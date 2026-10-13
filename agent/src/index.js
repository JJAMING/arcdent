import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    closeDentweb,
    connectDentweb,
    fetchPaymentsByPaidTime,
    fetchReceptions,
    fetchReservations,
    fetchStaffNames,
    fetchTreatmentFeesByDate,
    ymd,
} from './dentweb.js';
import {
    buildPayload,
    summarizePayments,
    summarizeReceptions,
    summarizeReservations,
    summarizeTreatmentFees,
} from './aggregate.js';
import { connectSupabase, uploadLiveStats } from './uploader.js';

// 사용법
//   node src/index.js check  → 덴트웹 접속 테스트 + 계산 결과를 화면에만 출력 (전송 안 함)
//   node src/index.js once   → 1회 계산 후 아크덴트로 전송
//   node src/index.js run    → intervalSeconds 마다 계속 전송 (기본 180초)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = path.join(ROOT, 'logs');
const LOG_KEEP_DAYS = 14;
const PAST_DAY_REFRESH_MS = 60 * 60 * 1000; // 지난 날짜 접수목록은 1시간마다만 다시 조회

// ---------------------------------------------------------------------------
// 로그 (숫자/상태만 기록, 개인정보 기록 안 함)
// ---------------------------------------------------------------------------
const log = (level, message) => {
    const now = new Date();
    const line = `[${now.toLocaleString('ko-KR')}] ${level} ${message}`;
    console.log(line);
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        fs.appendFileSync(path.join(LOG_DIR, `agent-${ymd(now)}.log`), `${line}\n`, 'utf8');
    } catch { /* 로그 실패는 무시 */ }
};

const cleanupOldLogs = () => {
    try {
        const limit = Date.now() - LOG_KEEP_DAYS * 24 * 60 * 60 * 1000;
        fs.readdirSync(LOG_DIR).forEach(file => {
            const full = path.join(LOG_DIR, file);
            if (fs.statSync(full).mtimeMs < limit) fs.unlinkSync(full);
        });
    } catch { /* 폴더 없음 등 무시 */ }
};

const loadConfig = () => {
    const file = path.join(ROOT, 'config.json');
    if (!fs.existsSync(file)) {
        throw new Error('config.json 이 없습니다. config.example.json 을 복사해서 config.json 으로 만들고 값을 채워 주세요.');
    }
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!config.dentweb?.user || !config.dentweb?.password) throw new Error('config.json 의 dentweb.user / password 를 입력해 주세요.');
    return config;
};

// ---------------------------------------------------------------------------
// 집계
// ---------------------------------------------------------------------------
const receptionCache = new Map(); // 'yyyymmdd' → { summary, fetchedAt }
let staffNames = new Map();
let staffFetchedAt = 0;

const getDaySummary = async (date, isToday) => {
    const key = ymd(date);
    const cached = receptionCache.get(key);
    if (!isToday && cached && Date.now() - cached.fetchedAt < PAST_DAY_REFRESH_MS) return cached.summary;
    const summary = summarizeReceptions(await fetchReceptions(date));
    receptionCache.set(key, { summary, fetchedAt: Date.now() });
    return summary;
};

const collect = async () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    // 달이 바뀌면 지난달 캐시 정리
    const monthPrefix = ymd(today).slice(0, 6);
    Array.from(receptionCache.keys()).forEach(key => { if (!key.startsWith(monthPrefix)) receptionCache.delete(key); });

    if (Date.now() - staffFetchedAt > PAST_DAY_REFRESH_MS) {
        staffNames = await fetchStaffNames();
        staffFetchedAt = Date.now();
    }

    const monthReceptionDays = [];
    for (let day = 1; day <= today.getDate(); day += 1) {
        const date = new Date(today.getFullYear(), today.getMonth(), day);
        monthReceptionDays.push(await getDaySummary(date, day === today.getDate()));
    }
    const todayReception = monthReceptionDays[monthReceptionDays.length - 1];

    const monthPaymentRows = await fetchPaymentsByPaidTime(monthStart, tomorrow);
    const todayPrefix = ymd(today);
    const todayPaymentRows = monthPaymentRows.filter(row => String(row.sz수납시각 || '').startsWith(todayPrefix));

    const todayPayments = summarizePayments(todayPaymentRows, staffNames);
    const monthPayments = summarizePayments(monthPaymentRows, staffNames);
    const todayFees = summarizeTreatmentFees(await fetchTreatmentFeesByDate(today));
    const reservations = summarizeReservations(await fetchReservations(today));

    const statDate = `${todayPrefix.slice(0, 4)}-${todayPrefix.slice(4, 6)}-${todayPrefix.slice(6, 8)}`;
    const payload = buildPayload({ todayReception, todayPayments, todayFees, reservations, monthPayments, monthReceptionDays });
    return { statDate, payload, refundCount: todayPayments.refundCount };
};

// 자주 나오는 오류를 이해하기 쉬운 안내로 바꿉니다.
const explain = (error) => {
    const message = String(error?.message || error);
    if (/Failed to connect|Could not connect|ECONNREFUSED|ETIMEOUT|getaddrinfo/i.test(message)) {
        return `${message}
  → 덴트웹 서버 주소/포트(config.json 의 dentweb.server, port)를 확인하세요. 덴트웹 서버 PC가 아니라면 방화벽에서 1436 포트가 열려 있어야 합니다.`;
    }
    if (/Login failed/i.test(message)) {
        return `${message}
  → 덴트웹 외부연동 아이디/비밀번호(config.json 의 dentweb.user, password)를 확인하세요.`;
    }
    if (/permission|EXECUTE|SELECT permission/i.test(message)) {
        return `${message}
  → 덴트웹 외부연동 계정에 조회 권한이 없습니다. 덴트웹 고객센터에 문의하세요.`;
    }
    return message;
};

const won = (value) => `${Math.round(value).toLocaleString('ko-KR')}원`;

const printSummary = ({ statDate, payload, refundCount }) => {
    const t = payload.today;
    const m = payload.month;
    console.log('');
    console.log(`=========== ${statDate} 덴트웹 집계 결과 ===========`);
    console.log(`[오늘] 수납액   ${won(t.paid)}  (카드 ${won(t.card)} / 현금 ${won(t.cash)} / 통장 ${won(t.bank)})`);
    console.log(`[오늘] 환불     ${won(t.refund)}  (${refundCount}건, 수납액에서 이미 뺀 금액)`);
    console.log(`[오늘] 진료비   총 ${won(t.totalFee)} / 공단 ${won(t.insuranceClaim)} / 본인 ${won(t.patientShare)} / 비급여 ${won(t.nonCovered)}`);
    console.log(`[오늘] 내원     ${t.visits}명  (신환 ${t.newPatients} / 구환 ${t.returningPatients})`);
    console.log(`[오늘] 진행     접수 ${t.status.waiting} / 준비완료 ${t.status.ready} / 진료중 ${t.status.inTreatment} / 진료완료 ${t.status.treated} / 수납완료 ${t.status.paid}`);
    console.log(`[오늘] 예약     전체 ${t.reservations.total} / 이행 ${t.reservations.done} / 미이행 ${t.reservations.pending} / 취소 ${t.reservations.canceled} / 보류 ${t.reservations.hold} / 신환예약 ${t.reservations.newPatient}`);
    console.log(`[오늘] 의사별   ${t.doctors.map(d => `${d.name} ${won(d.paid)}`).join(', ') || '-'}`);
    console.log(`[이번달] 수납액 ${won(m.paid)} / 내원 ${m.visits}명 / 신환 ${m.newPatients}명 (${m.daysCounted}일치)`);
    console.log('====================================================');
    console.log('덴트웹의 일일/월 마감 화면 숫자와 비교해 주세요.');
    console.log('');
};

// ---------------------------------------------------------------------------
// 실행 모드
// ---------------------------------------------------------------------------
const runCheck = async (config) => {
    log('INFO', `덴트웹 접속 시도: ${config.dentweb.server}${Number(config.dentweb.port) > 0 ? `,${config.dentweb.port}` : `\\${config.dentweb.instance || 'DENTWEB'}`}`);
    await connectDentweb(config.dentweb);
    log('INFO', '덴트웹 접속 성공');
    const result = await collect();
    printSummary(result);

    if (config.supabase?.agentEmail && config.supabase?.agentPassword) {
        try {
            const info = await connectSupabase(config.supabase);
            log('INFO', `아크덴트(Supabase) 로그인 성공 — 대상 치과: ${info.clinicName || info.clinicId} (점검 모드라 전송은 하지 않았습니다)`);
        } catch (error) {
            log('WARN', error.message);
        }
    }
};

const runOnce = async (config) => {
    await connectDentweb(config.dentweb);
    const info = await connectSupabase(config.supabase);
    const result = await collect();
    await uploadLiveStats(result);
    log('INFO', `전송 완료 (${info.clinicName || info.clinicId}) 수납 ${won(result.payload.today.paid)} · 내원 ${result.payload.today.visits}명 · 신환 ${result.payload.today.newPatients}명`);
};

const runLoop = async (config) => {
    const intervalMs = Math.max(60, Number(config.intervalSeconds) || 180) * 1000;
    log('INFO', `실행 모드 시작 — ${intervalMs / 1000}초마다 전송`);
    cleanupOldLogs();

    let lastCleanupDay = ymd(new Date());
    const tick = async () => {
        try {
            await runOnce(config);
        } catch (error) {
            log('ERROR', explain(error));
            // 덴트웹 연결 문제면 다음 주기에 새로 접속
            await closeDentweb();
        }
        const day = ymd(new Date());
        if (day !== lastCleanupDay) {
            lastCleanupDay = day;
            cleanupOldLogs();
        }
        setTimeout(tick, intervalMs);
    };
    await tick();
};

const main = async () => {
    const mode = (process.argv[2] || 'check').toLowerCase();
    try {
        const config = loadConfig();
        if (mode === 'check') {
            await runCheck(config);
            await closeDentweb();
            process.exit(0);
        } else if (mode === 'once') {
            await runOnce(config);
            await closeDentweb();
            process.exit(0);
        } else if (mode === 'run') {
            await runLoop(config);
        } else {
            console.log('사용법: node src/index.js [check | once | run]');
            process.exit(1);
        }
    } catch (error) {
        log('ERROR', explain(error));
        await closeDentweb();
        if (mode !== 'run') process.exit(1);
    }
};

main();
