import { supabase } from '../lib/supabaseClient';
import { DEFAULT_WEEKLY_HOURS, normalizeWeeklyHours, toDateKey } from './clinicOperations';

// 미팅·시연용 "샘플 치과". 실제 치과 데이터는 읽거나 바꾸지 않고, 가상 숫자만 만들어 넣습니다.
//  - 치과 행(clinics)은 supabase_sample_clinic.sql 로 한 번 만들고,
//  - 숫자는 관리자모드 "샘플 치과" 탭의 버튼으로 채웁니다. (올해 1월 ~ 오늘, 같은 버튼을 다시 눌러도 안전)
//  - 같은 날짜는 항상 같은 숫자가 나오도록 날짜로 난수를 고정했습니다.

export const SAMPLE_CLINIC_CODE = 'sample-gachi';
export const SAMPLE_CLINIC_NAME = '같이N치과';
export const SAMPLE_LIVE_SOURCE = 'sample';

export const isSampleClinic = (clinic) => String(clinic?.code || '').startsWith('sample-');
// "(샘플)" 표시는 관리자 목록에서만 붙입니다. 원장님 화면에는 치과 이름만 보입니다.
export const adminClinicName = (clinic) => (isSampleClinic(clinic) ? `${clinic.name} (샘플)` : clinic?.name);

const pad2 = (value) => String(value).padStart(2, '0');
const MONTH_TREND = [0.86, 0.84, 0.95, 1.0, 1.02, 1.0, 1.04, 0.9, 1.0, 1.08, 1.1, 1.12];
const BASE_WEEKDAY_REVENUE = 15500000; // 평일 하루 평균 매출(수납 + 청구)
const DOCTORS = [
    { name: '김민준', share: 0.52 },
    { name: '이서연', share: 0.31 },
    { name: '박지훈', share: 0.17 },
];
const CONSULTANTS = ['한소율', '오지안'];
const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권'];
const REJECT_REASONS = ['비용 부담', '타 병원 상담 후 결정', '치료 기간이 길어서', '가족과 상의 후 재방문', '당장 불편하지 않아서', '보험 적용 여부 확인 필요'];
const PATHS = [
    { path: '소개', weight: 0.27, avgFee: 1180000 },
    { path: '블로그', weight: 0.16, avgFee: 760000 },
    { path: '홈페이지', weight: 0.12, avgFee: 820000 },
    { path: '인스타그램', weight: 0.1, avgFee: 690000 },
    { path: '가까워서', weight: 0.14, avgFee: 540000 },
    { path: '지나가다가', weight: 0.08, avgFee: 480000 },
    { path: '간판', weight: 0.06, avgFee: 450000 },
    { path: '기타', weight: 0.07, avgFee: 520000 },
];
const FEE_ITEMS = [
    ['AA154', '초진 진찰료'], ['AA254', '재진 진찰료'], ['U2233', '치석제거 (전악)'], ['U1001', '구내 방사선 촬영'],
    ['U7005', '파노라마 촬영'], ['U3300', '광중합형 복합레진 충전'], ['U4130', '근관 확대·성형'], ['U5110', '단순 발치'],
    ['U5120', '복잡 발치'], ['U6101', '치과임플란트 1단계'], ['U6102', '치과임플란트 2단계'], ['U8201', '완전틀니 1단계'],
    ['U9001', '치은연하 소파술'], ['U3101', '치아 홈메우기'],
];
const LAB_ITEMS = [
    ['크라운', '지르코니아 크라운', 0.3], ['크라운', '골드 크라운', 0.06], ['임플란트 보철', '지르코니아 임플란트 크라운', 0.26],
    ['인레이/온레이', '세라믹 인레이', 0.12], ['틀니', '레진상 완전틀니', 0.05], ['틀니', '금속 부분틀니', 0.04],
    ['교정/장치', '투명 교정 장치', 0.1], ['기타', '나이트가드', 0.07],
];

// ---------------------------------------------------------------------------
// 같은 입력이면 같은 숫자가 나오는 난수
// ---------------------------------------------------------------------------
const makeRng = (seedText) => {
    let h = 1779033703 ^ String(seedText).length;
    for (let i = 0; i < String(seedText).length; i += 1) {
        h = Math.imul(h ^ String(seedText).charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    let a = (h >>> 0) || 1;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};
const roundTo = (value, unit) => Math.round(value / unit) * unit;
const parseDateKey = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
};
const splitByWeights = (total, weights, rng, jitter = 0.25) => {
    const raw = weights.map(w => Math.max(0.01, w * (1 - jitter + rng() * jitter * 2)));
    const sum = raw.reduce((acc, v) => acc + v, 0);
    const parts = raw.map(v => Math.floor((v / sum) * total));
    parts[0] += total - parts.reduce((acc, v) => acc + v, 0);
    return parts;
};

// ---------------------------------------------------------------------------
// 진료시간 / 휴무일
// ---------------------------------------------------------------------------
export const buildSampleHolidays = (year) => {
    const list = [
        [`${year}-01-01`, '신정'], [`${year}-05-05`, '어린이날'], [`${year}-06-06`, '현충일'],
        [`${year}-08-15`, '광복절'], [`${year}-10-03`, '개천절'], [`${year}-10-09`, '한글날'], [`${year}-12-25`, '성탄절'],
    ];
    if (year === 2026) {
        list.push(['2026-02-16', '설 연휴'], ['2026-02-17', '설날'], ['2026-02-18', '설 연휴'], ['2026-03-02', '삼일절 대체휴일'],
            ['2026-05-25', '부처님오신날 대체휴일'], ['2026-08-17', '광복절 대체휴일'],
            ['2026-09-24', '추석 연휴'], ['2026-09-25', '추석'], ['2026-09-26', '추석 연휴'], ['2026-10-05', '개천절 대체휴일']);
    }
    return list.map(([date, label]) => ({ date, label }));
};

const toMinutes = (time) => {
    const match = /^(\d{2}):(\d{2})$/.exec(String(time || ''));
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/** 그 날 진료시간 중 (시각까지) 지난 비율 0~1. 점심시간은 뺍니다. */
const workFractionAt = (dayHours, minuteOfDay) => {
    const start = toMinutes(dayHours?.start);
    const end = toMinutes(dayHours?.end);
    if (!dayHours?.open || start === null || end === null || end <= start) return 0;
    const lunchStart = toMinutes(dayHours.lunchStart);
    const lunchEnd = toMinutes(dayHours.lunchEnd);
    const lunch = lunchStart !== null && lunchEnd !== null && lunchEnd > lunchStart ? [lunchStart, lunchEnd] : null;
    const worked = (until) => {
        const t = Math.min(Math.max(until, start), end);
        let minutes = t - start;
        if (lunch) minutes -= Math.max(0, Math.min(t, lunch[1]) - lunch[0]);
        return Math.max(0, minutes);
    };
    const total = worked(end);
    return total > 0 ? worked(minuteOfDay) / total : 0;
};

const createCalendar = (year) => {
    const weekly = normalizeWeeklyHours(DEFAULT_WEEKLY_HOURS);
    const holidays = new Set(buildSampleHolidays(year).map(item => item.date));
    const isOpen = (key) => !holidays.has(key) && weekly[parseDateKey(key).getDay()].open;
    return { weekly, holidays, isOpen };
};

// ---------------------------------------------------------------------------
// 하루치 가상 숫자 (실제 중계 프로그램이 보내는 일별 기록과 같은 형태)
// ---------------------------------------------------------------------------
const buildDayMetrics = (key, calendar) => {
    if (!calendar.isOpen(key)) return null;
    const date = parseDateKey(key);
    const rng = makeRng(`sample-day-${key}`);
    const trend = MONTH_TREND[date.getMonth()];
    const isSaturday = date.getDay() === 6;
    let factor = 0.7 + rng() * 0.6;
    if (rng() < 0.12) factor *= 1.5;
    const revenue = roundTo(BASE_WEEKDAY_REVENUE * trend * factor * (isSaturday ? 0.55 : 1), 100);
    const claim = roundTo(revenue * (0.31 + rng() * 0.1), 100);
    const paid = revenue - claim;
    const visits = Math.max(8, Math.round(revenue / 390000 + (rng() - 0.5) * 6));
    const newPatients = Math.min(visits, Math.round(visits * (0.1 + rng() * 0.08)));
    const card = roundTo(paid * 0.74, 100);
    const cash = roundTo(paid * 0.19, 100);
    const doctorShares = splitByWeights(paid, DOCTORS.map(item => item.share), rng, 0.15);
    const canceled = Math.round(rng() * 4);
    return {
        revenue, paid, card, cash, bank: paid - card - cash,
        refund: rng() < 0.08 ? roundTo(rng() * 400000, 1000) : 0,
        claim,
        totalFee: Math.round(revenue * 1.05),
        patientShare: Math.round(claim * 0.4),
        nonCovered: Math.round(paid * 0.75),
        visits, newPatients, returningPatients: visits - newPatients,
        reservations: { total: visits + canceled + 2, done: visits, pending: 0, canceled, hold: 1, newPatient: newPatients },
        doctors: DOCTORS.map((doctor, index) => ({ name: doctor.name, paid: doctorShares[index] })).filter(item => item.paid > 0),
    };
};

const SUM_KEYS = ['revenue', 'paid', 'card', 'cash', 'bank', 'refund', 'claim', 'totalFee', 'patientShare', 'nonCovered', 'visits', 'newPatients', 'returningPatients'];

const scaleMetrics = (metrics, fraction) => {
    const scaled = { ...metrics };
    SUM_KEYS.forEach(k => { scaled[k] = Math.round(metrics[k] * fraction); });
    scaled.doctors = metrics.doctors.map(item => ({ ...item, paid: Math.round(item.paid * fraction) }));
    return scaled;
};

const buildDailyRange = (calendar, startKey, endKey, { now }) => {
    const todayKey = toDateKey(now);
    const minuteOfDay = now.getHours() * 60 + now.getMinutes();
    const days = {};
    for (let d = parseDateKey(startKey); toDateKey(d) <= endKey; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        const key = toDateKey(d);
        const full = buildDayMetrics(key, calendar);
        if (!full) continue;
        const shown = key === todayKey ? scaleMetrics(full, workFractionAt(calendar.weekly[d.getDay()], minuteOfDay)) : { ...full };
        days[key] = Object.assign(shown, { __full: full });
    }
    return days;
};

const stripFull = ({ __full, ...rest }) => rest; // eslint-disable-line no-unused-vars

const sumMetrics = (list) => list.reduce((acc, item) => {
    SUM_KEYS.forEach(k => { acc[k] += Number(item[k] || 0); });
    return acc;
}, Object.fromEntries(SUM_KEYS.map(k => [k, 0])));

// ---------------------------------------------------------------------------
// 오늘 실시간 + 시간별 누적
// ---------------------------------------------------------------------------
const INTRADAY_BACK_DAYS = [1, 2, 3, 4, 5, 6, 7, 14, 21, 28];

const buildTodayLive = (calendar, now, dailyByKey) => {
    const todayKey = toDateKey(now);
    const monthPrefix = todayKey.slice(0, 7);
    const monthDays = Object.entries(dailyByKey).filter(([key]) => key.startsWith(monthPrefix));
    const monthSum = sumMetrics(monthDays.map(([, metrics]) => metrics));
    const todayFull = dailyByKey[todayKey]?.__full || null;
    const todayNow = dailyByKey[todayKey] ? stripFull(dailyByKey[todayKey]) : null;
    const fraction = todayFull ? workFractionAt(calendar.weekly[now.getDay()], now.getHours() * 60 + now.getMinutes()) : 0;

    const visits = todayNow?.visits || 0;
    const inProgress = fraction > 0 && fraction < 1;
    const waiting = inProgress ? Math.min(visits, 2) : 0;
    const ready = inProgress ? Math.min(Math.max(0, visits - waiting), 1) : 0;
    const inTreatment = inProgress ? Math.min(Math.max(0, visits - waiting - ready), 3) : 0;
    const treated = Math.min(Math.max(0, visits - waiting - ready - inTreatment), Math.round(visits * 0.2));
    const status = { waiting, ready, inTreatment, treated, paid: Math.max(0, visits - waiting - ready - inTreatment - treated) };

    const empty = { revenue: 0, paid: 0, card: 0, cash: 0, bank: 0, refund: 0, claim: 0, totalFee: 0, patientShare: 0, nonCovered: 0, visits: 0, newPatients: 0, returningPatients: 0, reservations: { total: 0, done: 0, pending: 0, canceled: 0, hold: 0, newPatient: 0 }, doctors: [] };
    const base = todayNow || empty;
    const reservations = todayFull
        ? { total: todayFull.reservations.total, done: base.visits, pending: Math.max(0, todayFull.visits - base.visits), canceled: todayFull.reservations.canceled, hold: 1, newPatient: todayFull.newPatients }
        : base.reservations;

    return {
        metrics: { ...base, reservations },
        payload: {
            generatedAt: now.toISOString(),
            today: {
                revenue: base.revenue, paid: base.paid, card: base.card, cash: base.cash, bank: base.bank, refund: base.refund,
                totalFee: base.totalFee, insuranceClaim: base.claim, patientShare: base.patientShare, nonCovered: base.nonCovered,
                visits: base.visits, newPatients: base.newPatients, returningPatients: base.returningPatients,
                status, reservations, doctors: base.doctors,
            },
            month: {
                revenue: monthSum.revenue, paid: monthSum.paid, insuranceClaim: monthSum.claim, totalFee: monthSum.totalFee,
                visits: monthSum.visits, newPatients: monthSum.newPatients, daysCounted: monthDays.length,
            },
        },
    };
};

const buildIntradayRows = (clinicId, calendar, now, dailyByKey) => {
    const rows = [];
    const stamp = now.toISOString();
    const todayKey = toDateKey(now);
    const push = (statDate, hour, source, fraction) => {
        const m = scaleMetrics(source, fraction);
        rows.push({
            clinic_id: clinicId, stat_date: statDate, hour,
            metrics: { revenue: m.revenue, paid: m.paid, claim: m.claim, visits: m.visits, newPatients: m.newPatients, returningPatients: m.returningPatients },
            updated_at: stamp,
        });
    };
    INTRADAY_BACK_DAYS.forEach(back => {
        const key = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back));
        const full = dailyByKey[key]?.__full;
        if (!full) return;
        const hours = calendar.weekly[parseDateKey(key).getDay()];
        for (let hour = 9; hour <= 18; hour += 1) push(key, hour, full, workFractionAt(hours, hour * 60 + 55));
    });
    const todayEntry = dailyByKey[todayKey];
    if (todayEntry?.__full) {
        const hours = calendar.weekly[now.getDay()];
        for (let hour = 9; hour <= now.getHours(); hour += 1) {
            const fraction = hour === now.getHours()
                ? workFractionAt(hours, now.getHours() * 60 + now.getMinutes())
                : workFractionAt(hours, hour * 60 + 55);
            push(todayKey, hour, todayEntry.__full, fraction);
        }
    }
    return rows;
};

// ---------------------------------------------------------------------------
// 월별 분석 자료 (파일 업로드로 들어가는 것과 같은 형태)
// ---------------------------------------------------------------------------
const maskedName = (rng) => `${SURNAMES[Math.floor(rng() * SURNAMES.length)]}○○`;

const buildMonthlyRows = ({ clinicId, year, month, days }) => {
    const rng = makeRng(`sample-month-${year}-${month}`);
    const monthLabel = `${month}월`;
    const stamp = new Date().toISOString();
    const row = (category, subCategory, payload) => ({
        clinic_id: clinicId, category, sub_category: subCategory, year, month, payload, updated_at: stamp,
    });
    const sum = sumMetrics(days);
    const workDays = days.length;
    const rows = [];

    // 매출분석: 총 매출 / 의사별 / 신환 매출 / 상위 환자 / 치료비용계획
    const cash = sum.cash + sum.bank;
    const card = sum.card;
    const other = roundTo(sum.paid * 0.012, 1000);
    const netSales = cash + card + other;
    rows.push(row('sales', 'total_revenue', { month: monthLabel, cash, card, other, insurance: sum.claim, netSales, total: netSales + sum.claim }));

    const pureShares = splitByWeights(netSales, DOCTORS.map(item => item.share), rng, 0.1);
    const insShares = splitByWeights(sum.claim, DOCTORS.map(item => item.share), rng, 0.1);
    const doctorData = Object.fromEntries(DOCTORS.map((doctor, index) => [doctor.name, { pure: pureShares[index], insurance: insShares[index] }]));
    rows.push(row('sales', 'doctor_revenue', { doctorData, netSales, insurance: sum.claim, total: netSales + sum.claim }));

    const newPatientSales = Math.round(sum.newPatients * (1020000 + rng() * 260000));
    rows.push(row('sales', 'new_patient_revenue', { newPatient: sum.newPatients, newPatientSales }));

    let revenue = Math.round(netSales * (0.075 + rng() * 0.02));
    const topPatients = Array.from({ length: 10 }, (_, index) => {
        revenue = Math.round(revenue * (0.84 + rng() * 0.1));
        return {
            patientName: maskedName(rng), chartNo: `${String(year).slice(2)}-${pad2(month)}${String(100 + index * 7).padStart(3, '0')}`,
            doctor: DOCTORS[Math.floor(rng() * 2)].name, revenue, paid: revenue, year, month: monthLabel,
        };
    });
    rows.push(row('sales', 'top_patients', { rows: topPatients }));

    // 상담 (치료비용계획) — 전체/상담자별/미동의 자료도 같은 계획에서 계산해 서로 맞게 합니다.
    const amountChoices = [350000, 600000, 900000, 1500000, 2400000, 3600000, 5200000, 7800000, 11000000];
    const planCount = Math.round((22 + rng() * 8) * MONTH_TREND[month - 1]);
    const plans = Array.from({ length: planCount }, (_, index) => {
        const amount = amountChoices[Math.min(amountChoices.length - 1, Math.floor(Math.pow(rng(), 1.4) * amountChoices.length))];
        const pick = rng();
        const status = pick < 0.52 ? '전체동의' : pick < 0.72 ? '부분동의' : '미동의';
        const agreedAmount = status === '전체동의' ? amount : status === '부분동의' ? Math.round(amount * 0.5) : 0;
        const paidAmount = Math.round(agreedAmount * (0.4 + rng() * 0.6));
        return {
            chartNo: `${String(year).slice(2)}-${pad2(month)}${String(300 + index).padStart(3, '0')}`,
            patientName: maskedName(rng), year, month: monthLabel,
            contractAmount: amount, paidAmount, remainingAmount: Math.max(0, amount - paidAmount), status,
            createdAt: `${year}-${pad2(month)}-${pad2(1 + Math.floor(rng() * 27))}`,
            consultant: CONSULTANTS[index % CONSULTANTS.length], doctor: DOCTORS[Math.floor(rng() * DOCTORS.length)].name,
            agreedAmount, rejectedAmount: amount - agreedAmount,
            rejectReason: status === '전체동의' ? '' : REJECT_REASONS[Math.floor(rng() * REJECT_REASONS.length)],
        };
    });
    rows.push(row('sales', 'treatment_plan', { rows: plans }));

    const agreedPlans = plans.filter(p => p.status === '전체동의');
    const partialPlans = plans.filter(p => p.status === '부분동의');
    const rate = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
    const diagnosisAmount = plans.reduce((s, p) => s + p.contractAmount, 0);
    const agreedAmountTotal = plans.reduce((s, p) => s + p.agreedAmount, 0);
    const ledgerOld = Math.round(sum.returningPatients * 0.55);
    rows.push(row('consultation', 'overall', {
        year: String(year), month: monthLabel,
        totalConsultations: plans.length, agreedCount: agreedPlans.length, partialCount: partialPlans.length,
        rejectedCount: plans.length - agreedPlans.length - partialPlans.length,
        patientAgreementRate: rate(agreedPlans.length, plans.length), partialAgreementRate: rate(partialPlans.length, plans.length),
        newPatients: sum.newPatients, oldPatients: ledgerOld, totalPatients: sum.newPatients + ledgerOld,
        diagnosisAmount: Math.round(diagnosisAmount * 1.18), consultationAmount: diagnosisAmount,
        rejectedAmount: diagnosisAmount - agreedAmountTotal, agreedAmount: agreedAmountTotal,
        diagnosisAgreementRate: rate(agreedAmountTotal, Math.round(diagnosisAmount * 1.18)),
        consultationAgreementRate: rate(agreedAmountTotal, diagnosisAmount),
        insuranceDiagnosis: Math.round(plans.length * 0.35), insuranceAgreement: Math.round(plans.length * 0.3),
        planChange: Math.round(plans.length * 0.12), implantDecision: Math.round(4 + rng() * 5), dentureDecision: Math.round(1 + rng() * 3),
        doctorDiagnoses: DOCTORS.map(doctor => {
            const mine = plans.filter(p => p.doctor === doctor.name);
            return { name: doctor.name, count: mine.length, agreedAmount: mine.reduce((s, p) => s + p.agreedAmount, 0) };
        }).filter(item => item.count > 0),
    }));
    rows.push(row('consultation', 'consultant', {
        year: String(year), month: monthLabel,
        rows: CONSULTANTS.map(name => {
            const mine = plans.filter(p => p.consultant === name);
            const full = mine.filter(p => p.status === '전체동의').length;
            const part = mine.filter(p => p.status === '부분동의').length;
            const amount = mine.reduce((s, p) => s + p.contractAmount, 0);
            const agreed = mine.reduce((s, p) => s + p.agreedAmount, 0);
            return {
                name, patientCount: mine.length, fullAgreed: full, partialAgreed: part, totalAgreed: full + part,
                rejected: mine.length - full - part, patientAgreementRate: rate(full + part, mine.length),
                consultationAmount: amount, agreedAmount: agreed, amountAgreementRate: rate(agreed, amount),
            };
        }).filter(item => item.patientCount > 0),
    }));
    rows.push(row('consultation', 'rejected', {
        year: String(year), month: monthLabel,
        rows: plans.filter(p => p.status === '미동의').map(p => ({
            doctor: p.doctor, patientName: p.patientName, visitDate: p.createdAt, consultant: p.consultant, reason: p.rejectReason,
            diagnosisAmount: Math.round(p.contractAmount * 1.18), consultationAmount: p.contractAmount, agreedAmount: 0, rejectedAmount: p.contractAmount,
        })),
    }));

    // 환자분석: 총 환자수 + 의사별 환자수 + 기공물
    const patientTotal = sum.newPatients + ledgerOld;
    const doctorParts = splitByWeights(patientTotal, DOCTORS.map(d => d.share), rng, 0.08);
    const doctorPatients = Object.fromEntries(DOCTORS.map((doctor, index) => [doctor.name, doctorParts[index]]));
    const labTotal = Math.round(sum.visits * 0.09);
    const labCounts = splitByWeights(labTotal, LAB_ITEMS.map(item => item[2]), rng, 0.2);
    rows.push(row('patient', 'total_patients_ledger', {
        workDays, newPt: sum.newPatients, oldPt: ledgerOld, totalVisits: sum.visits,
        total: parseFloat((sum.visits / workDays).toFixed(1)),
        avgNewPt: parseFloat((sum.newPatients / workDays).toFixed(1)), avgOldPt: parseFloat((ledgerOld / workDays).toFixed(1)),
        doctorPatients,
        labRequests: LAB_ITEMS.map(([category, type], index) => ({ category, type, count: labCounts[index] })).filter(item => item.count > 0),
    }));

    // 신환분석: 내원경로 + 연령
    const pathCounts = splitByWeights(sum.newPatients, PATHS.map(item => item.weight), rng, 0.3);
    const pathRows = PATHS.map((item, index) => {
        const count = pathCounts[index];
        const avgFee = Math.round(item.avgFee * (0.88 + rng() * 0.25));
        const ratio = Math.round(25 + rng() * 35);
        return {
            path: item.path, oldPatient: 0, newPatient: count, visitPatient: count, totalFee: avgFee * count, avgFee,
            insurancePatients: Math.round(count * ratio / 100), nonInsurancePatients: count - Math.round(count * ratio / 100), ratio,
        };
    }).filter(item => item.newPatient > 0);
    const pathFee = pathRows.reduce((s, r) => s + r.totalFee, 0);
    rows.push(row('newPatient', 'path_distribution', {
        rows: pathRows.map(({ ratio, ...rest }) => rest),
        summary: {
            total: { visitPatients: sum.newPatients, oldPatients: 0, newPatients: sum.newPatients, totalVisits: Math.round(sum.newPatients * 1.65), totalFee: pathFee },
            average: { visitPatients: Math.round(sum.newPatients / Math.max(1, pathRows.length)), oldPatients: 0, newPatients: parseFloat((sum.newPatients / Math.max(1, pathRows.length)).toFixed(2)), totalVisits: 0, totalFee: Math.round(pathFee / Math.max(1, pathRows.length)) },
        },
        insuranceRatios: Object.fromEntries(pathRows.map(r => [r.path, r.ratio])),
        nonInsuranceRatios: {},
    }));
    const ageCounts = splitByWeights(sum.newPatients, [0.02, 0.08, 0.16, 0.22, 0.24, 0.17, 0.11], rng, 0.25);
    rows.push(row('newPatient', 'age_distribution', {
        year: String(year), month: monthLabel,
        ages: { '0대': ageCounts[0], '10대': ageCounts[1], '20대': ageCounts[2], '30대': ageCounts[3], '40대': ageCounts[4], '50대': ageCounts[5], '60대': Math.round(ageCounts[6] * 0.6), '70대+': ageCounts[6] - Math.round(ageCounts[6] * 0.6) },
    }));

    // 진료분석: 임플란트 / 보험 임플·틀니
    const implantTotal = Math.round(sum.visits * (0.05 + rng() * 0.02));
    const [osstem, dentium, dio, straumann] = splitByWeights(implantTotal, [0.45, 0.3, 0.15, 0.1], rng, 0.15);
    rows.push(row('treatment', 'implant_surgery', {
        osstem, dentium, dio, straumann, implantTotal, implantTypes: { 오스템: osstem, 덴티움: dentium, 디오: dio, 스트라우만: straumann },
        rowUsageTotal: implantTotal, sourceImplantTotal: implantTotal, unclassifiedImplantCount: 0,
        gbr: Math.round(5 + rng() * 7), lateral: Math.round(2 + rng() * 4), crestal: Math.round(4 + rng() * 6), surg1: implantTotal,
    }));
    const insImpStep1 = Math.round(4 + rng() * 5); const insImpStep2 = Math.round(3 + rng() * 5); const insImpStep3 = Math.round(3 + rng() * 5);
    const insDentStep1 = Math.round(2 + rng() * 3); const insDentStep5 = Math.round(1 + rng() * 3); const insDentStep6 = Math.round(1 + rng() * 3);
    rows.push(row('treatment', 'insurance_treatment', {
        insImpStep1, insImpStep2, insImpStep3, insImp: insImpStep1 + insImpStep2 + insImpStep3,
        insDentStep1, insDentStep5, insDentStep6, insDent: insDentStep1 + insDentStep5 + insDentStep6,
    }));

    // 보험청구분석: 청구액 / 수가별 / 조정·불능
    const health = Math.round(sum.claim * 0.97);
    rows.push(row('insurance', 'claim', { month: monthLabel, health, medicalAid: sum.claim - health, amount: sum.claim }));
    const feeWeights = [0.18, 0.2, 0.13, 0.1, 0.05, 0.08, 0.06, 0.05, 0.02, 0.03, 0.02, 0.01, 0.04, 0.03];
    rows.push(row('insurance', 'fee_stats', {
        rows: FEE_ITEMS.map(([code, name], index) => {
            const patients = Math.max(1, Math.round(sum.visits * feeWeights[index] * (0.9 + rng() * 0.2)));
            const visits = Math.round(patients * (1 + rng() * 0.8));
            return { code, name, patients, visits, treatmentAmount: Math.round(sum.claim * feeWeights[index] * (0.9 + rng() * 0.2)) };
        }),
    }));
    rows.push(row('insurance', 'adjustment_review', {
        month: monthLabel, adjustmentCount: Math.round(3 + rng() * 6), adjustmentAmount: roundTo(150000 + rng() * 750000, 1000),
        failureCount: Math.round(rng() * 3), failureAmount: roundTo(rng() * 400000, 1000),
    }));
    return rows;
};

// ---------------------------------------------------------------------------
// 상담일지 (가상) + 상담일지 화면용 오늘 접수 환자 · 원장님 목록
//  - 자동으로 만든 일지는 created_by 가 비어 있어서, 시연 중 직접 쓴 일지와 구분해 다시 만들 때만 지웁니다.
// ---------------------------------------------------------------------------
const GIVEN_NAMES = ['민서', '지훈', '서연', '도윤', '하은', '준호', '예린', '성민', '영숙', '정희', '순자', '경호', '미경', '동현', '수빈', '재원', '혜진', '상철', '은주', '태호', '지영', '현우', '말순', '옥자', '진수', '다은', '종민', '숙희', '병철', '유진'];
const JOURNAL_CHANNELS = ['지인소개', '가족소개', '네이버검색', '네이버블로그', '간판', '직장·집 근처', 'SNS', '지나가다'];
const JOURNAL_CHANNEL_WEIGHTS = [0.24, 0.12, 0.16, 0.12, 0.08, 0.14, 0.08, 0.06];
const JOURNAL_CATEGORIES = [
    { name: '임플란트', weight: 0.32, perTooth: 1100000, teeth: [1, 3] },
    { name: '보철치료', weight: 0.28, perTooth: 550000, teeth: [1, 4] },
    { name: '보존치료', weight: 0.2, perTooth: 250000, teeth: [1, 5] },
    { name: '교정', weight: 0.08, perTooth: 0, flat: 4500000, teeth: [0, 0] },
    { name: '틀니', weight: 0.07, perTooth: 0, flat: 1800000, teeth: [0, 0] },
    { name: '기타', weight: 0.05, perTooth: 300000, teeth: [1, 2] },
];
const JOURNAL_REASONS = ['상의 및 고민 필요', '비용 부담', '기간 미룸', '타치과 비교', '치료 전 다른 치료 필요', '일정 및 거리'];
const JOURNAL_MEMOS = [
    '치료 순서와 기간 설명함. 다음 내원 때 결정하기로 함.',
    '비용 부담 이야기하셔서 분할 수납 안내함.',
    '보험 적용 범위 설명, 가족과 상의 후 연락 주신다고 함.',
    '통증 있는 부위부터 먼저 진행 원하심.',
    '타 치과 견적과 비교 중이라고 하심. 1주 후 재연락.',
    '치료 계획서 출력해서 드림.',
    '임플란트 브랜드 차이 문의하셔서 설명함.',
    '다음 주 예약 잡고 귀가.',
];

const pickWeighted = (items, weights, rng) => {
    const total = weights.reduce((sum, w) => sum + w, 0);
    let r = rng() * total;
    for (let i = 0; i < items.length; i += 1) {
        r -= weights[i];
        if (r <= 0) return items[i];
    }
    return items[items.length - 1];
};
const fakeName = (rng) => `${SURNAMES[Math.floor(rng() * SURNAMES.length)]}${GIVEN_NAMES[Math.floor(rng() * GIVEN_NAMES.length)]}`;
const fakeChart = (rng, year) => `${String(year - Math.floor(rng() * 12)).slice(2)}-${String(Math.floor(1000 + rng() * 11000)).padStart(5, '0')}`;
const pickDoctor = (rng) => pickWeighted(DOCTORS.map(d => d.name), DOCTORS.map(d => d.share), rng);

/** 그 날 접수 환자 (가상). 오늘이면 지금 시각까지 접수된 사람만 */
const buildReceptionPatients = (key, full, calendar, now = null) => {
    if (!full) return [];
    const rng = makeRng(`sample-reception-${key}`);
    const date = parseDateKey(key);
    const hours = calendar.weekly[date.getDay()];
    const start = toMinutes(hours.start) ?? 570;
    const end = toMinutes(hours.end) ?? 1110;
    const isToday = now && key === toDateKey(now);
    const nowMinute = isToday ? now.getHours() * 60 + now.getMinutes() : 24 * 60;
    const list = [];
    for (let i = 0; i < full.visits; i += 1) {
        const minute = Math.round(start + ((end - start - 20) * (i + rng() * 0.8)) / full.visits);
        if (minute > nowMinute) break;
        const isNew = i % Math.max(1, Math.round(full.visits / Math.max(1, full.newPatients))) === 0 && list.filter(p => p.isNew).length < full.newPatients;
        const elapsed = nowMinute - minute;
        const status = !isToday ? 4 : elapsed > 90 ? 4 : elapsed > 60 ? 3 : elapsed > 25 ? 2 : elapsed > 10 ? 1 : 0;
        list.push({
            key: `S${key.replace(/-/g, '')}${String(i).padStart(3, '0')}`,
            name: fakeName(rng),
            chart: fakeChart(rng, date.getFullYear()),
            birthYear: 1945 + Math.floor(rng() * 60),
            gender: rng() < 0.52 ? 'F' : 'M',
            isNew,
            minute,
            status,
            doctor: pickDoctor(rng),
        });
    }
    return list;
};

/** 그 날 상담일지 (가상) — 접수 환자 중 진료가 끝난 환자 일부 */
const buildJournalRowsForDay = (clinicId, key, receptions) => {
    const rng = makeRng(`sample-journal-${key}`);
    const done = receptions.filter(p => p.status >= 3);
    if (done.length === 0) return [];
    const newOnes = done.filter(p => p.isNew);
    const returning = done.filter(p => !p.isNew);
    const chosen = [
        ...newOnes.filter(() => rng() < 0.7),
        ...returning.filter(() => rng() < 0.05),
    ];
    const date = parseDateKey(key);
    return chosen.map(patient => {
        const category = pickWeighted(JOURNAL_CATEGORIES, JOURNAL_CATEGORIES.map(c => c.weight), rng);
        const teeth = category.teeth[1] ? category.teeth[0] + Math.floor(rng() * (category.teeth[1] - category.teeth[0] + 1)) : 0;
        const consult = roundTo(category.flat ? category.flat * (0.85 + rng() * 0.3) : category.perTooth * teeth * (0.9 + rng() * 0.25), 10000);
        const diagnosis = roundTo(consult * (1 + rng() * 0.25), 10000);
        const pick = rng();
        const result = pick < 0.5 ? 'full' : pick < 0.68 ? 'partial' : pick < 0.95 ? 'declined' : 'cancelled';
        const agreed = result === 'full' ? consult : result === 'partial' ? roundTo(consult * (0.4 + rng() * 0.4), 10000) : 0;
        const agreedTeeth = result === 'full' ? teeth : result === 'partial' ? Math.max(1, Math.round(teeth * 0.5)) : 0;
        const insurable = (category.name === '임플란트' || category.name === '틀니') && date.getFullYear() - patient.birthYear >= 65;
        const isInsurance = insurable && rng() < 0.6;
        const createdAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor((patient.minute + 70) / 60), (patient.minute + 70) % 60);
        return {
            clinic_id: clinicId,
            consult_date: key,
            patient_name: patient.name,
            chart_no: patient.chart,
            patient_type: patient.isNew ? 'new' : 'returning',
            counselor: rng() < 0.6 ? CONSULTANTS[0] : CONSULTANTS[1],
            doctor: patient.doctor,
            visit_channel: patient.isNew ? pickWeighted(JOURNAL_CHANNELS, JOURNAL_CHANNEL_WEIGHTS, rng) : '',
            treatment_category: category.name,
            consulted_teeth: teeth,
            agreed_teeth: agreedTeeth,
            result,
            diagnosis_amount: diagnosis,
            consultation_amount: consult,
            agreed_amount: agreed,
            is_insurance: isInsurance,
            insurance_decision: isInsurance && result !== 'declined' && result !== 'cancelled' ? (category.name === '임플란트' ? 'implant' : 'denture') : '',
            plan_changed: rng() < 0.08,
            reject_reason: result === 'full' ? '' : JOURNAL_REASONS[Math.floor(rng() * JOURNAL_REASONS.length)],
            memo: rng() < 0.55 ? JOURNAL_MEMOS[Math.floor(rng() * JOURNAL_MEMOS.length)] : '',
            created_at: createdAt.toISOString(),
            updated_at: createdAt.toISOString(),
        };
    });
};

const toPatientRow = (clinicId, key, patient, stamp) => {
    const date = parseDateKey(key);
    return {
        clinic_id: clinicId,
        patient_key: patient.key,
        chart_no: patient.chart,
        name: patient.name,
        birth_year: patient.birthYear,
        gender: patient.gender,
        registered_date: patient.isNew ? key : `${date.getFullYear() - 2}-03-02`,
        last_visit_date: key,
        last_reception_at: new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(patient.minute / 60), patient.minute % 60).toISOString(),
        reception_status: patient.status,
        reception_doctor: patient.doctor,
        updated_at: stamp,
    };
};

/** 상담일지 화면용: 원장님 목록 · 최근 30일 접수 환자 · 오늘 상담일지를 지금 시각 기준으로 맞춥니다. */
const refreshSampleJournalToday = async (clinicId, calendar, now, dailyByKey) => {
    const stamp = now.toISOString();
    const todayKey = toDateKey(now);
    const cutoff = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));
    // 테이블이 아직 없으면(SQL 미실행) 조용히 건너뜀
    const optional = (error) => {
        if (error && !/does not exist|schema cache|PGRST205|42P01/i.test(`${error.code} ${error.message}`)) throw new Error(error.message);
    };

    optional((await supabase.from('emr_doctors').upsert(
        DOCTORS.map((doctor, index) => ({ clinic_id: clinicId, staff_key: `S${index + 1}`, name: doctor.name, updated_at: stamp })),
        { onConflict: 'clinic_id,staff_key' },
    )).error);

    const patientRows = [];
    Object.keys(dailyByKey).filter(key => key >= cutoff).forEach(key => {
        buildReceptionPatients(key, dailyByKey[key].__full, calendar, now)
            .forEach(patient => patientRows.push(toPatientRow(clinicId, key, patient, stamp)));
    });
    for (const chunk of chunked(patientRows, 500)) {
        optional((await supabase.from('emr_recent_patients').upsert(chunk, { onConflict: 'clinic_id,patient_key' })).error);
    }
    optional((await supabase.from('emr_recent_patients').delete().eq('clinic_id', clinicId).lt('last_visit_date', cutoff)).error);

    // 오늘 상담일지: 자동으로 만든 것만 다시 만듦 (시연 중 직접 쓴 일지는 그대로)
    const todayFull = dailyByKey[todayKey]?.__full;
    const todayRows = buildJournalRowsForDay(clinicId, todayKey, buildReceptionPatients(todayKey, todayFull, calendar, now));
    optional((await supabase.from('consultation_journals').delete().eq('clinic_id', clinicId).eq('consult_date', todayKey).is('created_by', null)).error);
    if (todayRows.length > 0) optional((await supabase.from('consultation_journals').insert(todayRows)).error);
};

/** 올해 1월 ~ 어제 상담일지 (자동으로 만든 것만 지우고 다시 만듦) + 선택 목록 */
const fillSampleJournals = async (clinicId, calendar, now, dailyByKey) => {
    const todayKey = toDateKey(now);
    const rows = [];
    Object.keys(dailyByKey).filter(key => key < todayKey).forEach(key => {
        rows.push(...buildJournalRowsForDay(clinicId, key, buildReceptionPatients(key, dailyByKey[key].__full, calendar)));
    });
    const { error: deleteError } = await supabase.from('consultation_journals').delete()
        .eq('clinic_id', clinicId).lt('consult_date', todayKey).is('created_by', null);
    if (deleteError) {
        if (/does not exist|schema cache|PGRST205|42P01/i.test(`${deleteError.code} ${deleteError.message}`)) return 0;
        throw new Error(`상담일지 정리 실패: ${deleteError.message}`);
    }
    for (const chunk of chunked(rows, 500)) {
        mustSucceed((await supabase.from('consultation_journals').insert(chunk)).error, '상담일지 저장 실패');
    }
    mustSucceed((await supabase.from('consultation_journal_settings').upsert({
        clinic_id: clinicId,
        options: {
            counselors: CONSULTANTS,
            doctors: [],
            visitChannels: JOURNAL_CHANNELS,
            treatmentCategories: JOURNAL_CATEGORIES.map(c => c.name),
            rejectReasons: JOURNAL_REASONS,
            hiddenDoctors: [],
        },
        updated_at: now.toISOString(),
    }, { onConflict: 'clinic_id' })).error, '상담일지 선택 목록 저장 실패');
    return rows.length;
};

// ---------------------------------------------------------------------------
// 저장
// ---------------------------------------------------------------------------
const chunked = (list, size = 100) => {
    const chunks = [];
    for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
    return chunks;
};

const mustSucceed = (error, label) => {
    if (error) throw new Error(`${label}: ${error.message}`);
};

export const findSampleClinic = async () => {
    const { data, error } = await supabase.from('clinics').select('id, name, code').like('code', 'sample-%').order('created_at', { ascending: true }).limit(1);
    if (error) throw new Error(`샘플 치과를 찾지 못했습니다: ${error.message}`);
    return data?.[0] || null;
};

/** 오늘 실시간 + 오늘 일별 + 시간별 누적을 지금 시각 기준으로 다시 씁니다. (관리자 화면에서 샘플 치과를 열 때마다 호출) */
export const refreshSampleToday = async (clinicId, now = new Date()) => {
    if (!clinicId) return;
    const calendar = createCalendar(now.getFullYear());
    const startKey = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));
    const dailyByKey = buildDailyRange(calendar, startKey, toDateKey(now), { now });
    const todayKey = toDateKey(now);
    const live = buildTodayLive(calendar, now, dailyByKey);
    const stamp = now.toISOString();

    mustSucceed((await supabase.from('live_clinic_stats').upsert({
        clinic_id: clinicId, stat_date: todayKey, payload: live.payload, source: SAMPLE_LIVE_SOURCE, updated_at: stamp,
    }, { onConflict: 'clinic_id,stat_date' })).error, '실시간 저장 실패');

    if (dailyByKey[todayKey]) {
        mustSucceed((await supabase.from('clinic_daily_stats').upsert({
            clinic_id: clinicId, stat_date: todayKey, metrics: stripFull(dailyByKey[todayKey]), updated_at: stamp,
        }, { onConflict: 'clinic_id,stat_date' })).error, '오늘 일별 기록 저장 실패');
    }
    const intraday = buildIntradayRows(clinicId, calendar, now, dailyByKey);
    for (const chunk of chunked(intraday)) {
        mustSucceed((await supabase.from('clinic_intraday_stats').upsert(chunk, { onConflict: 'clinic_id,stat_date,hour' })).error, '시간별 기록 저장 실패');
    }
    await refreshSampleJournalToday(clinicId, calendar, now, dailyByKey);
};

/** 올해 1월 ~ 오늘까지 모든 메뉴의 가상 자료를 채웁니다. */
export const fillSampleClinic = async (clinicId, { onProgress = () => {} } = {}) => {
    if (!clinicId) throw new Error('샘플 치과를 먼저 선택해 주세요.');
    const now = new Date();
    const year = now.getFullYear();
    const calendar = createCalendar(year);
    const stamp = now.toISOString();
    const dailyByKey = buildDailyRange(calendar, `${year}-01-01`, toDateKey(now), { now });

    onProgress('진료시간·휴무일·목표 저장 중...');
    mustSucceed((await supabase.from('clinic_operating_hours').upsert({ clinic_id: clinicId, weekly: calendar.weekly, updated_at: stamp }, { onConflict: 'clinic_id' })).error, '진료시간 저장 실패');
    mustSucceed((await supabase.from('clinic_holidays').upsert(
        buildSampleHolidays(year).map(item => ({ clinic_id: clinicId, holiday_date: item.date, label: item.label })),
        { onConflict: 'clinic_id,holiday_date' },
    )).error, '휴무일 저장 실패');

    const monthCount = now.getMonth() + 1;
    const goals = [];
    const analyticsRows = [];
    for (let month = 1; month <= monthCount; month += 1) {
        const prefix = `${year}-${pad2(month)}`;
        const monthDays = Object.entries(dailyByKey).filter(([key]) => key.startsWith(prefix));
        const openDayCount = (() => {
            let count = 0;
            const last = new Date(year, month, 0).getDate();
            for (let d = 1; d <= last; d += 1) if (calendar.isOpen(`${prefix}-${pad2(d)}`)) count += 1;
            return count;
        })();
        const expected = openDayCount * BASE_WEEKDAY_REVENUE * 0.93 * MONTH_TREND[month - 1];
        goals.push({
            clinic_id: clinicId, year, month, sales_goal: roundTo(expected * 1.02, 10000000),
            new_patient_goal: Math.round(openDayCount * 4.2 * MONTH_TREND[month - 1]), updated_at: stamp,
        });
        if (monthDays.length > 0) analyticsRows.push(...buildMonthlyRows({ clinicId, year, month, days: monthDays.map(([, metrics]) => stripFull(metrics)) }));
    }
    mustSucceed((await supabase.from('clinic_goals').upsert(goals, { onConflict: 'clinic_id,year,month' })).error, '월 목표 저장 실패');

    onProgress(`월별 분석 자료 ${analyticsRows.length}건 저장 중...`);
    for (const chunk of chunked(analyticsRows, 50)) {
        mustSucceed((await supabase.from('analytics_data').upsert(chunk, { onConflict: 'clinic_id,category,sub_category,year,month_key' })).error, '월별 분석 자료 저장 실패');
    }

    onProgress('일별 기록 저장 중...');
    const dailyRows = Object.entries(dailyByKey)
        .filter(([key]) => key !== toDateKey(now))
        .map(([key, metrics]) => ({ clinic_id: clinicId, stat_date: key, metrics: stripFull(metrics), updated_at: stamp }));
    for (const chunk of chunked(dailyRows)) {
        mustSucceed((await supabase.from('clinic_daily_stats').upsert(chunk, { onConflict: 'clinic_id,stat_date' })).error, '일별 기록 저장 실패');
    }

    onProgress('상담일지 저장 중...');
    const journalCount = await fillSampleJournals(clinicId, calendar, now, dailyByKey);

    onProgress('오늘 실시간 현황 저장 중...');
    await refreshSampleToday(clinicId, now);
    return { months: monthCount, analyticsRows: analyticsRows.length, dailyRows: dailyRows.length + 1, journals: journalCount };
};
