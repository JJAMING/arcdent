import { supabase } from '../lib/supabaseClient';

// 관리자모드 "계정 관리" → Vercel 서버 기능(api/admin-accounts.js) 호출
// 서버가 로그인 토큰으로 관리자인지 확인한 뒤 계정을 만들거나 바꿉니다.

export const LOGIN_DOMAIN = 'arcdent.local';
export const LOGIN_ID_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;

export const ACCOUNT_KIND_LABEL = {
    director: '원장님',
    manager: '병원관리자',
    agent: 'EMR 중계 계정',
};

const callAdminApi = async (action, payload = {}) => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error('로그인이 필요합니다.');

    let response;
    try {
        response = await fetch('/api/admin-accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ action, ...payload }),
        });
    } catch {
        throw new Error('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');
    }
    // 개발 PC(vite)에서는 서버 기능이 없어 404 → 배포된 사이트에서만 동작
    if (response.status === 404 && !(response.headers.get('content-type') || '').includes('json')) {
        throw new Error('계정 관리는 배포된 사이트(arcdent.vercel.app)에서만 사용할 수 있습니다.');
    }
    let result = null;
    try { result = await response.json(); } catch { /* 응답 형식 오류 */ }
    if (!response.ok || !result?.ok) {
        const error = new Error(result?.message || `요청 실패 (HTTP ${response.status})`);
        error.code = result?.code;
        throw error;
    }
    return result;
};

export const listAccounts = (clinicId) => callAdminApi('list', { clinicId }).then(result => result.accounts || []);
export const createAccount = (payload) => callAdminApi('create', payload);
export const resetAccountPassword = (userId, password = '') => callAdminApi('resetPassword', { userId, password });

/** 직접 정하는 비밀번호 확인 (서버와 같은 규칙). 문제가 없으면 '' */
export const passwordProblem = (password, loginId = '') => {
    const value = String(password || '');
    if (value.length < 8 || value.length > 64) return '비밀번호는 8~64자로 정해 주세요.';
    if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) return '비밀번호에 영문과 숫자를 함께 넣어 주세요.';
    if (/\s/.test(value)) return '비밀번호에 띄어쓰기는 쓸 수 없습니다.';
    if (loginId && value.toLowerCase().includes(String(loginId).toLowerCase())) return '비밀번호에 아이디를 넣을 수 없습니다.';
    return '';
};
export const setAccountEnabled = (userId, enabled) => callAdminApi('setEnabled', { userId, enabled });
export const updateAccount = (payload) => callAdminApi('update', payload);
export const deleteAccount = (userId) => callAdminApi('delete', { userId });
