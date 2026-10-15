import { supabase } from '../lib/supabaseClient';
import { isMissingTableError } from './clinicOperations';

// 관리자모드 "EMR 연동": 치과별 덴트웹 접속 설정 + 중계 프로그램 상태
// 테이블은 supabase_emr_settings.sql 로 만듭니다. (덴트웹 비밀번호는 저장하지 않음)

const MISSING_TABLE_MESSAGE = 'Supabase에 EMR 연동 테이블이 없습니다. supabase_emr_settings.sql 을 SQL Editor에서 먼저 실행해 주세요.';

const throwFriendly = (error) => {
    if (isMissingTableError(error)) throw new Error(MISSING_TABLE_MESSAGE);
    throw error;
};

export const DEFAULT_EMR_SETTINGS = Object.freeze({
    server: '',
    port: 1436,
    instance: 'DENTWEB',
    databaseName: 'DentWeb',
    intervalSeconds: 180,
    enabled: true,
});

const fromRow = (row) => ({
    server: row?.server || '',
    port: row?.port ?? '',
    instance: row?.instance || 'DENTWEB',
    databaseName: row?.database_name || 'DentWeb',
    intervalSeconds: Number(row?.interval_seconds) || 180,
    enabled: row ? row.enabled !== false : true,
});

/** 전체 치과의 설정 + 상태 (관리자만 조회 가능) */
export const loadEmrOverview = async () => {
    const [settingsResult, statusResult] = await Promise.all([
        supabase.from('clinic_emr_settings').select('clinic_id, server, port, instance, database_name, interval_seconds, enabled, updated_at'),
        supabase.from('clinic_agent_status').select('clinic_id, status, message, last_seen_at, last_success_at, agent_version, hostname'),
    ]);
    if (settingsResult.error) throwFriendly(settingsResult.error);
    if (statusResult.error) throwFriendly(statusResult.error);
    return {
        settings: Object.fromEntries((settingsResult.data || []).map(row => [row.clinic_id, { ...fromRow(row), exists: true }])),
        statuses: Object.fromEntries((statusResult.data || []).map(row => [row.clinic_id, row])),
    };
};

const IP_OR_HOST = /^[A-Za-z0-9.\-_]+$/;

export const saveEmrSettings = async ({ clinicId, settings }) => {
    if (!clinicId) throw new Error('치과를 먼저 선택해 주세요.');
    const server = String(settings.server || '').trim();
    if (server && !IP_OR_HOST.test(server)) {
        throw new Error('서버 주소는 IP(예: 192.168.0.150) 또는 PC 이름만 입력해 주세요. "\\DENTWEB" 같은 인스턴스 이름은 아래 칸에 따로 넣습니다.');
    }
    const port = settings.port === '' || settings.port === null ? null : Number(settings.port);
    if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) throw new Error('포트는 1~65535 사이 숫자입니다.');
    const interval = Number(settings.intervalSeconds) || 180;
    if (interval < 60 || interval > 3600) throw new Error('전송 간격은 60~3600초 사이로 입력해 주세요.');

    const { error } = await supabase.from('clinic_emr_settings').upsert({
        clinic_id: clinicId,
        server,
        port,
        instance: String(settings.instance || 'DENTWEB').trim() || 'DENTWEB',
        database_name: String(settings.databaseName || 'DentWeb').trim() || 'DentWeb',
        interval_seconds: interval,
        enabled: Boolean(settings.enabled),
        updated_at: new Date().toISOString(),
    }, { onConflict: 'clinic_id' });
    if (error) throwFriendly(error);
};

const minutesSince = (iso, now = Date.now()) => (iso ? (now - new Date(iso).getTime()) / 60000 : null);

export const formatAgo = (iso, now = Date.now()) => {
    const minutes = minutesSince(iso, now);
    if (minutes === null) return '-';
    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${Math.floor(minutes)}분 전`;
    if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}시간 전`;
    return `${Math.floor(minutes / 60 / 24)}일 전`;
};

/**
 * 화면에 보일 연동 상태
 * - 정상: 최근 보고가 정상이고 (전송 간격 × 3, 최소 10분) 이내
 * - 연결 끊김: 보고가 끊김 (PC 꺼짐, 인터넷 끊김, 프로그램 중지 등)
 * - 오류: 프로그램은 살아 있지만 덴트웹 접속 등에서 실패
 */
export const describeAgentState = ({ setting, status, now = Date.now() }) => {
    if (!status) {
        return setting?.exists
            ? { tone: 'idle', label: '설치 대기', hint: '중계 프로그램이 아직 보고하지 않았습니다.' }
            : { tone: 'idle', label: '미설정', hint: '서버 정보를 입력하고 중계 프로그램을 설치하세요.' };
    }
    if (status.status === 'disabled') return { tone: 'idle', label: '중지', hint: '관리자모드에서 연동을 중지했습니다.' };
    const limitMinutes = Math.max(10, ((setting?.intervalSeconds || 180) * 3) / 60);
    const minutes = minutesSince(status.last_seen_at, now);
    if (minutes === null || minutes > limitMinutes) {
        return { tone: 'bad', label: '연결 끊김', hint: `마지막 보고 ${formatAgo(status.last_seen_at, now)} — PC 전원·인터넷·프로그램 확인` };
    }
    if (status.status === 'error') return { tone: 'warn', label: '오류', hint: status.message || '원인 미상' };
    return { tone: 'good', label: '정상', hint: status.message || '' };
};
