# Arcdent 운영 가이드

Arcdent는 치과별 매출, 진료, 환자, 신환, 상담, 보험청구 데이터를 업로드하고 분석하는 React/Vite 기반 대시보드입니다.

이 문서는 컨텍스트 압축과 무관하게 유지해야 하는 운영 규칙, Supabase 설정, 업로드 파일 매칭, 배포 체크리스트를 정리합니다.

## 실행 명령

```bash
npm install
npm run dev
npm run build
```

- 로컬 개발 서버 기본 주소: `http://127.0.0.1:5173`
- 배포 전 확인: `npm run build`
- `npm run lint`는 현재 ESLint 설정 파일이 없으면 실패할 수 있습니다. 빌드 검증을 우선 기준으로 봅니다.

## 환경변수

`.env.local` 또는 Vercel 환경변수에 아래 값을 설정합니다.

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-publishable-or-anon-key
```

주의:

- `service_role` 또는 secret key는 프론트엔드/Vercel public 환경변수에 넣지 않습니다.
- `.env.local`은 GitHub에 올리지 않습니다.
- Supabase 신규 키 체계에서는 브라우저 앱에 `Publishable key`를 사용합니다. 기존 프로젝트라면 anon key도 동일 용도로 사용할 수 있습니다.

## Supabase 구조

핵심 테이블:

| 테이블 | 역할 |
| --- | --- |
| `clinics` | 치과 목록. `name`은 앱 왼쪽 상단에 표시되는 치과명입니다. |
| `profiles` | Supabase Auth 사용자와 치과/권한 연결. |
| `analytics_data` | 모든 분석 데이터 저장소. 카테고리, 서브카테고리, 연도, 월, payload 기준으로 저장합니다. |

권한 구조:

| role | clinic_id | 의미 |
| --- | --- | --- |
| `admin` | `null` | 관리자. 관리자 모드에서 치과를 선택해 해당 치과 DB에 업로드합니다. |
| `clinic_user` | 특정 `clinics.id` | 치과 계정. 본인 치과 데이터만 조회합니다. |

운영 원칙:

- 관리자 계정도 Supabase Auth에 만들어야 합니다.
- 치과 계정도 Supabase Auth에 만들고, `profiles.user_id`에 Auth user id를 연결합니다.
- 치과 계정의 `profiles.clinic_id`에는 이메일이 아니라 `clinics.id` UUID가 들어갑니다.
- 앱에는 `clinics.name`이 표시되어야 하며, `profiles.clinic_id -> clinics.id`로 조인되는 구조입니다.
- `analytics_data`는 RLS가 켜져 있어야 하며, 관리자 업로드와 치과별 조회가 분리되어야 합니다.

## analytics_data 고유키

동일 치과/카테고리/서브카테고리/연도/월 데이터는 덮어쓰기(upsert)됩니다.

필수 SQL:

```sql
alter table public.analytics_data
add column if not exists month_key int generated always as (coalesce(month, 0)) stored;

drop index if exists analytics_data_unique_scope;

create unique index if not exists analytics_data_unique_scope
on public.analytics_data (
    clinic_id,
    category,
    sub_category,
    year,
    month_key
);
```

## 치과별 운영 방식

권장 구조:

1. 앱은 하나만 운영합니다.
2. 관리자 모드에서 치과를 선택합니다.
3. A치과 선택 후 업로드하면 A치과 `clinic_id`로 Supabase에 저장됩니다.
4. B치과 선택 후 업로드하면 B치과 `clinic_id`로 Supabase에 저장됩니다.
5. 치과 사용자가 로그인하면 본인의 `clinic_id` 데이터만 보입니다.

관리자 업로드 주의:

- 관리자 모드에 진입하려면 Supabase 관리자 계정으로 로그인해야 합니다.
- 치과 선택 드롭다운에서 대상 치과를 먼저 선택해야 합니다.
- 알 수 없는 파일명은 저장하지 않고 오류 처리합니다.
- 업로드 데이터는 로컬 저장이 아니라 Supabase `analytics_data`에 저장합니다.

## 기본 연도

앱의 기본 연도는 고정 `2025년`이 아니라 브라우저 현재 연도 기준입니다.

- 2026년에 접속하면 2026년이 기본 선택됩니다.
- 2027년에 접속하면 2027년이 기본 선택됩니다.
- 업로드된 다른 연도 데이터는 드롭다운에 함께 표시됩니다.

## 업로드 파일 매칭표

아래 파일명 패턴은 연도/월이 바뀌어도 동작해야 합니다.

| 파일명 예시/패턴 | 파일 형식 | 저장 위치 |
| --- | --- | --- |
| `YYYY년M월월간장부` | 엑셀 | 매출분석 > 총매출현황: 현금수입 + 카드수입 + 기타(온라인)수입 = 순매출, 공단부담(청구액) = 보험청구 |
| `YYYY년M월월간장부` | 엑셀 | 환자분석 > 총환자수: 진료일수, 신환, 구환, 총 내원횟수, 총 접수 환자 수 자동 계산 |
| `YYYY년M월월간장부` | 이미지 | 환자분석 > 총환자수: OCR 결과 확인 팝업 후 승인 저장 |
| `YYYY년MM월의사별진료비수납액` | 엑셀 | 환자분석 > 총환자수(의사): 의사이름, 진료 환자수 |
| `YYYY년MM월의사별진료비수납액` | 엑셀 | 매출분석 > 매출분석(의사): 의사별 총 수납액 + 공단부담금 |
| `YYYY년 MM월 기공의뢰통계` | 엑셀 | 환자분석 > 기공물 의뢰 현황: 구분, 기공물 종류, 치아 수 |
| `YYYY년MM월내원환자내원경로분포` | 엑셀 | 신환분석 > 신환 내원경로 현황, 치료 이행율, 내원 경로별 객단가 |
| `YYYY년MM월내원환자내원경로분포 [내원경로]` | 이미지 | 신환분석 > 내원 경로별 치료 이행율: 파일명 뒤 내원경로에 보험/비보험 비율 반영 |
| `YYYY년MM월내원환자연령분포` | 엑셀 | 신환분석 > 연령별 신환 현황 |
| `YYYY년MM월신규환자내원경로분포` | 엑셀 | 매출분석 > 총매출현황 상세 지표 신환 수, 신환수익비교 |
| `YYYY년MM월환자별 수납내역` | 엑셀 | 매출분석 > 진료비 상위 |
| `치료비용계획_YYYYMMDD` | 엑셀 | 매출분석 > 동의환자 수납액 |
| `YYYY년보험청구액` | 엑셀 | 보험청구분석 > 보험청구액 통계 |
| `YYYY년월별조정심사불능내역` | 엑셀 | 보험청구분석 > 조정건수/금액: 조정·불능 건수/금액, 청구금액, 심사결정금액 |
| `YYYY년MM월보험수가별통계` | 엑셀 | 진료분석 기존 보험수가 데이터 + 보험청구분석 > 보험수가별 통계 |
| `YYYY년MM월임플란트수술통계` | 엑셀 | 진료분석 > 임플란트 |
| `YYYY년MM월보험수가별통계` | 엑셀 | 진료분석 > 보험 임플란트/보험 틀니 및 보험청구분석 수가별 통계 |
| `YYYY년_MM월_상담현황_통합정리.md` | Markdown | 상담분석 > 전체 동의율, 상담자별 동의율, 미동의 환자 현황 |
| `전체동의율` 포함 파일 | 이미지 | 상담분석 > 전체 동의율: OCR 확인 팝업 후 승인 저장 |
| `상담자별...동의율` Markdown | Markdown | 상담분석 > 상담자별 동의율 |
| `미동의환자...` Markdown | Markdown | 상담분석 > 미동의 환자 현황 |

상담분석 MD 권장 형식:

- 앞으로 통합 파일은 `YYYY년_MM월_상담현황_통합정리.md` 형식을 사용합니다.
- 이 파일 하나에 전체 동의율, 상담자별 동의율, 미동의 환자 현황을 함께 넣을 수 있습니다.
- 의사별 진단수에는 의사 이름, 진단수, 동의금액이 들어갑니다.

## 주요 화면별 메모

### HOME

- Supabase 데이터 기반 종합 대시보드입니다.
- 전체보기/상반기/하반기/월별 필터를 지원합니다.
- 월별 선택 시 월별 막대그래프 중심으로 표시합니다.
- 상담동의율 카드는 상담분석의 상담금액 대비 동의율을 사용합니다.
- 알림/이상 징후는 AI 분석이 아니라 업로드 데이터 기반 문구입니다.

알림 비교 기준:

| 필터 | 비교 기준 |
| --- | --- |
| 전체보기 | 전년도 대비 |
| 상반기 | 전년도 하반기 대비 |
| 하반기 | 이번년도 상반기 대비 |
| 월별 | 전월 대비 |

### 환자분석

- 총환자수 탭의 총 접수 환자 수는 `총 내원횟수 / 진료일수`로 계산합니다.
- 신환 일평균은 `신환 수 / 진료일수`입니다.
- 구환 일평균은 `(신환 + 구환) / 진료일수`입니다.
- 기공물 의뢰 상세 데이터는 10개씩 페이지네이션합니다.

### 신환분석

- 탭: 신환 내원경로 현황, 내원 경로별 치료 이행율, 연령별 신환 현황, 내원 경로별 객단가.
- 내원 경로별 치료 이행율 차트는 총 비율 기준입니다.
- 업로드되지 않은 월/항목은 0으로 표시합니다.
- 연령별 신환 현황은 0대, 10대, 20대, 30대, 40대, 50대, 60대, 70대+를 사용합니다.

### 상담분석

- 탭: 전체 동의율, 상담자별 동의율, 미동의 환자 현황.
- 상담현황 통합 MD 업로드 시 세 탭에 각각 저장됩니다.
- 전체 동의율 상단 카드: 최종동의금액, 진단금액 대비 동의율, 상담금액 대비 동의율.
- 전체 동의율 하단에는 의사별 진단수와 동의금액을 표시합니다.
- 미동의 환자 현황은 10개씩 페이지네이션합니다.

### 보험청구분석

- 탭: 보험청구액 통계, 보험수가별 통계, 조정건수/금액.
- 보험수가별 통계 상세 표는 환자수 높은 순으로 1페이지 20개 기준이며, 왼쪽/오른쪽 분할 또는 페이지네이션 형태로 조정한 이력이 있습니다.

## PDF 보고서

관리자 모드에서 PDF 보고서 다운로드를 제공합니다.

- 카테고리별 보고서
- 세부 탭별 보고서
- 여러 카테고리를 묶은 통합 보고서

PDF 보고서는 Supabase에 저장된 데이터를 기준으로 생성합니다.

## Supabase 데이터 삭제

잘못 업로드된 데이터는 Supabase SQL Editor에서 삭제합니다.

예시:

```sql
delete from public.analytics_data
where clinic_id = '치과_UUID'
  and category = 'sales'
  and sub_category = 'treatment_plan'
  and year = 2017;
```

월까지 지정:

```sql
delete from public.analytics_data
where clinic_id = '치과_UUID'
  and category = 'sales'
  and sub_category = 'treatment_plan'
  and year = 2026
  and month = 6;
```

주의:

- 삭제 전 `select`로 대상 행을 먼저 확인합니다.
- 여러 치과를 운영할 때는 반드시 `clinic_id` 조건을 넣습니다.
- 삭제 후 앱에서 해당 치과 계정으로 로그인해 화면 반영 여부를 확인합니다.

## 배포 체크리스트

1. `npm run build` 통과 확인
2. `.env.local`이 GitHub에 포함되지 않았는지 확인
3. Vercel 환경변수 설정 확인
4. Supabase RLS 정책 확인
5. 관리자 계정/치과 계정 `profiles` 연결 확인
6. 관리자 모드에서 대상 치과 선택 후 테스트 업로드
7. 치과 계정으로 로그인해 해당 치과 데이터만 보이는지 확인
8. PDF 보고서가 Supabase 데이터를 읽는지 확인

## Git 운영

- 사용자는 main 브랜치 직접 반영을 선호합니다.
- 작업 후 일반적으로 다음 순서로 반영합니다.

```bash
git add <changed files>
git commit -m "작업 내용"
git push origin main
```

## 보안 메모

- README에는 실제 계정 비밀번호, Supabase URL/키, Vercel 토큰을 적지 않습니다.
- Supabase `service_role` 키는 절대 브라우저 앱에 넣지 않습니다.
- 관리자 로그인 여부와 앱 계정 로그인 상태는 분리되어 있으므로, 로그아웃 시 관리자 세션도 함께 정리되는지 확인합니다.
- 치과별 데이터 분리는 `profiles.clinic_id`, `analytics_data.clinic_id`, RLS 정책으로 보장합니다.
