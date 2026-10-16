import { supabase } from '../lib/supabaseClient';

export const DEFAULT_CLINIC_FEATURE_SETTINGS = Object.freeze({
    salesCashOmission: false,
});

// 매출 목표 기준: 'total' = 수납액 + 보험청구액(덴트웹 장부 합계와 같음), 'paid' = 수납액만
export const GOAL_SALES_BASIS_OPTIONS = Object.freeze([
    { value: 'total', label: '총매출 (수납 + 보험청구)' },
    { value: 'paid', label: '수납액만' },
]);
const normalizeGoalSalesBasis = (value) => (value === 'paid' ? 'paid' : 'total');

const normalizeClinicFeatureSettings = (settings = {}) => ({
    salesCashOmission: Boolean(settings?.salesCashOmission),
});

const loadRawSettings = async (clinicId) => {
    const { data, error } = await supabase
        .from('clinic_feature_settings')
        .select('settings')
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (error) throw error;
    return data?.settings && typeof data.settings === 'object' ? data.settings : {};
};

// 화면마다 서로 다른 키를 저장하므로, 기존 값과 합쳐서 저장해 다른 설정을 지우지 않습니다.
const upsertMergedSettings = async (clinicId, patch) => {
    const current = await loadRawSettings(clinicId);
    const merged = { ...current, ...patch };
    const { data, error } = await supabase
        .from('clinic_feature_settings')
        .upsert({
            clinic_id: clinicId,
            settings: merged,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'clinic_id' })
        .select('settings')
        .single();
    if (error) throw error;
    return data?.settings || merged;
};

export const loadClinicFeatureSettings = async (clinicId) => {
    if (!clinicId) return { ...DEFAULT_CLINIC_FEATURE_SETTINGS };
    return normalizeClinicFeatureSettings(await loadRawSettings(clinicId));
};

export const saveClinicFeatureSettings = async ({ clinicId, settings = {} }) => {
    if (!clinicId) throw new Error('기능 설정을 저장할 치과를 먼저 선택해 주세요.');
    const saved = await upsertMergedSettings(clinicId, normalizeClinicFeatureSettings(settings));
    return normalizeClinicFeatureSettings(saved);
};

export const loadGoalSalesBasis = async (clinicId) => {
    if (!clinicId) return 'total';
    return normalizeGoalSalesBasis((await loadRawSettings(clinicId)).goalSalesBasis);
};

export const saveGoalSalesBasis = async ({ clinicId, basis }) => {
    if (!clinicId) throw new Error('치과를 먼저 선택해 주세요.');
    const saved = await upsertMergedSettings(clinicId, { goalSalesBasis: normalizeGoalSalesBasis(basis) });
    return normalizeGoalSalesBasis(saved.goalSalesBasis);
};
