import React, { useEffect, useMemo, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
    LineChart, Line, Legend
} from 'recharts';
import { Calendar, ChevronDown, ListChecks, ShieldCheck, WalletCards } from 'lucide-react';
import DashboardCard from '../components/DashboardCard';
import { useAuth } from '../context/AuthContext';
import { getActiveAnalyticsClinicId, loadAnalyticsData } from '../utils/supabaseAnalyticsStore';
import './SalesAnalysis.css';
import './TreatmentAnalysis.css';

const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b'];

const createEmptyClaimYearData = () => MONTHS.map(month => ({
    month,
    health: 0,
    medicalAid: 0,
    amount: 0,
}));

const createEmptyFeeYearData = () => MONTHS.map(month => ({
    month,
    fees: [],
}));

const normalizeClaimYearData = (rows) => {
    if (!Array.isArray(rows)) return createEmptyClaimYearData();
    return MONTHS.map(month => {
        const found = rows.find(row => row.month === month) || {};
        const health = Number(found.health || 0);
        const medicalAid = Number(found.medicalAid || 0);
        return {
            month,
            health,
            medicalAid,
            amount: Number(found.amount ?? (health + medicalAid) ?? 0),
        };
    });
};

const normalizeFeeYearData = (rows) => {
    if (!Array.isArray(rows)) return createEmptyFeeYearData();
    return MONTHS.map(month => {
        const found = rows.find(row => row.month === month) || {};
        return {
            month,
            fees: Array.isArray(found.fees) ? found.fees.map(item => ({
                code: String(item.code || ''),
                name: String(item.name || item.feeName || ''),
                patients: Number(item.patients || 0),
                visits: Number(item.visits || 0),
            })) : [],
        };
    });
};

const loadInsuranceClaimData = (year) => {
    return createEmptyClaimYearData();
};

const loadInsuranceFeeStatsData = (year) => {
    return createEmptyFeeYearData();
};

const buildClaimMapFromSupabaseRows = (rows = []) => rows.reduce((map, row) => {
    const year = String(row.year || '');
    const monthLabel = `${Number(row.month || 0)}월`;
    if (!year || !MONTHS.includes(monthLabel)) return map;
    if (!map[year]) map[year] = createEmptyClaimYearData();
    const target = map[year].find(item => item.month === monthLabel);
    if (target) {
        const payload = row.payload || {};
        target.health = Number(payload.health || 0);
        target.medicalAid = Number(payload.medicalAid || 0);
        target.amount = Number(payload.amount ?? (target.health + target.medicalAid));
    }
    return map;
}, {});

const buildFeeMapFromSupabaseRows = (rows = []) => rows.reduce((map, row) => {
    const year = String(row.year || '');
    const monthLabel = `${Number(row.month || 0)}월`;
    if (!year || !MONTHS.includes(monthLabel)) return map;
    if (!map[year]) map[year] = createEmptyFeeYearData();
    const target = map[year].find(item => item.month === monthLabel);
    if (target) {
        target.fees = (row.payload?.rows || []).map(item => ({
            code: String(item.code || ''),
            name: String(item.name || item.feeName || ''),
            patients: Number(item.patients || 0),
            visits: Number(item.visits || 0),
        }));
    }
    return map;
}, {});

const formatWon = (value) => `${Math.round(Number(value || 0)).toLocaleString()}원`;
const formatShortWon = (value) => {
    const number = Number(value || 0);
    if (number >= 100000000) return `${(number / 100000000).toFixed(1)}억`;
    if (number >= 10000) return `${Math.round(number / 10000).toLocaleString()}만`;
    return number.toLocaleString();
};

const monthSelectWrapStyle = { display: 'flex', alignItems: 'center', gap: '0.55rem' };
const monthSelectLabelStyle = { fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' };
const monthSelectStyle = {
    minWidth: '86px',
    padding: '0.45rem 0.7rem',
    borderRadius: '0.5rem',
    border: '1px solid var(--border-color)',
    background: 'var(--card-bg)',
    color: 'var(--text-primary)',
    fontWeight: 700,
    outline: 'none',
};
const feeCountCellStyle = { minWidth: '72px', whiteSpace: 'nowrap', wordBreak: 'keep-all' };
const FEE_ROWS_PER_PAGE = 20;

const InsuranceAnalysis = () => {
    const { clinicId } = useAuth();
    const activeClinicId = getActiveAnalyticsClinicId(clinicId);
    const [selectedYear, setSelectedYear] = useState('2025');
    const [availableYears, setAvailableYears] = useState(['2025']);
    const [isYearOpen, setIsYearOpen] = useState(false);
    const [half, setHalf] = useState('all');
    const [subTab, setSubTab] = useState('claim');
    const [selectedFeeMonthIndex, setSelectedFeeMonthIndex] = useState(0);
    const [feePage, setFeePage] = useState(1);
    const [claimYearData, setClaimYearData] = useState(() => createEmptyClaimYearData());
    const [feeYearData, setFeeYearData] = useState(() => createEmptyFeeYearData());
    const [supabaseClaimMap, setSupabaseClaimMap] = useState(null);
    const [supabaseFeeMap, setSupabaseFeeMap] = useState(null);

    const refreshYears = (claimMap = supabaseClaimMap, feeMap = supabaseFeeMap, includeLocal = !activeClinicId) => {
        const years = new Set(['2025']);
        try {
            // Supabase 전환 후 로컬 캐시는 연도 산정에 사용하지 않습니다.
            Object.keys(claimMap || {}).forEach(year => years.add(year));
            Object.keys(feeMap || {}).forEach(year => years.add(year));
        } catch (e) {
            console.error(e);
        }
        setAvailableYears(Array.from(years).sort((a, b) => Number(b) - Number(a)));
    };

    useEffect(() => {
        refreshYears();
    }, []);

    useEffect(() => {
        let cancelled = false;

        const loadData = async () => {
            let nextClaimMap = null;
            let nextFeeMap = null;
            if (activeClinicId) {
                try {
                    const [claimRows, feeRows] = await Promise.all([
                        loadAnalyticsData({ clinicId: activeClinicId, category: 'insurance', subCategory: 'claim' }),
                        loadAnalyticsData({ clinicId: activeClinicId, category: 'insurance', subCategory: 'fee_stats' }),
                    ]);
                    const claimMap = buildClaimMapFromSupabaseRows(claimRows);
                    const feeMap = buildFeeMapFromSupabaseRows(feeRows);
                    nextClaimMap = Object.keys(claimMap).length > 0 ? claimMap : null;
                    nextFeeMap = Object.keys(feeMap).length > 0 ? feeMap : null;
                } catch (e) {
                    console.error('[InsuranceAnalysis] Supabase data load error:', e);
                }
            }

            if (cancelled) return;
            setSupabaseClaimMap(nextClaimMap);
            setSupabaseFeeMap(nextFeeMap);
            refreshYears(nextClaimMap, nextFeeMap, false);
            setClaimYearData(nextClaimMap?.[selectedYear] || createEmptyClaimYearData());
            setFeeYearData(nextFeeMap?.[selectedYear] || createEmptyFeeYearData());
        };

        loadData();
        return () => {
            cancelled = true;
        };
    }, [activeClinicId, selectedYear]);

    useEffect(() => {
        const handleUpdate = () => {
            refreshYears();
            setClaimYearData(createEmptyClaimYearData());
            setFeeYearData(createEmptyFeeYearData());
        };
        window.addEventListener('insuranceClaimUpdated', handleUpdate);
        window.addEventListener('insuranceFeeStatsUpdated', handleUpdate);
        window.addEventListener('storage', handleUpdate);
        window.addEventListener('activeClinicChanged', handleUpdate);
        return () => {
            window.removeEventListener('insuranceClaimUpdated', handleUpdate);
            window.removeEventListener('insuranceFeeStatsUpdated', handleUpdate);
            window.removeEventListener('storage', handleUpdate);
            window.removeEventListener('activeClinicChanged', handleUpdate);
        };
    }, [selectedYear, activeClinicId]);

    const currentClaimData = useMemo(() => {
        if (half === 'first') return claimYearData.slice(0, 6);
        if (half === 'second') return claimYearData.slice(6, 12);
        return claimYearData;
    }, [half, claimYearData]);

    const currentFeeMonths = useMemo(() => {
        if (half === 'first') return feeYearData.slice(0, 6);
        if (half === 'second') return feeYearData.slice(6, 12);
        return feeYearData;
    }, [half, feeYearData]);

    const totalClaim = currentClaimData.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const healthTotal = currentClaimData.reduce((sum, row) => sum + Number(row.health || 0), 0);
    const medicalAidTotal = currentClaimData.reduce((sum, row) => sum + Number(row.medicalAid || 0), 0);
    const nonZeroMonths = currentClaimData.filter(row => Number(row.amount || 0) > 0).length;
    const averageClaim = nonZeroMonths > 0 ? totalClaim / nonZeroMonths : 0;
    const peakMonth = currentClaimData.reduce((max, row) => (
        Number(row.amount || 0) > Number(max.amount || 0) ? row : max
    ), currentClaimData[0] || { month: '-', amount: 0 });
    const periodLabel = half === 'first' ? '상반기' : half === 'second' ? '하반기' : '전체';

    const feeRows = useMemo(() => {
        const grouped = {};
        currentFeeMonths.forEach(month => {
            (month.fees || []).forEach(item => {
                const key = `${item.code}|||${item.name}`;
                if (!grouped[key]) grouped[key] = { code: item.code, name: item.name, patients: 0, visits: 0 };
                grouped[key].patients += Number(item.patients || 0);
                grouped[key].visits += Number(item.visits || 0);
            });
        });
        return Object.values(grouped)
            .filter(item => item.code || item.name)
            .sort((a, b) => b.patients - a.patients || b.visits - a.visits);
    }, [currentFeeMonths]);

    const topPatientFees = feeRows.slice().sort((a, b) => b.patients - a.patients).slice(0, 5);
    const topVisitFees = feeRows.slice().sort((a, b) => b.visits - a.visits).slice(0, 5);
    const selectedFeeMonth = feeYearData[selectedFeeMonthIndex] || { month: MONTHS[selectedFeeMonthIndex] || '-', fees: [] };
    const selectedFeeMonthRows = (selectedFeeMonth.fees || [])
        .slice()
        .sort((a, b) => Number(b.patients || 0) - Number(a.patients || 0) || Number(b.visits || 0) - Number(a.visits || 0));
    const feeTotalPages = Math.max(1, Math.ceil(selectedFeeMonthRows.length / FEE_ROWS_PER_PAGE));
    const currentFeePage = Math.min(feePage, feeTotalPages);
    const pagedFeeRows = selectedFeeMonthRows.slice(
        (currentFeePage - 1) * FEE_ROWS_PER_PAGE,
        currentFeePage * FEE_ROWS_PER_PAGE
    );
    const leftFeeRows = pagedFeeRows.slice(0, 10);
    const rightFeeRows = pagedFeeRows.slice(10, 20);

    const makeFeeChartData = (topFees, key) => (
        currentFeeMonths.map(month => {
            const row = { month: month.month };
            topFees.forEach(item => {
                const found = (month.fees || []).find(fee => fee.code === item.code && fee.name === item.name);
                row[`${item.code} ${item.name}`] = Number(found?.[key] || 0);
            });
            return row;
        })
    );

    const patientChartData = useMemo(() => makeFeeChartData(topPatientFees, 'patients'), [currentFeeMonths, topPatientFees]);
    const visitChartData = useMemo(() => makeFeeChartData(topVisitFees, 'visits'), [currentFeeMonths, topVisitFees]);

    const renderClaimTab = () => (
        <>
            <div className="patient-kpi-row" style={{ marginBottom: '1.5rem' }}>
                <div className="patient-kpi-card">
                    <span className="kpi-label">보험청구액</span>
                    <span className="kpi-value" style={{ color: '#3b82f6' }}>{formatWon(totalClaim)}</span>
                    <span className="kpi-sub">{periodLabel} 합계</span>
                </div>
                <div className="patient-kpi-card">
                    <span className="kpi-label">건강보험</span>
                    <span className="kpi-value" style={{ color: '#10b981' }}>{formatWon(healthTotal)}</span>
                    <span className="kpi-sub">청구액(건강보험)</span>
                </div>
                <div className="patient-kpi-card">
                    <span className="kpi-label">의료급여</span>
                    <span className="kpi-value" style={{ color: '#f59e0b' }}>{formatWon(medicalAidTotal)}</span>
                    <span className="kpi-sub">청구액(의료급여)</span>
                </div>
                <div className="patient-kpi-card">
                    <span className="kpi-label">월 평균</span>
                    <span className="kpi-value" style={{ color: '#8b5cf6' }}>{formatWon(averageClaim)}</span>
                    <span className="kpi-sub">{peakMonth.month} 최고 {formatShortWon(peakMonth.amount)}원</span>
                </div>
            </div>

            <div className="dashboard-stack">
                <DashboardCard title="월별 보험청구액" subtitle="건강보험 + 의료급여 합산">
                    <div style={{ height: 360, width: '100%' }}>
                        <ResponsiveContainer>
                            <BarChart data={currentClaimData} margin={{ top: 28, right: 24, left: 20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                <YAxis tick={{ fontSize: 11 }} width={82} tickFormatter={formatShortWon} />
                                <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} formatter={(value, name) => [formatWon(value), name]} />
                                <Bar dataKey="amount" name="보험청구액" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={54}>
                                    <LabelList dataKey="amount" position="top" formatter={formatShortWon} style={{ fontSize: 11, fill: '#3b82f6', fontWeight: 700 }} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </DashboardCard>

                <DashboardCard title="월별 보험청구액 상세 데이터" subtitle="엑셀 청구액(건강보험) + 청구액(의료급여)">
                    <div className="treatment-data-table-container">
                        <table className="treatment-data-table">
                            <thead>
                                <tr>
                                    <th className="row-header">월</th>
                                    <th>청구액(건강보험)</th>
                                    <th>청구액(의료급여)</th>
                                    <th>보험청구액</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentClaimData.map(row => (
                                    <tr key={row.month}>
                                        <td className="row-header">
                                            <ShieldCheck size={14} style={{ color: '#3b82f6' }} />
                                            {row.month}
                                        </td>
                                        <td>{formatWon(row.health)}</td>
                                        <td>{formatWon(row.medicalAid)}</td>
                                        <td className="font-bold"><WalletCards size={14} />{formatWon(row.amount)}</td>
                                    </tr>
                                ))}
                                <tr className="highlight-row">
                                    <td className="row-header">합계</td>
                                    <td className="font-bold">{formatWon(healthTotal)}</td>
                                    <td className="font-bold">{formatWon(medicalAidTotal)}</td>
                                    <td className="font-bold">{formatWon(totalClaim)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </DashboardCard>
            </div>
        </>
    );

    const renderFeeLines = (topFees, data, dataKeyLabel) => (
        <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 24, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} width={42} />
                <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} formatter={(value, name) => [`${Number(value || 0).toLocaleString()}${dataKeyLabel === '진료횟수' ? '회' : '명'}`, name]} />
                <Legend verticalAlign="top" height={42} iconType="line" wrapperStyle={{ fontSize: '11px' }} />
                {topFees.map((item, index) => {
                    const key = `${item.code} ${item.name}`;
                    return (
                        <Line
                            key={key}
                            type="monotone"
                            dataKey={key}
                            name={key}
                            stroke={COLORS[index % COLORS.length]}
                            strokeWidth={2.5}
                            dot={{ r: 3, strokeWidth: 2, fill: 'var(--card-bg)' }}
                            activeDot={{ r: 5 }}
                            connectNulls
                        />
                    );
                })}
            </LineChart>
        </ResponsiveContainer>
    );

    const renderFeeTab = () => (
        <div className="dashboard-stack">
            <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <DashboardCard title="보험수가별 환자수 상위 5개" subtitle={`${periodLabel} 합계 기준`}>
                    <div style={{ height: 320, width: '100%' }}>
                        {renderFeeLines(topPatientFees, patientChartData, '환자수')}
                    </div>
                </DashboardCard>
                <DashboardCard title="보험수가별 진료횟수 상위 5개" subtitle={`${periodLabel} 합계 기준`}>
                    <div style={{ height: 320, width: '100%' }}>
                        {renderFeeLines(topVisitFees, visitChartData, '진료횟수')}
                    </div>
                </DashboardCard>
            </div>

            <DashboardCard
                title="보험수가별 통계 상세 데이터"
                subtitle="선택 월 기준"
                headerRight={
                    <div style={monthSelectWrapStyle}>
                        <span style={monthSelectLabelStyle}>조회 월</span>
                        <select
                            value={selectedFeeMonthIndex}
                            onChange={(e) => {
                                setSelectedFeeMonthIndex(Number(e.target.value));
                                setFeePage(1);
                            }}
                            style={monthSelectStyle}
                        >
                            {MONTHS.map((month, index) => (
                                <option key={month} value={index}>{month}</option>
                            ))}
                        </select>
                    </div>
                }
            >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    {[
                        { title: `${(currentFeePage - 1) * FEE_ROWS_PER_PAGE + 1} ~ ${(currentFeePage - 1) * FEE_ROWS_PER_PAGE + 10}`, rows: leftFeeRows, offset: 0 },
                        { title: `${(currentFeePage - 1) * FEE_ROWS_PER_PAGE + 11} ~ ${(currentFeePage - 1) * FEE_ROWS_PER_PAGE + 20}`, rows: rightFeeRows, offset: 10 },
                    ].map(section => (
                        <div key={section.title}>
                            <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.55rem' }}>
                                <span className="rank-badge">{section.title}</span>
                            </h4>
                            <div className="treatment-data-table-container">
                                <table className="treatment-data-table">
                                    <thead>
                                        <tr>
                                            <th className="row-header">코드</th>
                                            <th>보험 수가명</th>
                                            <th style={feeCountCellStyle}>환자수</th>
                                            <th style={feeCountCellStyle}>진료횟수</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {section.rows.map(row => (
                                            <tr key={`${section.title}-${row.code}-${row.name}`}>
                                                <td className="row-header">
                                                    <ListChecks size={14} style={{ color: '#3b82f6' }} />
                                                    {row.code}
                                                </td>
                                                <td>{row.name}</td>
                                                <td className="font-bold" style={feeCountCellStyle}>{Number(row.patients || 0).toLocaleString()}명</td>
                                                <td className="font-bold" style={feeCountCellStyle}>{Number(row.visits || 0).toLocaleString()}회</td>
                                            </tr>
                                        ))}
                                        {selectedFeeMonthRows.length === 0 && section.offset === 0 && (
                                            <tr>
                                                <td className="row-header">-</td>
                                                <td>{selectedFeeMonth.month} 업로드 데이터가 없습니다.</td>
                                                <td style={feeCountCellStyle}>0명</td>
                                                <td style={feeCountCellStyle}>0회</td>
                                            </tr>
                                        )}
                                        {selectedFeeMonthRows.length > 0 && section.rows.length === 0 && (
                                            <tr>
                                                <td className="row-header">-</td>
                                                <td>표시할 데이터가 없습니다.</td>
                                                <td style={feeCountCellStyle}>0명</td>
                                                <td style={feeCountCellStyle}>0회</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
                {selectedFeeMonthRows.length > FEE_ROWS_PER_PAGE && (
                    <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button
                            className="pagination-btn"
                            disabled={currentFeePage === 1}
                            onClick={() => setFeePage(1)}
                        >
                            처음
                        </button>
                        <button
                            className="pagination-btn"
                            disabled={currentFeePage === 1}
                            onClick={() => setFeePage(prev => Math.max(1, prev - 1))}
                        >
                            이전
                        </button>
                        {Array.from({ length: feeTotalPages }, (_, index) => index + 1).map(page => (
                            <button
                                key={page}
                                className={`pagination-number ${currentFeePage === page ? 'active' : ''}`}
                                onClick={() => setFeePage(page)}
                            >
                                {page}
                            </button>
                        ))}
                        <button
                            className="pagination-btn"
                            disabled={currentFeePage === feeTotalPages}
                            onClick={() => setFeePage(prev => Math.min(feeTotalPages, prev + 1))}
                        >
                            다음
                        </button>
                        <button
                            className="pagination-btn"
                            disabled={currentFeePage === feeTotalPages}
                            onClick={() => setFeePage(feeTotalPages)}
                        >
                            마지막
                        </button>
                    </div>
                )}
            </DashboardCard>
        </div>
    );

    return (
        <div className="analysis-page">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1>보험청구분석</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>월별 보험청구액과 보험수가별 통계를 분석합니다.</p>
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

            <nav className="tab-navigation">
                <ul className="tab-list">
                    <li className={subTab === 'claim' ? 'active' : ''} onClick={() => setSubTab('claim')}>
                        <WalletCards size={20} />
                        <span>보험청구액 통계</span>
                    </li>
                    <li className={subTab === 'fee' ? 'active' : ''} onClick={() => setSubTab('fee')}>
                        <ListChecks size={20} />
                        <span>보험수가별 통계</span>
                    </li>
                </ul>
            </nav>

            {subTab === 'claim' ? renderClaimTab() : renderFeeTab()}
        </div>
    );
};

export default InsuranceAnalysis;
