import os from 'node:os';
import { createClient } from '@supabase/supabase-js';

// 중계 프로그램 전용(agent) 계정으로 Supabase에 로그인합니다.
// agent 계정은 RLS로 다음만 허용됩니다:
//   - 자기 치과 실시간 현황(live_clinic_stats) 쓰기
//   - 자기 치과 EMR 접속 설정(clinic_emr_settings) 읽기
//   - 자기 치과 중계 프로그램 상태(clinic_agent_status) 쓰기

export const AGENT_VERSION = '1.3.1';

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
