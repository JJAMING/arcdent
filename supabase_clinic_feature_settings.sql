-- Clinic-specific feature settings
-- Run this once in the Supabase SQL Editor after supabase_schema.sql.

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
