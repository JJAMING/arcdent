# 아크덴트 덴트웹 중계 프로그램

치과의 덴트웹 DB에서 **오늘 수납액 · 내원 · 신환/구환 · 예약** 숫자를 읽어서
3분마다 아크덴트(Supabase)로 보내는 프로그램입니다.

```
[덴트웹 DB] → [중계 프로그램 (치과 PC)] → [Supabase] → [아크덴트 홈 화면]
```

- 덴트웹 DB는 **읽기만** 합니다. (덴트웹이 외부 연동용으로 공개한 뷰/프로시저만 사용)
- **환자 이름·연락처·차트번호·생년월일은 전송하지 않습니다.** 합계 숫자만 보냅니다.
- 치과 PC에서 바깥으로 보내기만 하므로 공유기 포트를 열 필요가 없습니다.

## 보내는 숫자

| 항목 | 덴트웹 출처 | 계산 |
|---|---|---|
| 오늘 수납액 | `PUB_V진료비내역` (수납시각이 오늘) | 카드 + 현금 + 통장, 환불(n구분=2)은 차감 |
| 진료비 구성 | `PUB_V진료비내역` (진료일이 오늘) | 총진료비 / 공단부담금 / 본인부담금 / 비급여 |
| 내원 / 신환 / 구환 | `PUB_P접수목록` | 같은 환자 중복 접수는 1명, `b신환여부`로 신환 구분 |
| 진행 현황 | `PUB_P접수목록` `n상태` | 접수 / 준비완료 / 진료중 / 진료완료 / 수납완료 |
| 오늘 예약 | `PUB_V예약정보` | 이행 / 미이행 / 취소 / 보류 / 신환예약 |
| 의사별 수납 | `PUB_V진료비내역` + `PUB_V직원정보` | 담당의사별 합계 |
| 이번 달 누적 | 위 자료를 1일~오늘 | 수납액 / 내원 / 신환 |

---

## 설치 순서 (치과마다 1번)

### 1. 아크덴트용 중계 계정 만들기 (Supabase)

1. Supabase → **Authentication → Users → Add user → Create new user**
   - Email: `agent-치과코드@arcdent.local` (예: `agent-bclinic@arcdent.local`)
   - Password: 길고 복잡하게
   - **Auto Confirm User 체크**
2. 만든 사용자의 **User UID** 복사
3. **SQL Editor**에서 실행 (치과 UUID는 `clinics` 테이블에서 확인)

```sql
insert into public.profiles (user_id, clinic_id, role)
values ('중계계정_USER_UID', '치과_UUID', 'agent');
```

> `agent` 계정은 자기 치과 실시간 숫자 **쓰기만** 가능하고, 다른 분석 데이터는 볼 수 없습니다.
> 웹 화면 로그인도 막혀 있습니다.

### 2. 덴트웹 외부연동 아이디 만들기

덴트웹 안내에 따라 외부 프로그램 연동용 SQL 계정(아이디/비밀번호)을 만듭니다.

### 3. 치과 서버 PC 준비

1. **Node.js LTS** 설치: <https://nodejs.org> (설치 화면에서 계속 "Next")
2. 이 `agent` 폴더를 서버 PC에 복사 (예: `C:\arcdent-agent`)
3. 폴더 안의 **`setup.bat`** 더블클릭 → 필요한 부품 설치 + `config.json` 생성

### 4. 설정 파일 입력

메모장으로 `config.json`을 열고 입력합니다.

```json
{
  "dentweb": {
    "server": "127.0.0.1",
    "instance": "DENTWEB",
    "port": 1436,
    "database": "DentWeb",
    "user": "덴트웹 외부연동 아이디",
    "password": "덴트웹 외부연동 비밀번호"
  },
  "supabase": {
    "url": "https://프로젝트ID.supabase.co",
    "anonKey": "Supabase anon public key",
    "agentEmail": "agent-bclinic@arcdent.local",
    "agentPassword": "1단계에서 만든 비밀번호"
  },
  "intervalSeconds": 180
}
```

- `server`: 덴트웹 **서버 PC에 설치하면 `127.0.0.1`**, 다른 PC에 설치하면 서버 PC의 IP
- `url`, `anonKey`: Supabase → Project Settings → API (아크덴트 웹 앱과 같은 값)
- `config.json`에는 비밀번호가 들어 있으니 **다른 곳에 공유하지 마세요.** (GitHub에도 올라가지 않게 막혀 있습니다)

### 5. 점검 (전송 안 함)

**`check.bat`** 더블클릭 → 계산된 숫자가 화면에 나옵니다.
덴트웹의 **일일 마감 / 수납 현황** 숫자와 비교해 주세요.

- 숫자가 맞으면 → 6단계
- 다르면 → 화면을 캡처해서 개발자에게 전달 (계산 기준 보정)

### 6. 1회 전송 테스트

**`send-once.bat`** 더블클릭 → 아크덴트 홈 화면에 "오늘 실시간 현황"이 나오는지 확인

### 7. 자동 실행 등록

**`install-task.bat` 마우스 오른쪽 → 관리자 권한으로 실행**

- 지금 바로 시작되고, PC를 켤 때마다 자동으로 실행됩니다.
- 오류로 꺼지면 1분 뒤 자동으로 다시 켜집니다.
- 해제하려면 `uninstall-task.bat`을 관리자 권한으로 실행

---

## 문제 해결

| 증상 | 확인할 것 |
|---|---|
| `Failed to connect` | `config.json`의 server/port 확인. 다른 PC에 설치했다면 서버 PC 방화벽에서 1436 포트 허용 |
| `Login failed` | 덴트웹 외부연동 아이디/비밀번호 확인 |
| `Supabase 로그인 실패` | agentEmail / agentPassword, Auto Confirm 여부 확인 |
| `agent로 등록되어 있지 않습니다` | 1단계 SQL(profiles 연결) 실행 여부 확인 |
| 홈 화면에 "연결 확인 필요" | 서버 PC가 켜져 있는지, `logs` 폴더의 오늘 기록 확인 |

작업 기록은 `logs` 폴더에 날짜별로 남고 14일이 지나면 자동 삭제됩니다. (숫자만 기록, 개인정보 없음)

## 개발자용

```bash
npm test        # 집계 로직 자체 테스트 (덴트웹 없이)
npm run check   # 점검 모드
npm run once    # 1회 전송
npm start       # 실행 모드
```

홈 화면이 읽는 payload 형태는 `src/aggregate.js`의 `buildPayload`와
`src/components/home/HomeLiveSection.jsx`가 맞춰져 있어야 합니다.
