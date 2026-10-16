import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';
import {
    fetchPaymentsByPaidTime,
    fetchReceptions,
    fetchReservationsByRange,
    fetchTreatmentFeesByDateRange,
    ymd,
} from './dentweb.js';
import {
    buildDailyMetrics,
    summarizePayments,
    summarizeReceptions,
    summarizeReservations,
    summarizeTreatmentFees,
} from './aggregate.js';
import { currentClinicId, historyAvailable, upsertDailyStats } from './uploader.js';

// 지난 데이터 채우기
//   - 처음: 최근 13개월을 한 달씩 거슬러 올라가며 채움 (전송 주기마다 한 달씩 → PC·덴트웹 부담 최소화)
//   - 매일 밤(날짜가 바뀐 뒤 첫 주기): 최근 7일을 다시 계산 → 늦게 들어온 수정·환불 반영
// 진행 상황은 state.json 에 저장합니다. (치과 정보·비밀번호 없음)

const STATE_FILE = path.join(ROOT, 'state.json');
const BACKFILL_MONTHS = 13;
const NIGHTLY_DAYS = 7;

const readState = () => {
    try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
};
const writeState = (state) => {
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8'); } catch { /* 무시 */ }
};

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, days) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
export const toIsoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIsoDate = (text) => {
    const [y, m, d] = String(text).split('-').map(Number);
    return new Date(y, m - 1, d);
};

/** fromDate ~ toDate(포함) 하루하루의 기록을 덴트웹에서 계산 */
export const computeDays = async (fromDate, toDate, staffNames) => {
    const [paymentRows, feeRows, reservationRows] = await Promise.all([
        fetchPaymentsByPaidTime(fromDate, addDays(toDate, 1)),
        fetchTreatmentFeesByDateRange(fromDate, toDate),
        fetchReservationsByRange(fromDate, toDate),
    ]);
    const group = (rows, keyOf) => rows.reduce((map, row) => {
        const key = keyOf(row);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(row);
        return map;
    }, new Map());
    const paymentsByDay = group(paymentRows, row => String(row.sz수납시각 || '').slice(0, 8));
    const feesByDay = group(feeRows, row => String(row.sz진료일 || '').trim());
    const reservationsByDay = group(reservationRows, row => String(row.sz예약시각 || '').slice(0, 8));

    const rows = [];
    for (let day = startOfDay(fromDate); day <= toDate; day = addDays(day, 1)) {
        const key = ymd(day);
        const reception = summarizeReceptions(await fetchReceptions(day));
        rows.push({
            statDate: toIsoDate(day),
            metrics: buildDailyMetrics({
                reception,
                payments: summarizePayments(paymentsByDay.get(key) || [], staffNames),
                fees: summarizeTreatmentFees(feesByDay.get(key) || []),
                reservations: summarizeReservations(reservationsByDay.get(key) || []),
            }),
        });
    }
    return rows;
};

/**
 * 한 주기에 한 번 호출. 할 일이 있으면 조금씩(한 번에 한 가지) 처리합니다.
 */
export const maintainHistory = async ({ staffNames, log }) => {
    if (!historyAvailable()) return;
    const clinicId = currentClinicId();
    if (!clinicId) return;

    const today = startOfDay(new Date());
    const yesterday = addDays(today, -1);
    let state = readState();
    if (state.clinicId !== clinicId) state = { clinicId }; // 다른 치과 계정으로 바뀌면 처음부터

    // 1) 매일 밤: 최근 7일 재계산 (어제 최종 숫자 확정 포함)
    if (state.lastNightly !== toIsoDate(today)) {
        const rows = await computeDays(addDays(today, -NIGHTLY_DAYS), yesterday, staffNames);
        if (await upsertDailyStats(rows)) {
            state.lastNightly = toIsoDate(today);
            writeState(state);
            log('INFO', `지난 ${NIGHTLY_DAYS}일 기록 재계산 완료`);
        }
        return; // 한 주기에 한 가지 일만
    }

    // 2) 처음 설치 시: 13개월 채우기 (한 주기에 한 달씩, 최근 달부터)
    const target = new Date(today.getFullYear(), today.getMonth() - (BACKFILL_MONTHS - 1), 1);
    const oldestDone = state.backfillOldest ? fromIsoDate(state.backfillOldest) : today;
    if (oldestDone <= target) return;

    const chunkEnd = addDays(oldestDone, -1);
    const monthStart = new Date(chunkEnd.getFullYear(), chunkEnd.getMonth(), 1);
    const chunkStart = monthStart < target ? target : monthStart;
    const rows = await computeDays(chunkStart, chunkEnd, staffNames);
    if (await upsertDailyStats(rows)) {
        state.backfillOldest = toIsoDate(chunkStart);
        writeState(state);
        const done = chunkStart <= target;
        log('INFO', `지난 기록 채우기: ${toIsoDate(chunkStart)} ~ ${toIsoDate(chunkEnd)} (${rows.length}일)${done ? ' — 13개월 채우기 완료' : ''}`);
    }
};
