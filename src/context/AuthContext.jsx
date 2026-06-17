import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext();
const ADMIN_AUTH_SESSION_KEY = 'arcdent_admin_authenticated';
const ADMIN_SELECTED_CLINIC_KEY = 'arcdent_admin_selected_clinic_id';

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

    const clearProfileState = useCallback(() => {
        setProfile(null);
        setClinic(null);
        setProfileError('');
    }, []);

    const loadProfile = useCallback(async (targetUser) => {
        if (!targetUser?.id) {
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

    const applySession = useCallback(async (nextSession) => {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);

        if (nextSession?.user) {
            await loadProfile(nextSession.user);
        } else {
            clearAdminRuntimeState();
            clearProfileState();
        }
    }, [clearProfileState, loadProfile]);

    useEffect(() => {
        let mounted = true;

        const initializeAuth = async () => {
            const { data } = await supabase.auth.getSession();
            if (!mounted) return;
            await applySession(data.session ?? null);
            if (mounted) setLoading(false);
        };

        initializeAuth();

        const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            setLoading(true);
            applySession(nextSession ?? null).finally(() => setLoading(false));
        });

        return () => {
            mounted = false;
            authListener.subscription.unsubscribe();
        };
    }, [applySession]);

    const login = async (loginId, password) => {
        const email = normalizeLoginId(loginId);
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            return { success: false, message: getAuthErrorMessage(error.message) };
        }

        setLoading(true);
        await applySession(data.session ?? null);
        setLoading(false);
        return { success: true };
    };

    const signup = async ({ email, password, ...metadata }) => {
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
        clearAdminRuntimeState();
        await supabase.auth.signOut();
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
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
