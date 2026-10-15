-- EMR(덴트웹) 연동 원격 설정 + 중계 프로그램 상태 보고
-- Supabase SQL Editor에서 한 번 실행합니다. (여러 번 실행해도 안전)
-- 선행 조건: supabase_live_dashboard.sql 실행 완료 (agent 권한, current_agent_clinic_id 함수)
--
-- ※ 덴트웹 아이디/비밀번호는 여기에 저장하지 않습니다. (치과 PC의 config.json 에만 보관)

-- ---------------------------------------------------------------------------
-- 1. 치과별 EMR 접속 설정 (관리자모드에서 입력, 중계 프로그램이 읽음)
-- ---------------------------------------------------------------------------
create table if not exists public.clinic_emr_settings (
    clinic_id uuid primary key references public.clinics(id) on delete cascade,
    server text not null default '',
    port int check (port is null or (port between 1 and 65535)),
    instance text not null default 'DENTWEB',
    database_name text not null default 'DentWeb',
    interval_seconds int not null default 180 check (interval_seconds between 60 and 3600),
    enabled boolean not null default true,
    updated_at timestamptz not null default now()
);

alter table public.clinic_emr_settings enable row level security;
grant select, insert, update, delete on public.clinic_emr_settings to authenticated;

drop policy if exists clinic_emr_settings_admin_all on public.clinic_emr_settings;
create policy clinic_emr_settings_admin_all
on public.clinic_emr_settings
for all
to authenticated
using (app_private.current_user_role() = 'admin')
with check (app_private.current_user_role() = 'admin');

drop policy if exists clinic_emr_settings_agent_read on public.clinic_emr_settings;
create policy clinic_emr_settings_agent_read
on public.clinic_emr_settings
for select
to authenticated
using (app_private.current_agent_clinic_id() = clinic_id);

-- ---------------------------------------------------------------------------
-- 2. 중계 프로그램 상태 (중계 프로그램이 매 주기 보고, 관리자모드에서 조회)
-- ---------------------------------------------------------------------------
create table if not exists public.clinic_agent_status (
    clinic_id uuid primary key references public.clinics(id) on delete cascade,
    status text not null default 'ok' check (status in ('ok', 'error', 'disabled')),
    message text not null default '',
    last_seen_at timestamptz not null default now(),
    last_success_at timestamptz,
    agent_version text not null default '',
    hostname text not null default '',
    updated_at timestamptz not null default now()
);

alter table public.clinic_agent_status enable row level security;
grant select, insert, update, delete on public.clinic_agent_status to authenticated;

drop policy if exists clinic_agent_status_admin_all on public.clinic_agent_status;
create policy clinic_agent_status_admin_all
on public.clinic_agent_status
for all
to authenticated
using (app_private.current_user_role() = 'admin')
with check (app_private.current_user_role() = 'admin');

drop policy if exists clinic_agent_status_agent_select on public.clinic_agent_status;
create policy clinic_agent_status_agent_select
on public.clinic_agent_status
for select
to authenticated
using (app_private.current_agent_clinic_id() = clinic_id);

drop policy if exists clinic_agent_status_agent_insert on public.clinic_agent_status;
create policy clinic_agent_status_agent_insert
on public.clinic_agent_status
for insert
to authenticated
with check (app_private.current_agent_clinic_id() = clinic_id);

drop policy if exists clinic_agent_status_agent_update on public.clinic_agent_status;
create policy clinic_agent_status_agent_update
on public.clinic_agent_status
for update
to authenticated
using (app_private.current_agent_clinic_id() = clinic_id)
with check (app_private.current_agent_clinic_id() = clinic_id);
