import { fetchActiveDoctors, fetchRecentPatients, fetchTodayReceptionPatients, ymd } from './dentweb.js';
import { deleteOldRecentPatients, directoryAvailable, replaceDoctors, upsertRecentPatients } from './uploader.js';

// 상담일지 환자 검색용 명단 동기화 (supabase_emr_patients.sql)
//  - 최근 30일 내원 환자: 30분마다 전체 확인, 오늘 접수 환자는 매 주기 반영
//  - 바뀐 줄만 보냅니다. 30일이 지난 환자는 하루 한 번 지웁니다.
//  - 재직 의사 목록: 6시간마다
// 차트번호 · 이름 · 출생연도 · 성별 · 등록일 · 최근 내원일 · 접수 시각만 다룹니다. (연락처 · 주소 없음)

const KEEP_DAYS = 30;
const FULL_SYNC_MS = 30 * 60 * 1000;
const DOCTOR_SYNC_MS = 6 * 60 * 60 * 1000;

let recentCache = new Map(); // patient_key → row
let lastFullSyncAt = 0;
let lastDoctorSyncAt = 0;
let lastCleanupDay = '';
const sentHash = new Map(); // patient_key → 마지막으로 보낸 내용

const isoDay = (date) => {
    const t = ymd(date);
    return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
};

const COLUMNS = ['patient_key', 'chart_no', 'name', 'birth_year', 'gender', 'registered_date', 'last_visit_date', 'last_reception_at'];
const completeRow = (row) => Object.fromEntries(COLUMNS.map(key => [key, row[key] ?? null]));

export const syncPatientDirectory = async ({ log }) => {
    if (!directoryAvailable()) return;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayIso = isoDay(today);
    const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - KEEP_DAYS);

    if (Date.now() - lastFullSyncAt > FULL_SYNC_MS || recentCache.size === 0) {
        const rows = await fetchRecentPatients(cutoff);
        const next = new Map(rows.map(row => [row.patient_key, completeRow(row)]));
        // 오늘 접수 시각은 다음 단계에서 다시 덮어씀
        recentCache.forEach((row, key) => {
            if (next.has(key) && row.last_reception_at) next.get(key).last_reception_at = row.last_reception_at;
        });
        recentCache = next;
        lastFullSyncAt = Date.now();
    }

    // 오늘 접수 환자: 내원일 = 오늘, 접수 시각 표시, 신환이면 등록일 = 오늘
    const todayRows = await fetchTodayReceptionPatients(today);
    todayRows.forEach(row => {
        const base = recentCache.get(row.patient_key) || completeRow({ ...row, registered_date: row.is_new ? todayIso : null });
        recentCache.set(row.patient_key, completeRow({
            ...base,
            chart_no: row.chart_no || base.chart_no,
            name: row.name || base.name,
            birth_year: row.birth_year ?? base.birth_year,
            gender: row.gender || base.gender,
            registered_date: base.registered_date || (row.is_new ? todayIso : null),
            last_visit_date: todayIso,
            last_reception_at: row.reception_at || base.last_reception_at,
        }));
    });

    const changed = [];
    recentCache.forEach((row, key) => {
        const hash = JSON.stringify(row);
        if (sentHash.get(key) !== hash) changed.push(row);
    });
    if (changed.length > 0) {
        const ok = await upsertRecentPatients(changed);
        if (ok) {
            changed.forEach(row => sentHash.set(row.patient_key, JSON.stringify(row)));
            log('INFO', `상담일지 환자 명단 ${changed.length}명 반영 (최근 ${KEEP_DAYS}일 내원 ${recentCache.size}명)`);
        }
    }

    if (lastCleanupDay !== todayIso) {
        const ok = await deleteOldRecentPatients(isoDay(cutoff));
        if (ok) {
            lastCleanupDay = todayIso;
            recentCache.forEach((row, key) => {
                if (!row.last_visit_date || row.last_visit_date < isoDay(cutoff)) {
                    recentCache.delete(key);
                    sentHash.delete(key);
                }
            });
        }
    }

    if (Date.now() - lastDoctorSyncAt > DOCTOR_SYNC_MS) {
        const ok = await replaceDoctors(await fetchActiveDoctors());
        if (ok) lastDoctorSyncAt = Date.now();
    }

    if (!directoryAvailable()) {
        log('WARN', '상담일지 환자 검색 테이블이 없어 명단 전송을 건너뜁니다. (supabase_emr_patients.sql 실행 필요)');
    }
};
