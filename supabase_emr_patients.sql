-- 상담일지 환자 검색용: 덴트웹 최근 내원 환자 + 원장님 목록
-- Supabase SQL Editor에서 한 번 실행합니다. (여러 번 실행해도 안전)
-- 선행 조건: supabase_live_dashboard.sql (agent 권한), supabase_consultation_journal.sql
--
-- ⚠️ 개인정보 최소화
--   · 최근 30일 안에 내원한 환자만 올리고, 30일이 지나면 중계 프로그램이 지웁니다.
--   · 차트번호 · 이름 · 출생연도 · 성별 · 등록일 · 최근 내원일만 저장합니다. (연락처 · 주소 · 주민번호 없음)
--   · 같은 치과 계정 중 상담일지 메뉴를 볼 수 있는 계정만 조회할 수 있습니다.

-- 1. 최근 내원 환자
create table if not exists public.emr_recent_patients (
    clinic_id uuid not null references public.clinics(id) on delete cascade,
    patient_key text not null,              -- 덴트웹 환자 ID
    chart_no text not null default '',
    name text not null default '',
    birth_year int,
    gender text not null default '' check (gender in ('', 'M', 'F')),
    registered_date date,                   -- 덴트웹 최초 등록일 (신환/구환 판단)
    last_visit_date date,
    last_reception_at timestamptz,          -- 오늘 접수 시각 (오늘 접수 환자 먼저 보여주기)
    updated_at timestamptz not null default now(),
    primary key (clinic_id, patient_key)
);

-- 오늘 접수 현황용 (중계 프로그램 1.5.0): 접수 상태(0 접수 · 1 준비완료 · 2 진료중 · 3 진료완료 · 4 수납완료), 접수 담당의사 이름
alter table public.emr_recent_patients add column if not exists reception_status smallint;
alter table public.emr_recent_patients add column if not exists reception_doctor text;

create index if not exists emr_recent_patients_clinic_name_idx on public.emr_recent_patients (clinic_id, name);
create index if not exists emr_recent_patients_clinic_chart_idx on public.emr_recent_patients (clinic_id, chart_no);
create index if not exists emr_recent_patients_clinic_visit_idx on public.emr_recent_patients (clinic_id, last_visit_date);

-- 2. 원장님(의사) 목록 — 상담일지 '담당 원장님' 버튼 자동 채움
create table if not exists public.emr_doctors (
    clinic_id uuid not null references public.clinics(id) on delete cascade,
    staff_key text not null,
    name text not null,
    updated_at timestamptz not null default now(),
    primary key (clinic_id, staff_key)
);

alter table public.emr_recent_patients enable row level security;
alter table public.emr_doctors enable row level security;
grant select, insert, update, delete on public.emr_recent_patients to authenticated;
grant select, insert, update, delete on public.emr_doctors to authenticated;

do $$
declare
    t text;
begin
    foreach t in array array['emr_recent_patients', 'emr_doctors']
    loop
        -- 관리자: 전체
        execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
        execute format('create policy %I on public.%I for all to authenticated '
            'using (app_private.current_user_role() = ''admin'') '
            'with check (app_private.current_user_role() = ''admin'')', t || '_admin_all', t);

        -- 중계 프로그램: 자기 치과 것만 쓰기/지우기
        execute format('drop policy if exists %I on public.%I', t || '_agent_all', t);
        execute format('create policy %I on public.%I for all to authenticated '
            'using (app_private.current_agent_clinic_id() = clinic_id) '
            'with check (app_private.current_agent_clinic_id() = clinic_id)', t || '_agent_all', t);

        -- 치과 계정: 자기 치과 + 상담일지 메뉴를 볼 수 있을 때만 조회
        execute format('drop policy if exists %I on public.%I', t || '_clinic_read', t);
        execute format('create policy %I on public.%I for select to authenticated '
            'using (app_private.current_user_role() = ''clinic_user'' '
            'and clinic_id = app_private.current_user_clinic_id() '
            'and app_private.can_view_menu(''journal''))', t || '_clinic_read', t);
    end loop;
end $$;
