import React, { useEffect, useMemo, useState } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, LineChart, Line, Legend
} from 'recharts';
import { Calendar, ChevronDown, WalletCards, Users, UserPlus, ShieldCheck, TrendingDown, TrendingUp, Percent } from 'lucide-react';
import DashboardCard from '../components/DashboardCard';
import { useAuth } from '../context/AuthContext';
import { getActiveAnalyticsClinicId, loadAnalyticsData } from '../utils/supabaseAnalyticsStore';
import { getCurrentYearString, getDefaultYearOptions } from '../utils/dateUtils';
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
    return fallback;
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
    const years = new Set(getDefaultYearOptions());
    stores.forEach(store => Object.keys(store || {}).forEach(year => years.add(year)));
    return Array.from(years).sort((a, b) => Number(b) - Number(a))[0] || getCurrentYearString();
};

const readLocalDashboardStores = () => ({
    sales: {},
    ledger: {},
    newPatient: {},
    insuranceFees: {},
    consultationOverall: {},
});

const emptyDashboardStores = () => ({
    sales: {},
    ledger: {},
    newPatient: {},
    insuranceFees: {},
    consultationOverall: {},
});

const ensureSalesMonth = (store, year, monthNumber) => {
    const yearKey = String(year || '');
    const month = `${Number(monthNumber || 0)}월`;
    if (!yearKey || !MONTHS.includes(month)) return null;
    if (!store[yearKey]) store[yearKey] = emptySalesYear();
    return store[yearKey].find(item => item.month === month);
};

const buildSalesDashboardStore = (totalRows = [], doctorRows = [], newPatientRows = []) => {
    const store = {};
    totalRows.forEach(row => {
        const target = ensureSalesMonth(store, row.year, row.month);
        if (target) Object.assign(target, row.payload || {}, { month: target.month });
    });
    doctorRows.forEach(row => {
        const target = ensureSalesMonth(store, row.year, row.month);
        if (!target) return;
        Object.assign(target, {
            doctorData: row.payload?.doctorData || {},
            netSales: Number(row.payload?.netSales || target.netSales || 0),
            insurance: Number(row.payload?.insurance || target.insurance || 0),
            total: Number(row.payload?.total || target.total || 0),
        });
    });
    newPatientRows.forEach(row => {
        const target = ensureSalesMonth(store, row.year, row.month);
        if (!target) return;
        Object.assign(target, {
            newPatient: Number(row.payload?.newPatient || 0),
            newPatientSales: Number(row.payload?.newPatientSales || 0),
        });
    });
    return store;
};

const buildObjectMonthStore = (rows = []) => rows.reduce((store, row) => {
    const year = String(row.year || '');
    const month = `${Number(row.month || 0)}월`;
    if (!year || !MONTHS.includes(month)) return store;
    if (!store[year]) store[year] = {};
    store[year][month] = row.payload || {};
    return store;
}, {});

const buildNewPatientDashboardStore = (rows = []) => {
    const store = {};
    rows.forEach(row => {
        const year = String(row.year || '');
        const month = `${Number(row.month || 0)}월`;
        if (!year || !MONTHS.includes(month)) return;
        if (!store[year]) store[year] = emptyNewPatientYear();
        const target = store[year].find(item => item.month === month);
        if (!target) return;

        const sources = {};
        const sourceRevenue = {};
        const sourceAvgFee = {};
        (row.payload?.rows || []).forEach(item => {
            if (!item.path) return;
            sources[item.path] = Number(item.newPatient || 0);
            sourceRevenue[item.path] = Number(item.totalFee || 0);
            sourceAvgFee[item.path] = Number(item.avgFee || 0);
        });
        Object.assign(target, { sources, sourceRevenue, sourceAvgFee });
    });
    return store;
};

const buildInsuranceFeesDashboardStore = (rows = []) => rows.reduce((store, row) => {
    const year = String(row.year || '');
    const month = `${Number(row.month || 0)}월`;
    if (!year || !MONTHS.includes(month)) return store;
    if (!store[year]) store[year] = MONTHS.map(item => ({ month: item, fees: [] }));
    const target = store[year].find(item => item.month === month);
    if (target) target.fees = row.payload?.rows || [];
    return store;
}, {});

const HomeDashboard = () => {
    const { clinicId } = useAuth();
    const activeClinicId = getActiveAnalyticsClinicId(clinicId);
    const [selectedYear, setSelectedYear] = useState(() => getCurrentYearString());
    const [availableYears, setAvailableYears] = useState(() => getDefaultYearOptions());
    const [isYearOpen, setIsYearOpen] = useState(false);
    const [half, setHalf] = useState('all');
    const [monthFilter, setMonthFilter] = useState('all');
    const [isMonthOpen, setIsMonthOpen] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [stores, setStores] = useState(() => emptyDashboardStores());

    useEffect(() => {
        let cancelled = false;

        const loadStores = async () => {
            let nextStores = emptyDashboardStores();

            if (activeClinicId) {
                try {
                    const [
                        salesRows,
                        doctorRows,
                        newPatientRevenueRows,
                        ledgerRows,
                        newPatientRows,
                        insuranceFeeRows,
                        consultationRows,
                    ] = await Promise.all([
                        loadAnalyticsData({ clinicId: activeClinicId, category: 'sales', subCategory: 'total_revenue' }),
                        loadAnalyticsData({ clinicId: activeClinicId, category: 'sales', subCategory: 'doctor_revenue' }),
                        loadAnalyticsData({ clinicId: activeClinicId, category: 'sales', subCategory: 'new_patient_revenue' }),
                        loadAnalyticsData({ clinicId: activeClinicId, category: 'patient', subCategory: 'total_patients_ledger' }),
                        loadAnalyticsData({ clinicId: activeClinicId, category: 'newPatient', subCategory: 'path_distribution' }),
                        loadAnalyticsData({ clinicId: activeClinicId, category: 'insurance', subCategory: 'fee_stats' }),
                        loadAnalyticsData({ clinicId: activeClinicId, category: 'consultation', subCategory: 'overall' }),
                    ]);

                    const salesStore = buildSalesDashboardStore(salesRows, doctorRows, newPatientRevenueRows);
                    const ledgerStore = buildObjectMonthStore(ledgerRows);
                    const newPatientStore = buildNewPatientDashboardStore(newPatientRows);
                    const insuranceFeesStore = buildInsuranceFeesDashboardStore(insuranceFeeRows);
                    const consultationStore = buildObjectMonthStore(consultationRows);

                    nextStores = {
                        sales: Object.keys(salesStore).length > 0 ? salesStore : {},
                        ledger: Object.keys(ledgerStore).length > 0 ? ledgerStore : {},
                        newPatient: Object.keys(newPatientStore).length > 0 ? newPatientStore : {},
                        insuranceFees: Object.keys(insuranceFeesStore).length > 0 ? insuranceFeesStore : {},
                        consultationOverall: Object.keys(consultationStore).length > 0 ? consultationStore : {},
                    };
                } catch (e) {
                    console.error('[HomeDashboard] Supabase data load error:', e);
                }
            }

            if (!cancelled) setStores(nextStores);
        };

        loadStores();
        return () => {
            cancelled = true;
        };
    }, [activeClinicId, refreshKey]);

    useEffect(() => {
        const latestYear = getLatestYear(stores.sales, stores.ledger, stores.newPatient, stores.insuranceFees, stores.consultationOverall);
        const years = new Set(getDefaultYearOptions());
        [stores.sales, stores.ledger, stores.newPatient, stores.insuranceFees, stores.consultationOverall].forEach(store => {
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
        window.addEventListener('consultationAnalysisUpdated', handleUpdate);
        window.addEventListener('activeClinicChanged', handleUpdate);
        return () => {
            window.removeEventListener('storage', handleUpdate);
            window.removeEventListener('patientLedgerUpdated', handleUpdate);
            window.removeEventListener('newPatientAnalysisUpdated', handleUpdate);
            window.removeEventListener('insuranceFeeStatsUpdated', handleUpdate);
            window.removeEventListener('insuranceClaimUpdated', handleUpdate);
            window.removeEventListener('consultationAnalysisUpdated', handleUpdate);
            window.removeEventListener('activeClinicChanged', handleUpdate);
        };
    }, []);

    const yearSales = normalizeMonthArray(stores.sales[selectedYear], emptySalesYear);
    const yearNewPatient = normalizeMonthArray(stores.newPatient[selectedYear], emptyNewPatientYear);
    const yearLedger = MONTHS.map(month => ({
        month,
        ...(stores.ledger?.[selectedYear]?.[month] || {}),
    }));
    const yearInsuranceFees = normalizeMonthArray(stores.insuranceFees[selectedYear], () => MONTHS.map(month => ({ month, fees: [] })));
    const yearConsultationOverall = MONTHS.map(month => ({
        month,
        ...(stores.consultationOverall?.[selectedYear]?.[month] || {}),
    }));

    const periodData = useMemo(() => {
        const sliceByHalf = rows => {
            if (monthFilter !== 'all') return rows.filter(row => row.month === monthFilter);
            if (half === 'first') return rows.slice(0, 6);
            if (half === 'second') return rows.slice(6, 12);
            return rows;
        };
        return {
            sales: sliceByHalf(yearSales),
            ledger: sliceByHalf(yearLedger),
            newPatient: sliceByHalf(yearNewPatient),
            insuranceFees: sliceByHalf(yearInsuranceFees),
            consultationOverall: sliceByHalf(yearConsultationOverall),
        };
    }, [half, monthFilter, yearSales, yearLedger, yearNewPatient, yearInsuranceFees, yearConsultationOverall]);

    const totalSales = sum(periodData.sales, 'total');
    const netSales = sum(periodData.sales, 'netSales');
    const insuranceSales = sum(periodData.sales, 'insurance');
    const totalPatients = periodData.ledger.reduce((acc, row) => acc + Number(row.total || row.totalVisits || 0), 0);
    const newPatients = periodData.ledger.reduce((acc, row) => acc + Number(row.newPt || 0), 0) || sum(periodData.sales, 'newPatient');
    const consultationAmount = sum(periodData.consultationOverall, 'consultationAmount');
    const agreedAmount = sum(periodData.consultationOverall, 'agreedAmount');
    const consultationRates = periodData.consultationOverall
        .map(row => Number(row.consultationAgreementRate || 0))
        .filter(value => value > 0);
    const consultationRate = consultationAmount > 0
        ? (agreedAmount / consultationAmount) * 100
        : consultationRates.length > 0
            ? consultationRates.reduce((acc, value) => acc + value, 0) / consultationRates.length
            : 0;
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
        const prevYear = String(Number(selectedYear) - 1);
        const getSalesRows = (year) => normalizeMonthArray(stores.sales?.[year], emptySalesYear);
        const getLedgerRows = (year) => MONTHS.map(month => ({
            month,
            ...(stores.ledger?.[year]?.[month] || {}),
        }));
        const byMonths = (rows, targetMonths) => rows.filter(row => targetMonths.includes(row.month));
        const periodRows = (rows) => {
            if (monthFilter !== 'all') return byMonths(rows, [monthFilter]);
            if (half === 'first') return rows.slice(0, 6);
            if (half === 'second') return rows.slice(6, 12);
            return rows;
        };
        const previousRows = (rows, previousYearRows) => {
            if (monthFilter !== 'all') {
                const currentIndex = MONTHS.indexOf(monthFilter);
                if (currentIndex <= 0) return byMonths(previousYearRows, ['12월']);
                return byMonths(rows, [MONTHS[currentIndex - 1]]);
            }
            if (half === 'first') return previousYearRows.slice(6, 12);
            if (half === 'second') return rows.slice(0, 6);
            return previousYearRows;
        };
        const currentLabel = monthFilter !== 'all'
            ? `${selectedYear}년 ${monthFilter}`
            : `${selectedYear}년 ${half === 'first' ? '상반기' : half === 'second' ? '하반기' : '전체'}`;
        const compareLabel = monthFilter !== 'all'
            ? '전월 대비'
            : half === 'first'
                ? '전년도 하반기 대비'
                : half === 'second'
                    ? '이번년도 상반기 대비'
                    : '전년도 대비';
        const currentSalesRows = periodRows(getSalesRows(selectedYear));
        const previousSalesRows = previousRows(getSalesRows(selectedYear), getSalesRows(prevYear));
        const currentLedgerRows = periodRows(getLedgerRows(selectedYear));
        const previousLedgerRows = previousRows(getLedgerRows(selectedYear), getLedgerRows(prevYear));
        const currentSalesTotal = sum(currentSalesRows, 'total');
        const previousSalesTotal = sum(previousSalesRows, 'total');
        const currentNewPatients = currentLedgerRows.reduce((acc, row, index) => acc + Number(row.newPt || currentSalesRows[index]?.newPatient || 0), 0);
        const previousNewPatients = previousLedgerRows.reduce((acc, row, index) => acc + Number(row.newPt || previousSalesRows[index]?.newPatient || 0), 0);
        const currentNetSales = sum(currentSalesRows, 'netSales');
        const currentNewPatientSales = sum(currentSalesRows, 'newPatientSales');
        const currentRevenueRate = currentNetSales > 0 ? (currentNewPatientSales / currentNetSales) * 100 : 0;
        const pushCompareMessage = (label, currentValue, previousValue, unit) => {
            if (previousValue <= 0 && currentValue <= 0) return;
            if (previousValue <= 0) {
                messages.push({
                    type: 'neutral',
                    text: `${currentLabel} ${label}은 ${unit(currentValue)}입니다. ${compareLabel} 비교 데이터가 부족합니다.`,
                });
                return;
            }
            const diffRate = ((currentValue - previousValue) / previousValue) * 100;
            messages.push({
                type: diffRate >= 0 ? 'up' : 'down',
                text: `${currentLabel} ${label}이 ${compareLabel} ${Math.abs(diffRate).toFixed(1)}% ${diffRate >= 0 ? '증가' : '감소'}했습니다.`,
            });
        };

        pushCompareMessage('총매출', currentSalesTotal, previousSalesTotal, formatWon);
        pushCompareMessage('신환 수', currentNewPatients, previousNewPatients, formatPeople);

        if (currentRevenueRate > 0) {
            messages.push({
                type: 'ratio',
                text: `${currentLabel} 신환 매출 비중은 순매출 대비 ${currentRevenueRate.toFixed(1)}%입니다.`,
            });
        }

        if (messages.length === 0) {
            messages.push({ type: 'neutral', text: `${currentLabel} 기준 비교 가능한 데이터가 부족합니다. 주요 파일 업로드 후 변화 코멘트가 표시됩니다.` });
        }
        return messages.slice(0, 4);
    }, [selectedYear, stores.sales, stores.ledger, half, monthFilter]);

    const periodLabel = monthFilter !== 'all' ? monthFilter : half === 'first' ? '상반기' : half === 'second' ? '하반기' : '전체';

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
                                            setMonthFilter('all');
                                        }}
                                    >
                                        {year}년
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="period-tabs">
                        <button className={half === 'all' && monthFilter === 'all' ? 'active' : ''} onClick={() => { setHalf('all'); setMonthFilter('all'); }}>전체보기</button>
                        <button className={half === 'first' && monthFilter === 'all' ? 'active' : ''} onClick={() => { setHalf('first'); setMonthFilter('all'); }}>상반기</button>
                        <button className={half === 'second' && monthFilter === 'all' ? 'active' : ''} onClick={() => { setHalf('second'); setMonthFilter('all'); }}>하반기</button>
                    </div>
                    <div className="year-selector-container">
                        <button className="year-select-btn" onClick={() => setIsMonthOpen(!isMonthOpen)}>
                            {monthFilter === 'all' ? '월별보기' : monthFilter}
                            <ChevronDown size={14} style={{ transform: isMonthOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                        </button>
                        {isMonthOpen && (
                            <div className="year-dropdown">
                                <button
                                    className={`year-item ${monthFilter === 'all' ? 'active' : ''}`}
                                    onClick={() => {
                                        setMonthFilter('all');
                                        setIsMonthOpen(false);
                                    }}
                                >
                                    기간 기준
                                </button>
                                {MONTHS.map(month => (
                                    <button
                                        key={month}
                                        className={`year-item ${monthFilter === month ? 'active' : ''}`}
                                        onClick={() => {
                                            setMonthFilter(month);
                                            setIsMonthOpen(false);
                                        }}
                                    >
                                        {month}
                                    </button>
                                ))}
                            </div>
                        )}
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
                    { label: '상담 동의율', value: `${consultationRate.toFixed(1)}%`, sub: `상담금액 대비 ${periodLabel}`, color: '#64748b', icon: TrendingUp },
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
                <DashboardCard title={monthFilter !== 'all' ? `${monthFilter} 매출 현황` : '월별 매출 추이'} subtitle="총매출 / 순매출 / 보험청구">
                    <div style={{ height: 320, width: '100%' }}>
                        <ResponsiveContainer>
                            {monthFilter !== 'all' ? (
                                <BarChart data={monthlySalesChart} margin={{ top: 24, right: 24, left: 20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                    <YAxis tick={{ fontSize: 11 }} width={72} tickFormatter={formatShortWon} />
                                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(value, name) => [formatWon(value), name]} />
                                    <Legend verticalAlign="top" height={36} iconType="square" wrapperStyle={{ fontSize: '11px' }} />
                                    <Bar dataKey="총매출" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={56} />
                                    <Bar dataKey="순매출" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={56} />
                                    <Bar dataKey="보험청구" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={56} />
                                </BarChart>
                            ) : (
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
                            )}
                        </ResponsiveContainer>
                    </div>
                </DashboardCard>

                <DashboardCard title="알림 / 이상 징후" subtitle="업로드 데이터 기반">
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                        {alerts.map((alert, index) => {
                            const isDown = alert.type === 'down';
                            const color = alert.type === 'ratio' ? '#14b8a6' : isDown ? '#3b82f6' : alert.type === 'up' ? '#ef4444' : '#64748b';
                            const Icon = alert.type === 'ratio' ? Percent : isDown ? TrendingDown : TrendingUp;
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
                <DashboardCard title={monthFilter !== 'all' ? `${monthFilter} 환자 현황` : '월별 환자 추이'} subtitle="총환자수 / 신환수">
                    <div style={{ height: 300, width: '100%' }}>
                        <ResponsiveContainer>
                            {monthFilter !== 'all' ? (
                                <BarChart data={monthlyPatientChart} margin={{ top: 24, right: 24, left: 8, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                    <YAxis tick={{ fontSize: 11 }} width={48} />
                                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(value, name) => [formatPeople(value), name]} />
                                    <Legend verticalAlign="top" height={36} iconType="square" wrapperStyle={{ fontSize: '11px' }} />
                                    <Bar dataKey="총환자수" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={56} />
                                    <Bar dataKey="신환수" fill="#ec4899" radius={[4, 4, 0, 0]} maxBarSize={56} />
                                </BarChart>
                            ) : (
                                <LineChart data={monthlyPatientChart} margin={{ top: 24, right: 24, left: 8, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                    <YAxis tick={{ fontSize: 11 }} width={48} />
                                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(value, name) => [formatPeople(value), name]} />
                                    <Legend verticalAlign="top" height={36} iconType="line" wrapperStyle={{ fontSize: '11px' }} />
                                    <Line type="monotone" dataKey="총환자수" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--card-bg)' }} />
                                    <Line type="monotone" dataKey="신환수" stroke="#ec4899" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--card-bg)' }} />
                                </LineChart>
                            )}
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
