import { supabase } from '../lib/supabaseClient';

// EMR 지난 데이터 (supabase_history.sql)
//   clinic_daily_stats    : 하루 1줄 최종 기록
//   clinic_intraday_stats : 시간별 누적 ("어제 이 시간까지" 비교용)
// 테이블이 아직 없으면 빈 값으로 돌려 화면이 깨지지 않게 합니다.

const isMissingTable = (error) => /does not exist|schema cache|PGRST205|42P01/i.test(`${error?.code} ${error?.message}`);

/** { 'YYYY-MM-DD': metrics } */
export const loadDailyStats = async (clinicId, fromDate, toDate) => {
    if (!clinicId) return {};
    const result = {};
    // 1,000줄 제한을 피하려고 나눠서 받습니다.
    for (let offset = 0; offset < 5000; offset += 1000) {
        const { data, error } = await supabase
            .from('clinic_daily_stats')
            .select('stat_date, metrics')
            .eq('clinic_id', clinicId)
            .gte('stat_date', fromDate)
            .lte('stat_date', toDate)
            .order('stat_date', { ascending: true })
            .range(offset, offset + 999);
        if (error) {
            if (isMissingTable(error)) return {};
            throw error;
        }
        (data || []).forEach(row => { result[row.stat_date] = row.metrics || {}; });
        if (!data || data.length < 1000) break;
    }
    return result;
};

/** { 'YYYY-MM-DD': { [hour]: metrics } } */
export const loadIntradayStats = async (clinicId, dates = []) => {
    if (!clinicId || dates.length === 0) return {};
    const { data, error } = await supabase
        .from('clinic_intraday_stats')
        .select('stat_date, hour, metrics')
        .eq('clinic_id', clinicId)
        .in('stat_date', dates);
    if (error) {
        if (isMissingTable(error)) return {};
        throw error;
    }
    return (data || []).reduce((acc, row) => {
        if (!acc[row.stat_date]) acc[row.stat_date] = {};
        acc[row.stat_date][row.hour] = row.metrics || {};
        return acc;
    }, {});
};

/** 그 날의 hour 시점까지 누적 기록 (해당 시간 이전 가장 마지막 기록). 없으면 null */
export const pickIntradayAt = (byHour, hour) => {
    if (!byHour) return null;
    for (let h = hour; h >= 0; h -= 1) {
        if (byHour[h]) return byHour[h];
    }
    return null;
};
