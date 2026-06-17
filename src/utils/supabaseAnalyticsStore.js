import { supabase } from '../lib/supabaseClient';

export const getActiveAnalyticsClinicId = (clinicId = '') => {
    if (clinicId) return clinicId;
    if (typeof sessionStorage === 'undefined') return '';
    return sessionStorage.getItem('arcdent_admin_selected_clinic_id') || '';
};

const normalizeMonth = (month) => {
    if (month === null || month === undefined || month === '') return null;
    const parsed = Number(String(month).replace(/[^0-9]/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const saveAnalyticsData = async ({
    clinicId,
    category,
    subCategory,
    year,
    month = null,
    payload = {},
}) => {
    if (!clinicId) {
        throw new Error('업로드 대상 치과를 선택해주세요.');
    }
    if (!category || !subCategory || !year) {
        throw new Error('저장할 카테고리, 세부 탭, 연도 정보가 필요합니다.');
    }

    const normalizedMonth = normalizeMonth(month);
    const row = {
        clinic_id: clinicId,
        category,
        sub_category: subCategory,
        year: Number(year),
        month: normalizedMonth,
        payload,
        updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
        .from('analytics_data')
        .upsert(row, {
            onConflict: 'clinic_id,category,sub_category,year,month_key',
        })
        .select('id')
        .single();

    if (error) throw error;
    return { id: data?.id, action: 'upserted' };
};

export const loadAnalyticsData = async ({
    clinicId,
    category,
    subCategory,
    year = null,
}) => {
    if (!clinicId) return [];

    let query = supabase
        .from('analytics_data')
        .select('id, clinic_id, category, sub_category, year, month, payload, updated_at')
        .eq('clinic_id', clinicId)
        .eq('category', category)
        .eq('sub_category', subCategory)
        .order('year', { ascending: false })
        .order('month', { ascending: true });

    if (year) {
        query = query.eq('year', Number(year));
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
};
