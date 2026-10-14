import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Target, UserPlus, Users, WalletCards, Repeat } from 'lucide-react';
import DashboardCard from '../DashboardCard';
import {
    getMonthBusinessDays,
    loadGoalsForYear,
    loadHolidays,
    loadLatestLiveStats,
    loadOperatingHours,
    subscribeLiveStats,
    toDateKey,
} from '../../utils/clinicOperations';
import './HomeLiveSection.css';

const STALE_MINUTES = 10;
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
            loadHolidays(clinicId, { from: monthStart, to: monthEnd }),
            loadGoalsForYear(clinicId, year),
        ]).then(([hoursResult, holidayResult, goalResult]) => {
            if (cancelled) return;
            setWeekly(hoursResult.status === 'fulfilled' ? hoursResult.value.weekly : null);
            setHolidays(holidayResult.status === 'fulfilled' ? holidayResult.value : []);
            setGoal(goalResult.status === 'fulfilled' ? (goalResult.value[month] || null) : null);
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
    const monthActual = liveMonth
        ? { paid: Number(liveMonth.paid || 0), newPatients: Number(liveMonth.newPatients || 0), source: 'live' }
        : { paid: Number(excelMonthActual?.paid || 0), newPatients: Number(excelMonthActual?.newPatients || 0), source: 'excel' };

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
        buildGoalRow({ key: 'sales', label: '매출', icon: WalletCards, actual: monthActual.paid, target: goal?.salesGoal, formatShort: shortWon }),
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
        return {
            expectedNow,
            items: [
                build({ key: 'sales', label: '매출', valueLabel: '수납', monthTarget: goal?.salesGoal, monthValue: monthActual.paid, todayValue: Number(today.paid || 0), format: manWon }),
                build({ key: 'newPatients', label: '신환', valueLabel: '현재', monthTarget: goal?.newPatientGoal, monthValue: monthActual.newPatients, todayValue: Number(today.newPatients || 0), format: people, wholeNumber: true }),
            ].filter(Boolean),
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
                    {monthActual.source === 'live' ? 'EMR 실시간' : '엑셀 업로드 기준'}
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

    const liveCard = (
        <DashboardCard
            title="오늘 실시간 현황"
            subtitle={`${month}월 ${now.getDate()}일 · EMR 기준`}
            headerRight={<span className={`home-live-badge tone-${connection.tone}`}><i />{connection.text}</span>}
        >
            {!live ? (
                <div className="home-live-empty">
                    {liveReady ? (
                        <>
                            <strong>EMR 실시간 연동 전입니다.</strong>
                            <span>치과 PC에 중계 프로그램을 설치하면 오늘 수납액, 내원 환자, 신환/구환이 실시간으로 표시됩니다.</span>
                        </>
                    ) : '불러오는 중입니다.'}
                </div>
            ) : !today ? (
                <div className="home-live-empty">
                    <strong>{business.isOpenToday ? '아직 오늘 데이터가 없습니다.' : '오늘은 휴진일입니다.'}</strong>
                    <span>마지막 데이터: {live.stat_date}</span>
                </div>
            ) : (
                <>
                    <div className="home-live-kpis">
                        {[
                            { label: '오늘 수납액', value: won(today.paid), sub: `카드 ${shortWon(today.card)} · 현금 ${shortWon(today.cash)} · 통장 ${shortWon(today.bank)}`, color: '#3b82f6', icon: WalletCards },
                            { label: '내원 환자', value: people(today.visits), sub: '오늘 접수 기준', color: '#8b5cf6', icon: Users },
                            { label: '신환', value: people(today.newPatients), sub: '처음 오신 환자', color: '#ec4899', icon: UserPlus },
                            { label: '구환', value: people(today.returningPatients), sub: '재내원 환자', color: '#10b981', icon: Repeat },
                        ].map(item => {
                            const Icon = item.icon;
                            return (
                                <div key={item.label} className="home-live-kpi" style={{ borderTopColor: item.color }}>
                                    <span className="home-live-kpi-label"><Icon size={14} /> {item.label}</span>
                                    <span className="home-live-kpi-value" style={{ color: item.color }}>{item.value}</span>
                                    <span className="home-live-kpi-sub">{item.sub}</span>
                                </div>
                            );
                        })}
                    </div>
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
                    {reservations && (
                        <div className="home-live-status">
                            <span className="home-live-status-title"><CalendarCheck size={14} /> 오늘 예약</span>
                            <span className="home-live-chip">전체 <strong>{Number(reservations.total || 0)}</strong></span>
                            <span className="home-live-chip">이행 <strong>{Number(reservations.done || 0)}</strong></span>
                            <span className="home-live-chip">미이행 <strong>{Number(reservations.pending || 0)}</strong></span>
                            <span className="home-live-chip">취소 <strong>{Number(reservations.canceled || 0)}</strong></span>
                            {Number(reservations.newPatient || 0) > 0 && (
                                <span className="home-live-chip">신환 예약 <strong>{Number(reservations.newPatient || 0)}</strong></span>
                            )}
                        </div>
                    )}
                </>
            )}
        </DashboardCard>
    );

    // 목표 달성을 먼저(왼쪽, 모바일에선 맨 위) 보여줍니다.
    return (
        <div className="dashboard-grid home-live-grid" style={{ gridTemplateColumns: '1.3fr 1fr', marginBottom: '1.5rem' }}>
            {goalCard}
            {liveCard}
        </div>
    );
};

// 원형 게이지: 채워진 호 = 달성률, 원을 가로지르는 눈금 = 오늘까지 예상 진도
const RING_SIZE = 168;
const RING_RADIUS = 66;
const RING_STROKE = 16;
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
        <div className="home-goal-ring" style={{ width: RING_SIZE, height: RING_SIZE }}>
            <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} aria-hidden="true">
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
