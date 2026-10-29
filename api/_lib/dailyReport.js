// 매일 마감 알림톡: 숫자 계산 + 양식 (서버 전용, 화면 코드와 공유하지 않음)
// 홈 화면 "오늘 목표"와 같은 계산입니다: 오늘 목표 = (월 목표 − 어제까지 실적) ÷ 오늘 포함 남은 영업일
// 파일 이름이 _ 로 시작하는 폴더라서 Vercel 이 서버 기능(주소)으로 만들지 않습니다.

// 솔라피에 등록할 알림톡 양식. 글자 하나라도 다르면 카카오 검수/발송에서 실패하므로 그대로 등록해야 합니다.
export const TEMPLATE_TEXT = [
    '[아크덴트] #{치과명} #{날짜} 마감 보고',
    '',
    '■ 오늘 매출',
    '#{오늘매출} / 목표 #{오늘매출목표} (#{오늘달성률})',
    '■ 오늘 신환',
    '#{오늘신환} / 목표 #{오늘신환목표}',
    '■ 내원 환자 #{내원}',
    '신환 #{신환} · 구환 #{구환}',
    '',
    '■ 이번 달 누적 매출 #{월누적매출} / 목표 #{월매출목표} (#{월달성률})',
    '■ 내일 하루 목표 #{내일목표} (남은 영업일 #{남은영업일})',
    '',
    '#{업데이트}',
].join('\n');

export const TEMPLATE_BUTTON = { type: '웹링크(WL)', name: '앱에서 자세히 보기', url: 'https://arcdent.vercel.app' };

const DEFAULT_WEEKLY = {
    0: { open: false }, 1: { open: true }, 2: { open: true }, 3: { open: true },
    4: { open: true }, 5: { open: true }, 6: { open: true },
};
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad2 = (value) => String(value).padStart(2, '0');

/** 서버(UTC)에서 한국 시각의 '벽시계' 값 */
export const kstNow = (base = Date.now()) => {
    const d = new Date(base + 9 * 60 * 60 * 1000);
    return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
        weekday: d.getUTCDay(),
        hhmm: `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`,
        dateKey: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`,
    };
};

const isOpenDay = (weekly, holidays, year, month, day) => {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const hours = weekly?.[weekday] ?? weekly?.[String(weekday)] ?? DEFAULT_WEEKLY[weekday];
    return Boolean(hours?.open) && !holidays.has(`${year}-${pad2(month)}-${pad2(day)}`);
};

const manWon = (value) => {
    const n = Math.round(Number(value || 0));
    return Math.abs(n) >= 10000 ? `${Math.round(n / 10000).toLocaleString('ko-KR')}만원` : `${n.toLocaleString('ko-KR')}원`;
};
const shortWon = (value) => {
    const n = Math.round(Number(value || 0));
    if (Math.abs(n) >= 100000000) return `${(n / 100000000).toFixed(2).replace(/\.?0+$/, '')}억`;
    return manWon(n);
};
const percent = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '-');
const kstTime = (iso) => {
    if (!iso) return '';
    const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
    return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};

/**
 * 알림톡 변수 만들기
 * live: live_clinic_stats 오늘 줄 { payload, updated_at } / goal: { sales_goal, new_patient_goal } | null
 * weekly: 진료시간(요일별 open) / holidays: ['YYYY-MM-DD'] / basis: 'total' | 'paid'
 */
export const buildReport = ({ clinicName, now, live, goal, weekly, holidays = [], basis = 'total' }) => {
    const holidaySet = new Set(holidays.map(item => String(item).slice(0, 10)));
    const lastDay = new Date(Date.UTC(now.year, now.month, 0)).getUTCDate();
    let daysAfterToday = 0;
    for (let day = now.day + 1; day <= lastDay; day += 1) {
        if (isOpenDay(weekly, holidaySet, now.year, now.month, day)) daysAfterToday += 1;
    }
    const openToday = isOpenDay(weekly, holidaySet, now.year, now.month, now.day);

    const today = live?.payload?.today || {};
    const month = live?.payload?.month || {};
    const hasClaim = month.insuranceClaim !== undefined && month.insuranceClaim !== null;
    const useTotal = basis === 'total' && hasClaim;
    const todaySales = Number(today.paid || 0) + (useTotal ? Number(today.insuranceClaim || 0) : 0);
    const monthSales = Number(month.paid || 0) + (useTotal ? Number(month.insuranceClaim || 0) : 0);
    const todayNew = Number(today.newPatients || 0);
    const monthNew = Number(month.newPatients || 0);
    const visits = Number(today.visits || 0);

    const salesGoal = Number(goal?.sales_goal || 0);
    const newGoal = Number(goal?.new_patient_goal || 0);
    const daysFromToday = daysAfterToday + (openToday ? 1 : 0);
    const todaySalesTarget = salesGoal > 0 && daysFromToday > 0 ? Math.max(0, salesGoal - (monthSales - todaySales)) / daysFromToday : null;
    const todayNewTarget = newGoal > 0 && daysFromToday > 0 ? Math.ceil(Math.max(0, newGoal - (monthNew - todayNew)) / daysFromToday - 1e-9) : null;
    const tomorrowTarget = salesGoal > 0 && daysAfterToday > 0 ? Math.max(0, salesGoal - monthSales) / daysAfterToday : null;

    const variables = {
        '#{치과명}': clinicName,
        '#{날짜}': `${now.month}/${now.day}(${WEEKDAYS[now.weekday]})`,
        '#{오늘매출}': manWon(todaySales),
        '#{오늘매출목표}': todaySalesTarget === null ? '미설정' : manWon(todaySalesTarget),
        '#{오늘달성률}': todaySalesTarget ? percent(todaySales, todaySalesTarget) : '-',
        '#{오늘신환}': `${todayNew}명`,
        '#{오늘신환목표}': todayNewTarget === null ? '미설정' : `${todayNewTarget}명`,
        '#{내원}': `${visits}명`,
        '#{신환}': `${todayNew}명`,
        '#{구환}': `${Math.max(0, visits - todayNew)}명`,
        '#{월누적매출}': shortWon(monthSales),
        '#{월매출목표}': salesGoal > 0 ? shortWon(salesGoal) : '미설정',
        '#{월달성률}': salesGoal > 0 ? percent(monthSales, salesGoal) : '-',
        '#{내일목표}': tomorrowTarget === null ? (salesGoal > 0 ? '이번 달 영업 종료' : '미설정') : manWon(tomorrowTarget),
        '#{남은영업일}': `${daysAfterToday}일`,
        '#{업데이트}': live?.updated_at ? `EMR 마지막 업데이트 ${kstTime(live.updated_at)}${useTotal ? ' · 매출은 수납+보험청구' : ' · 매출은 수납 기준'}` : 'EMR 자료 없음',
    };
    return { openToday, hasData: Boolean(live), variables };
};

export const renderTemplate = (variables) => Object.entries(variables)
    .reduce((text, [key, value]) => text.split(key).join(String(value)), TEMPLATE_TEXT);

export const maskPhone = (phone) => {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits.length >= 8 ? `${digits.slice(0, 3)}-****-${digits.slice(-4)}` : '***';
};
