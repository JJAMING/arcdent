import React, { useEffect, useMemo, useState } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, LineChart, Line, Legend
} from 'recharts';
import { Calendar, ChevronDown, WalletCards, Users, UserPlus, ShieldCheck, TrendingDown, TrendingUp } from 'lucide-react';
import DashboardCard from '../components/DashboardCard';
import './SalesAnalysis.css';
import './TreatmentAnalysis.css';

const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b'];

const emptySalesYear = () => MONTHS.map(month => ({
    month,
    netSales: 0,
    insurance: 0,
    total: 0,
    newPatient: 0,
    newPatientSales: 0,
}));

const emptyNewPatientYear = () => MONTHS.map(month => ({
    month,
    sources: {},
    sourceRevenue: {},
    sourceAvgFee: {},
}));

const safeJson = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        console.error(`[HomeDashboard] ${key} parse error`, e);
        return fallback;
    }
};

const normalizeMonthArray = (rows, emptyFactory) => {
    const source = Array.isArray(rows) ? rows : [];
    return MONTHS.map(month => ({ ...emptyFactory().find(item => item.month === month), ...(source.find(item => item.month === month) || {}) }));
};

const formatWon = (value) => `${Math.round(Number(value || 0)).toLocaleString()}원`;
const formatShortWon = (value) => {
    const number = Number(value || 0);
    if (number >= 100000000) return `${(number / 100000000).toFixed(1)}억`;
    if (number >= 10000) return `${Math.round(number / 10000).toLocaleString()}만`;
    return number.toLocaleString();
};
const formatPeople = (value) => `${Math.round(Number(value || 0)).toLocaleString()}명`;
const sum = (rows, key) => rows.reduce((acc, row) => acc + Number(row?.[key] || 0), 0);

const getLatestYear = (...stores) => {
    const years = new Set(['2025']);
    stores.forEach(store => Object.keys(store || {}).forEach(year => years.add(year)));
    return Array.from(years).sort((a, b) => Number(b) - Number(a))[0] || '2025';
};

const HomeDashboard = () => {
    const [selectedYear, setSelectedYear] = useState('2025');
    const [availableYears, setAvailableYears] = useState(['2025']);
    const [isYearOpen, setIsYearOpen] = useState(false);
    const [half, setHalf] = useState('all');
    const [refreshKey, setRefreshKey] = useState(0);

    const stores = useMemo(() => ({
        sales: safeJson('parsed_sales_data', {}),
        ledger: safeJson('patient_ledger_data', {}),
        newPatient: safeJson('new_patient_analysis_data', {}),
        insuranceFees: safeJson('insurance_fee_stats_data', {}),
    }), [refreshKey]);

    useEffect(() => {
        const latestYear = getLatestYear(stores.sales, stores.ledger, stores.newPatient, stores.insuranceFees);
        const years = new Set(['2025']);
        [stores.sales, stores.ledger, stores.newPatient, stores.insuranceFees].forEach(store => {
            Object.keys(store || {}).forEach(year => years.add(year));
        });
        setAvailableYears(Array.from(years).sort((a, b) => Number(b) - Number(a)));
        setSelectedYear(prev => years.has(prev) ? prev : latestYear);
    }, [stores]);

    useEffect(() => {
        const handleUpdate = () => setRefreshKey(prev => prev + 1);
        window.addEventListener('storage', handleUpdate);
        window.addEventListener('patientLedgerUpdated', handleUpdate);
        window.addEventListener('newPatientAnalysisUpdated', handleUpdate);
        window.addEventListener('insuranceFeeStatsUpdated', handleUpdate);
        window.addEventListener('insuranceClaimUpdated', handleUpdate);
        return () => {
            window.removeEventListener('storage', handleUpdate);
            window.removeEventListener('patientLedgerUpdated', handleUpdate);
            window.removeEventListener('newPatientAnalysisUpdated', handleUpdate);
            window.removeEventListener('insuranceFeeStatsUpdated', handleUpdate);
            window.removeEventListener('insuranceClaimUpdated', handleUpdate);
        };
    }, []);

    const yearSales = normalizeMonthArray(stores.sales[selectedYear], emptySalesYear);
    const yearNewPatient = normalizeMonthArray(stores.newPatient[selectedYear], emptyNewPatientYear);
    const yearLedger = MONTHS.map(month => ({
        month,
        ...(stores.ledger?.[selectedYear]?.[month] || {}),
    }));
    const yearInsuranceFees = normalizeMonthArray(stores.insuranceFees[selectedYear], () => MONTHS.map(month => ({ month, fees: [] })));

    const periodData = useMemo(() => {
        const sliceByHalf = rows => {
            if (half === 'first') return rows.slice(0, 6);
            if (half === 'second') return rows.slice(6, 12);
            return rows;
        };
        return {
            sales: sliceByHalf(yearSales),
            ledger: sliceByHalf(yearLedger),
            newPatient: sliceByHalf(yearNewPatient),
            insuranceFees: sliceByHalf(yearInsuranceFees),
        };
    }, [half, yearSales, yearLedger, yearNewPatient, yearInsuranceFees]);

    const totalSales = sum(periodData.sales, 'total');
    const netSales = sum(periodData.sales, 'netSales');
    const insuranceSales = sum(periodData.sales, 'insurance');
    const totalPatients = periodData.ledger.reduce((acc, row) => acc + Number(row.total || row.totalVisits || 0), 0);
    const newPatients = periodData.ledger.reduce((acc, row) => acc + Number(row.newPt || 0), 0) || sum(periodData.sales, 'newPatient');
    const consultationRate = 0;
    const newPatientRevenue = sum(periodData.sales, 'newPatientSales');
    const newPatientRevenueRate = netSales > 0 ? (newPatientRevenue / netSales) * 100 : 0;

    const monthlySalesChart = periodData.sales.map(row => ({
        month: row.month,
        총매출: Number(row.total || 0),
        순매출: Number(row.netSales || 0),
        보험청구: Number(row.insurance || 0),
    }));

    const monthlyPatientChart = periodData.ledger.map((row, index) => ({
        month: row.month,
        총환자수: Number(row.total || row.totalVisits || 0),
        신환수: Number(row.newPt || periodData.sales[index]?.newPatient || 0),
    }));

    const doctorRanking = useMemo(() => {
        const totals = {};
        periodData.sales.forEach(month => {
            Object.entries(month.doctorData || {}).forEach(([name, data]) => {
                totals[name] = (totals[name] || 0) + Number(data.pure || 0) + Number(data.insurance || 0);
            });
        });
        return Object.entries(totals)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
    }, [periodData.sales]);

    const sourceRanking = useMemo(() => {
        const totals = {};
        periodData.newPatient.forEach(month => {
            Object.entries(month.sources || {}).forEach(([name, value]) => {
                totals[name] = (totals[name] || 0) + Number(value || 0);
            });
        });
        return Object.entries(totals)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
    }, [periodData.newPatient]);

    const unitPriceRanking = useMemo(() => {
        const totals = {};
        const counts = {};
        periodData.newPatient.forEach(month => {
            Object.entries(month.sourceAvgFee || {}).forEach(([name, value]) => {
                if (Number(value || 0) <= 0) return;
                totals[name] = (totals[name] || 0) + Number(value || 0);
                counts[name] = (counts[name] || 0) + 1;
            });
        });
        return Object.keys(totals)
            .map(name => ({ name, value: counts[name] ? totals[name] / counts[name] : 0 }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
    }, [periodData.newPatient]);

    const insuranceFeeRanking = useMemo(() => {
        const totals = {};
        periodData.insuranceFees.forEach(month => {
            (month.fees || []).forEach(item => {
                const key = `${item.code} ${item.name}`.trim();
                totals[key] = (totals[key] || 0) + Number(item.patients || 0);
            });
        });
        return Object.entries(totals)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
    }, [periodData.insuranceFees]);

    const alerts = useMemo(() => {
        const messages = [];
        const nonZeroSales = yearSales.filter(row => Number(row.total || 0) > 0);
        const lastSales = nonZeroSales.at(-1);
        const prevSales = nonZeroSales.at(-2);
        if (lastSales && prevSales) {
            const diffRate = Number(prevSales.total || 0) > 0 ? ((Number(lastSales.total || 0) - Number(prevSales.total || 0)) / Number(prevSales.total || 0)) * 100 : 0;
            messages.push({
                type: diffRate >= 0 ? 'up' : 'down',
                text: `${lastSales.month} 총매출이 전월 대비 ${Math.abs(diffRate).toFixed(1)}% ${diffRate >= 0 ? '증가' : '감소'}했습니다.`,
            });
        }

        const nonZeroNewPatients = yearLedger
            .map((row, index) => ({ month: row.month, value: Number(row.newPt || yearSales[index]?.newPatient || 0) }))
            .filter(row => row.value > 0);
        const lastNew = nonZeroNewPatients.at(-1);
        const prevNew = nonZeroNewPatients.at(-2);
        if (lastNew && prevNew) {
            const diffRate = prevNew.value > 0 ? ((lastNew.value - prevNew.value) / prevNew.value) * 100 : 0;
            messages.push({
                type: diffRate >= 0 ? 'up' : 'down',
                text: `${lastNew.month} 신환 수가 전월 대비 ${Math.abs(diffRate).toFixed(1)}% ${diffRate >= 0 ? '증가' : '감소'}했습니다.`,
            });
        }

        if (newPatientRevenueRate > 0) {
            messages.push({
                type: newPatientRevenueRate >= 25 ? 'up' : 'neutral',
                text: `선택 기간 신환 매출 비중은 순매출 대비 ${newPatientRevenueRate.toFixed(1)}%입니다.`,
            });
        }

        if (messages.length === 0) {
            messages.push({ type: 'neutral', text: '업로드된 데이터가 부족합니다. 주요 파일 업로드 후 변화 코멘트가 표시됩니다.' });
        }
        return messages.slice(0, 4);
    }, [yearSales, yearLedger, newPatientRevenueRate]);

    const periodLabel = half === 'first' ? '상반기' : half === 'second' ? '하반기' : '전체';

    const renderRanking = (title, subtitle, rows, formatter) => (
        <DashboardCard title={title} subtitle={subtitle}>
            <div style={{ display: 'grid', gap: '0.65rem' }}>
                {(rows.length > 0 ? rows : [{ name: '데이터 없음', value: 0 }]).map((row, index) => (
                    <div key={`${title}-${row.name}`} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', alignItems: 'center', gap: '0.65rem' }}>
                        <span style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '0.75rem' }}>{index + 1}</span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
                        <span style={{ color: COLORS[index % COLORS.length], fontWeight: 800 }}>{formatter(row.value)}</span>
                    </div>
                ))}
            </div>
        </DashboardCard>
    );

    return (
        <div className="analysis-page">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1>종합 대시보드</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>병원의 주요 지표를 한눈에 확인합니다.</p>
                </div>

                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                    <div className="year-selector-container">
                        <button className="year-select-btn" onClick={() => setIsYearOpen(!isYearOpen)}>
                            <Calendar size={16} />
                            {selectedYear}년
                            <ChevronDown size={14} style={{ transform: isYearOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                        </button>
                        {isYearOpen && (
                            <div className="year-dropdown">
                                {availableYears.map(year => (
                                    <button
                                        key={year}
                                        className={`year-item ${selectedYear === year ? 'active' : ''}`}
                                        onClick={() => {
                                            setSelectedYear(year);
                                            setIsYearOpen(false);
                                        }}
                                    >
                                        {year}년
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="period-tabs">
                        <button className={half === 'all' ? 'active' : ''} onClick={() => setHalf('all')}>전체보기</button>
                        <button className={half === 'first' ? 'active' : ''} onClick={() => setHalf('first')}>상반기</button>
                        <button className={half === 'second' ? 'active' : ''} onClick={() => setHalf('second')}>하반기</button>
                    </div>
                </div>
            </header>

            <div className="patient-kpi-row" style={{ marginBottom: '1.5rem' }}>
                {[
                    { label: '총매출', value: formatWon(totalSales), sub: `${periodLabel} 합계`, color: '#3b82f6', icon: WalletCards },
                    { label: '순매출', value: formatWon(netSales), sub: '현금+카드+기타', color: '#10b981', icon: WalletCards },
                    { label: '보험청구', value: formatWon(insuranceSales), sub: '공단부담/청구액', color: '#f59e0b', icon: ShieldCheck },
                    { label: '총 접수 환자 수', value: formatPeople(totalPatients), sub: `${periodLabel} 합계`, color: '#8b5cf6', icon: Users },
                    { label: '신환 수', value: formatPeople(newPatients), sub: `${periodLabel} 합계`, color: '#ec4899', icon: UserPlus },
                    { label: '상담 동의율', value: `${consultationRate.toFixed(1)}%`, sub: '상담분석 연결 전', color: '#64748b', icon: TrendingUp },
                ].map(item => {
                    const Icon = item.icon;
                    return (
                        <div key={item.label} className="patient-kpi-card" style={{ borderTop: `3px solid ${item.color}` }}>
                            <span className="kpi-label"><Icon size={15} /> {item.label}</span>
                            <span className="kpi-value" style={{ color: item.color }}>{item.value}</span>
                            <span className="kpi-sub">{item.sub}</span>
                        </div>
                    );
                })}
            </div>

            <div className="dashboard-grid" style={{ gridTemplateColumns: '1.35fr 1fr' }}>
                <DashboardCard title="월별 매출 추이" subtitle="총매출 / 순매출 / 보험청구">
                    <div style={{ height: 320, width: '100%' }}>
                        <ResponsiveContainer>
                            <AreaChart data={monthlySalesChart} margin={{ top: 24, right: 24, left: 20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                <YAxis tick={{ fontSize: 11 }} width={72} tickFormatter={formatShortWon} />
                                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(value, name) => [formatWon(value), name]} />
                                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                                <Area type="monotone" dataKey="총매출" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.12} strokeWidth={2.5} />
                                <Area type="monotone" dataKey="순매출" stroke="#10b981" fill="#10b981" fillOpacity={0.08} strokeWidth={2.2} />
                                <Area type="monotone" dataKey="보험청구" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.08} strokeWidth={2.2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </DashboardCard>

                <DashboardCard title="알림 / 이상 징후" subtitle="업로드 데이터 기반">
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                        {alerts.map((alert, index) => {
                            const isDown = alert.type === 'down';
                            const color = isDown ? '#ef4444' : alert.type === 'up' ? '#10b981' : '#64748b';
                            const Icon = isDown ? TrendingDown : TrendingUp;
                            return (
                                <div key={index} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: '0.65rem', alignItems: 'start', padding: '0.8rem', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-color)' }}>
                                    <Icon size={18} style={{ color, marginTop: 2 }} />
                                    <span style={{ color: 'var(--text-primary)', fontWeight: 650, lineHeight: 1.5 }}>{alert.text}</span>
                                </div>
                            );
                        })}
                    </div>
                </DashboardCard>
            </div>

            <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: '1.5rem' }}>
                <DashboardCard title="월별 환자 추이" subtitle="총환자수 / 신환수">
                    <div style={{ height: 300, width: '100%' }}>
                        <ResponsiveContainer>
                            <LineChart data={monthlyPatientChart} margin={{ top: 24, right: 24, left: 8, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                <YAxis tick={{ fontSize: 11 }} width={48} />
                                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(value, name) => [formatPeople(value), name]} />
                                <Legend verticalAlign="top" height={36} iconType="line" wrapperStyle={{ fontSize: '11px' }} />
                                <Line type="monotone" dataKey="총환자수" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--card-bg)' }} />
                                <Line type="monotone" dataKey="신환수" stroke="#ec4899" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--card-bg)' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </DashboardCard>

                <DashboardCard title="신환 매출 비중" subtitle="순매출 대비">
                    <div style={{ height: 300, width: '100%' }}>
                        <ResponsiveContainer>
                            <BarChart data={[{ name: '신환 매출', value: newPatientRevenueRate }]} layout="vertical" margin={{ top: 40, right: 40, left: 40, bottom: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-color)" />
                                <XAxis type="number" tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                                <YAxis dataKey="name" type="category" width={80} />
                                <Tooltip formatter={(value) => [`${Number(value || 0).toFixed(1)}%`, '비중']} />
                                <Bar dataKey="value" fill="#14b8a6" radius={[0, 4, 4, 0]} maxBarSize={38} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </DashboardCard>
            </div>

            <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', marginTop: '1.5rem' }}>
                {renderRanking('매출 상위 의사 TOP 5', `${periodLabel} 합계`, doctorRanking, formatWon)}
                {renderRanking('신환 내원경로 TOP 5', `${periodLabel} 신환수`, sourceRanking, formatPeople)}
                {renderRanking('객단가 상위 경로 TOP 5', `${periodLabel} 평균진료비`, unitPriceRanking, formatWon)}
                {renderRanking('보험수가 환자수 TOP 5', `${periodLabel} 합계`, insuranceFeeRanking, formatPeople)}
            </div>
        </div>
    );
};

export default HomeDashboard;
