-- 계정 관리 + 병원관리자 권한
-- Supabase SQL Editor에서 한 번 실행합니다. (여러 번 실행해도 안전)
-- 선행 조건: supabase_schema.sql, supabase_live_dashboard.sql, supabase_history.sql

-- 1. 계정 정보 칸 추가
--    permissions: null = 전체 보기(원장님) / 병원관리자는 { hiddenMenus, hiddenItems, hideAmounts }
alter table public.profiles add column if not exists display_name text not null default '';
alter table public.profiles add column if not exists permissions jsonb;

-- 2. 지금 로그인한 치과 계정의 권한 (관리자·중계 계정은 null)
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

-- 3. 메뉴를 볼 수 있는지 (권한이 없으면 전체 허용)
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

-- 분석 데이터 카테고리 → 메뉴 id
create or replace function app_private.can_view_analytics(category text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select app_private.can_view_menu(
        case category
            when 'newPatient' then 'new-patient'
            else category
        end
    )
$$;

revoke all on function app_private.current_user_permissions() from public;
revoke all on function app_private.can_view_menu(text) from public;
revoke all on function app_private.can_view_analytics(text) from public;
grant execute on function app_private.current_user_permissions() to authenticated;
grant execute on function app_private.can_view_menu(text) to authenticated;
grant execute on function app_private.can_view_analytics(text) to authenticated;

-- 4. 숨긴 메뉴의 데이터는 서버에서도 막기 (restrictive = 기존 권한과 '그리고'로 함께 적용)
drop policy if exists analytics_menu_permission on public.analytics_data;
create policy analytics_menu_permission
on public.analytics_data
as restrictive
for select
to authenticated
using (app_private.can_view_analytics(category));

do $$
declare
    t text;
begin
    foreach t in array array['live_clinic_stats', 'clinic_daily_stats', 'clinic_intraday_stats']
    loop
        execute format('drop policy if exists %I on public.%I', t || '_home_permission', t);
        execute format(
            'create policy %I on public.%I as restrictive for select to authenticated '
            'using (app_private.can_view_menu(''home''))',
            t || '_home_permission', t
        );
    end loop;
end $$;

-- ※ 계정 만들기 · 비밀번호 재설정 · 사용 중지 · 삭제는 Vercel 서버 기능(api/admin-accounts.js)이
--   SUPABASE_SERVICE_ROLE_KEY 로 처리합니다. 이 키는 Vercel 환경변수에만 넣고 화면 코드에는 절대 넣지 않습니다.
