// Vercel 서버 기능: 매일 저녁 카카오 알림톡 마감 보고 (솔라피)
//
//  1) 예약 발송: Supabase pg_cron 이 10분마다 { action: 'scheduled' } 로 부릅니다. (헤더 x-cron-secret 확인)
//     → 알림톡을 켠 치과 중 발송 시각(기본 21:00)이 지났고 오늘 아직 안 보낸 곳에만 보냅니다.
//  2) 관리자 화면: { action: 'preview' | 'test', clinicId } (로그인한 관리자만)
//
// 환경변수 (Vercel → Settings → Environment Variables, 화면 코드나 GitHub 에는 넣지 않음)
//   SUPABASE_SERVICE_ROLE_KEY, REPORT_CRON_SECRET,
//   SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_PFID(카카오 채널 연결 ID), SOLAPI_TEMPLATE_ID,
//   SOLAPI_SENDER(선택: 알림톡 실패 시 문자로 대신 보낼 발신번호)

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { TEMPLATE_BUTTON, TEMPLATE_TEXT, buildReport, kstNow, maskPhone, renderTemplate } from './_lib/dailyReport.js';

const MAX_FAILURES_PER_DAY = 3;

const json = (res, status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
};

const solapiMissing = () => ['SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'SOLAPI_PFID', 'SOLAPI_TEMPLATE_ID'].filter(key => !process.env[key]);

const sameSecret = (given, expected) => {
    const a = Buffer.from(String(given || ''));
    const b = Buffer.from(String(expected || ''));
    return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
};

/** 솔라피 알림톡 1건 */
const sendAlimtalk = async ({ to, variables }) => {
    const apiKey = process.env.SOLAPI_API_KEY;
    const apiSecret = process.env.SOLAPI_API_SECRET;
    const date = new Date().toISOString();
    const salt = randomBytes(16).toString('hex');
    const signature = createHmac('sha256', apiSecret).update(date + salt).digest('hex');
    const sender = String(process.env.SOLAPI_SENDER || '').replace(/\D/g, '');
    const message = {
        to: String(to).replace(/\D/g, ''),
        type: 'ATA',
        kakaoOptions: {
            pfId: process.env.SOLAPI_PFID,
            templateId: process.env.SOLAPI_TEMPLATE_ID,
            variables,
            disableSms: !sender,
        },
        ...(sender ? { from: sender } : {}),
    };
    const response = await fetch('https://api.solapi.com/messages/v4/send-many/detail', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
        },
        body: JSON.stringify({ messages: [message] }),
    });
    const result = await response.json().catch(() => ({}));
    const failed = Array.isArray(result.failedMessageList) ? result.failedMessageList : [];
    const ok = response.ok && failed.length === 0;
    const detail = failed[0]?.statusMessage || result.errorMessage || result.message || `HTTP ${response.status}`;
    return { ok, detail: ok ? '' : String(detail).slice(0, 300) };
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return json(res, 405, { ok: false, message: 'POST 요청만 받습니다.' });
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return json(res, 500, { ok: false, message: 'Vercel 환경변수에 SUPABASE_SERVICE_ROLE_KEY 가 없습니다.' });
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    const now = kstNow();

    // 치과 한 곳의 오늘 보고 만들기
    const prepare = async (clinicId) => {
        const monthStart = `${now.year}-${String(now.month).padStart(2, '0')}-01`;
        const lastDay = new Date(Date.UTC(now.year, now.month, 0)).getUTCDate();
        const monthEnd = `${now.year}-${String(now.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        const [clinicRes, liveRes, goalRes, hoursRes, holidayRes, featureRes] = await Promise.all([
            admin.from('clinics').select('name').eq('id', clinicId).maybeSingle(),
            admin.from('live_clinic_stats').select('payload, updated_at').eq('clinic_id', clinicId).eq('stat_date', now.dateKey).maybeSingle(),
            admin.from('clinic_goals').select('sales_goal, new_patient_goal').eq('clinic_id', clinicId).eq('year', now.year).eq('month', now.month).maybeSingle(),
            admin.from('clinic_operating_hours').select('weekly').eq('clinic_id', clinicId).maybeSingle(),
            admin.from('clinic_holidays').select('holiday_date').eq('clinic_id', clinicId).gte('holiday_date', monthStart).lte('holiday_date', monthEnd),
            admin.from('clinic_feature_settings').select('settings').eq('clinic_id', clinicId).maybeSingle(),
        ]);
        return buildReport({
            clinicName: clinicRes.data?.name || '치과',
            now,
            live: liveRes.data || null,
            goal: goalRes.data || null,
            weekly: hoursRes.data?.weekly || null,
            holidays: (holidayRes.data || []).map(row => row.holiday_date),
            basis: featureRes.data?.settings?.goalSalesBasis === 'paid' ? 'paid' : 'total',
        });
    };

    const log = (row) => admin.from('clinic_report_logs').insert({ stat_date: now.dateKey, ...row }).then(() => {}, () => {});

    // 받는 사람 모두에게 보내고 기록
    const deliver = async ({ clinicId, recipients, report, kind }) => {
        const text = renderTemplate(report.variables);
        const results = [];
        for (const recipient of recipients) {
            const phone = String(recipient?.phone || '').replace(/\D/g, '');
            if (phone.length < 10) continue;
            let result;
            try {
                result = await sendAlimtalk({ to: phone, variables: report.variables });
            } catch (error) {
                result = { ok: false, detail: String(error?.message || error).slice(0, 300) };
            }
            await log({ clinic_id: clinicId, kind, status: result.ok ? 'sent' : 'failed', recipient: maskPhone(phone), message: result.ok ? text : `실패: ${result.detail}` });
            results.push({ recipient: maskPhone(phone), name: recipient?.name || '', ...result });
        }
        return results;
    };

    try {
        // ------------------------------------------------------------------ 예약 발송
        if (body.action === 'scheduled') {
            if (!sameSecret(req.headers['x-cron-secret'], process.env.REPORT_CRON_SECRET)) {
                return json(res, 401, { ok: false, message: 'cron secret 이 맞지 않습니다.' });
            }
            if (solapiMissing().length > 0) return json(res, 200, { ok: true, skipped: 'solapi_not_configured' });

            const { data: settings } = await admin.from('clinic_report_settings').select('clinic_id, send_time, recipients').eq('enabled', true);
            const summary = [];
            for (const setting of settings || []) {
                if (now.hhmm < setting.send_time) continue;
                const { data: todayLogs } = await admin.from('clinic_report_logs')
                    .select('status').eq('clinic_id', setting.clinic_id).eq('stat_date', now.dateKey).eq('kind', 'scheduled');
                const statuses = (todayLogs || []).map(row => row.status);
                if (statuses.includes('sent') || statuses.includes('skipped')) continue;
                if (statuses.filter(status => status === 'failed').length >= MAX_FAILURES_PER_DAY) continue;

                const report = await prepare(setting.clinic_id);
                if (!report.openToday || !report.hasData) {
                    await log({ clinic_id: setting.clinic_id, kind: 'scheduled', status: 'skipped', message: !report.openToday ? '휴진일이라 보내지 않음' : '오늘 EMR 자료가 없어 보내지 않음' });
                    summary.push({ clinicId: setting.clinic_id, skipped: true });
                    continue;
                }
                const results = await deliver({ clinicId: setting.clinic_id, recipients: setting.recipients || [], report, kind: 'scheduled' });
                summary.push({ clinicId: setting.clinic_id, sent: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length });
            }
            return json(res, 200, { ok: true, now: `${now.dateKey} ${now.hhmm}`, summary });
        }

        // ------------------------------------------------------------------ 관리자 화면
        const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        if (!token) return json(res, 401, { ok: false, message: '로그인이 필요합니다.' });
        const { data: authData, error: authError } = await admin.auth.getUser(token);
        if (authError || !authData?.user) return json(res, 401, { ok: false, message: '로그인 정보가 만료되었습니다. 다시 로그인해 주세요.' });
        const { data: me } = await admin.from('profiles').select('role').eq('user_id', authData.user.id).maybeSingle();
        if (me?.role !== 'admin') return json(res, 403, { ok: false, message: '관리자만 사용할 수 있습니다.' });

        const { clinicId } = body;
        if (!clinicId) return json(res, 400, { ok: false, message: '치과를 선택해 주세요.' });
        const report = await prepare(clinicId);

        if (body.action === 'preview') {
            return json(res, 200, {
                ok: true,
                text: renderTemplate(report.variables),
                templateText: TEMPLATE_TEXT,
                templateButton: TEMPLATE_BUTTON,
                hasData: report.hasData,
                openToday: report.openToday,
                missingEnv: [...solapiMissing(), ...(process.env.REPORT_CRON_SECRET ? [] : ['REPORT_CRON_SECRET'])],
                smsFallback: Boolean(process.env.SOLAPI_SENDER),
            });
        }

        if (body.action === 'test') {
            const missing = solapiMissing();
            if (missing.length > 0) return json(res, 400, { ok: false, message: `Vercel 환경변수가 없습니다: ${missing.join(', ')}` });
            const { data: setting } = await admin.from('clinic_report_settings').select('recipients').eq('clinic_id', clinicId).maybeSingle();
            const recipients = setting?.recipients || [];
            if (recipients.length === 0) return json(res, 400, { ok: false, message: '받는 사람을 먼저 저장해 주세요.' });
            const results = await deliver({ clinicId, recipients, report, kind: 'test' });
            const failed = results.filter(r => !r.ok);
            return json(res, failed.length ? 400 : 200, {
                ok: failed.length === 0,
                message: failed.length ? `발송 실패: ${failed.map(r => r.detail).join(' / ')}` : `${results.length}명에게 테스트 알림톡을 보냈습니다.`,
            });
        }

        return json(res, 400, { ok: false, message: '알 수 없는 요청입니다.' });
    } catch (error) {
        return json(res, 500, { ok: false, message: String(error?.message || error) });
    }
}
