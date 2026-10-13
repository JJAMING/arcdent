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

// 홈 화면 상단: ① 오늘 실시간 현황(덴트웹) ② 이번 달 목표 달성
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
        if (!live) return { tone: 'off', text: '덴트웹 미연동' };
        if (isTodayRow && minutesSinceUpdate !== null && minutesSinceUpdate <= STALE_MINUTES) {
            return { tone: 'on', text: `덴트웹 연동 · ${timeLabel(live.updated_at)} 업데이트` };
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

    const buildGoalRow = ({ key, label, icon, actual, target, format, formatShort }) => {
        if (!target) return { key, label, icon, missing: true };
        const achievedRate = (actual / target) * 100;
        const remaining = Math.max(0, target - actual);
        const perDay = business.remainingDayCount > 0 ? remaining / business.remainingDayCount : null;
        const projected = business.elapsedDays > 0 ? (actual / business.elapsedDays) * business.totalDays : null;
        return {
            key, label, icon, actual, target, format, formatShort,
            achievedRate,
            remaining,
            perDay,
            projected,
            pace: getPace(achievedRate, expectedRate),
        };
    };

    const goalRows = [
        buildGoalRow({ key: 'sales', label: '매출', icon: WalletCards, actual: monthActual.paid, target: goal?.salesGoal, format: won, formatShort: shortWon }),
        buildGoalRow({ key: 'newPatients', label: '신환', icon: UserPlus, actual: monthActual.newPatients, target: goal?.newPatientGoal, format: people, formatShort: people }),
    ];

    const status = today?.status || {};
    const reservations = today?.reservations || null;
    const waitingCount = Number(status.waiting || 0) + Number(status.ready || 0);

    return (
        <div className="dashboard-grid home-live-grid" style={{ gridTemplateColumns: '1.15fr 1fr', marginBottom: '1.5rem' }}>
            <DashboardCard
                title="오늘 실시간 현황"
                subtitle={`${month}월 ${now.getDate()}일 · 덴트웹 기준`}
                headerRight={<span className={`home-live-badge tone-${connection.tone}`}><i />{connection.text}</span>}
            >
                {!live ? (
                    <div className="home-live-empty">
                        {liveReady ? (
                            <>
                                <strong>덴트웹 실시간 연동 전입니다.</strong>
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

            <DashboardCard
                title={`${month}월 목표 달성`}
                subtitle={`영업일 ${business.totalDays}일 중 ${business.elapsedDays.toFixed(1)}일 경과 · 남은 영업일 ${business.remainingDayCount}일`}
                headerRight={(
                    <span className="home-goal-source">
                        {monthActual.source === 'live' ? '덴트웹 실시간' : '엑셀 업로드 기준'}
                    </span>
                )}
            >
                <div className="home-goal-list">
                    {goalRows.map(row => {
                        const Icon = row.icon;
                        if (row.missing) {
                            return (
                                <div key={row.key} className="home-goal-row is-missing">
                                    <div className="home-goal-head">
                                        <span className="home-goal-label"><Icon size={15} /> {row.label}</span>
                                        <span className="home-goal-missing">목표 미설정</span>
                                    </div>
                                    <span className="home-goal-hint">관리자모드 → 운영 설정 / 목표에서 입력할 수 있습니다.</span>
                                </div>
                            );
                        }
                        const barWidth = Math.min(100, row.achievedRate);
                        const markerLeft = Math.min(100, expectedRate);
                        return (
                            <div key={row.key} className="home-goal-row">
                                <div className="home-goal-head">
                                    <span className="home-goal-label"><Icon size={15} /> {row.label}</span>
                                    <span className={`home-goal-rate tone-${row.pace.tone}`}>{row.achievedRate.toFixed(1)}%</span>
                                </div>
                                <div className="home-goal-bar" title={`오늘까지 예상 진도 ${expectedRate.toFixed(1)}%`}>
                                    <div className={`home-goal-bar-fill tone-${row.pace.tone}`} style={{ width: `${barWidth}%` }} />
                                    <div className="home-goal-bar-marker" style={{ left: `${markerLeft}%` }} />
                                </div>
                                <div className="home-goal-numbers">
                                    <span><strong>{row.format(row.actual)}</strong> / {row.format(row.target)}</span>
                                    <span className={`home-goal-pace tone-${row.pace.tone}`}>{row.pace.text}</span>
                                </div>
                                <div className="home-goal-detail">
                                    {row.remaining > 0 ? (
                                        <>
                                            목표까지 <strong>{row.formatShort(row.remaining)}</strong>
                                            {row.perDay !== null && (
                                                <> · 하루 <strong>{row.key === 'newPatients' ? `${row.perDay.toFixed(1)}명` : row.formatShort(row.perDay)}</strong> 필요</>
                                            )}
                                        </>
                                    ) : '이번 달 목표를 달성했습니다.'}
                                    {row.projected !== null && (
                                        <span className="home-goal-projected">
                                            이 속도면 월말 {row.key === 'newPatients' ? `${Math.round(row.projected)}명` : row.formatShort(row.projected)}
                                            ({((row.projected / row.target) * 100).toFixed(0)}%)
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="home-goal-legend">
                    <span><i className="marker" /> 오늘까지 예상 진도 {expectedRate.toFixed(1)}%</span>
                    <span><Target size={12} /> 진료시간·휴무일 기준</span>
                </div>
            </DashboardCard>
        </div>
    );
};

export default HomeLiveSection;
