import assert from 'node:assert/strict';
import {
    buildPayload,
    summarizePayments,
    summarizeReceptions,
    summarizeReservations,
    summarizeTreatmentFees,
} from './aggregate.js';

// 덴트웹 없이 집계 로직만 검증하는 자체 테스트입니다. (npm test)

// 접수목록: 환자 3명(그중 1명은 같은 날 2번 접수) + 신환 1명
const receptions = summarizeReceptions([
    { n상태: 4, b신환여부: false, n환자ID: 10 },
    { n상태: 0, b신환여부: false, n환자ID: 10 },
    { n상태: 2, b신환여부: true, n환자ID: 11 },
    { n상태: 3, b신환여부: 0, n환자ID: 12 },
]);
assert.equal(receptions.visits, 3);
assert.equal(receptions.newPatients, 1);
assert.equal(receptions.returningPatients, 2);
assert.deepEqual(receptions.status, { waiting: 1, ready: 0, inTreatment: 1, treated: 1, paid: 1 });

// 수납: 카드 50,000 + 현금 20,000 + 통장 30,000, 환불 10,000 (양수로 기록된 경우)
const staff = new Map([[1, '김원장'], [2, '이원장']]);
const payments = summarizePayments([
    { n구분: 0, n담당의사: 1, n카드수납액: 50000, n현금수납액: 0, n통장수납액: 0 },
    { n구분: 0, n담당의사: 2, n카드수납액: 0, n현금수납액: 20000, n통장수납액: 30000 },
    { n구분: 2, n담당의사: 1, n카드수납액: 10000, n현금수납액: 0, n통장수납액: 0 },
], staff);
assert.equal(payments.paid, 90000);
assert.equal(payments.card, 40000);
assert.equal(payments.refund, 10000);
assert.equal(payments.refundCount, 1);
assert.deepEqual(payments.doctors, [{ name: '이원장', paid: 50000 }, { name: '김원장', paid: 40000 }]);

// 환불이 음수로 기록된 경우도 똑같이 빼져야 함
const negativeRefund = summarizePayments([
    { n구분: 0, n카드수납액: 50000 },
    { n구분: 2, n카드수납액: -10000 },
]);
assert.equal(negativeRefund.paid, 40000);

const fees = summarizeTreatmentFees([
    { n구분: 0, n총진료비: 100000, n공단부담금: 60000, n본인부담금: 40000, n비급여진료비: 0 },
    { n구분: 0, n총진료비: 300000, n공단부담금: 0, n본인부담금: 0, n비급여진료비: 300000 },
]);
assert.deepEqual(fees, { totalFee: 400000, insuranceClaim: 60000, patientShare: 40000, nonCovered: 300000 });

const reservations = summarizeReservations([
    { n이행현황: 1, n예약종류: 0, n환자ID: 10 },
    { n이행현황: 0, n예약종류: 0x40, n환자ID: -3 },
    { n이행현황: 2, n예약종류: 0x2, n환자ID: 12 },
    { n이행현황: 3, n예약종류: 0, n환자ID: 13 },
]);
assert.deepEqual(reservations, { total: 4, done: 1, pending: 1, canceled: 1, hold: 1, newPatient: 1 });

const payload = buildPayload({
    todayReception: receptions,
    todayPayments: payments,
    todayFees: fees,
    reservations,
    monthPayments: { paid: 1000000 },
    monthReceptionDays: [{ visits: 10, newPatients: 2 }, receptions],
});
assert.equal(payload.today.paid, 90000);
assert.equal(payload.month.visits, 13);
assert.equal(payload.month.newPatients, 3);

// payload에 개인정보 키가 섞이지 않았는지 확인
const serialized = JSON.stringify(payload);
['sz이름', '전화', '휴대폰', '차트번호', '생년월일', 'n환자ID'].forEach(key => {
    assert.ok(!serialized.includes(key), `payload에 ${key} 가 포함되면 안 됩니다`);
});

console.log('자체 테스트 통과 ✅');
