import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight, Target, UserPlus, Users, WalletCards, Repeat } from 'lucide-react';
import DashboardCard from '../DashboardCard';
import {
    getMonthBusinessDays,
    getMonthOpenDays,
    loadGoalsForYear,
    loadHolidays,
    loadLatestLiveStats,
    loadOperatingHours,
    subscribeLiveStats,
    toDateKey,
} from '../../utils/clinicOperations';
import { loadGoalSalesBasis } from '../../utils/clinicFeatureSettings';
import { loadDailyStats, loadIntradayStats, pickIntradayAt } from '../../utils/clinicHistory';
import { ChangeChip, DailyCalendarCard, MonthCompareCard, salesOf } from './HomeHistoryCards';
import './HomeLiveSection.css';

const STALE_MINUTES = 10;
const HISTORY_REFRESH_MS = 5 * 60 * 1000;
const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
const POLL_MS = 60 * 1000;

const won = (value) => `${Math.round(Number(value || 0)).toLocaleString()}원`;
const shortWon = (value) => {
    const number = Math.round(Number(value || 0));
    if (Math.abs(number) >= 100000000) return `${(number / 100000000).toFixed(2).replace(/\.?0+$/, '')}억`;
    if (Math.abs(number) >= 10000) return `${Math.round(number / 10000).toLocaleString()}만`;
    return `${number.toLocaleString()}`;
};
const people = (value) => `${Math.round(Number(value || 0)).toLocaleString()}명`;
// '오늘 목표' 칸용: 만원 단위까지 붙여서 (1,819만원), 1만원 미만은 원 단위
const manWon = (value) => {
    const number = Math.round(Number(value || 0));
    if (Math.abs(number) >= 10000) return `${Math.round(number / 10000).toLocaleString()}만원`;
    return `${number.toLocaleString()}원`;
};
const decimalPeople = (value) => `${Number(value || 0).toFixed(Number.isInteger(Number(value)) ? 0 : 1)}명`;
const timeLabel = (iso) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
};

const getPace = (achievedRate, expectedRate) => {
    if (achievedRate >= 100) return { tone: 'done', text: '목표 달성!' };
    const gap = achievedRate - expectedRate;
    if (gap >= 0) return { tone: 'good', text: `${gap.toFixed(1)}%p 앞서는 중` };
    if (gap >= -10) return { tone: 'warn', text: `${Math.abs(gap).toFixed(1)}%p 조금 뒤처짐` };
    return { tone: 'bad', text: `${Math.abs(gap).toFixed(1)}%p 뒤처짐` };
};

// 홈 화면 상단: ① 이번 달 목표 달성 ② 오늘 실시간 현황(덴트웹)
// excelMonthActual: 덴트웹 미연동일 때 목표 달성률 계산에 쓰는 이번 달 엑셀 업로드 값 { paid, newPatients }
const HomeLiveSection = ({ clinicId, excelMonthActual }) => {
    const [now, setNow] = useState(() => new Date());
    const [live, setLive] = useState(null);
    const [liveReady, setLiveReady] = useState(false);
    const [weekly, setWeekly] = useState(null);
    const [holidays, setHolidays] = useState([]);
    const [goal, setGoal] = useState(null);
    const [yearGoals, setYearGoals] = useState({});
    const [goalSalesBasis, setGoalSalesBasis] = useState('total');
    const [daily, setDaily] = useState({});
    const [intraday, setIntraday] = useState({});
    const [pickedDate, setPickedDate] = useState(null); // null = 오늘(실시간)
    const [opsKey, setOpsKey] = useState(0);

    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const todayKey = toDateKey(now);

    // 1분마다 시계 갱신 (영업일 진도, 연결 상태 판단용)
    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), POLL_MS);
        return () => window.clearInterval(timer);
    }, []);

    // 운영 설정 + 목표 (치과/월이 바뀔 때만)
    useEffect(() => {
        let cancelled = false;
        if (!clinicId) return undefined;
        const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
        const monthEnd = toDateKey(new Date(year, month, 0));
        Promise.allSettled([
            loadOperatingHours(clinicId),
            loadHolidays(clinicId, { from: toDateKey(new Date(year, month - 13, 1)), to: monthEnd }),
            loadGoalsForYear(clinicId, year),
            loadGoalSalesBasis(clinicId),
        ]).then(([hoursResult, holidayResult, goalResult, basisResult]) => {
            if (!cancelled) setGoalSalesBasis(basisResult.status === 'fulfilled' ? basisResult.value : 'total');
            if (cancelled) return;
            setWeekly(hoursResult.status === 'fulfilled' ? hoursResult.value.weekly : null);
            setHolidays(holidayResult.status === 'fulfilled' ? holidayResult.value : []);
            setGoal(goalResult.status === 'fulfilled' ? (goalResult.value[month] || null) : null);
            setYearGoals(goalResult.status === 'fulfilled' ? goalResult.value : {});
        });
        return () => { cancelled = true; };
    }, [clinicId, year, month, opsKey]);

    // 관리자모드에서 진료시간/휴무일/목표를 저장하면 다시 불러옵니다.
    useEffect(() => {
        const handleUpdate = () => setOpsKey(key => key + 1);
        window.addEventListener('clinicOperationsUpdated', handleUpdate);
        return () => window.removeEventListener('clinicOperationsUpdated', handleUpdate);
    }, []);

    // 실시간 현황: 처음 1번 + Realtime 구독 + 1분 폴링(구독이 끊겼을 때 대비)
    useEffect(() => {
        let cancelled = false;
        setLive(null);
        setLiveReady(false);
        if (!clinicId) return undefined;

        const fetchLatest = () => loadLatestLiveStats(clinicId)
            .then(row => { if (!cancelled) setLive(row); })
            .catch(() => { /* 테이블 미생성 등: 미연동으로 표시 */ })
            .finally(() => { if (!cancelled) setLiveReady(true); });

        fetchLatest();
        const unsubscribe = subscribeLiveStats(clinicId, (row) => {
            if (!cancelled && row) {
                setLive(current => (!current || String(row.stat_date) >= String(current.stat_date) ? row : current));
            }
        });
        const poll = window.setInterval(fetchLatest, POLL_MS);
        return () => {
            cancelled = true;
            unsubscribe();
            window.clearInterval(poll);
        };
    }, [clinicId]);

    // 지난 데이터: 최근 13개월 일별 기록 + 어제/지난주 같은 요일 시간별 기록 (5분마다 새로고침)
    useEffect(() => {
        let cancelled = false;
        setDaily({});
        setIntraday({});
        setPickedDate(null);
        if (!clinicId) return undefined;
        const load = () => {
            const base = new Date();
            const from = toDateKey(new Date(base.getFullYear(), base.getMonth() - 12, 1));
            const to = toDateKey(base);
            // 시간별 기록: 직전 진료일 후보(최근 7일) + 같은 요일 2~4주 전
            const intradayDates = [1, 2, 3, 4, 5, 6, 7, 14, 21, 28]
                .map(back => toDateKey(new Date(base.getFullYear(), base.getMonth(), base.getDate() - back)));
            Promise.allSettled([
                loadDailyStats(clinicId, from, to),
                loadIntradayStats(clinicId, intradayDates),
            ]).then(([dailyResult, intradayResult]) => {
                if (cancelled) return;
                if (dailyResult.status === 'fulfilled') setDaily(dailyResult.value);
                if (intradayResult.status === 'fulfilled') setIntraday(intradayResult.value);
            });
        };
        load();
        const timer = window.setInterval(load, HISTORY_REFRESH_MS);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [clinicId]);

    const business = useMemo(
        () => getMonthBusinessDays({ now, weekly, holidays }),
        [now, weekly, holidays],
    );

    const isTodayRow = live && String(live.stat_date) === todayKey;
    const today = isTodayRow ? (live.payload?.today || {}) : null;
    const minutesSinceUpdate = live?.updated_at ? (now.getTime() - new Date(live.updated_at).getTime()) / 60000 : null;

    const connection = (() => {
        if (!liveReady) return { tone: 'idle', text: '불러오는 중' };
        if (!live) return { tone: 'off', text: 'EMR 미연동' };
        if (isTodayRow && minutesSinceUpdate !== null && minutesSinceUpdate <= STALE_MINUTES) {
            return { tone: 'on', text: `EMR 연동 · ${timeLabel(live.updated_at)} 업데이트` };
        }
        if (business.isWorkingNow) {
            return { tone: 'warn', text: `연결 확인 필요 · 마지막 ${live.updated_at ? new Date(live.updated_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}` };
        }
        return { tone: 'idle', text: `진료시간 외 · 마지막 ${timeLabel(live.updated_at)}` };
    })();

    // 목표 달성 계산에 쓸 이번 달 실적: 덴트웹(이번 달 데이터) 우선, 없으면 엑셀
    const liveMonth = live && String(live.stat_date).slice(0, 7) === todayKey.slice(0, 7) ? live.payload?.month : null;
    // claim(보험청구액)이 없으면 null — 예전 버전 중계 프로그램 데이터 등
    const toNumberOrNull = (value) => (value === undefined || value === null || value === '' ? null : Number(value));
    const monthActual = liveMonth
        ? {
            paid: Number(liveMonth.paid || 0),
            claim: toNumberOrNull(liveMonth.insuranceClaim),
            newPatients: Number(liveMonth.newPatients || 0),
            source: 'live',
        }
        : {
            paid: Number(excelMonthActual?.paid || 0),
            claim: toNumberOrNull(excelMonthActual?.claim),
            newPatients: Number(excelMonthActual?.newPatients || 0),
            source: 'excel',
        };
    // 매출 목표 기준: 총매출(수납 + 청구) 또는 수납액만 — 관리자모드에서 치과별 설정
    const useTotalSales = goalSalesBasis === 'total' && monthActual.claim !== null;
    const monthSales = useTotalSales ? monthActual.paid + monthActual.claim : monthActual.paid;
    const todayClaim = today ? toNumberOrNull(today.insuranceClaim) : null;
    const todaySales = today
        ? (goalSalesBasis === 'total' && todayClaim !== null ? Number(today.paid || 0) + todayClaim : Number(today.paid || 0))
        : 0;
    const salesBasisLabel = useTotalSales ? '청구 포함' : '수납 기준';

    const expectedRate = business.totalDays > 0 ? (business.elapsedDays / business.totalDays) * 100 : 0;

    const buildGoalRow = ({ key, label, icon, actual, target, formatShort }) => {
        if (!target) return { key, label, icon, missing: true };
        const achievedRate = (actual / target) * 100;
        const remaining = Math.max(0, target - actual);
        const perDay = business.remainingDayCount > 0 ? remaining / business.remainingDayCount : null;
        const projected = business.elapsedDays > 0 ? (actual / business.elapsedDays) * business.totalDays : null;
        return {
            key, label, icon, actual, target, formatShort,
            achievedRate,
            remaining,
            perDay,
            projected,
            pace: getPace(achievedRate, expectedRate),
        };
    };

    const goalRows = [
        {
            ...buildGoalRow({ key: 'sales', label: '매출', icon: WalletCards, actual: monthSales, target: goal?.salesGoal, formatShort: shortWon }),
            breakdown: useTotalSales ? `수납 ${shortWon(monthActual.paid)} + 청구 ${shortWon(monthActual.claim)}` : '',
        },
        buildGoalRow({ key: 'newPatients', label: '신환', icon: UserPlus, actual: monthActual.newPatients, target: goal?.newPatientGoal, formatShort: people }),
    ];

    // 오늘 목표 = (월 목표 − 어제까지 실적) ÷ 오늘 포함 남은 영업일 — 덴트웹 실시간일 때만
    const todayGoals = (() => {
        if (monthActual.source !== 'live' || !today || !business.isOpenToday || business.daysFromToday <= 0) return null;
        // 지금 시각까지 오늘 진료시간이 지난 비율 → '지금 예상' 눈금과 순항/부족 판단
        const expectedNow = business.todayFraction === null ? null : business.todayFraction * 100;
        const build = ({ key, label, valueLabel, monthTarget, monthValue, todayValue, format, wholeNumber }) => {
            if (!monthTarget) return null;
            const beforeToday = Math.max(0, monthValue - todayValue);
            const rawTarget = Math.max(0, monthTarget - beforeToday) / business.daysFromToday;
            // 신환처럼 사람 수는 소수점 없이 올림 (4.6명 → 5명)
            const target = wholeNumber ? Math.ceil(rawTarget - 1e-9) : rawTarget;
            const rate = target > 0 ? (todayValue / target) * 100 : 100;
            const remaining = Math.max(0, target - todayValue);
            const monthDone = target <= 0;
            let pace = null;
            if (monthDone || rate >= 100) pace = { tone: 'done', text: '달성' };
            else if (expectedNow !== null) {
                const gap = rate - expectedNow;
                pace = gap >= 0
                    ? { tone: 'good', text: '순항' }
                    : gap >= -15 ? { tone: 'warn', text: '조금 부족' } : { tone: 'bad', text: '부족' };
            }
            return { key, label, valueLabel, target, value: todayValue, remaining, rate, format, monthDone, pace };
        };
        // ⚠️ 목표가 없거나 아직 불러오기 전이면 build()가 null 을 돌려줍니다.
        //    예전에는 null 을 펼쳐서({...null}) 빈 항목이 만들어졌고, 그 항목의 format 이 없어
        //    'format is not a function' 오류로 앱 전체가 흰 화면이 됐습니다.
        const salesItem = build({ key: 'sales', label: '매출', valueLabel: useTotalSales ? '매출' : '수납', monthTarget: goal?.salesGoal, monthValue: monthSales, todayValue: todaySales, format: manWon });
        if (salesItem) {
            salesItem.breakdown = useTotalSales && todayClaim !== null ? `수납 ${manWon(today.paid)} + 청구 ${manWon(todayClaim)}` : '';
        }
        return {
            expectedNow,
            items: [
                salesItem,
                build({ key: 'newPatients', label: '신환', valueLabel: '현재', monthTarget: goal?.newPatientGoal, monthValue: monthActual.newPatients, todayValue: Number(today.newPatients || 0), format: people, wholeNumber: true }),
            ].filter(item => item && typeof item.format === 'function'),
        };
    })();

    const todayEmptyMessage = monthActual.source !== 'live'
        ? 'EMR이 연동되면 오늘 채워야 할 목표가 실시간으로 표시됩니다.'
        : !business.isOpenToday
            ? '오늘은 휴진일입니다.'
            : !today
                ? '오늘 데이터를 기다리는 중입니다.'
                : '월 목표를 설정하면 오늘 목표가 표시됩니다.';

    const status = today?.status || {};
    const reservations = today?.reservations || null;
    const waitingCount = Number(status.waiting || 0) + Number(status.ready || 0);

    const goalCard = (
        <DashboardCard
            title={`${month}월 목표 달성`}
            subtitle={`영업일 ${business.totalDays}일 중 ${business.completedDays}일 경과 · 오늘 포함 남은 영업일 ${business.remainingDayCount}일`}
            headerRight={(
                <span className="home-goal-source">
                    {monthActual.source === 'live' ? 'EMR 실시간' : '엑셀 업로드 기준'} · {salesBasisLabel}
                </span>
            )}
        >
            <div className="home-goal-layout">
                {goalRows.map(row => {
                    if (row.missing) {
                        return (
                            <div key={row.key} className="home-goal-gauge is-missing">
                                <GoalRing rate={0} expectedRate={expectedRate} tone="idle" label={row.label} icon={row.icon} empty />
                                <span className="home-goal-missing">목표 미설정</span>
                                <span className="home-goal-hint">관리자모드 → 운영 설정 / 목표</span>
                            </div>
                        );
                    }
                    return (
                        <div key={row.key} className="home-goal-gauge">
                            <GoalRing rate={row.achievedRate} expectedRate={expectedRate} tone={row.pace.tone} label={row.label} icon={row.icon} />
                            <div className="home-goal-amount">
                                <strong>{row.formatShort(row.actual)}</strong>
                                <span> / {row.formatShort(row.target)}</span>
                            </div>
                            {/* 두 게이지 칸 높이를 맞추기 위해 구성 줄이 없어도 같은 높이의 빈 줄을 둠 */}
                            <div className={`home-goal-breakdown ${row.breakdown ? "" : "is-empty"}`}>{row.breakdown || ' '}</div>
                            <span className={`home-goal-pace-badge tone-${row.pace.tone}`}>{row.pace.text}</span>
                            <dl className="home-goal-facts">
                                {row.remaining > 0 ? (
                                    <>
                                        <div><dt>목표까지</dt><dd>{row.formatShort(row.remaining)}</dd></div>
                                        {row.perDay !== null && (
                                            <div><dt>하루 필요</dt><dd>{row.key === 'newPatients' ? decimalPeople(Number(row.perDay.toFixed(1))) : row.formatShort(row.perDay)}</dd></div>
                                        )}
                                    </>
                                ) : (
                                    <div><dt>이번 달</dt><dd>목표 달성</dd></div>
                                )}
                                {row.projected !== null && (
                                    <div>
                                        <dt>월말 예상</dt>
                                        <dd>
                                            {row.key === 'newPatients' ? `${Math.round(row.projected)}명` : row.formatShort(row.projected)}
                                            <small> ({((row.projected / row.target) * 100).toFixed(0)}%)</small>
                                        </dd>
                                    </div>
                                )}
                            </dl>
                        </div>
                    );
                })}

                <div className="home-goal-today">
                    <span className="home-goal-today-title"><Target size={15} /> 오늘 목표</span>
                    {todayGoals && todayGoals.items.length > 0 ? todayGoals.items.map(item => {
                        const tone = item.pace?.tone || 'idle';
                        return (
                            <div key={item.key} className={`home-goal-today-item tone-box-${tone}`}>
                                <div className="home-goal-today-head">
                                    <span className="home-goal-today-label">{item.label}</span>
                                    <span className="home-goal-today-rate">
                                        <strong>{item.monthDone ? '월 목표 달성' : `${Math.min(999, item.rate).toFixed(0)}%`}</strong>
                                        {item.pace && <em className={`home-goal-today-pace tone-${tone}`}>{item.pace.tone === 'done' ? '🎉 ' : ''}{item.pace.text}</em>}
                                    </span>
                                </div>
                                {item.monthDone ? (
                                    <div className="home-goal-today-empty">이번 달 목표를 이미 채웠습니다.</div>
                                ) : (
                                    <>
                                        <div className="home-goal-today-tiles">
                                            <div><span>목표</span><strong>{item.format(item.target)}</strong></div>
                                            <div><span>{item.valueLabel}</span><strong>{item.format(item.value)}</strong></div>
                                            <div className="is-remaining">
                                                <span>{item.remaining > 0 ? (item.key === 'sales' ? '남은 금액' : '남은 인원') : '초과 달성'}</span>
                                                <strong>{item.remaining > 0 ? item.format(item.remaining) : item.format(item.value - item.target)}</strong>
                                            </div>
                                        </div>
                                        {item.breakdown && <div className="home-goal-today-breakdown">오늘 {item.breakdown}</div>}
                                        <div className="home-goal-today-bar">
                                            <div className="home-goal-today-fill" style={{ width: `${Math.min(100, item.rate)}%` }} />
                                            {todayGoals.expectedNow !== null && item.rate < 100 && (
                                                <div className="home-goal-today-marker" style={{ left: `${Math.min(100, todayGoals.expectedNow)}%` }} />
                                            )}
                                        </div>
                                        {todayGoals.expectedNow !== null && item.rate < 100 && (
                                            <div className="home-goal-today-caption" style={{ paddingLeft: `clamp(0%, calc(${Math.min(100, todayGoals.expectedNow)}% - 3.5rem), calc(100% - 7rem))` }}>
                                                ▲ 지금 예상 {todayGoals.expectedNow.toFixed(0)}%
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    }) : (
                        <div className="home-goal-today-empty">{todayEmptyMessage}</div>
                    )}
                </div>
            </div>
            <div className="home-goal-legend">
                <span><i className="marker" /> 원 위의 눈금 = 오늘까지 예상 진도 {expectedRate.toFixed(1)}%</span>
                <span>진료시간·휴무일 기준</span>
            </div>
        </DashboardCard>
    );

    // ---------------------------------------------------------------------------
    // 실시간 현황 + 지난 날짜 보기 + 비교
    // ---------------------------------------------------------------------------
    const useTotal = goalSalesBasis === 'total';
    const viewDate = pickedDate || todayKey;
    const isViewingToday = viewDate === todayKey;
    // 오늘 숫자(실시간)를 일별 기록과 같은 형태로 맞춤
    const todayMetrics = today
        ? {
            ...today,
            claim: todayClaim === null ? undefined : todayClaim,
            revenue: todayClaim === null ? undefined : Number(today.paid || 0) + todayClaim,
        }
        : null;
    const viewMetrics = isViewingToday ? todayMetrics : (daily[viewDate] || null);

    const shiftIso = (iso, days) => {
        const [y, m, d] = iso.split('-').map(Number);
        return toDateKey(new Date(y, m - 1, d + days));
    };
    const weekdayOf = (iso) => {
        const [y, m, d] = iso.split('-').map(Number);
        return WEEKDAY_NAMES[new Date(y, m - 1, d).getDay()];
    };
    const dateLabel = (iso) => {
        const [, m, d] = iso.split('-').map(Number);
        return `${m}월 ${d}일(${weekdayOf(iso)})`;
    };

    // 진료가 없었던 날(휴진·공휴일)은 비교 대상에서 제외
    const isOpenDay = (metrics) => Boolean(metrics) && (
        Number(metrics.visits || 0) > 0 || Number(metrics.paid || 0) !== 0 || Number(metrics.revenue || 0) !== 0
    );
    const shortDate = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
    // 매시간 누적 기록은 그 시간의 마지막 값이라, 정각~29분에는 직전 시간 기록과 비교
    const hourRef = now.getMinutes() < 30 ? now.getHours() - 1 : now.getHours();

    /**
     * 비교 기준 1개 만들기
     * candidates: 거슬러 올라가며 볼 날짜들(가까운 순) — 처음 만나는 진료일을 씀
     * mode: 'same-time'(오늘 vs 그날 이 시간까지) | 'progress'(오늘 vs 그날 하루 전체 → 도달률) | 'final'(지난 날짜끼리)
     */
    const buildComparison = (kind, candidates) => {
        const found = candidates.find(iso => isOpenDay(daily[iso]));
        if (!found) return { key: kind, label: kind === 'prev' ? '직전 진료일' : `지난 ${weekdayOf(viewDate)}요일`, base: null };
        const first = candidates[0];
        let label;
        if (kind === 'prev') label = found === first ? (isViewingToday ? '어제' : '전날') : '직전 진료일';
        else {
            const weeksBack = Math.round((Date.parse(viewDate) - Date.parse(found)) / (7 * 86400000));
            label = weeksBack === 1 ? `지난주 ${weekdayOf(found)}` : `${weeksBack}주 전 ${weekdayOf(found)}`;
        }
        if (!isViewingToday) return { key: kind, label, iso: found, base: daily[found], mode: 'final' };
        const atTime = hourRef >= 0 ? pickIntradayAt(intraday[found], hourRef) : null;
        return atTime
            ? { key: kind, label: `${label} 이 시간`, iso: found, base: atTime, mode: 'same-time' }
            : { key: kind, label: `${label} 하루`, iso: found, base: daily[found], mode: 'progress' };
    };

    const comparisons = viewMetrics ? [
        buildComparison('prev', Array.from({ length: 7 }, (_, i) => shiftIso(viewDate, -(i + 1)))),
        buildComparison('week', [1, 2, 3, 4].map(weeks => shiftIso(viewDate, -7 * weeks))),
    ] : [];

    // 최근 7일 미니 그래프용 (보고 있는 날짜 포함, 오늘은 실시간 값)
    const last7 = Array.from({ length: 7 }, (_, i) => {
        const iso = shiftIso(viewDate, i - 6);
        return { iso, metrics: iso === todayKey ? todayMetrics : daily[iso] };
    });

    const kpis = viewMetrics ? [
        {
            key: 'sales',
            label: isViewingToday ? (useTotal && todayClaim !== null ? '오늘 매출' : '오늘 수납액') : (useTotal ? '매출' : '수납액'),
            value: won(salesOf(viewMetrics, useTotal)),
            raw: (metrics) => salesOf(metrics, useTotal),
            format: shortWon,
            diffMode: 'pct',
            sub: useTotal && viewMetrics.claim !== undefined
                ? `수납 ${shortWon(viewMetrics.paid)} · 청구 ${shortWon(viewMetrics.claim)}`
                : `카드 ${shortWon(viewMetrics.card)} · 현금 ${shortWon(viewMetrics.cash)} · 통장 ${shortWon(viewMetrics.bank)}`,
            title: `수납: 카드 ${won(viewMetrics.card)} · 현금 ${won(viewMetrics.cash)} · 통장 ${won(viewMetrics.bank)}`,
            color: '#3b82f6',
            icon: WalletCards,
        },
        { key: 'visits', label: '내원 환자', value: people(viewMetrics.visits), raw: (m) => Number(m?.visits || 0), format: people, diffMode: 'pct', sub: '접수 기준', color: '#8b5cf6', icon: Users },
        { key: 'newPatients', label: '신환', value: people(viewMetrics.newPatients), raw: (m) => Number(m?.newPatients || 0), format: people, diffMode: 'count', sub: '처음 오신 환자', color: '#ec4899', icon: UserPlus },
        { key: 'returningPatients', label: '구환', value: people(viewMetrics.returningPatients), raw: (m) => Number(m?.returningPatients || 0), format: people, diffMode: 'pct', sub: '재내원 환자', color: '#10b981', icon: Repeat },
    ] : [];

    const renderComparison = (item, comparison, current) => {
        if (!comparison.base) {
            return (
                <div key={comparison.key} className="home-live-compare-row">
                    <span className="home-live-compare-label">{comparison.label}</span>
                    <span className="home-live-compare-base" />
                    <span className="home-compare-chip">비교할 진료일 없음</span>
                </div>
            );
        }
        const base = item.raw(comparison.base);
        let chip;
        if (comparison.mode === 'progress') {
            // 진행 중인 오늘 vs 끝난 하루 → 증감이 아니라 '도달률'
            const reached = base > 0 ? Math.round((current / base) * 100) : null;
            chip = <span className="home-compare-chip is-progress">{reached === null ? '-' : `${reached}% 도달`}</span>;
        } else if (item.diffMode === 'count') {
            const diff = Math.round(current - base);
            chip = <span className={`home-compare-chip is-${diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'}`}>{diff > 0 ? '▲' : diff < 0 ? '▼' : ''} {diff === 0 ? '같음' : `${Math.abs(diff)}명`}</span>;
        } else {
            chip = <ChangeChip current={current} previous={base} unit="won" />;
        }
        return (
            <div key={comparison.key} className="home-live-compare-row" title={`${shortDate(comparison.iso)}(${weekdayOf(comparison.iso)}) 기준`}>
                <span className="home-live-compare-label">{comparison.label}</span>
                <span className="home-live-compare-base">{item.format(base)}</span>
                {chip}
            </div>
        );
    };

    const viewReservations = viewMetrics?.reservations || null;
    const hasHistory = Object.keys(daily).length > 0;

    const dateBar = (live || hasHistory) && (
        <div className="home-live-datebar">
            <button type="button" onClick={() => setPickedDate(shiftIso(viewDate, -1))} title="전날"><ChevronLeft size={16} /></button>
            <strong>{dateLabel(viewDate)}</strong>
            <button type="button" onClick={() => { const next = shiftIso(viewDate, 1); setPickedDate(next >= todayKey ? null : next); }} disabled={isViewingToday} title="다음날"><ChevronRight size={16} /></button>
            {!isViewingToday && <button type="button" className="home-live-today-btn" onClick={() => setPickedDate(null)}>오늘로</button>}
        </div>
    );

    const liveCard = (
        <DashboardCard
            title={isViewingToday ? '오늘 실시간 현황' : '지난 기록'}
            subtitle={isViewingToday ? `${month}월 ${now.getDate()}일 · EMR 기준` : `${dateLabel(viewDate)} 최종 기록 · EMR 기준`}
            headerRight={isViewingToday
                ? <span className={`home-live-badge tone-${connection.tone}`}><i />{connection.text}</span>
                : <span className="home-live-badge tone-idle"><i />지난 날짜 보는 중</span>}
        >
            {dateBar}
            {!live && !hasHistory ? (
                <div className="home-live-empty">
                    {liveReady ? (
                        <>
                            <strong>EMR 실시간 연동 전입니다.</strong>
                            <span>치과 PC에 중계 프로그램을 설치하면 오늘 수납액, 내원 환자, 신환/구환이 실시간으로 표시됩니다.</span>
                        </>
                    ) : '불러오는 중입니다.'}
                </div>
            ) : !viewMetrics ? (
                <div className="home-live-empty">
                    <strong>
                        {isViewingToday
                            ? (business.isOpenToday ? '아직 오늘 데이터가 없습니다.' : '오늘은 휴진일입니다.')
                            : '이 날짜의 기록이 없습니다.'}
                    </strong>
                    <span>{isViewingToday ? `마지막 데이터: ${live?.stat_date || '-'}` : '휴진일이거나, 중계 프로그램이 지난 기록을 아직 채우는 중입니다.'}</span>
                </div>
            ) : (
                <>
                    <div className="home-live-kpis">
                        {kpis.map(item => {
                            const Icon = item.icon;
                            const current = item.raw(viewMetrics);
                            return (
                                <div key={item.key} className="home-live-kpi" style={{ borderTopColor: item.color }} title={item.title || undefined}>
                                    <div className="home-live-kpi-top">
                                        <div className="home-live-kpi-main">
                                            <span className="home-live-kpi-label"><Icon size={15} /> {item.label}</span>
                                            <span className="home-live-kpi-value" style={{ color: item.color }}>{item.value}</span>
                                            <span className="home-live-kpi-sub">{item.sub}</span>
                                        </div>
                                        <MiniBars
                                            values={last7.map(day => ({ iso: day.iso, value: day.metrics && isOpenDay(day.metrics) ? item.raw(day.metrics) : null }))}
                                            activeIso={viewDate}
                                            color={item.color}
                                            format={item.format}
                                        />
                                    </div>
                                    {comparisons.length > 0 && (
                                        <div className="home-live-compare">
                                            {comparisons.map(comparison => renderComparison(item, comparison, current))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {isViewingToday && (
                        <div className="home-live-status">
                            <span className="home-live-status-title">진행 현황</span>
                            {[
                                { label: '대기', value: waitingCount, color: '#f59e0b' },
                                { label: '진료중', value: status.inTreatment, color: '#3b82f6' },
                                { label: '진료완료', value: status.treated, color: '#8b5cf6' },
                                { label: '수납완료', value: status.paid, color: '#10b981' },
                            ].map(item => (
                                <span key={item.label} className="home-live-chip">
                                    <i style={{ background: item.color }} />{item.label} <strong>{Number(item.value || 0)}</strong>
                                </span>
                            ))}
                        </div>
                    )}
                    {viewReservations && (
                        <div className="home-live-status">
                            <span className="home-live-status-title"><CalendarCheck size={14} /> {isViewingToday ? '오늘 예약' : '예약'}</span>
                            <span className="home-live-chip">전체 <strong>{Number(viewReservations.total || 0)}</strong></span>
                            <span className="home-live-chip">이행 <strong>{Number(viewReservations.done || 0)}</strong></span>
                            <span className="home-live-chip">미이행 <strong>{Number(viewReservations.pending || 0)}</strong></span>
                            <span className="home-live-chip">취소 <strong>{Number(viewReservations.canceled || 0)}</strong></span>
                            {Number(viewReservations.newPatient || 0) > 0 && (
                                <span className="home-live-chip">신환 예약 <strong>{Number(viewReservations.newPatient || 0)}</strong></span>
                            )}
                        </div>
                    )}
                </>
            )}
        </DashboardCard>
    );

    const openDays = getMonthOpenDays({ year, month: month - 1, weekly, holidays });
    // 달력 ✓ 표시용 하루 목표 = 그 달 매출 목표 ÷ 그 달 영업일 (올해 목표가 있는 달만)
    const openDayCountCache = {};
    const dailyTargetFor = (iso) => {
        const y = Number(iso.slice(0, 4));
        const m = Number(iso.slice(5, 7));
        const monthGoal = y === year ? Number(yearGoals[m]?.salesGoal || 0) : 0;
        if (!monthGoal) return null;
        const cacheKey = `${y}-${m}`;
        if (openDayCountCache[cacheKey] === undefined) {
            openDayCountCache[cacheKey] = getMonthOpenDays({ year: y, month: m - 1, weekly, holidays }).filter(Boolean).length;
        }
        return openDayCountCache[cacheKey] ? monthGoal / openDayCountCache[cacheKey] : null;
    };
    const oldestKey = Object.keys(daily).sort()[0];
    const oldestMonth = oldestKey ? { y: Number(oldestKey.slice(0, 4)), m: Number(oldestKey.slice(5, 7)) - 1 } : null;
    const selectDate = (iso) => {
        setPickedDate(iso >= todayKey ? null : iso);
        document.getElementById('home-live-row')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // 목표 달성을 먼저(왼쪽, 모바일에선 맨 위) 보여줍니다.
    return (
        <>
            <div id="home-live-row" className="dashboard-grid home-live-grid" style={{ gridTemplateColumns: '1.3fr 1fr', marginBottom: '1.5rem' }}>
                {goalCard}
                {liveCard}
            </div>
            {(live || hasHistory) && (
                <div className="dashboard-grid home-history-grid" style={{ gridTemplateColumns: '1.3fr 1fr', marginBottom: '1.5rem' }}>
                    <MonthCompareCard
                        daily={daily}
                        now={now}
                        todayMetrics={todayMetrics}
                        useTotal={useTotal}
                        salesGoal={goal?.salesGoal || 0}
                        newPatientGoal={goal?.newPatientGoal || 0}
                        openDays={openDays}
                    />
                    <DailyCalendarCard
                        daily={daily}
                        now={now}
                        todayMetrics={todayMetrics}
                        useTotal={useTotal}
                        selectedDate={viewDate}
                        onSelectDate={selectDate}
                        oldestMonth={oldestMonth}
                        dailyTargetFor={dailyTargetFor}
                    />
                </div>
            )}
        </>
    );
};

// 최근 7일 미니 막대그래프 (휴진일은 빈칸, 보고 있는 날짜는 진하게)
const MiniBars = ({ values, activeIso, color, format }) => {
    const max = Math.max(1, ...values.map(item => Number(item.value || 0)));
    return (
        <div className="home-mini-bars" aria-hidden="true">
            <div className="home-mini-bars-plot">
                {values.map(item => (
                    <span
                        key={item.iso}
                        className={item.iso === activeIso ? 'is-active' : ''}
                        title={`${item.iso.slice(5).replace('-', '/')} ${item.value === null ? '휴진/기록 없음' : format(item.value)}`}
                        style={{
                            height: item.value === null ? '3px' : `${Math.max(6, (Number(item.value) / max) * 100)}%`,
                            background: item.value === null ? 'var(--border-color)' : color,
                        }}
                    />
                ))}
            </div>
            <span className="home-mini-bars-caption">최근 7일</span>
        </div>
    );
};

// 원형 게이지: 채워진 호 = 달성률, 원을 가로지르는 눈금 = 오늘까지 예상 진도
const RING_SIZE = 210;
const RING_RADIUS = 84;
const RING_STROKE = 18;
const TONE_COLORS = { good: '#10b981', warn: '#f59e0b', bad: '#ef4444', done: '#3b82f6', idle: '#94a3b8' };

const GoalRing = ({ rate, expectedRate, tone, label, icon: Icon, empty = false }) => {
    const center = RING_SIZE / 2;
    const circumference = 2 * Math.PI * RING_RADIUS;
    const filled = Math.max(0, Math.min(100, rate)) / 100;
    const angle = (Math.max(0, Math.min(100, expectedRate)) / 100) * 2 * Math.PI - Math.PI / 2;
    const inner = RING_RADIUS - RING_STROKE / 2 - 4;
    const outer = RING_RADIUS + RING_STROKE / 2 + 6;
    const color = TONE_COLORS[tone] || TONE_COLORS.idle;

    return (
        <div className="home-goal-ring" style={{ width: "100%", maxWidth: RING_SIZE, aspectRatio: "1 / 1" }}>
            <svg width="100%" height="100%" viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} aria-hidden="true">
                <circle cx={center} cy={center} r={RING_RADIUS} fill="none" stroke="var(--border-color)" strokeWidth={RING_STROKE} />
                {!empty && filled > 0 && (
                    <circle
                        className="home-goal-ring-progress"
                        cx={center}
                        cy={center}
                        r={RING_RADIUS}
                        fill="none"
                        stroke={color}
                        strokeWidth={RING_STROKE}
                        strokeLinecap="round"
                        strokeDasharray={`${circumference * filled} ${circumference}`}
                        transform={`rotate(-90 ${center} ${center})`}
                    />
                )}
                {!empty && (
                    <line
                        x1={center + inner * Math.cos(angle)}
                        y1={center + inner * Math.sin(angle)}
                        x2={center + outer * Math.cos(angle)}
                        y2={center + outer * Math.sin(angle)}
                        stroke="var(--text-primary)"
                        strokeWidth={3}
                        strokeLinecap="round"
                        opacity={0.7}
                    />
                )}
            </svg>
            <div className="home-goal-ring-center">
                <span className="home-goal-ring-label">{Icon ? <Icon size={14} /> : null}{label}</span>
                <span className="home-goal-ring-rate" style={{ color: empty ? 'var(--text-secondary)' : color }}>
                    {empty ? '-' : `${rate.toFixed(1)}%`}
                </span>
            </div>
        </div>
    );
};

export default HomeLiveSection;
