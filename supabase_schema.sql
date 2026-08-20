-- Arcdent Supabase base schema
-- Run this in the Supabase SQL Editor for each new clinic deployment project.
-- After running, create Auth users in Supabase Auth, then insert matching rows
-- into public.profiles using the examples at the bottom of this file.

create extension if not exists pgcrypto;
create schema if not exists app_private;

create table if not exists public.clinics (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    code text not null unique,
    created_at timestamptz not null default now()
);

create table if not exists public.profiles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique references auth.users(id) on delete cascade,
    clinic_id uuid references public.clinics(id) on delete set null,
    role text not null check (role in ('admin', 'clinic_user')),
    created_at timestamptz not null default now()
);

create table if not exists public.analytics_data (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid not null references public.clinics(id) on delete cascade,
    category text not null,
    sub_category text not null,
    year int not null,
    month int,
    month_key int generated always as (coalesce(month, 0)) stored,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.analytics_audit_logs (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid not null references public.clinics(id) on delete cascade,
    user_id uuid references auth.users(id) on delete set null,
    action_type text not null default 'upload' check (action_type in ('upload', 'update', 'delete', 'rollback')),
    status text not null check (status in ('success', 'failed')),
    category text not null,
    sub_category text not null default '',
    year int,
    month int,
    file_name text not null default '',
    file_type text not null default '',
    file_size bigint,
    summary jsonb not null default '{}'::jsonb,
    error_message text not null default '',
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

alter table public.analytics_data
add column if not exists month_key int generated always as (coalesce(month, 0)) stored;

drop index if exists analytics_data_unique_scope;
create unique index if not exists analytics_data_unique_scope
on public.analytics_data (
    clinic_id,
    category,
    sub_category,
    year,
    month_key
);

create index if not exists analytics_data_lookup_idx
on public.analytics_data (clinic_id, category, sub_category, year, month);

create index if not exists analytics_audit_logs_lookup_idx
on public.analytics_audit_logs (clinic_id, created_at desc, category, status, year, month);

alter table public.clinics enable row level security;
alter table public.profiles enable row level security;
alter table public.analytics_data enable row level security;
alter table public.analytics_audit_logs enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.clinics to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.analytics_data to authenticated;
grant select, insert, update, delete on public.analytics_audit_logs to authenticated;
grant usage on schema app_private to authenticated;

create or replace function app_private.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
    select p.role
    from public.profiles p
    where p.user_id = auth.uid()
    limit 1
$$;

create or replace function app_private.current_user_clinic_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
    select p.clinic_id
    from public.profiles p
    where p.user_id = auth.uid()
    limit 1
$$;

revoke all on function app_private.current_user_role() from public;
revoke all on function app_private.current_user_clinic_id() from public;
grant execute on function app_private.current_user_role() to authenticated;
grant execute on function app_private.current_user_clinic_id() to authenticated;

drop policy if exists "clinics_select_admin_or_own" on public.clinics;
create policy "clinics_select_admin_or_own"
on public.clinics
for select
to authenticated
using (
    app_private.current_user_role() = 'admin'
    or app_private.current_user_clinic_id() = public.clinics.id
);

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
on public.profiles
for select
to authenticated
using (
    user_id = auth.uid()
    or app_private.current_user_role() = 'admin'
);

drop policy if exists "analytics_select_admin_or_own_clinic" on public.analytics_data;
create policy "analytics_select_admin_or_own_clinic"
on public.analytics_data
for select
to authenticated
using (
    app_private.current_user_role() = 'admin'
    or app_private.current_user_clinic_id() = public.analytics_data.clinic_id
);

drop policy if exists "analytics_insert_admin_only" on public.analytics_data;
create policy "analytics_insert_admin_only"
on public.analytics_data
for insert
to authenticated
with check (
    app_private.current_user_role() = 'admin'
);

drop policy if exists "analytics_update_admin_only" on public.analytics_data;
create policy "analytics_update_admin_only"
on public.analytics_data
for update
to authenticated
using (
    app_private.current_user_role() = 'admin'
)
with check (
    app_private.current_user_role() = 'admin'
);

drop policy if exists "analytics_delete_admin_only" on public.analytics_data;
create policy "analytics_delete_admin_only"
on public.analytics_data
for delete
to authenticated
using (
    app_private.current_user_role() = 'admin'
);

drop policy if exists "analytics_audit_logs_admin_all" on public.analytics_audit_logs;
create policy "analytics_audit_logs_admin_all"
on public.analytics_audit_logs
for all
to authenticated
using (
    app_private.current_user_role() = 'admin'
)
with check (
    app_private.current_user_role() = 'admin'
);

drop policy if exists "analytics_audit_logs_clinic_read" on public.analytics_audit_logs;
create policy "analytics_audit_logs_clinic_read"
on public.analytics_audit_logs
for select
to authenticated
using (
    app_private.current_user_clinic_id() = public.analytics_audit_logs.clinic_id
);

-- Example setup after creating Auth users:
--
-- 1) Create a clinic.
-- insert into public.clinics (name, code)
-- values ('충주본365치과', 'chungjubon')
-- on conflict (code) do update set name = excluded.name
-- returning id;
--
-- 2) Find Auth user IDs.
-- select id, email from auth.users;
--
-- 3) Connect the admin account.
-- insert into public.profiles (user_id, clinic_id, role)
-- values ('ADMIN_AUTH_USER_UUID_HERE', null, 'admin')
-- on conflict (user_id) do update set clinic_id = excluded.clinic_id, role = excluded.role;
--
-- 4) Connect a clinic user account.
-- insert into public.profiles (user_id, clinic_id, role)
-- values (
--     'CLINIC_AUTH_USER_UUID_HERE',
--     (select id from public.clinics where code = 'chungjubon'),
--     'clinic_user'
-- )
-- on conflict (user_id) do update set clinic_id = excluded.clinic_id, role = excluded.role;

-- Clinic-specific feature settings. Each clinic can independently enable optional UI/data features.
create table if not exists public.clinic_feature_settings (
    clinic_id uuid primary key references public.clinics(id) on delete cascade,
    settings jsonb not null default '{"salesCashOmission": false}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.clinic_feature_settings enable row level security;

drop policy if exists clinic_feature_settings_admin_all on public.clinic_feature_settings;
create policy clinic_feature_settings_admin_all
on public.clinic_feature_settings
for all
to authenticated
using (app_private.current_user_role() = 'admin')
with check (app_private.current_user_role() = 'admin');

drop policy if exists clinic_feature_settings_clinic_read on public.clinic_feature_settings;
create policy clinic_feature_settings_clinic_read
on public.clinic_feature_settings
for select
to authenticated
using (app_private.current_user_clinic_id() = clinic_id);
