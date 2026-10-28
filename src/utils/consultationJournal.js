import { supabase } from '../lib/supabaseClient';

// 상담일지 (supabase_consultation_journal.sql)
//  - 상담 1건 = 1줄. 상담분석 메뉴는 일지가 있는 달은 일지로, 없는 달은 기존 업로드 자료로 계산합니다.
//  - 집계 기준
//      · 전체상담건수: 보험 상담 포함 전체
//      · 최종동의금액: 전체동의 + 부분동의의 동의금액 (동의 후 취소는 0)
//      · 비동의금액: 부분동의·미동의·동의 후 취소의 (상담금액 − 동의금액)
//      · 미동의 환자 현황: 부분동의·미동의·동의 후 취소 환자

export const JOURNAL_RESULTS = [
    { value: 'full', label: '전체동의' },
    { value: 'partial', label: '부분동의' },
    { value: 'declined', label: '미동의' },
    { value: 'cancelled', label: '동의 후 취소' },
];
export const JOURNAL_RESULT_LABEL = Object.fromEntries(JOURNAL_RESULTS.map(item => [item.value, item.label]));

export const INSURANCE_DECISIONS = [
    { value: '', label: '결정 없음' },
    { value: 'implant', label: '보험 임플' },
    { value: 'denture', label: '보험 틀니' },
    { value: 'other', label: '기타 보험' },
];

export const JOURNAL_OPTION_GROUPS = [
    { key: 'counselors', label: '상담자' },
    { key: 'doctors', label: '담당 원장님' },
    { key: 'visitChannels', label: '내원경로' },
    { key: 'treatmentCategories', label: '진료분류' },
    { key: 'rejectReasons', label: '미동의 사유' },
];

export const DEFAULT_JOURNAL_OPTIONS = Object.freeze({
    counselors: [],
    doctors: [],
    visitChannels: ['지인소개', '가족소개', '직장·집 근처', '간판', '네이버검색', '네이버블로그', '구글검색', 'SNS', '지나가다', '기타'],
    treatmentCategories: ['임플란트', '보철치료', '보존치료', '교정', '틀니', '기타'],
    rejectReasons: ['상의 및 고민 필요', '비용 부담', '기간 미룸', '타치과 비교', '치료 전 다른 치료 필요', '일정 및 거리', '기타'],
});

const isMissingTable = (error) => /does not exist|schema cache|PGRST205|42P01/i.test(`${error?.code} ${error?.message}`);
const MISSING_TABLE_MESSAGE = 'Supabase에 상담일지 테이블이 없습니다. supabase_consultation_journal.sql 을 SQL Editor에서 먼저 실행해 주세요.';
const throwFriendly = (error) => {
    if (isMissingTable(error)) throw new Error(MISSING_TABLE_MESSAGE);
    throw error;
};

const cleanList = (list) => Array.from(new Set((Array.isArray(list) ? list : []).map(item => String(item || '').trim()).filter(Boolean)));

export const normalizeJournalOptions = (options = {}) => Object.fromEntries(
    JOURNAL_OPTION_GROUPS.map(({ key }) => [key, Array.isArray(options?.[key]) ? cleanList(options[key]) : [...DEFAULT_JOURNAL_OPTIONS[key]]]),
);

export const loadJournalOptions = async (clinicId) => {
    if (!clinicId) return normalizeJournalOptions();
    const { data, error } = await supabase
        .from('consultation_journal_settings')
        .select('options')
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (error) throwFriendly(error);
    return normalizeJournalOptions(data?.options);
};

export const saveJournalOptions = async (clinicId, options) => {
    const normalized = normalizeJournalOptions(options);
    const { error } = await supabase
        .from('consultation_journal_settings')
        .upsert({ clinic_id: clinicId, options: normalized, updated_at: new Date().toISOString() }, { onConflict: 'clinic_id' });
    if (error) throwFriendly(error);
    return normalized;
};

// ---------------------------------------------------------------------------
// 화면 값 ↔ DB 줄
// ---------------------------------------------------------------------------
const num = (value) => {
    const n = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};

export const fromJournalRow = (row) => ({
    id: row.id,
    clinicId: row.clinic_id,
    date: row.consult_date,
    patientName: row.patient_name || '',
    chartNo: row.chart_no || '',
    patientType: row.patient_type === 'returning' ? 'returning' : 'new',
    counselor: row.counselor || '',
    doctor: row.doctor || '',
    visitChannel: row.visit_channel || '',
    treatmentCategory: row.treatment_category || '',
    consultedTeeth: Number(row.consulted_teeth || 0),
    agreedTeeth: Number(row.agreed_teeth || 0),
    result: row.result || 'full',
    diagnosisAmount: Number(row.diagnosis_amount || 0),
    consultationAmount: Number(row.consultation_amount || 0),
    agreedAmount: Number(row.agreed_amount || 0),
    isInsurance: Boolean(row.is_insurance),
    insuranceDecision: row.insurance_decision || '',
    planChanged: Boolean(row.plan_changed),
    rejectReason: row.reject_reason || '',
    memo: row.memo || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const toJournalRow = (clinicId, entry) => ({
    clinic_id: clinicId,
    consult_date: entry.date,
    patient_name: String(entry.patientName || '').trim(),
    chart_no: String(entry.chartNo || '').trim(),
    patient_type: entry.patientType === 'returning' ? 'returning' : 'new',
    counselor: String(entry.counselor || '').trim(),
    doctor: String(entry.doctor || '').trim(),
    visit_channel: String(entry.visitChannel || '').trim(),
    treatment_category: String(entry.treatmentCategory || '').trim(),
    consulted_teeth: num(entry.consultedTeeth),
    agreed_teeth: num(entry.agreedTeeth),
    result: JOURNAL_RESULT_LABEL[entry.result] ? entry.result : 'full',
    diagnosis_amount: num(entry.diagnosisAmount),
    consultation_amount: num(entry.consultationAmount),
    agreed_amount: num(entry.agreedAmount),
    is_insurance: Boolean(entry.isInsurance),
    insurance_decision: entry.isInsurance ? (entry.insuranceDecision || '') : '',
    plan_changed: Boolean(entry.planChanged),
    reject_reason: entry.result === 'full' ? '' : String(entry.rejectReason || '').trim(),
    memo: String(entry.memo || '').trim(),
    updated_at: new Date().toISOString(),
});

export const loadJournalEntries = async (clinicId, { from = null, to = null } = {}) => {
    if (!clinicId) return [];
    const result = [];
    for (let offset = 0; offset < 20000; offset += 1000) {
        let query = supabase
            .from('consultation_journals')
            .select('*')
            .eq('clinic_id', clinicId)
            .order('consult_date', { ascending: false })
            .order('created_at', { ascending: false })
            .range(offset, offset + 999);
        if (from) query = query.gte('consult_date', from);
        if (to) query = query.lte('consult_date', to);
        const { data, error } = await query;
        if (error) throwFriendly(error);
        (data || []).forEach(row => result.push(fromJournalRow(row)));
        if (!data || data.length < 1000) break;
    }
    return result;
};

export const saveJournalEntry = async (clinicId, entry) => {
    if (!clinicId) throw new Error('치과를 먼저 선택해 주세요.');
    if (!entry.date) throw new Error('상담 날짜를 입력해 주세요.');
    if (!String(entry.patientName || '').trim()) throw new Error('환자 성함을 입력해 주세요.');
    const row = toJournalRow(clinicId, entry);
    if (row.agreed_amount > row.consultation_amount && row.consultation_amount > 0) {
        throw new Error('동의금액이 상담금액보다 큽니다. 금액을 확인해 주세요.');
    }
    const request = entry.id
        ? supabase.from('consultation_journals').update(row).eq('id', entry.id).select('*').single()
        : supabase.from('consultation_journals').insert({ ...row, created_by: (await supabase.auth.getUser()).data?.user?.id || null }).select('*').single();
    const { data, error } = await request;
    if (error) throwFriendly(error);
    notifyJournalChanged();
    return fromJournalRow(data);
};

export const deleteJournalEntry = async (id) => {
    const { error } = await supabase.from('consultation_journals').delete().eq('id', id);
    if (error) throwFriendly(error);
    notifyJournalChanged();
};

/** 같은 차트번호의 가장 최근 상담 (다시 상담할 때 이름·구분·경로 자동 채움) */
export const findLatestJournalByChart = async (clinicId, chartNo) => {
    const chart = String(chartNo || '').trim();
    if (!clinicId || !chart) return null;
    const { data, error } = await supabase
        .from('consultation_journals')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('chart_no', chart)
        .order('consult_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) {
        if (isMissingTable(error)) return null;
        throw error;
    }
    return data ? fromJournalRow(data) : null;
};

const notifyJournalChanged = () => {
    window.dispatchEvent(new Event('consultationJournalUpdated'));
    window.dispatchEvent(new Event('consultationAnalysisUpdated'));
};

// ---------------------------------------------------------------------------
// 상담분석용 집계 (기존 업로드 자료와 같은 형태로 만듭니다)
// ---------------------------------------------------------------------------
export const isAgreedResult = (result) => result === 'full' || result === 'partial';
// 진단금액을 비워 두면 상담금액과 같은 것으로 봅니다.
export const diagnosisAmountOf = (entry) => Number(entry.diagnosisAmount || 0) || Number(entry.consultationAmount || 0);
export const effectiveAgreedAmount = (entry) => (isAgreedResult(entry.result) ? Number(entry.agreedAmount || 0) : 0);
export const rejectedAmountOf = (entry) => (
    entry.result === 'full' ? 0 : Math.max(0, Number(entry.consultationAmount || 0) - effectiveAgreedAmount(entry))
);
const rate = (part, whole) => (whole > 0 ? Number(((part / whole) * 100).toFixed(1)) : 0);

export const summarizeJournalEntries = (entries = []) => {
    const full = entries.filter(e => e.result === 'full').length;
    const partial = entries.filter(e => e.result === 'partial').length;
    const consultationAmount = entries.reduce((s, e) => s + Number(e.consultationAmount || 0), 0);
    const diagnosisAmount = entries.reduce((s, e) => s + diagnosisAmountOf(e), 0);
    const agreedAmount = entries.reduce((s, e) => s + effectiveAgreedAmount(e), 0);
    return {
        total: entries.length,
        full,
        partial,
        rejected: entries.length - full - partial,
        consultationAmount,
        diagnosisAmount,
        agreedAmount,
        rejectedAmount: entries.reduce((s, e) => s + rejectedAmountOf(e), 0),
        patientAgreementRate: rate(full, entries.length),
        totalAgreementRate: rate(full + partial, entries.length),
        amountAgreementRate: rate(agreedAmount, consultationAmount),
    };
};

const buildMonthPayloads = (year, month, entries) => {
    const summary = summarizeJournalEntries(entries);
    const monthLabel = `${month}월`;
    const newPatients = entries.filter(e => e.patientType === 'new').length;
    const oldPatients = entries.length - newPatients;
    const insurance = entries.filter(e => e.isInsurance);
    const insuranceAgreed = insurance.filter(e => isAgreedResult(e.result));

    const byName = (key) => entries.reduce((map, entry) => {
        const name = String(entry[key] || '').trim();
        if (!name) return map;
        if (!map.has(name)) map.set(name, []);
        map.get(name).push(entry);
        return map;
    }, new Map());

    const overall = {
        year: String(year),
        month: monthLabel,
        source: 'journal',
        totalConsultations: summary.total,
        agreedCount: summary.full,
        partialCount: summary.partial,
        rejectedCount: summary.rejected,
        patientAgreementRate: summary.patientAgreementRate,
        partialAgreementRate: rate(summary.partial, summary.total),
        newPatients,
        oldPatients,
        totalPatients: summary.total,
        diagnosisAmount: summary.diagnosisAmount,
        consultationAmount: summary.consultationAmount,
        rejectedAmount: summary.rejectedAmount,
        agreedAmount: summary.agreedAmount,
        diagnosisAgreementRate: rate(summary.agreedAmount, summary.diagnosisAmount),
        consultationAgreementRate: summary.amountAgreementRate,
        insuranceDiagnosis: insurance.length,
        insuranceAgreement: insuranceAgreed.length,
        planChange: entries.filter(e => e.planChanged).length,
        implantDecision: insuranceAgreed.filter(e => e.insuranceDecision === 'implant').length,
        dentureDecision: insuranceAgreed.filter(e => e.insuranceDecision === 'denture').length,
        doctorDiagnoses: Array.from(byName('doctor').entries()).map(([name, list]) => ({
            name,
            count: list.length,
            agreedAmount: list.reduce((s, e) => s + effectiveAgreedAmount(e), 0),
        })),
    };

    const consultant = {
        year: String(year),
        month: monthLabel,
        source: 'journal',
        rows: Array.from(byName('counselor').entries()).map(([name, list]) => {
            const s = summarizeJournalEntries(list);
            return {
                name,
                patientCount: s.total,
                fullAgreed: s.full,
                partialAgreed: s.partial,
                totalAgreed: s.full + s.partial,
                rejected: s.rejected,
                patientAgreementRate: s.totalAgreementRate,
                consultationAmount: s.consultationAmount,
                agreedAmount: s.agreedAmount,
                amountAgreementRate: s.amountAgreementRate,
            };
        }),
    };

    const rejected = {
        year: String(year),
        month: monthLabel,
        source: 'journal',
        rows: entries
            .filter(e => e.result !== 'full')
            .sort((a, b) => String(a.date).localeCompare(String(b.date)))
            .map(e => ({
                id: e.id,
                doctor: e.doctor || '-',
                newPatient: e.patientType === 'new' ? '1' : '',
                oldPatient: e.patientType === 'returning' ? '1' : '',
                patientName: e.patientName || '-',
                visitDate: e.date,
                consultant: e.counselor || '-',
                reason: e.rejectReason || JOURNAL_RESULT_LABEL[e.result] || '-',
                diagnosisAmount: diagnosisAmountOf(e),
                consultationAmount: Number(e.consultationAmount || 0),
                agreedAmount: effectiveAgreedAmount(e),
                rejectedAmount: rejectedAmountOf(e),
                note: JOURNAL_RESULT_LABEL[e.result] || '',
            })),
    };

    return { overall, consultant, rejected };
};

/** 일지 → { overall, consultant, rejected } 각각 analytics_data 와 같은 [{ year, month, payload }] */
export const buildJournalAnalyticsRows = (entries = []) => {
    const groups = new Map();
    entries.forEach(entry => {
        const [y, m] = String(entry.date || '').split('-').map(Number);
        if (!y || !m) return;
        const key = `${y}-${m}`;
        if (!groups.has(key)) groups.set(key, { year: y, month: m, entries: [] });
        groups.get(key).entries.push(entry);
    });
    const result = { overall: [], consultant: [], rejected: [] };
    groups.forEach(({ year, month, entries: list }) => {
        const payloads = buildMonthPayloads(year, month, list);
        Object.keys(result).forEach(key => result[key].push({ year, month, payload: payloads[key] }));
    });
    return result;
};

/** 같은 연·월이면 일지 자료로 바꾸고, 일지가 없는 달은 업로드 자료를 그대로 둡니다. */
export const mergeJournalRowsByMonth = (uploadRows = [], journalRows = []) => {
    const journalMonths = new Set(journalRows.map(row => `${Number(row.year)}-${Number(row.month)}`));
    return [
        ...uploadRows.filter(row => !journalMonths.has(`${Number(row.year)}-${Number(row.month)}`)),
        ...journalRows,
    ];
};

/** 상담분석·PDF 보고서용: 일지를 읽어 월별 자료로 만듭니다. 테이블이 없거나 권한이 없으면 빈 자료. */
export const loadJournalAnalyticsRows = async (clinicId, year = null) => {
    try {
        const entries = await loadJournalEntries(clinicId, year ? { from: `${year}-01-01`, to: `${year}-12-31` } : {});
        return buildJournalAnalyticsRows(entries);
    } catch {
        return { overall: [], consultant: [], rejected: [] };
    }
};
