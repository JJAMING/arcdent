import sql from 'mssql';

// 덴트웹 DB(MS-SQL) 조회 모듈. 덴트웹이 외부 연동용으로 공개한 뷰/프로시저만 "읽기"로 사용합니다.
// 조회한 원본 행은 합계 계산에 필요한 칸만 남기고 바로 버립니다. (이름·연락처 등은 메모리에도 보관하지 않음)

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
            SELECT sz진료일, n구분, n총진료비, n공단부담금, n본인부담금, n비급여진료비
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
