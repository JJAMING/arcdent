-- Login history log.
-- Run this in the Supabase SQL Editor after supabase_schema.sql has already been applied
-- (it reuses the app_private.current_user_role()/current_user_clinic_id() helper functions
-- defined there).

create table if not exists public.login_logs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete set null,
    clinic_id uuid references public.clinics(id) on delete set null,
    email text not null default '',
    role text not null default '',
    user_agent text not null default '',
    created_at timestamptz not null default now()
);

alter table public.login_logs enable row level security;

grant select, insert on public.login_logs to authenticated;

-- Admin sees every login across every clinic; a clinic account only sees logins
-- recorded under its own clinic_id (mirrors analytics_audit_logs_clinic_read).
drop policy if exists login_logs_select_admin_or_own_clinic on public.login_logs;
create policy login_logs_select_admin_or_own_clinic
on public.login_logs
for select
to authenticated
using (
    app_private.current_user_role() = 'admin'
    or app_private.current_user_clinic_id() = public.login_logs.clinic_id
);

-- Each signed-in user may only insert a row for themselves (their own login event).
drop policy if exists login_logs_insert_self on public.login_logs;
create policy login_logs_insert_self
on public.login_logs
for insert
to authenticated
with check (user_id = auth.uid());

create index if not exists login_logs_created_at_idx on public.login_logs (created_at desc);
create index if not exists login_logs_clinic_idx on public.login_logs (clinic_id, created_at desc);
