-- 같이N치과 (미팅·시연용 샘플 치과)
-- Supabase SQL Editor에서 한 번 실행합니다. (여러 번 실행해도 안전)
-- 실행 후: 관리자모드 → "샘플 치과" 탭 → "샘플 데이터 채우기" 버튼을 누르면 올해 1월~오늘 가상 자료가 들어갑니다.
-- 치과 이름에는 "(샘플)"이 붙지 않고, 관리자 목록에서만 "(샘플)"로 표시됩니다.

insert into public.clinics (name, code)
values ('같이N치과', 'sample-gachi')
on conflict (code) do nothing;

select id, name, code from public.clinics where code = 'sample-gachi';
