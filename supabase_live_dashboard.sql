-- 실시간 대시보드(덴트웹 연동) + 치과 운영 설정(진료시간/휴무일) + 월별 목표
-- Supabase SQL Editor에서 한 번 실행합니다. (여러 번 실행해도 안전하게 작성됨)
-- 선행 조건: supabase_schema.sql 이 이미 실행되어 있어야 합니다.

-- ---------------------------------------------------------------------------
-- 1. 중계 프로그램 전용 권한(agent)
--    덴트웹 PC에 설치되는 중계 프로그램은 별도 Auth 계정으로 로그인하며,
--    자기 치과의 실시간 현황(live_clinic_stats)만 쓸 수 있습니다.
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
    add constraint profiles_role_check check (role in ('admin', 'clinic_user', 'agent'));

-- agent 계정은 기존 치과 데이터(analytics_data 등)를 읽지 못하도록
-- current_user_clinic_id()가 agent에게는 null을 돌려주게 바꿉니다.
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
      and p.role <> 'agent'
    limit 1
$$;

create or replace function app_private.current_agent_clinic_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
    select p.clinic_id
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'agent'
    limit 1
$$;

revoke all on function app_private.current_agent_clinic_id() from public;
grant execute on function app_private.current_agent_clinic_id() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. 실시간 현황 (치과별 · 날짜별 1줄)
--    payload에는 합계 숫자만 저장합니다. 환자 이름/연락처 등 개인정보는 넣지 않습니다.
-- ---------------------------------------------------------------------------
create table if not exists public.live_clinic_stats (
    clinic_id uuid not null references public.clinics(id) on delete cascade,
    stat_date date not null,
    payload jsonb not null default '{}'::jsonb,
    source text not null default 'dentweb',
    updated_at timestamptz not null default now(),
    primary key (clinic_id, stat_date)
);

alter table public.live_clinic_stats enable row level security;
grant select, insert, update, delete on public.live_clinic_stats to authenticated;

drop policy if exists live_clinic_stats_admin_all on public.live_clinic_stats;
create policy live_clinic_stats_admin_all
on public.live_clinic_stats
for all
to authenticated
using (app_private.current_user_role() = 'admin')
with check (app_private.current_user_role() = 'admin');

drop policy if exists live_clinic_stats_clinic_read on public.live_clinic_stats;
create policy live_clinic_stats_clinic_read
on public.live_clinic_stats
for select
to authenticated
using (app_private.current_user_clinic_id() = clinic_id);

drop policy if exists live_clinic_stats_agent_select on public.live_clinic_stats;
create policy live_clinic_stats_agent_select
on public.live_clinic_stats
for select
to authenticated
using (app_private.current_agent_clinic_id() = clinic_id);

drop policy if exists live_clinic_stats_agent_insert on public.live_clinic_stats;
create policy live_clinic_stats_agent_insert
on public.live_clinic_stats
for insert
to authenticated
with check (app_private.current_agent_clinic_id() = clinic_id);

drop policy if exists live_clinic_stats_agent_update on public.live_clinic_stats;
create policy live_clinic_stats_agent_update
on public.live_clinic_stats
for update
to authenticated
using (app_private.current_agent_clinic_id() = clinic_id)
with check (app_private.current_agent_clinic_id() = clinic_id);

-- 홈 화면이 새로고침 없이 갱신되도록 Realtime 대상에 추가
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'live_clinic_stats'
    ) then
        alter publication supabase_realtime add table public.live_clinic_stats;
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. 진료시간 (요일별)
--    weekly 예: {"1": {"open": true, "start": "09:30", "end": "18:30", "lunchStart": "13:00", "lunchEnd": "14:00"}, "0": {"open": false}}
--    키 0=일요일 ... 6=토요일
-- ---------------------------------------------------------------------------
create table if not exists public.clinic_operating_hours (
    clinic_id uuid primary key references public.clinics(id) on delete cascade,
    weekly jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. 휴무일 (공휴일, 여름휴가 등 특정 날짜)
-- ---------------------------------------------------------------------------
create table if not exists public.clinic_holidays (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid not null references public.clinics(id) on delete cascade,
    holiday_date date not null,
    label text not null default '',
    created_at timestamptz not null default now(),
    unique (clinic_id, holiday_date)
);

create index if not exists clinic_holidays_clinic_date_idx
    on public.clinic_holidays (clinic_id, holiday_date);

-- ---------------------------------------------------------------------------
-- 5. 월별 목표 (매출 목표 = 수납액 기준, 신환 목표)
-- ---------------------------------------------------------------------------
create table if not exists public.clinic_goals (
    clinic_id uuid not null references public.clinics(id) on delete cascade,
    year int not null,
    month int not null check (month between 1 and 12),
    sales_goal bigint not null default 0 check (sales_goal >= 0),
    new_patient_goal int not null default 0 check (new_patient_goal >= 0),
    updated_at timestamptz not null default now(),
    primary key (clinic_id, year, month)
);

-- 3~5번 테이블: 관리자만 입력/수정, 치과 계정은 자기 치과 것만 조회
do $$
declare
    t text;
begin
    foreach t in array array['clinic_operating_hours', 'clinic_holidays', 'clinic_goals']
    loop
        execute format('alter table public.%I enable row level security', t);
        execute format('grant select, insert, update, delete on public.%I to authenticated', t);

        execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
        execute format(
            'create policy %I on public.%I for all to authenticated '
            'using (app_private.current_user_role() = ''admin'') '
            'with check (app_private.current_user_role() = ''admin'')',
            t || '_admin_all', t
        );

        execute format('drop policy if exists %I on public.%I', t || '_clinic_read', t);
        execute format(
            'create policy %I on public.%I for select to authenticated '
            'using (app_private.current_user_clinic_id() = clinic_id)',
            t || '_clinic_read', t
        );
    end loop;
end $$;

-- ---------------------------------------------------------------------------
-- (참고) 중계 프로그램 계정 연결 예시 — 치과마다 1개
--   1) Authentication > Users 에서 예: agent-bclinic@arcdent.local 생성 (Auto Confirm 체크)
--   2) 아래 실행
-- insert into public.profiles (user_id, clinic_id, role)
-- values ('중계계정_USER_UID', '치과_UUID', 'agent');
-- ---------------------------------------------------------------------------
