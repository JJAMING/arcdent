-- EMR 지난 데이터: 일별 기록 + 시간별 누적 기록
-- Supabase SQL Editor에서 한 번 실행합니다. (여러 번 실행해도 안전)
-- 선행 조건: supabase_live_dashboard.sql (agent 권한, current_agent_clinic_id 함수)
-- 저장 내용은 합계 숫자뿐입니다. (환자 개인정보 없음)

-- 1. 일별 기록: 하루 1줄 (중계 프로그램이 덴트웹에서 다시 계산해서 채움 — 최근 13개월, 매일 밤 최근 7일 재계산)
create table if not exists public.clinic_daily_stats (
    clinic_id uuid not null references public.clinics(id) on delete cascade,
    stat_date date not null,
    metrics jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    primary key (clinic_id, stat_date)
);

-- 2. 시간별 누적: "어제 이 시간까지"와 비교하기 위해 매시간 누적 숫자 저장 (hour = 0~23)
create table if not exists public.clinic_intraday_stats (
    clinic_id uuid not null references public.clinics(id) on delete cascade,
    stat_date date not null,
    hour smallint not null check (hour between 0 and 23),
    metrics jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    primary key (clinic_id, stat_date, hour)
);

do $$
declare
    t text;
begin
    foreach t in array array['clinic_daily_stats', 'clinic_intraday_stats']
    loop
        execute format('alter table public.%I enable row level security', t);
        execute format('grant select, insert, update, delete on public.%I to authenticated', t);

        execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
        execute format('create policy %I on public.%I for all to authenticated '
            'using (app_private.current_user_role() = ''admin'') '
            'with check (app_private.current_user_role() = ''admin'')', t || '_admin_all', t);

        execute format('drop policy if exists %I on public.%I', t || '_clinic_read', t);
        execute format('create policy %I on public.%I for select to authenticated '
            'using (app_private.current_user_clinic_id() = clinic_id)', t || '_clinic_read', t);

        execute format('drop policy if exists %I on public.%I', t || '_agent_select', t);
        execute format('create policy %I on public.%I for select to authenticated '
            'using (app_private.current_agent_clinic_id() = clinic_id)', t || '_agent_select', t);

        execute format('drop policy if exists %I on public.%I', t || '_agent_insert', t);
        execute format('create policy %I on public.%I for insert to authenticated '
            'with check (app_private.current_agent_clinic_id() = clinic_id)', t || '_agent_insert', t);

        execute format('drop policy if exists %I on public.%I', t || '_agent_update', t);
        execute format('create policy %I on public.%I for update to authenticated '
            'using (app_private.current_agent_clinic_id() = clinic_id) '
            'with check (app_private.current_agent_clinic_id() = clinic_id)', t || '_agent_update', t);
    end loop;
end $$;
