import { supabase } from '../lib/supabaseClient';

export const DEFAULT_CLINIC_FEATURE_SETTINGS = Object.freeze({
    salesCashOmission: false,
});

const normalizeClinicFeatureSettings = (settings = {}) => ({
    salesCashOmission: Boolean(settings?.salesCashOmission),
});

export const loadClinicFeatureSettings = async (clinicId) => {
    if (!clinicId) return { ...DEFAULT_CLINIC_FEATURE_SETTINGS };

    const { data, error } = await supabase
        .from('clinic_feature_settings')
        .select('settings')
        .eq('clinic_id', clinicId)
        .maybeSingle();

    if (error) throw error;
    return normalizeClinicFeatureSettings(data?.settings);
};

export const saveClinicFeatureSettings = async ({ clinicId, settings = {} }) => {
    if (!clinicId) throw new Error('기능 설정을 저장할 치과를 먼저 선택해 주세요.');

    const normalizedSettings = normalizeClinicFeatureSettings(settings);
    const { data, error } = await supabase
        .from('clinic_feature_settings')
        .upsert({
            clinic_id: clinicId,
            settings: normalizedSettings,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'clinic_id' })
        .select('settings')
        .single();

    if (error) throw error;
    return normalizeClinicFeatureSettings(data?.settings || normalizedSettings);
};
