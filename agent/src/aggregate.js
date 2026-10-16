// 덴트웹에서 읽은 행(row)들을 아크덴트로 보낼 "합계 숫자"로 바꾸는 순수 함수 모음입니다.
// 여기서 만든 결과(payload)에는 환자 이름·연락처·차트번호 같은 개인정보가 들어가지 않습니다.

const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

// 환불(n구분=2)은 덴트웹에 양수로 들어오든 음수로 들어오든 항상 '빼는 금액'으로 처리합니다.
const signed = (row, value) => (num(row.n구분) === 2 ? -Math.abs(num(value)) : num(value));

/**
 * 접수목록(PUB_P접수목록) → 하루 내원 요약
 * n상태: 0=접수, 1=준비완료, 2=진료중, 3=진료완료, 4=수납완료
 */
export const summarizeReceptions = (rows = []) => {
    const status = { waiting: 0, ready: 0, inTreatment: 0, treated: 0, paid: 0 };
    const statusKeys = ['waiting', 'ready', 'inTreatment', 'treated', 'paid'];
    const patients = new Map(); // 환자ID → 신환 여부 (같은 날 2번 접수돼도 1명)
    let anonymous = 0;
    let anonymousNew = 0;

    rows.forEach(row => {
        const key = statusKeys[num(row.n상태)];
        if (key) status[key] += 1;

        const isNew = row.b신환여부 === true || row.b신환여부 === 1;
        const patientId = num(row.n환자ID);
        if (patientId > 0) {
            patients.set(patientId, Boolean(patients.get(patientId)) || isNew);
        } else {
            anonymous += 1;
            if (isNew) anonymousNew += 1;
        }
    });

    const visits = patients.size + anonymous;
    const newPatients = Array.from(patients.values()).filter(Boolean).length + anonymousNew;
    return {
        visits,
        newPatients,
        returningPatients: Math.max(0, visits - newPatients),
        status,
    };
};

/**
 * 진료비내역(PUB_V진료비내역) → 수납/진료비 합계
 * 수납액 = 카드 + 현금 + 통장 (현금영수증 발행액은 현금에 포함된 금액이라 더하지 않음)
 */
export const summarizePayments = (rows = [], staffNames = new Map()) => {
    const result = {
        paid: 0,
        card: 0,
        cash: 0,
        bank: 0,
        refund: 0,
        refundCount: 0,
        doctors: [],
    };
    const byDoctor = new Map();

    rows.forEach(row => {
        const card = signed(row, row.n카드수납액);
        const cash = signed(row, row.n현금수납액);
        const bank = signed(row, row.n통장수납액);
        const paid = card + cash + bank;

        result.card += card;
        result.cash += cash;
        result.bank += bank;
        result.paid += paid;
        if (num(row.n구분) === 2) {
            result.refund += Math.abs(paid);
            result.refundCount += 1;
        }

        const doctorId = num(row.n담당의사);
        if (doctorId > 0) byDoctor.set(doctorId, (byDoctor.get(doctorId) || 0) + paid);
    });

    result.doctors = Array.from(byDoctor.entries())
        .map(([id, paid]) => ({ name: staffNames.get(id) || `의사${id}`, paid }))
        .filter(item => item.paid !== 0)
        .sort((a, b) => b.paid - a.paid);
    return result;
};

/** 진료비내역 중 '오늘 진료분' → 진료비 구성 (총진료비/공단부담금/본인부담금/비급여) */
export const summarizeTreatmentFees = (rows = []) => rows.reduce((acc, row) => {
    acc.totalFee += signed(row, row.n총진료비);
    acc.insuranceClaim += signed(row, row.n공단부담금);
    acc.patientShare += signed(row, row.n본인부담금);
    acc.nonCovered += signed(row, row.n비급여진료비);
    return acc;
}, { totalFee: 0, insuranceClaim: 0, patientShare: 0, nonCovered: 0 });

/**
 * 예약정보(PUB_V예약정보) → 오늘 예약 요약
 * n이행현황: 0=미이행, 1=이행, 2=취소, 3=보류 / n예약종류 0x40 = 신환예약 (또는 n환자ID 음수)
 */
export const summarizeReservations = (rows = []) => rows.reduce((acc, row) => {
    acc.total += 1;
    const state = num(row.n이행현황);
    if (state === 1) acc.done += 1;
    else if (state === 2) acc.canceled += 1;
    else if (state === 3) acc.hold += 1;
    else acc.pending += 1;
    if ((num(row.n예약종류) & 0x40) !== 0 || num(row.n환자ID) < 0) acc.newPatient += 1;
    return acc;
}, { total: 0, done: 0, pending: 0, canceled: 0, hold: 0, newPatient: 0 });

/** 아크덴트 홈 화면(HomeLiveSection)이 읽는 payload 형태로 조립 */
// 매출(revenue) = 수납액 + 공단부담금(청구액) — 덴트웹 월간 장부의 "합계(청구포함)"와 같은 기준
export const buildPayload = ({ todayReception, todayPayments, todayFees, reservations, monthPayments, monthFees, monthReceptionDays }) => {
    const monthVisits = monthReceptionDays.reduce((acc, day) => acc + day.visits, 0);
    const monthNewPatients = monthReceptionDays.reduce((acc, day) => acc + day.newPatients, 0);
    return {
        generatedAt: new Date().toISOString(),
        today: {
            revenue: todayPayments.paid + todayFees.insuranceClaim,
            paid: todayPayments.paid,
            card: todayPayments.card,
            cash: todayPayments.cash,
            bank: todayPayments.bank,
            refund: todayPayments.refund,
            ...todayFees,
            visits: todayReception.visits,
            newPatients: todayReception.newPatients,
            returningPatients: todayReception.returningPatients,
            status: todayReception.status,
            reservations,
            doctors: todayPayments.doctors,
        },
        month: {
            revenue: monthPayments.paid + monthFees.insuranceClaim,
            paid: monthPayments.paid,
            insuranceClaim: monthFees.insuranceClaim,
            totalFee: monthFees.totalFee,
            visits: monthVisits,
            newPatients: monthNewPatients,
            daysCounted: monthReceptionDays.length,
        },
    };
};
