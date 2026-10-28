// Vercel 서버 기능: 관리자모드 "계정 관리"
// 치과 계정(원장님 · 병원관리자)과 덴트웹 중계 계정을 만들고, 비밀번호 재설정 · 사용 중지 · 삭제 · 권한 수정을 합니다.
//
// ⚠️ SUPABASE_SERVICE_ROLE_KEY 는 모든 권한 규칙을 무시하는 키라서 여기(서버)에서만 씁니다.
//    Vercel → Settings → Environment Variables 에만 넣고, 화면 코드(VITE_*)나 GitHub 에는 절대 넣지 않습니다.
// 요청한 사람이 로그인한 '관리자'인지 매번 확인한 뒤에만 처리합니다.

import { randomInt } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const LOGIN_DOMAIN = 'arcdent.local';
const LOGIN_ID_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const BAN_FOREVER = '876000h';
const KINDS = new Set(['director', 'manager', 'agent']);

const MENU_IDS = new Set(['home', 'sales', 'treatment', 'patient', 'new-patient', 'insurance', 'consultation', 'journal']);
const ITEM_RE = /^(home|sales|treatment|patient|new-patient|insurance|consultation|journal):[A-Za-z]{2,40}$/;

// 관리자가 직접 정하는 비밀번호: 8~64자, 영문과 숫자를 섞고, 아이디가 들어가면 안 됨
const passwordProblem = (password, loginId) => {
    if (password.length < 8 || password.length > 64) return '비밀번호는 8~64자로 정해 주세요.';
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return '비밀번호에 영문과 숫자를 함께 넣어 주세요.';
    if (/\s/.test(password)) return '비밀번호에 띄어쓰기는 쓸 수 없습니다.';
    if (loginId && password.toLowerCase().includes(String(loginId).toLowerCase())) return '비밀번호에 아이디를 넣을 수 없습니다.';
    return '';
};

const json = (res, status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
};

// 헷갈리는 글자(0 O 1 l I)를 뺀 10자리, 숫자 최소 1개
const makePassword = () => {
    const letters = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const all = letters + digits;
    const chars = Array.from({ length: 9 }, () => all[randomInt(all.length)]);
    chars.splice(randomInt(10), 0, digits[randomInt(digits.length)]);
    return chars.join('');
};

const normalizePermissions = (permissions) => {
    if (!permissions || typeof permissions !== 'object') return { hiddenMenus: [], hiddenItems: [], hideAmounts: false };
    return {
        hiddenMenus: Array.from(new Set((permissions.hiddenMenus || []).filter(id => MENU_IDS.has(id)))),
        hiddenItems: Array.from(new Set((permissions.hiddenItems || []).filter(id => ITEM_RE.test(String(id))))),
        hideAmounts: Boolean(permissions.hideAmounts),
    };
};

const loginIdOf = (email = '') => (email.endsWith(`@${LOGIN_DOMAIN}`) ? email.slice(0, -LOGIN_DOMAIN.length - 1) : email);

const kindOf = (profile) => {
    if (profile.role === 'agent') return 'agent';
    return profile.permissions ? 'manager' : 'director';
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return json(res, 405, { ok: false, message: 'POST 요청만 받습니다.' });

    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        return json(res, 500, {
            ok: false,
            code: 'missing_service_key',
            message: 'Vercel 환경변수에 SUPABASE_SERVICE_ROLE_KEY 가 없습니다. 설정 후 다시 배포해 주세요.',
        });
    }
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    // 1) 요청한 사람이 로그인한 관리자인지 확인
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return json(res, 401, { ok: false, message: '로그인이 필요합니다.' });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData?.user) return json(res, 401, { ok: false, message: '로그인 정보가 만료되었습니다. 다시 로그인해 주세요.' });
    const { data: me } = await admin.from('profiles').select('role').eq('user_id', authData.user.id).maybeSingle();
    if (me?.role !== 'admin') return json(res, 403, { ok: false, message: '관리자만 사용할 수 있습니다.' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { action } = body;

    // 대상 계정 확인: 관리자 계정은 이 기능으로 절대 건드리지 않음
    const loadTarget = async (userId) => {
        if (!userId) return null;
        const { data } = await admin.from('profiles').select('user_id, clinic_id, role, display_name, permissions').eq('user_id', userId).maybeSingle();
        if (!data || data.role === 'admin') return null;
        return data;
    };

    try {
        if (action === 'list') {
            const { clinicId } = body;
            if (!clinicId) return json(res, 400, { ok: false, message: '치과를 선택해 주세요.' });
            const { data: profiles, error } = await admin
                .from('profiles')
                .select('user_id, clinic_id, role, display_name, permissions, created_at')
                .eq('clinic_id', clinicId)
                .in('role', ['clinic_user', 'agent'])
                .order('created_at', { ascending: true });
            if (error) {
                if (/display_name|permissions/.test(error.message)) {
                    return json(res, 400, { ok: false, code: 'missing_sql', message: 'supabase_accounts.sql 을 먼저 실행해 주세요.' });
                }
                throw error;
            }
            const accounts = await Promise.all((profiles || []).map(async (profile) => {
                const { data: userData } = await admin.auth.admin.getUserById(profile.user_id);
                const user = userData?.user;
                const bannedUntil = user?.banned_until ? new Date(user.banned_until) : null;
                return {
                    userId: profile.user_id,
                    loginId: loginIdOf(user?.email || ''),
                    email: user?.email || '',
                    displayName: profile.display_name || '',
                    kind: kindOf(profile),
                    permissions: profile.permissions || null,
                    enabled: !(bannedUntil && bannedUntil > new Date()),
                    lastSignInAt: user?.last_sign_in_at || null,
                    createdAt: profile.created_at,
                };
            }));
            return json(res, 200, { ok: true, accounts });
        }

        if (action === 'create') {
            const { clinicId, kind } = body;
            const loginId = String(body.loginId || '').trim().toLowerCase();
            const displayName = String(body.displayName || '').trim().slice(0, 30);
            if (!KINDS.has(kind)) return json(res, 400, { ok: false, message: '계정 종류를 선택해 주세요.' });
            if (!LOGIN_ID_RE.test(loginId)) {
                return json(res, 400, { ok: false, message: '아이디는 영문 소문자·숫자로 시작하는 3~30자입니다. (영문·숫자·. _ - 만 사용)' });
            }
            const { data: clinic } = await admin.from('clinics').select('id, name').eq('id', clinicId).maybeSingle();
            if (!clinic) return json(res, 400, { ok: false, message: '치과를 찾을 수 없습니다.' });

            // 직접 입력한 비밀번호가 있으면 그것으로 (중계 계정은 항상 자동 생성)
            const customPassword = kind === 'agent' ? '' : String(body.password || '');
            if (customPassword) {
                const problem = passwordProblem(customPassword, loginId);
                if (problem) return json(res, 400, { ok: false, message: problem });
            }
            const password = customPassword || makePassword();
            const { data: created, error } = await admin.auth.admin.createUser({
                email: `${loginId}@${LOGIN_DOMAIN}`,
                password,
                email_confirm: true,
                user_metadata: { display_name: displayName },
            });
            if (error || !created?.user) {
                const taken = /already|registered|exists/i.test(error?.message || '');
                return json(res, 400, { ok: false, message: taken ? '이미 쓰고 있는 아이디입니다. 다른 아이디를 넣어 주세요.' : `만들지 못했습니다: ${error?.message || '알 수 없는 오류'}` });
            }
            const userId = created.user.id;
            const { error: insertError } = await admin.from('profiles').insert({
                user_id: userId,
                clinic_id: clinicId,
                role: kind === 'agent' ? 'agent' : 'clinic_user',
                display_name: displayName || (kind === 'agent' ? 'EMR 중계' : kind === 'manager' ? '병원관리자' : '원장님'),
                permissions: kind === 'manager' ? normalizePermissions(body.permissions) : null,
            });
            if (insertError) {
                await admin.auth.admin.deleteUser(userId); // 반쪽짜리 계정이 남지 않게
                if (/display_name|permissions/.test(insertError.message)) {
                    return json(res, 400, { ok: false, code: 'missing_sql', message: 'supabase_accounts.sql 을 먼저 실행해 주세요.' });
                }
                return json(res, 400, { ok: false, message: `만들지 못했습니다: ${insertError.message}` });
            }
            return json(res, 200, {
                ok: true,
                message: `${clinic.name} 계정 "${loginId}"을(를) 만들었습니다.`,
                loginId,
                email: `${loginId}@${LOGIN_DOMAIN}`,
                password,
                clinicName: clinic.name,
            });
        }

        const target = await loadTarget(body.userId);
        if (!target) return json(res, 404, { ok: false, message: '계정을 찾을 수 없습니다.' });

        if (action === 'resetPassword') {
            const customPassword = String(body.password || '');
            if (customPassword && kindOf(target) === 'agent') {
                return json(res, 400, { ok: false, message: '중계 계정은 비밀번호를 직접 정할 수 없습니다. (자동 생성만 가능)' });
            }
            if (customPassword) {
                const { data: userData } = await admin.auth.admin.getUserById(target.user_id);
                const problem = passwordProblem(customPassword, loginIdOf(userData?.user?.email || ''));
                if (problem) return json(res, 400, { ok: false, message: problem });
            }
            const password = customPassword || makePassword();
            const { error } = await admin.auth.admin.updateUserById(target.user_id, { password });
            if (error) throw error;
            return json(res, 200, { ok: true, message: customPassword ? '비밀번호를 바꿨습니다.' : '비밀번호를 새로 만들었습니다.', password });
        }

        if (action === 'setEnabled') {
            const enabled = Boolean(body.enabled);
            const { error } = await admin.auth.admin.updateUserById(target.user_id, { ban_duration: enabled ? 'none' : BAN_FOREVER });
            if (error) throw error;
            return json(res, 200, { ok: true, message: enabled ? '계정을 다시 사용하게 했습니다.' : '계정을 사용 중지했습니다. (로그인 차단)' });
        }

        if (action === 'update') {
            if (target.role !== 'clinic_user') return json(res, 400, { ok: false, message: '중계 계정은 권한을 바꿀 수 없습니다.' });
            const kind = body.kind === 'manager' ? 'manager' : 'director';
            const patch = {
                display_name: String(body.displayName ?? target.display_name ?? '').trim().slice(0, 30),
                permissions: kind === 'manager' ? normalizePermissions(body.permissions) : null,
            };
            const { error } = await admin.from('profiles').update(patch).eq('user_id', target.user_id);
            if (error) throw error;
            return json(res, 200, { ok: true, message: '계정 정보를 저장했습니다. (해당 계정은 다시 로그인하면 바로 적용)' });
        }

        if (action === 'delete') {
            const { error } = await admin.auth.admin.deleteUser(target.user_id);
            if (error) throw error;
            await admin.from('profiles').delete().eq('user_id', target.user_id);
            return json(res, 200, { ok: true, message: '계정을 삭제했습니다.' });
        }

        return json(res, 400, { ok: false, message: '알 수 없는 요청입니다.' });
    } catch (error) {
        return json(res, 500, { ok: false, message: `처리 중 오류: ${error?.message || error}` });
    }
}
