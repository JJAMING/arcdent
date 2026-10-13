import { supabase } from '../lib/supabaseClient';

// 치과 운영 설정(진료시간/휴무일), 월별 목표, 덴트웹 실시간 현황을 다루는 모듈입니다.
// 테이블은 supabase_live_dashboard.sql 로 만듭니다.

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
// 화면에는 월요일부터 보여줍니다.
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const DEFAULT_WEEKLY_HOURS = Object.freeze({
    0: { open: false, start: '', end: '', lunchStart: '', lunchEnd: '' },
    1: { open: true, start: '09:30', end: '18:30', lunchStart: '13:00', lunchEnd: '14:00' },
    2: { open: true, start: '09:30', end: '18:30', lunchStart: '13:00', lunchEnd: '14:00' },
    3: { open: true, start: '09:30', end: '18:30', lunchStart: '13:00', lunchEnd: '14:00' },
    4: { open: true, start: '09:30', end: '18:30', lunchStart: '13:00', lunchEnd: '14:00' },
    5: { open: true, start: '09:30', end: '18:30', lunchStart: '13:00', lunchEnd: '14:00' },
    6: { open: true, start: '09:30', end: '14:00', lunchStart: '', lunchEnd: '' },
});

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const cleanTime = (value) => (TIME_PATTERN.test(String(value || '')) ? String(value) : '');

export const normalizeWeeklyHours = (weekly = {}) => {
    const result = {};
    for (let day = 0; day < 7; day += 1) {
        const source = weekly?.[day] ?? weekly?.[String(day)];
        const fallback = DEFAULT_WEEKLY_HOURS[day];
        const item = source && typeof source === 'object' ? source : fallback;
        result[day] = {
            open: Boolean(item.open),
            start: cleanTime(item.start),
            end: cleanTime(item.end),
            lunchStart: cleanTime(item.lunchStart),
            lunchEnd: cleanTime(item.lunchEnd),
        };
    }
    return result;
};

// 테이블이 아직 없을 때(SQL 미실행) 나오는 오류인지 판별
export const isMissingTableError = (error) => {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    return code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(message);
};

const MISSING_TABLE_MESSAGE = 'Supabase에 운영 설정 테이블이 없습니다. supabase_live_dashboard.sql 을 SQL Editor에서 먼저 실행해 주세요.';

const throwFriendly = (error) => {
    if (isMissingTableError(error)) throw new Error(MISSING_TABLE_MESSAGE);
    throw error;
};

// ---------------------------------------------------------------------------
// 진료시간
// ---------------------------------------------------------------------------
export const loadOperatingHours = async (clinicId) => {
    if (!clinicId) return { weekly: normalizeWeeklyHours(), isDefault: true };
    const { data, error } = await supabase
        .from('clinic_operating_hours')
        .select('weekly')
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (error) throwFriendly(error);
    return { weekly: normalizeWeeklyHours(data?.weekly), isDefault: !data };
};

export const saveOperatingHours = async ({ clinicId, weekly }) => {
    if (!clinicId) throw new Error('치과를 먼저 선택해 주세요.');
    const normalized = normalizeWeeklyHours(weekly);
    const { error } = await supabase
        .from('clinic_operating_hours')
        .upsert({ clinic_id: clinicId, weekly: normalized, updated_at: new Date().toISOString() }, { onConflict: 'clinic_id' });
    if (error) throwFriendly(error);
    return normalized;
};

// ---------------------------------------------------------------------------
// 휴무일
// ---------------------------------------------------------------------------
export const loadHolidays = async (clinicId, { from = null, to = null } = {}) => {
    if (!clinicId) return [];
    let query = supabase
        .from('clinic_holidays')
        .select('id, holiday_date, label')
        .eq('clinic_id', clinicId)
        .order('holiday_date', { ascending: true });
    if (from) query = query.gte('holiday_date', from);
    if (to) query = query.lte('holiday_date', to);
    const { data, error } = await query;
    if (error) throwFriendly(error);
    return data || [];
};

export const addHoliday = async ({ clinicId, date, label = '' }) => {
    if (!clinicId) throw new Error('치과를 먼저 선택해 주세요.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw new Error('휴무일 날짜를 선택해 주세요.');
    const { error } = await supabase
        .from('clinic_holidays')
        .upsert({ clinic_id: clinicId, holiday_date: date, label: String(label || '').trim() }, { onConflict: 'clinic_id,holiday_date' });
    if (error) throwFriendly(error);
};

export const deleteHoliday = async (id) => {
    const { error } = await supabase.from('clinic_holidays').delete().eq('id', id);
    if (error) throwFriendly(error);
};

// ---------------------------------------------------------------------------
// 월별 목표
// ---------------------------------------------------------------------------
export const loadGoalsForYear = async (clinicId, year) => {
    if (!clinicId || !year) return {};
    const { data, error } = await supabase
        .from('clinic_goals')
        .select('month, sales_goal, new_patient_goal')
        .eq('clinic_id', clinicId)
        .eq('year', Number(year));
    if (error) throwFriendly(error);
    return Object.fromEntries((data || []).map(row => [row.month, {
        salesGoal: Number(row.sales_goal || 0),
        newPatientGoal: Number(row.new_patient_goal || 0),
    }]));
};

export const saveGoalsForYear = async ({ clinicId, year, goals }) => {
    if (!clinicId) throw new Error('치과를 먼저 선택해 주세요.');
    const now = new Date().toISOString();
    const rows = Object.entries(goals || {}).map(([month, value]) => ({
        clinic_id: clinicId,
        year: Number(year),
        month: Number(month),
        sales_goal: Math.max(0, Math.round(Number(value?.salesGoal || 0))),
        new_patient_goal: Math.max(0, Math.round(Number(value?.newPatientGoal || 0))),
        updated_at: now,
    }));
    if (rows.length === 0) return;
    const { error } = await supabase.from('clinic_goals').upsert(rows, { onConflict: 'clinic_id,year,month' });
    if (error) throwFriendly(error);
};

// ---------------------------------------------------------------------------
// 덴트웹 실시간 현황
// ---------------------------------------------------------------------------
export const loadLatestLiveStats = async (clinicId) => {
    if (!clinicId) return null;
    const { data, error } = await supabase
        .from('live_clinic_stats')
        .select('stat_date, payload, updated_at')
        .eq('clinic_id', clinicId)
        .order('stat_date', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throwFriendly(error);
    return data || null;
};

export const subscribeLiveStats = (clinicId, onChange) => {
    if (!clinicId) return () => {};
    const channel = supabase
        .channel(`live-clinic-stats-${clinicId}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'live_clinic_stats',
            filter: `clinic_id=eq.${clinicId}`,
        }, (event) => onChange?.(event.new || null))
        .subscribe();
    return () => { supabase.removeChannel(channel); };
};

// ---------------------------------------------------------------------------
// 영업일 계산
// ---------------------------------------------------------------------------
const pad2 = (value) => String(value).padStart(2, '0');
export const toDateKey = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const toMinutes = (time) => {
    if (!TIME_PATTERN.test(String(time || ''))) return null;
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
};

// 하루 진료시간(분)과, 지금 시각 기준으로 지난 진료시간(분)을 계산 (점심시간 제외)
const getWorkingMinutes = (dayHours, nowMinutes = null) => {
    const start = toMinutes(dayHours?.start);
    const end = toMinutes(dayHours?.end);
    if (start === null || end === null || end <= start) return { total: 0, elapsed: 0 };

    const lunchStart = toMinutes(dayHours?.lunchStart);
    const lunchEnd = toMinutes(dayHours?.lunchEnd);
    const hasLunch = lunchStart !== null && lunchEnd !== null && lunchEnd > lunchStart;

    const overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
    const lunchTotal = hasLunch ? overlap(start, end, lunchStart, lunchEnd) : 0;
    const total = end - start - lunchTotal;

    if (nowMinutes === null) return { total, elapsed: 0 };
    const until = Math.min(Math.max(nowMinutes, start), end);
    const lunchElapsed = hasLunch ? overlap(start, until, lunchStart, lunchEnd) : 0;
    return { total, elapsed: Math.max(0, until - start - lunchElapsed) };
};

/**
 * 이번 달 영업일 정보를 계산합니다.
 * - totalDays: 이번 달 전체 영업일
 * - elapsedDays: 오늘 진료시간 진행분까지 반영한 '지난 영업일' (소수)
 * - remainingDays: 오늘 남은 진료시간 비율까지 반영한 남은 영업일 (소수)
 * - remainingDayCount: 오늘(아직 진료 종료 전이면 포함)부터 월말까지 남은 영업일 수 (정수)
 * - daysFromToday: 오늘(진료일이면 시각과 무관하게 포함)부터 월말까지 영업일 수 — '오늘 목표' 계산용
 * - isOpenToday / isWorkingNow: 오늘 진료일인지, 지금 진료시간인지
 */
export const getMonthBusinessDays = ({ now = new Date(), weekly, holidays = [] }) => {
    const hours = normalizeWeeklyHours(weekly);
    const holidaySet = new Set((holidays || []).map(item => String(item.holiday_date || item).slice(0, 10)));
    const year = now.getFullYear();
    const month = now.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const today = now.getDate();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    let totalDays = 0;
    let elapsedDays = 0;
    let remainingDays = 0;
    let remainingDayCount = 0;
    let daysFromToday = 0;
    let isOpenToday = false;
    let isWorkingNow = false;

    for (let day = 1; day <= lastDay; day += 1) {
        const date = new Date(year, month, day);
        const dayHours = hours[date.getDay()];
        if (!dayHours.open || holidaySet.has(toDateKey(date))) continue;

        totalDays += 1;
        if (day < today) {
            elapsedDays += 1;
        } else if (day === today) {
            isOpenToday = true;
            daysFromToday += 1;
            const { total, elapsed } = getWorkingMinutes(dayHours, nowMinutes);
            // 진료시간이 입력되지 않은 요일은 하루를 절반 진행한 것으로 봅니다.
            const fraction = total > 0 ? elapsed / total : 0.5;
            elapsedDays += fraction;
            if (fraction < 1) {
                remainingDays += 1 - fraction;
                remainingDayCount += 1;
            }
            const start = toMinutes(dayHours.start);
            const end = toMinutes(dayHours.end);
            isWorkingNow = start !== null && end !== null && nowMinutes >= start && nowMinutes < end;
        } else {
            remainingDays += 1;
            remainingDayCount += 1;
            daysFromToday += 1;
        }
    }

    return { totalDays, elapsedDays, remainingDays, remainingDayCount, daysFromToday, isOpenToday, isWorkingNow };
};
