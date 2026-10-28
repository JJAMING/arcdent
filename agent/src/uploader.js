import os from 'node:os';
import { createClient } from '@supabase/supabase-js';

// 중계 프로그램 전용(agent) 계정으로 Supabase에 로그인합니다.
// agent 계정은 RLS로 다음만 허용됩니다:
//   - 자기 치과 실시간 현황(live_clinic_stats) 쓰기
//   - 자기 치과 EMR 접속 설정(clinic_emr_settings) 읽기
//   - 자기 치과 중계 프로그램 상태(clinic_agent_status) 쓰기

export const AGENT_VERSION = '1.5.1';

let client = null;
let clinicId = null;
let clinicName = '';

const resetConnection = () => {
    client = null;
    clinicId = null;
    clinicName = '';
};

export const connectSupabase = async (config) => {
    if (client && clinicId) return { clinicId, clinicName };
    if (!config?.url || !config?.anonKey) {
        throw new Error('Supabase 주소/키가 없습니다. setup.bat 을 다시 실행해 주세요.');
    }

    client = createClient(config.url, config.anonKey, {
        auth: { persistSession: false, autoRefreshToken: true },
    });

    const { data, error } = await client.auth.signInWithPassword({
        email: config.agentEmail,
        password: config.agentPassword,
    });
    if (error) {
        resetConnection();
        throw new Error(`Supabase 로그인 실패: ${error.message}`);
    }

    const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('clinic_id, role, clinics(name)')
        .eq('user_id', data.user.id)
        .maybeSingle();
    if (profileError) {
        resetConnection();
        throw new Error(`계정 정보 조회 실패: ${profileError.message}`);
    }
    if (!profile || profile.role !== 'agent' || !profile.clinic_id) {
        resetConnection();
        throw new Error('이 계정은 중계 프로그램용(agent)으로 등록되어 있지 않습니다. profiles 에 role=agent, clinic_id 를 연결해 주세요.');
    }

    clinicId = profile.clinic_id;
    clinicName = profile.clinics?.name || '';
    return { clinicId, clinicName };
};

/**
 * 관리자모드에서 입력한 EMR 접속 설정. 없으면 null (→ config.json 값 사용)
 * 테이블이 아직 없을 때(SQL 미실행)도 null 을 돌려 기존 방식으로 동작합니다.
 */
export const fetchEmrSettings = async () => {
    if (!client || !clinicId) throw new Error('Supabase에 연결되어 있지 않습니다.');
    const { data, error } = await client
        .from('clinic_emr_settings')
        .select('server, port, instance, database_name, interval_seconds, enabled')
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (error) {
        if (/does not exist|schema cache|PGRST205|42P01/i.test(`${error.code} ${error.message}`)) return null;
        throw new Error(`EMR 설정 조회 실패: ${error.message}`);
    }
    return data || null;
};

/** 관리자모드 "EMR 연동" 화면에 보이는 상태 보고. 실패해도 본 작업은 계속합니다. */
export const reportStatus = async ({ status, message = '', success = false }) => {
    if (!client || !clinicId) return;
    const now = new Date().toISOString();
    const row = {
        clinic_id: clinicId,
        status,
        message: String(message || '').slice(0, 500),
        last_seen_at: now,
        agent_version: AGENT_VERSION,
        hostname: os.hostname(),
        updated_at: now,
        ...(success ? { last_success_at: now } : {}),
    };
    await client.from('clinic_agent_status').upsert(row, { onConflict: 'clinic_id' }).then(() => {}, () => {});
};

export const uploadLiveStats = async ({ statDate, payload }) => {
    if (!client || !clinicId) throw new Error('Supabase에 연결되어 있지 않습니다.');
    const { error } = await client
        .from('live_clinic_stats')
        .upsert({
            clinic_id: clinicId,
            stat_date: statDate,
            payload,
            source: 'dentweb',
            updated_at: new Date().toISOString(),
        }, { onConflict: 'clinic_id,stat_date' });
    if (error) {
        // 토큰 만료 등으로 실패하면 다음 주기에 다시 로그인하도록 초기화
        resetConnection();
        throw new Error(`업로드 실패: ${error.message}`);
    }
};

// ---------------------------------------------------------------------------
// 지난 데이터 (supabase_history.sql). 테이블이 아직 없으면 조용히 건너뜁니다.
// ---------------------------------------------------------------------------
const isMissingTable = (error) => /does not exist|schema cache|PGRST205|42P01/i.test(`${error?.code} ${error?.message}`);
let historyTablesMissing = false;

export const historyAvailable = () => !historyTablesMissing;

/** rows: [{ statDate: 'YYYY-MM-DD', metrics }] — 한 번에 최대 100줄씩 저장 */
export const upsertDailyStats = async (rows) => {
    if (!client || !clinicId || historyTablesMissing || rows.length === 0) return false;
    const now = new Date().toISOString();
    for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100).map(row => ({ clinic_id: clinicId, stat_date: row.statDate, metrics: row.metrics, updated_at: now }));
        const { error } = await client.from('clinic_daily_stats').upsert(chunk, { onConflict: 'clinic_id,stat_date' });
        if (error) {
            if (isMissingTable(error)) { historyTablesMissing = true; return false; }
            throw new Error(`일별 기록 저장 실패: ${error.message}`);
        }
    }
    return true;
};

export const upsertIntradayStat = async ({ statDate, hour, metrics }) => {
    if (!client || !clinicId || historyTablesMissing) return false;
    const { error } = await client.from('clinic_intraday_stats').upsert({
        clinic_id: clinicId, stat_date: statDate, hour, metrics, updated_at: new Date().toISOString(),
    }, { onConflict: 'clinic_id,stat_date,hour' });
    if (error) {
        if (isMissingTable(error)) { historyTablesMissing = true; return false; }
        throw new Error(`시간별 기록 저장 실패: ${error.message}`);
    }
    return true;
};

export const currentClinicId = () => clinicId;

// ---------------------------------------------------------------------------
// 상담일지 환자 검색용 명단 (supabase_emr_patients.sql). 테이블이 아직 없으면 조용히 건너뜁니다.
// ---------------------------------------------------------------------------
// 테이블이 없으면 30분 동안 건너뛰고 다시 확인합니다. (SQL을 나중에 실행해도 재시작 없이 반영)
const DIRECTORY_RETRY_MS = 30 * 60 * 1000;
let directoryTablesMissing = false;
let directoryMissingAt = 0;
export const directoryAvailable = () => {
    if (directoryTablesMissing && Date.now() - directoryMissingAt > DIRECTORY_RETRY_MS) directoryTablesMissing = false;
    return !directoryTablesMissing;
};

const directoryError = (error, label) => {
    if (isMissingTable(error)) {
        directoryTablesMissing = true;
        directoryMissingAt = Date.now();
        return false;
    }
    throw new Error(`${label}: ${error.message}`);
};

/** rows: emr_recent_patients 칸 그대로 (clinic_id 제외). 500줄씩 저장 */
// 접수 상태 · 담당의사 칸은 SQL을 다시 실행해야 생깁니다. 없으면 그 두 칸만 빼고 보냅니다.
const RECEPTION_COLUMNS = ['reception_status', 'reception_doctor'];
let receptionColumnsMissing = false;
let receptionColumnsMissingAt = 0;

/** 칸이 없어서 빼고 보내던 중이면 30분마다 다시 시도합니다. 다시 시도할 차례면 true (→ 전체 명단을 다시 보냄) */
export const retryReceptionColumnsIfDue = () => {
    if (!receptionColumnsMissing || Date.now() - receptionColumnsMissingAt < DIRECTORY_RETRY_MS) return false;
    receptionColumnsMissing = false;
    return true;
};

export const upsertRecentPatients = async (rows) => {
    if (!client || !clinicId || directoryTablesMissing || rows.length === 0) return false;
    const now = new Date().toISOString();
    for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map(row => {
            const next = { ...row, clinic_id: clinicId, updated_at: now };
            if (receptionColumnsMissing) RECEPTION_COLUMNS.forEach(key => delete next[key]);
            return next;
        });
        let { error } = await client.from('emr_recent_patients').upsert(chunk, { onConflict: 'clinic_id,patient_key' });
        if (error && !receptionColumnsMissing && RECEPTION_COLUMNS.some(key => String(error.message).includes(key))) {
            receptionColumnsMissing = true;
            receptionColumnsMissingAt = Date.now();
            chunk.forEach(row => RECEPTION_COLUMNS.forEach(key => delete row[key]));
            ({ error } = await client.from('emr_recent_patients').upsert(chunk, { onConflict: 'clinic_id,patient_key' }));
        }
        if (error) return directoryError(error, '환자 명단 저장 실패');
    }
    return true;
};

/** 최근 내원일이 beforeDate('YYYY-MM-DD') 이전인 환자를 지웁니다. (30일 보관) */
export const deleteOldRecentPatients = async (beforeDate) => {
    if (!client || !clinicId || directoryTablesMissing) return false;
    const { error } = await client.from('emr_recent_patients').delete()
        .eq('clinic_id', clinicId)
        .or(`last_visit_date.lt.${beforeDate},last_visit_date.is.null`)
        .or(`last_reception_at.is.null,last_reception_at.lt.${beforeDate}T00:00:00`);
    if (error) return directoryError(error, '오래된 환자 명단 삭제 실패');
    return true;
};

/** 원장님 목록을 덴트웹 재직 의사로 맞춥니다. */
export const replaceDoctors = async (rows) => {
    if (!client || !clinicId || directoryTablesMissing) return false;
    const now = new Date().toISOString();
    if (rows.length > 0) {
        const { error } = await client.from('emr_doctors')
            .upsert(rows.map(row => ({ ...row, clinic_id: clinicId, updated_at: now })), { onConflict: 'clinic_id,staff_key' });
        if (error) return directoryError(error, '원장님 목록 저장 실패');
    }
    const keep = rows.map(row => row.staff_key);
    let query = client.from('emr_doctors').delete().eq('clinic_id', clinicId);
    if (keep.length > 0) query = query.not('staff_key', 'in', `(${keep.join(',')})`);
    const { error } = await query;
    if (error) return directoryError(error, '퇴사 원장님 정리 실패');
    return true;
};
