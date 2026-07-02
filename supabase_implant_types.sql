create table if not exists public.clinic_implant_types (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid not null references public.clinics(id) on delete cascade,
    name text not null,
    color text not null default '#4472c4',
    sort_order int not null default 1,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint clinic_implant_types_name_not_blank check (length(trim(name)) > 0),
    constraint clinic_implant_types_unique_name unique (clinic_id, name)
);

alter table public.clinic_implant_types enable row level security;

drop policy if exists clinic_implant_types_admin_all on public.clinic_implant_types;
drop policy if exists clinic_implant_types_clinic_read on public.clinic_implant_types;

create policy clinic_implant_types_admin_all
on public.clinic_implant_types
for all
to authenticated
using (app_private.current_user_role() = 'admin')
with check (app_private.current_user_role() = 'admin');

create policy clinic_implant_types_clinic_read
on public.clinic_implant_types
for select
to authenticated
using (app_private.current_user_clinic_id() = clinic_id);

create index if not exists clinic_implant_types_clinic_sort_idx
on public.clinic_implant_types (clinic_id, is_active, sort_order);
