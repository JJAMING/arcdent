import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { clearSessionAnalysisPeriods } from '../utils/analysisPeriodSession';
import { recordLoginEvent } from '../utils/supabaseAnalyticsStore';

const AuthContext = createContext();
const ADMIN_AUTH_SESSION_KEY = 'arcdent_admin_authenticated';
const ADMIN_SELECTED_CLINIC_KEY = 'arcdent_admin_selected_clinic_id';
const ACTIVE_TAB_SESSION_KEY = 'arcdent_active_tab';
const ADMIN_TAB_REQUESTED_SESSION_KEY = 'arcdent_admin_tab_requested';

const clearUserWorkspaceState = () => {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(ACTIVE_TAB_SESSION_KEY);
    sessionStorage.removeItem(ADMIN_TAB_REQUESTED_SESSION_KEY);
    clearSessionAnalysisPeriods();
};

const clearAdminRuntimeState = () => {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(ADMIN_AUTH_SESSION_KEY);
    sessionStorage.removeItem(ADMIN_SELECTED_CLINIC_KEY);
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('activeClinicChanged'));
    }
};

const normalizeLoginId = (value) => {
    const loginId = value.trim();
    if (loginId.includes('@')) return loginId;
    return `${loginId}@arcdent.local`;
};

const getAuthErrorMessage = (message) => {
    if (!message) return '로그인 중 오류가 발생했습니다.';
    if (message.includes('Invalid login credentials')) {
        return '아이디 또는 비밀번호가 올바르지 않습니다.';
    }
    if (message.includes('Email not confirmed')) {
        return '이메일 인증이 완료되지 않은 계정입니다.';
    }
    return message;
};

export const AuthProvider = ({ children }) => {
    const [session, setSession] = useState(null);
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [clinic, setClinic] = useState(null);
    const [loading, setLoading] = useState(true);
    const [profileError, setProfileError] = useState('');
    // 지금 화면에 로그인된 사용자 — 토큰 자동 갱신처럼 같은 사용자 신호는 화면을 다시 그리지 않기 위해 사용
    const currentUserIdRef = useRef(null);

    const clearProfileState = useCallback(() => {
        setProfile(null);
        setClinic(null);
        setProfileError('');
    }, []);

    const loadProfile = useCallback(async (targetUser, { recordLogin = false } = {}) => {
        if (!isSupabaseConfigured || !targetUser?.id) {
            clearProfileState();
            return;
        }

        const { data: profileData, error: profileFetchError } = await supabase
            .from('profiles')
            .select('id, user_id, clinic_id, role, clinics(id, name, code)')
            .eq('user_id', targetUser.id)
            .maybeSingle();

        if (profileFetchError) {
            clearProfileState();
            setProfileError(profileFetchError.message);
            return;
        }

        const nextProfile = profileData
            ? {
                id: profileData.id,
                user_id: profileData.user_id,
                clinic_id: profileData.clinic_id,
                role: profileData.role,
            }
            : null;

        setProfile(nextProfile);
        setProfileError('');

        if (nextProfile?.role !== 'admin') {
            clearAdminRuntimeState();
        }

        // 실제 로그인 액션에서만 기록합니다 (새로고침·토큰 자동 갱신에 의한 세션
        // 복원은 제외) — 실패해도 로그인 자체는 막지 않습니다.
        if (recordLogin) {
            recordLoginEvent({
                userId: targetUser.id,
                clinicId: nextProfile?.clinic_id ?? null,
                email: targetUser.email || '',
                role: nextProfile?.role || '',
            }).catch((err) => {
                console.warn('[Auth] login_logs insert failed:', err.message);
            });
        }

        if (!profileData?.clinic_id) {
            setClinic(null);
            return;
        }

        if (profileData.clinics) {
            setClinic(profileData.clinics);
            return;
        }

        const { data: clinicData, error: clinicFetchError } = await supabase
            .from('clinics')
            .select('id, name, code')
            .eq('id', profileData.clinic_id)
            .maybeSingle();

        if (clinicFetchError) {
            setClinic(null);
            setProfileError(clinicFetchError.message);
            return;
        }

        setClinic(clinicData ?? null);
    }, [clearProfileState]);

    const applySession = useCallback(async (nextSession, { recordLogin = false } = {}) => {
        currentUserIdRef.current = nextSession?.user?.id ?? null;
        setSession(nextSession);
        setUser(nextSession?.user ?? null);

        if (nextSession?.user) {
            await loadProfile(nextSession.user, { recordLogin });
        } else {
            clearUserWorkspaceState();
            clearAdminRuntimeState();
            clearProfileState();
        }
    }, [clearProfileState, loadProfile]);

    useEffect(() => {
        let mounted = true;

        const initializeAuth = async () => {
            if (!isSupabaseConfigured) {
                clearAdminRuntimeState();
                clearProfileState();
                if (mounted) setLoading(false);
                return;
            }
            const { data } = await supabase.auth.getSession();
            if (!mounted) return;
            await applySession(data.session ?? null);
            if (mounted) setLoading(false);
        };

        initializeAuth();

        if (!isSupabaseConfigured) return undefined;

        // ⚠️ 이 콜백 안에서 다른 Supabase 요청을 기다리면, Supabase 내부 잠금 때문에 서로 기다리다
        //    멈춰서(앱 재진입 시 흰 화면) 버립니다. 공식 권장대로 다음 틱으로 미뤄서 처리합니다.
        const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
            window.setTimeout(() => {
                if (!mounted || event === 'INITIAL_SESSION') return; // 첫 세션은 initializeAuth 가 처리
                const sameUser = Boolean(currentUserIdRef.current) && nextSession?.user?.id === currentUserIdRef.current;
                if (sameUser && event !== 'SIGNED_OUT') {
                    // 토큰 자동 갱신 등 같은 사용자: 화면은 그대로 두고 로그인 정보만 교체
                    setSession(nextSession);
                    setUser(nextSession.user);
                    return;
                }
                setLoading(true);
                applySession(nextSession ?? null).finally(() => {
                    if (mounted) setLoading(false);
                });
            }, 0);
        });

        return () => {
            mounted = false;
            authListener.subscription.unsubscribe();
        };
    }, [applySession]);

    const login = async (loginId, password) => {
        if (!isSupabaseConfigured) {
            return { success: false, message: 'Supabase 환경변수가 설정되지 않았습니다.' };
        }
        const email = normalizeLoginId(loginId);
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            return { success: false, message: getAuthErrorMessage(error.message) };
        }

        // 덴트웹 중계 프로그램 전용 계정(agent)은 웹 화면 로그인에 쓰지 못하게 막습니다.
        const { data: roleRow } = await supabase
            .from('profiles')
            .select('role')
            .eq('user_id', data.user?.id)
            .maybeSingle();
        if (roleRow?.role === 'agent') {
            await supabase.auth.signOut();
            return { success: false, message: '중계 프로그램 전용 계정은 화면에 로그인할 수 없습니다.' };
        }

        setLoading(true);
        await applySession(data.session ?? null, { recordLogin: true });
        setLoading(false);
        return { success: true };
    };

    const signup = async ({ email, password, ...metadata }) => {
        if (!isSupabaseConfigured) {
            return { success: false, message: 'Supabase 환경변수가 설정되지 않았습니다.' };
        }
        const { error } = await supabase.auth.signUp({
            email: normalizeLoginId(email),
            password,
            options: {
                data: metadata,
            },
        });

        if (error) {
            return { success: false, message: getAuthErrorMessage(error.message) };
        }

        return { success: true };
    };

    const logout = async () => {
        setLoading(true);
        clearUserWorkspaceState();
        clearAdminRuntimeState();
        if (isSupabaseConfigured) {
            await supabase.auth.signOut();
        }
        await applySession(null);
        setLoading(false);
    };

    const value = useMemo(() => ({
        isAuthenticated: Boolean(session),
        isAdmin: profile?.role === 'admin',
        isClinicUser: profile?.role === 'clinic_user',
        clinicId: profile?.clinic_id ?? null,
        session,
        user,
        profile,
        clinic,
        profileError,
        loading,
        login,
        signup,
        logout,
        refreshProfile: () => loadProfile(user),
        getAllUsers: () => [],
    }), [session, user, profile, clinic, profileError, loading, loadProfile]);

    return (
        <AuthContext.Provider value={value}>
            {loading ? <AuthLoadingScreen /> : children}
        </AuthContext.Provider>
    );
};

// 로그인 상태 확인 중 화면 (예전에는 아무것도 그리지 않아 흰 화면으로 보였음)
// 12초가 넘으면 네트워크 문제 등으로 보고 '다시 시도' 버튼을 보여줍니다.
const AuthLoadingScreen = () => {
    const [slow, setSlow] = useState(false);
    useEffect(() => {
        const timer = window.setTimeout(() => setSlow(true), 12000);
        return () => window.clearTimeout(timer);
    }, []);
    return (
        <div style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            background: 'var(--bg-color)',
            color: 'var(--text-secondary)',
            fontFamily: 'inherit',
        }}>
            <div style={{ display: 'grid', justifyItems: 'center', gap: '0.9rem', textAlign: 'center', padding: '1rem' }}>
                <div className="auth-loading-spinner" />
                <span style={{ fontWeight: 700 }}>불러오는 중입니다…</span>
                {slow && (
                    <>
                        <span style={{ fontSize: '0.85rem' }}>시간이 오래 걸리고 있습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.</span>
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            style={{
                                padding: '0.55rem 1.2rem',
                                border: 0,
                                borderRadius: '0.6rem',
                                background: 'var(--accent-primary)',
                                color: '#fff',
                                fontWeight: 800,
                                cursor: 'pointer',
                            }}
                        >
                            다시 시도
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export const useAuth = () => useContext(AuthContext);
