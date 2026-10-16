import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import DashboardCard from '../DashboardCard';

// 홈 화면 2번째 줄: ① 이번 달 vs 지난달 누적 비교  ② 일별 현황 달력
// 데이터는 HomeLiveSection 이 불러와서 넘겨줍니다. (daily = { 'YYYY-MM-DD': metrics })

const pad2 = (n) => String(n).padStart(2, '0');
export const isoDate = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const shortWon = (value) => {
    const number = Math.round(Number(value || 0));
    if (Math.abs(number) >= 100000000) return `${(number / 100000000).toFixed(2).replace(/\.?0+$/, '')}억`;
    if (Math.abs(number) >= 10000) return `${Math.round(number / 10000).toLocaleString()}만`;
    return number.toLocaleString();
};

/** 매출 기준(총매출/수납)에 맞춰 하루 매출 값 */
export const salesOf = (metrics, useTotal) => {
    if (!metrics) return 0;
    const paid = Number(metrics.paid || 0);
    if (!useTotal) return paid;
    if (metrics.revenue !== undefined && metrics.revenue !== null) return Number(metrics.revenue);
    return paid + Number(metrics.claim ?? metrics.insuranceClaim ?? 0);
};

const METRICS = [
    { key: 'sales', label: '매출', unit: 'won' },
    { key: 'newPatients', label: '신환', unit: 'people' },
    { key: 'visits', label: '내원', unit: 'people' },
];

const valueOf = (metrics, key, useTotal) => (key === 'sales' ? salesOf(metrics, useTotal) : Number(metrics?.[key] || 0));
const formatValue = (value, unit) => (unit === 'won' ? shortWon(value) : `${Math.round(value).toLocaleString()}명`);

const ChangeChip = ({ current, previous, unit }) => {
    if (!previous && !current) return <span className="home-compare-chip">-</span>;
    if (unit === 'people') {
        const diff = Math.round(current - previous);
        const tone = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
        return <span className={`home-compare-chip is-${tone}`}>{diff > 0 ? '▲' : diff < 0 ? '▼' : ''} {diff === 0 ? '같음' : `${Math.abs(diff)}명`}</span>;
    }
    if (!previous) return <span className="home-compare-chip is-up">신규</span>;
    const pct = ((current - previous) / previous) * 100;
    const tone = pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat';
    return <span className={`home-compare-chip is-${tone}`}>{tone === 'up' ? '▲' : tone === 'down' ? '▼' : ''} {Math.abs(pct).toFixed(1)}%</span>;
};

// ---------------------------------------------------------------------------
// ① 이번 달 vs 지난달
// ---------------------------------------------------------------------------
export const MonthCompareCard = ({ daily, now, todayMetrics, useTotal, salesGoal, newPatientGoal, openDays }) => {
    const [metricKey, setMetricKey] = useState('sales');
    const metric = METRICS.find(item => item.key === metricKey);
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();
    const lastMonthYear = new Date(year, month - 1, 1).getFullYear();
    const lastMonthIndex = new Date(year, month - 1, 1).getMonth();
    const lastMonthDays = new Date(year, month, 0).getDate();
    const thisMonthDays = new Date(year, month + 1, 0).getDate();

    const { chartData, summary } = useMemo(() => {
        const dayValue = (y, m, d) => {
            const key = isoDate(y, m, d);
            if (y === year && m === month && d === today && todayMetrics) return valueOf(todayMetrics, metricKey, useTotal);
            return valueOf(daily[key], metricKey, useTotal);
        };
        const goal = metricKey === 'sales' ? salesGoal : metricKey === 'newPatients' ? newPatientGoal : 0;
        const totalOpen = (openDays || []).filter(Boolean).length;
        let thisCum = 0;
        let lastCum = 0;
        let openCum = 0;
        let lastSamePeriod = 0;
        const rows = [];
        for (let d = 1; d <= Math.max(thisMonthDays, lastMonthDays); d += 1) {
            const row = { day: `${d}일` };
            if (d <= lastMonthDays) {
                lastCum += dayValue(lastMonthYear, lastMonthIndex, d);
                row.lastMonth = lastCum;
                if (d <= today) lastSamePeriod = lastCum;
            }
            if (d <= thisMonthDays) {
                if (openDays?.[d - 1]) openCum += 1;
                if (goal && totalOpen) row.goal = Math.round((goal * openCum) / totalOpen);
                if (d <= today) {
                    thisCum += dayValue(year, month, d);
                    row.thisMonth = thisCum;
                }
            }
            rows.push(row);
        }
        return {
            chartData: rows,
            summary: { thisPeriod: thisCum, lastPeriod: lastSamePeriod, lastTotal: lastCum, hasGoal: Boolean(goal && totalOpen) },
        };
    }, [daily, todayMetrics, metricKey, useTotal, salesGoal, newPatientGoal, openDays, year, month, today, thisMonthDays, lastMonthDays, lastMonthYear, lastMonthIndex]);

    const hasLastMonth = summary.lastTotal > 0;

    return (
        <DashboardCard
            title="이번 달 vs 지난달"
            subtitle={`누적 ${metric.label} · 동기간(1~${today}일) 비교`}
            headerRight={(
                <div className="home-metric-tabs">
                    {METRICS.map(item => (
                        <button key={item.key} type="button" className={item.key === metricKey ? 'active' : ''} onClick={() => setMetricKey(item.key)}>
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        >
            <div className="home-month-summary">
                <div>
                    <span>이번 달 (1~{today}일)</span>
                    <strong>{formatValue(summary.thisPeriod, metric.unit)}</strong>
                </div>
                <div>
                    <span>지난달 같은 기간</span>
                    <strong>{hasLastMonth ? formatValue(summary.lastPeriod, metric.unit) : '-'}</strong>
                </div>
                <div>
                    <span>동기간 대비</span>
                    <strong>{hasLastMonth ? <ChangeChip current={summary.thisPeriod} previous={summary.lastPeriod} unit={metric.unit} /> : '-'}</strong>
                </div>
                <div>
                    <span>지난달 전체</span>
                    <strong>{hasLastMonth ? formatValue(summary.lastTotal, metric.unit) : '-'}</strong>
                </div>
            </div>
            {!hasLastMonth && (
                <div className="home-history-note">지난달 기록을 채우는 중입니다. 중계 프로그램이 최근 13개월 기록을 몇 시간에 걸쳐 자동으로 채웁니다.</div>
            )}
            <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                    <LineChart data={chartData} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={4} />
                        <YAxis tick={{ fontSize: 11 }} width={metric.unit === 'won' ? 56 : 40} tickFormatter={(v) => (metric.unit === 'won' ? shortWon(v) : v)} />
                        <Tooltip
                            contentStyle={{ borderRadius: 12, fontSize: 12 }}
                            formatter={(value, name) => [formatValue(value, metric.unit), name]}
                        />
                        <Legend verticalAlign="top" height={28} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                        <Line type="monotone" dataKey="thisMonth" name="이번 달" stroke="#3b82f6" strokeWidth={3} dot={false} connectNulls />
                        <Line type="monotone" dataKey="lastMonth" name="지난달" stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 4" dot={false} />
                        {summary.hasGoal && (
                            <Line type="monotone" dataKey="goal" name="목표 페이스" stroke="#10b981" strokeWidth={1.5} strokeDasharray="2 4" dot={false} />
                        )}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </DashboardCard>
    );
};

// ---------------------------------------------------------------------------
// ② 일별 현황 달력
// ---------------------------------------------------------------------------
export const DailyCalendarCard = ({ daily, now, todayMetrics, useTotal, selectedDate, onSelectDate, oldestMonth }) => {
    const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });
    const todayIso = isoDate(now.getFullYear(), now.getMonth(), now.getDate());
    const lastDay = new Date(view.y, view.m + 1, 0).getDate();
    const firstWeekday = new Date(view.y, view.m, 1).getDay();

    const cells = useMemo(() => {
        const list = [];
        for (let i = 0; i < firstWeekday; i += 1) list.push(null);
        for (let d = 1; d <= lastDay; d += 1) {
            const iso = isoDate(view.y, view.m, d);
            const metrics = iso === todayIso && todayMetrics ? todayMetrics : daily[iso];
            list.push({ d, iso, metrics, sales: salesOf(metrics, useTotal), future: iso > todayIso });
        }
        return list;
    }, [daily, todayMetrics, useTotal, view, firstWeekday, lastDay, todayIso]);

    const maxSales = Math.max(1, ...cells.filter(Boolean).map(cell => cell.sales));
    const monthTotal = cells.filter(Boolean).reduce((acc, cell) => acc + cell.sales, 0);
    const workedDays = cells.filter(cell => cell && cell.sales > 0).length;

    const canPrev = !oldestMonth || view.y > oldestMonth.y || (view.y === oldestMonth.y && view.m > oldestMonth.m);
    const canNext = view.y < now.getFullYear() || (view.y === now.getFullYear() && view.m < now.getMonth());
    const move = (delta) => setView(current => {
        const date = new Date(current.y, current.m + delta, 1);
        return { y: date.getFullYear(), m: date.getMonth() };
    });

    return (
        <DashboardCard
            title="일별 현황"
            subtitle={`${view.y}년 ${view.m + 1}월 · 합계 ${shortWon(monthTotal)} · 진료 ${workedDays}일 · 단위 만원`}
            headerRight={(
                <div className="home-calendar-nav">
                    <button type="button" onClick={() => move(-1)} disabled={!canPrev} title="이전 달"><ChevronLeft size={16} /></button>
                    <button type="button" onClick={() => move(1)} disabled={!canNext} title="다음 달"><ChevronRight size={16} /></button>
                </div>
            )}
        >
            <div className="home-calendar">
                {WEEKDAYS.map((label, index) => (
                    <span key={label} className={`home-calendar-weekday ${index === 0 ? 'is-sunday' : index === 6 ? 'is-saturday' : ''}`}>{label}</span>
                ))}
                {cells.map((cell, index) => {
                    if (!cell) return <span key={`blank-${index}`} />;
                    const intensity = cell.sales > 0 ? 0.12 + 0.68 * (cell.sales / maxSales) : 0;
                    const classes = [
                        'home-calendar-day',
                        cell.iso === todayIso ? 'is-today' : '',
                        cell.iso === selectedDate ? 'is-selected' : '',
                        cell.future ? 'is-future' : '',
                        !cell.future && cell.sales <= 0 ? 'is-empty' : '',
                    ].filter(Boolean).join(' ');
                    return (
                        <button
                            key={cell.iso}
                            type="button"
                            className={classes}
                            disabled={cell.future}
                            onClick={() => onSelectDate?.(cell.iso)}
                            style={intensity ? { background: `rgba(59, 130, 246, ${intensity.toFixed(2)})`, color: intensity > 0.5 ? '#fff' : undefined } : undefined}
                            title={cell.metrics ? `${cell.iso} (누르면 위에서 이 날짜 보기) · 매출 ${shortWon(cell.sales)} · 내원 ${Number(cell.metrics.visits || 0)}명 · 신환 ${Number(cell.metrics.newPatients || 0)}명` : cell.iso}
                        >
                            <span className="home-calendar-num">{cell.d}</span>
                            {cell.sales > 0 && <span className="home-calendar-value">{Math.round(cell.sales / 10000).toLocaleString()}</span>}
                        </button>
                    );
                })}
            </div>
        </DashboardCard>
    );
};

export { ChangeChip };
