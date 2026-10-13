import { createClient } from '@supabase/supabase-js';

// 중계 프로그램 전용(agent) 계정으로 Supabase에 로그인해서 live_clinic_stats 에 저장합니다.
// agent 계정은 RLS로 "자기 치과 실시간 현황 쓰기"만 허용되어 있습니다.

let client = null;
let clinicId = null;

export const connectSupabase = async (config) => {
    if (client && clinicId) return { clinicId };

    client = createClient(config.url, config.anonKey, {
        auth: { persistSession: false, autoRefreshToken: true },
    });

    const { data, error } = await client.auth.signInWithPassword({
        email: config.agentEmail,
        password: config.agentPassword,
    });
    if (error) {
        client = null;
        throw new Error(`Supabase 로그인 실패: ${error.message}`);
    }

    const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('clinic_id, role, clinics(name)')
        .eq('user_id', data.user.id)
        .maybeSingle();
    if (profileError) throw new Error(`계정 정보 조회 실패: ${profileError.message}`);
    if (!profile || profile.role !== 'agent' || !profile.clinic_id) {
        client = null;
        throw new Error('이 계정은 중계 프로그램용(agent)으로 등록되어 있지 않습니다. profiles 에 role=agent, clinic_id 를 연결해 주세요.');
    }

    clinicId = profile.clinic_id;
    return { clinicId, clinicName: profile.clinics?.name || '' };
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
        client = null;
        clinicId = null;
        throw new Error(`업로드 실패: ${error.message}`);
    }
};
