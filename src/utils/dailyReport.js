import { supabase } from '../lib/supabaseClient';

// 관리자모드 "알림톡" — 매일 저녁 마감 보고 (supabase_daily_report.sql, api/daily-report.js)
// 설정 · 기록은 Supabase(관리자만), 미리보기 · 테스트 발송은 서버 기능으로 합니다.

const isMissingTable = (error) => /does not exist|schema cache|PGRST205|42P01/i.test(`${error?.code} ${error?.message}`);
const MISSING_MESSAGE = 'Supabase에 알림톡 테이블이 없습니다. supabase_daily_report.sql 을 먼저 실행해 주세요.';

export const DEFAULT_REPORT_SETTINGS = Object.freeze({ enabled: false, sendTime: '21:00', recipients: [{ name: '원장님', phone: '' }] });

export const loadReportSettings = async (clinicId) => {
    const { data, error } = await supabase
        .from('clinic_report_settings')
        .select('enabled, send_time, recipients')
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (error) throw new Error(isMissingTable(error) ? MISSING_MESSAGE : error.message);
    if (!data) return { ...DEFAULT_REPORT_SETTINGS, recipients: [...DEFAULT_REPORT_SETTINGS.recipients] };
    const recipients = Array.isArray(data.recipients) && data.recipients.length > 0 ? data.recipients : [{ name: '원장님', phone: '' }];
    return { enabled: Boolean(data.enabled), sendTime: data.send_time || '21:00', recipients };
};

export const saveReportSettings = async (clinicId, settings) => {
    const recipients = (settings.recipients || [])
        .map(item => ({ name: String(item.name || '').trim().slice(0, 20), phone: String(item.phone || '').replace(/\D/g, '') }))
        .filter(item => item.phone);
    if (settings.enabled && recipients.length === 0) throw new Error('받는 사람 휴대폰 번호를 입력해 주세요.');
    if (recipients.some(item => !/^01\d{8,9}$/.test(item.phone))) throw new Error('휴대폰 번호를 확인해 주세요. (예: 010-1234-5678)');
    const { error } = await supabase.from('clinic_report_settings').upsert({
        clinic_id: clinicId,
        enabled: Boolean(settings.enabled),
        send_time: settings.sendTime || '21:00',
        recipients,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'clinic_id' });
    if (error) throw new Error(isMissingTable(error) ? MISSING_MESSAGE : error.message);
};

export const loadReportLogs = async (clinicId, limit = 20) => {
    const { data, error } = await supabase
        .from('clinic_report_logs')
        .select('stat_date, kind, status, recipient, message, created_at')
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) return [];
    return data || [];
};

const callReportApi = async (action, clinicId) => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error('로그인이 필요합니다.');
    let response;
    try {
        response = await fetch('/api/daily-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ action, clinicId }),
        });
    } catch {
        throw new Error('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');
    }
    if (response.status === 404 && !(response.headers.get('content-type') || '').includes('json')) {
        throw new Error('알림톡은 배포된 사이트(arcdent.vercel.app)에서만 사용할 수 있습니다.');
    }
    let result = null;
    try { result = await response.json(); } catch { /* 응답 형식 오류 */ }
    if (!response.ok || !result?.ok) throw new Error(result?.message || `요청 실패 (HTTP ${response.status})`);
    return result;
};

export const previewReport = (clinicId) => callReportApi('preview', clinicId);
export const sendTestReport = (clinicId) => callReportApi('test', clinicId);
