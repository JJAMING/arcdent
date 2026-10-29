-- 매일 저녁 카카오 알림톡 마감 보고 (솔라피 발송)
-- Supabase SQL Editor에서 실행합니다. (여러 번 실행해도 안전)
-- 선행 조건: supabase_schema.sql, supabase_live_dashboard.sql
--
-- ⚠️ 실행 전 맨 아래 'REPLACE_WITH_REPORT_CRON_SECRET' 를 Vercel 환경변수 REPORT_CRON_SECRET 과
--    같은 값으로 바꿔 주세요. (이 값은 채팅이나 GitHub 에 붙여넣지 마세요)

-- 1. 치과별 알림톡 설정 (받는 사람 휴대폰 번호가 있으므로 관리자만 보기/수정)
create table if not exists public.clinic_report_settings (
    clinic_id uuid primary key references public.clinics(id) on delete cascade,
    enabled boolean not null default false,
    send_time text not null default '21:00' check (send_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    recipients jsonb not null default '[]'::jsonb,   -- [{ "name": "원장님", "phone": "01012345678" }]
    updated_at timestamptz not null default now()
);

-- 2. 발송 기록 (같은 날 두 번 보내지 않기 위한 확인용 · 관리자 화면 기록)
create table if not exists public.clinic_report_logs (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid not null references public.clinics(id) on delete cascade,
    stat_date date not null,
    kind text not null default 'scheduled' check (kind in ('scheduled', 'test')),
    status text not null check (status in ('sent', 'failed', 'skipped')),
    recipient text not null default '',              -- 가린 번호 (010-****-5678)
    message text not null default '',
    created_at timestamptz not null default now()
);

create index if not exists clinic_report_logs_clinic_date_idx on public.clinic_report_logs (clinic_id, stat_date desc);

alter table public.clinic_report_settings enable row level security;
alter table public.clinic_report_logs enable row level security;
grant select, insert, update, delete on public.clinic_report_settings to authenticated;
grant select on public.clinic_report_logs to authenticated;

drop policy if exists clinic_report_settings_admin_all on public.clinic_report_settings;
create policy clinic_report_settings_admin_all on public.clinic_report_settings
for all to authenticated
using (app_private.current_user_role() = 'admin')
with check (app_private.current_user_role() = 'admin');

drop policy if exists clinic_report_logs_admin_read on public.clinic_report_logs;
create policy clinic_report_logs_admin_read on public.clinic_report_logs
for select to authenticated
using (app_private.current_user_role() = 'admin');

-- 3. 10분마다 아크덴트 서버(/api/daily-report)를 부릅니다.
--    서버가 치과별 발송 시각(기본 21:00)이 지났고 오늘 아직 안 보낸 치과에만 보냅니다.
--    (휴진일 · 오늘 자료 없음이면 보내지 않음)
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('arcdent-daily-report')
where exists (select 1 from cron.job where jobname = 'arcdent-daily-report');

select cron.schedule(
    'arcdent-daily-report',
    '*/10 * * * *',
    $$
    select net.http_post(
        url := 'https://arcdent.vercel.app/api/daily-report',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', 'REPLACE_WITH_REPORT_CRON_SECRET'
        ),
        body := '{"action":"scheduled"}'::jsonb,
        timeout_milliseconds := 30000
    );
    $$
);
