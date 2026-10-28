-- 상담일지 (상담분석 자동 계산용)
-- Supabase SQL Editor에서 한 번 실행합니다. (여러 번 실행해도 안전)
-- 선행 조건: supabase_schema.sql
-- 상담 1건 = 1줄. 환자 성함·차트번호가 저장되므로 치과별로만 볼 수 있게 막습니다.

-- 0. 병원관리자 권한 함수 (supabase_accounts.sql 과 같은 내용 — 아직 실행 안 했어도 동작하도록)
alter table public.profiles add column if not exists permissions jsonb;

create or replace function app_private.current_user_permissions()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
    select p.permissions
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'clinic_user'
    limit 1
$$;

create or replace function app_private.can_view_menu(menu text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select coalesce(
        not ((app_private.current_user_permissions() -> 'hiddenMenus') ? menu),
        true
    )
$$;

-- 상담일지를 쓸 수 있는지: 상담일지 메뉴가 보이고 '작성·수정'을 막지 않은 치과 계정
create or replace function app_private.can_write_consultation_journal()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select app_private.current_user_role() = 'clinic_user'
       and app_private.can_view_menu('journal')
       and coalesce(not ((app_private.current_user_permissions() -> 'hiddenItems') ? 'journal:write'), true)
$$;

revoke all on function app_private.current_user_permissions() from public;
revoke all on function app_private.can_view_menu(text) from public;
revoke all on function app_private.can_write_consultation_journal() from public;
grant execute on function app_private.current_user_permissions() to authenticated;
grant execute on function app_private.can_view_menu(text) to authenticated;
grant execute on function app_private.can_write_consultation_journal() to authenticated;

-- 1. 상담일지
create table if not exists public.consultation_journals (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid not null references public.clinics(id) on delete cascade,
    consult_date date not null,
    patient_name text not null default '',
    chart_no text not null default '',
    patient_type text not null default 'new' check (patient_type in ('new', 'returning')),
    counselor text not null default '',
    doctor text not null default '',
    visit_channel text not null default '',
    treatment_category text not null default '',
    consulted_teeth int not null default 0 check (consulted_teeth >= 0),
    agreed_teeth int not null default 0 check (agreed_teeth >= 0),
    -- full=전체동의, partial=부분동의, declined=미동의, cancelled=동의 후 취소
    result text not null default 'full' check (result in ('full', 'partial', 'declined', 'cancelled')),
    diagnosis_amount bigint not null default 0 check (diagnosis_amount >= 0),
    consultation_amount bigint not null default 0 check (consultation_amount >= 0),
    agreed_amount bigint not null default 0 check (agreed_amount >= 0),
    is_insurance boolean not null default false,
    -- 보험 결정 종류: implant=임플, denture=틀니, other=기타
    insurance_decision text not null default '' check (insurance_decision in ('', 'implant', 'denture', 'other')),
    plan_changed boolean not null default false,
    reject_reason text not null default '',
    memo text not null default '',
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists consultation_journals_clinic_date_idx
    on public.consultation_journals (clinic_id, consult_date);
create index if not exists consultation_journals_clinic_chart_idx
    on public.consultation_journals (clinic_id, chart_no);

-- 2. 치과별 선택 목록 (상담자, 원장님, 내원경로, 진료분류, 미동의 사유)
create table if not exists public.consultation_journal_settings (
    clinic_id uuid primary key references public.clinics(id) on delete cascade,
    options jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

alter table public.consultation_journals enable row level security;
alter table public.consultation_journal_settings enable row level security;
grant select, insert, update, delete on public.consultation_journals to authenticated;
grant select, insert, update, delete on public.consultation_journal_settings to authenticated;

-- 관리자: 전체
drop policy if exists consultation_journals_admin_all on public.consultation_journals;
create policy consultation_journals_admin_all on public.consultation_journals
for all to authenticated
using (app_private.current_user_role() = 'admin')
with check (app_private.current_user_role() = 'admin');

-- 치과 계정: 자기 치과만 보기 (상담일지 또는 상담분석 메뉴를 볼 수 있을 때)
drop policy if exists consultation_journals_clinic_read on public.consultation_journals;
create policy consultation_journals_clinic_read on public.consultation_journals
for select to authenticated
using (
    app_private.current_user_role() = 'clinic_user'
    and clinic_id = app_private.current_user_clinic_id()
    and (app_private.can_view_menu('journal') or app_private.can_view_menu('consultation'))
);

-- 치과 계정: 자기 치과 것만 작성·수정·삭제 (작성 권한이 있을 때)
drop policy if exists consultation_journals_clinic_insert on public.consultation_journals;
create policy consultation_journals_clinic_insert on public.consultation_journals
for insert to authenticated
with check (clinic_id = app_private.current_user_clinic_id() and app_private.can_write_consultation_journal());

drop policy if exists consultation_journals_clinic_update on public.consultation_journals;
create policy consultation_journals_clinic_update on public.consultation_journals
for update to authenticated
using (clinic_id = app_private.current_user_clinic_id() and app_private.can_write_consultation_journal())
with check (clinic_id = app_private.current_user_clinic_id() and app_private.can_write_consultation_journal());

drop policy if exists consultation_journals_clinic_delete on public.consultation_journals;
create policy consultation_journals_clinic_delete on public.consultation_journals
for delete to authenticated
using (clinic_id = app_private.current_user_clinic_id() and app_private.can_write_consultation_journal());

-- 선택 목록: 관리자 전체 / 치과 계정은 자기 치과 보기, 작성 권한이 있으면 수정
drop policy if exists consultation_journal_settings_admin_all on public.consultation_journal_settings;
create policy consultation_journal_settings_admin_all on public.consultation_journal_settings
for all to authenticated
using (app_private.current_user_role() = 'admin')
with check (app_private.current_user_role() = 'admin');

drop policy if exists consultation_journal_settings_clinic_read on public.consultation_journal_settings;
create policy consultation_journal_settings_clinic_read on public.consultation_journal_settings
for select to authenticated
using (app_private.current_user_role() = 'clinic_user' and clinic_id = app_private.current_user_clinic_id());

drop policy if exists consultation_journal_settings_clinic_write on public.consultation_journal_settings;
create policy consultation_journal_settings_clinic_write on public.consultation_journal_settings
for insert to authenticated
with check (clinic_id = app_private.current_user_clinic_id() and app_private.can_write_consultation_journal());

drop policy if exists consultation_journal_settings_clinic_update on public.consultation_journal_settings;
create policy consultation_journal_settings_clinic_update on public.consultation_journal_settings
for update to authenticated
using (clinic_id = app_private.current_user_clinic_id() and app_private.can_write_consultation_journal())
with check (clinic_id = app_private.current_user_clinic_id() and app_private.can_write_consultation_journal());
