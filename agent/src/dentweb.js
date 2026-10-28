import sql from 'mssql';

// 덴트웹 DB(MS-SQL) 조회 모듈. 덴트웹이 외부 연동용으로 공개한 뷰/프로시저만 "읽기"로 사용합니다.
// 조회한 원본 행은 합계 계산에 필요한 칸만 남기고 바로 버립니다. (연락처·주소 등은 조회하지 않음)
// 예외: 상담일지 환자 검색용 최근 내원 환자 명단(fetchRecentPatients 등)은 차트번호·이름·출생연도·성별·날짜만 읽습니다.

let pool = null;
let poolKey = '';

export const connectDentweb = async (config) => {
    // 관리자모드에서 서버 주소/포트가 바뀌면 기존 연결을 닫고 새로 접속합니다.
    const key = [config.server, config.port, config.instance, config.database, config.user].join('|');
    if (pool?.connected && poolKey === key) return pool;
    if (pool) await closeDentweb();
    poolKey = key;
    const usePort = Number(config.port) > 0;
    pool = await new sql.ConnectionPool({
        server: config.server,
        port: usePort ? Number(config.port) : undefined,
        database: config.database || 'DentWeb',
        user: config.user,
        password: config.password,
        connectionTimeout: 15000,
        requestTimeout: 30000,
        pool: { max: 2, min: 0, idleTimeoutMillis: 60000 },
        options: {
            encrypt: false,
            trustServerCertificate: true,
            // 포트를 지정하면 포트로, 아니면 인스턴스 이름(DENTWEB)으로 접속
            ...(usePort ? {} : { instanceName: config.instance || 'DENTWEB' }),
        },
    }).connect();
    pool.on('error', () => { pool = null; });
    return pool;
};

export const closeDentweb = async () => {
    if (pool) {
        const current = pool;
        pool = null;
        await current.close().catch(() => {});
    }
};

const pad2 = (value) => String(value).padStart(2, '0');
export const ymd = (date) => `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;

/** 직원 ID → 이름 (의사별 수납액 표시에 사용) */
export const fetchStaffNames = async () => {
    const result = await pool.request().query('SELECT nID, sz이름 FROM dbo.PUB_V직원정보');
    return new Map(result.recordset.map(row => [Number(row.nID), String(row.sz이름 || '').trim()]));
};

/** 하루 접수목록 — 상태/신환여부/환자ID(중복 제거용)만 남깁니다 */
export const fetchReceptions = async (date) => {
    const result = await pool.request()
        .input('date', sql.VarChar(8), ymd(date))
        .query('EXEC dbo.PUB_P접수목록 @date');
    return result.recordset.map(row => ({
        n상태: row.n상태,
        b신환여부: row.b신환여부,
        n환자ID: row.n환자ID,
    }));
};

/**
 * 수납 기준 진료비내역 (from 00:00 ~ to 직전까지 수납된 건)
 * 금액 칸만 조회합니다 — 환자ID, 치료내용, 메모는 조회하지 않습니다.
 */
export const fetchPaymentsByPaidTime = async (fromDate, toDate) => {
    const result = await pool.request()
        .input('from', sql.Char(14), `${ymd(fromDate)}000000`)
        .input('to', sql.Char(14), `${ymd(toDate)}000000`)
        .query(`
            SELECT n구분, n담당의사, n카드수납액, n현금수납액, n통장수납액, sz수납시각
            FROM dbo.PUB_V진료비내역
            WHERE sz수납시각 >= @from AND sz수납시각 < @to
        `);
    return result.recordset;
};

/**
 * 진료일 기준 진료비 구성 (총진료비/공단부담금/본인부담금/비급여), fromDate~toDate 포함
 * 공단부담금(청구액)은 덴트웹 월간 장부처럼 진료일 기준으로 집계합니다.
 */
export const fetchTreatmentFeesByDateRange = async (fromDate, toDate) => {
    const result = await pool.request()
        .input('from', sql.Char(8), ymd(fromDate))
        .input('to', sql.Char(8), ymd(toDate))
        .query(`
            SELECT sz진료일, n환자ID, n구분, n총진료비, n공단부담금, n본인부담금, n비급여진료비
            FROM dbo.PUB_V진료비내역
            WHERE sz진료일 >= @from AND sz진료일 <= @to
        `);
    return result.recordset;
};

/** 하루 예약 — 이행현황/예약종류/환자ID 부호(신환예약 판별)만 조회 */
export const fetchReservations = async (date) => {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    const result = await pool.request()
        .input('from', sql.Char(12), `${ymd(date)}0000`)
        .input('to', sql.Char(12), `${ymd(next)}0000`)
        .query(`
            SELECT n환자ID, n예약종류, n이행현황
            FROM dbo.PUB_V예약정보
            WHERE sz예약시각 >= @from AND sz예약시각 < @to
        `);
    return result.recordset;
};

/** 기간 예약 (fromDate 00:00 ~ toDate 다음날 00:00 전) — 날짜별로 나누기 위해 예약시각도 조회 */
export const fetchReservationsByRange = async (fromDate, toDate) => {
    const next = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1);
    const result = await pool.request()
        .input('from', sql.Char(12), `${ymd(fromDate)}0000`)
        .input('to', sql.Char(12), `${ymd(next)}0000`)
        .query(`
            SELECT n환자ID, n예약종류, n이행현황, sz예약시각
            FROM dbo.PUB_V예약정보
            WHERE sz예약시각 >= @from AND sz예약시각 < @to
        `);
    return result.recordset;
};

/**
 * 날짜별 신규 등록 환자 수 { 'yyyymmdd': 명 } — 접수목록이 없는 오래된 날짜의 '신환' 대체 계산용
 * (덴트웹 접수목록은 최근 약 30일만 제공됨)
 */
export const fetchNewRegistrationsByRange = async (fromDate, toDate) => {
    const next = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1);
    const result = await pool.request()
        .input('from', sql.VarChar(14), `${ymd(fromDate)}000000`)
        .input('to', sql.VarChar(14), `${ymd(next)}000000`)
        .query(`
            SELECT LEFT(sz등록시각, 8) AS d, COUNT(*) AS cnt
            FROM dbo.PUB_V환자정보
            WHERE sz등록시각 >= @from AND sz등록시각 < @to
            GROUP BY LEFT(sz등록시각, 8)
        `);
    return new Map(result.recordset.map(row => [String(row.d), Number(row.cnt) || 0]));
};

// ---------------------------------------------------------------------------
// 상담일지 환자 검색용 (supabase_emr_patients.sql)
//   차트번호 · 이름 · 출생연도 · 성별 · 등록일 · 최근 내원일만 읽습니다. (연락처 · 주소 · 메모 없음)
// ---------------------------------------------------------------------------
const toIsoDate = (value) => {
    const text = String(value || '').trim();
    return /^\d{8}/.test(text) ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` : null;
};
const toBirthYear = (value) => {
    const year = Number(String(value || '').slice(0, 4));
    return year >= 1900 && year <= new Date().getFullYear() ? year : null;
};
// 덴트웹 b성별: true = 여자, false = 남자
const toGender = (value) => (value === true || value === 1 ? 'F' : value === false || value === 0 ? 'M' : '');
const toTimestamp = (value) => {
    const t = String(value || '').trim();
    if (!/^\d{14}$/.test(t)) return null;
    const date = new Date(Number(t.slice(0, 4)), Number(t.slice(4, 6)) - 1, Number(t.slice(6, 8)), Number(t.slice(8, 10)), Number(t.slice(10, 12)), Number(t.slice(12, 14)));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/** fromDate 이후 내원했거나 새로 등록된 환자 */
export const fetchRecentPatients = async (fromDate) => {
    const result = await pool.request()
        .input('from', sql.VarChar(8), ymd(fromDate))
        .input('from14', sql.VarChar(14), `${ymd(fromDate)}000000`)
        .query(`
            SELECT n환자ID, sz차트번호, sz이름, b성별, sz생년월일, sz등록시각, sz최종내원일
            FROM dbo.PUB_V환자정보
            WHERE sz최종내원일 >= @from OR sz등록시각 >= @from14
        `);
    return result.recordset
        .filter(row => Number(row.n환자ID) > 0)
        .map(row => ({
            patient_key: String(row.n환자ID),
            chart_no: String(row.sz차트번호 || '').trim(),
            name: String(row.sz이름 || '').trim(),
            birth_year: toBirthYear(row.sz생년월일),
            gender: toGender(row.b성별),
            registered_date: toIsoDate(row.sz등록시각),
            last_visit_date: toIsoDate(row.sz최종내원일),
        }));
};

/** 오늘 접수 환자 (접수 시각 포함) — 오늘 상담할 환자를 검색 목록 맨 위에 보여주기 위함 */
export const fetchTodayReceptionPatients = async (date) => {
    const result = await pool.request()
        .input('date', sql.VarChar(8), ymd(date))
        .query('EXEC dbo.PUB_P접수목록 @date');
    return result.recordset
        .filter(row => Number(row.n환자ID) > 0)
        .map(row => ({
            patient_key: String(row.n환자ID),
            chart_no: String(row.sz차트번호 || '').trim(),
            name: String(row.sz이름 || '').trim(),
            birth_year: toBirthYear(row.sz생년월일),
            gender: toGender(row.b성별),
            is_new: row.b신환여부 === true || row.b신환여부 === 1,
            reception_at: toTimestamp(row.sz접수시각),
        }));
};

/** 재직 중인 의사 (직종 1 = 의사, 퇴사일 없음) — 상담일지 '담당 원장님' 자동 채움 */
export const fetchActiveDoctors = async () => {
    const result = await pool.request().query(`
        SELECT nID, sz이름 FROM dbo.PUB_V직원정보
        WHERE n직종 = 1 AND (sz퇴사일 IS NULL OR LTRIM(RTRIM(sz퇴사일)) = '')
    `);
    return result.recordset
        .map(row => ({ staff_key: String(row.nID), name: String(row.sz이름 || '').trim() }))
        .filter(row => row.name);
};
