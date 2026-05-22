import React, { useState, useEffect, useMemo } from 'react';
import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, LineChart, Line
} from 'recharts';
import { Calendar, ChevronDown, ClipboardCheck, MapPin, Users, WalletCards } from 'lucide-react';
import DashboardCard from '../components/DashboardCard';
import './SalesAnalysis.css';
import './TreatmentAnalysis.css';

const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b'];
const DEFAULT_TREATMENT_RATES = {
    '지인소개': 0.72,
    '네이버예약': 0.64,
    '블로그/SNS': 0.58,
    '간판/외부': 0.52,
    '기타': 0.45,
};
const DEFAULT_INSURANCE_RATES = {
    '지인소개': 0.68,
    '네이버예약': 0.62,
    '블로그/SNS': 0.58,
    '간판/외부': 0.55,
    '기타': 0.50,
};

const MOCK_NEW_PATIENT_DATA = {
    '2025': MONTHS.map((month, index) => ({
        month,
        sources: {
            '지인소개': 18 + (index % 4) * 3,
            '네이버예약': 14 + (index % 3) * 4,
            '블로그/SNS': 11 + (index % 5) * 2,
            '간판/외부': 8 + (index % 2) * 3,
            '기타': 5 + (index % 3),
        },
        sourceRevenue: {
            '지인소개': 7200000 + index * 280000,
            '네이버예약': 6100000 + index * 240000,
            '블로그/SNS': 4300000 + index * 210000,
            '간판/외부': 2600000 + index * 160000,
            '기타': 1200000 + index * 90000,
        },
        ages: {
            '10대': 4 + (index % 2),
            '20대': 13 + (index % 4),
            '30대': 22 + (index % 5),
            '40대': 19 + (index % 4),
            '50대': 12 + (index % 3),
            '60대+': 8 + (index % 2),
        },
    })),
};

const formatWon = (value) => `${Math.round(value || 0).toLocaleString()}원`;

const normalizeYearData = (rawYearData) => {
    if (!Array.isArray(rawYearData)) return null;
    return MONTHS.map((month) => {
        const found = rawYearData.find(item => item.month === month) || {};
        return {
            month,
            sources: found.sources || found.newPatientSources || {},
            sourceRevenue: found.sourceRevenue || found.newPatientSourceRevenue || {},
            sourceTreatments: found.sourceTreatments || found.newPatientSourceTreatments || {},
            sourceInsurancePatients: found.sourceInsurancePatients || found.newPatientSourceInsurancePatients || found.insurancePatientsBySource || {},
            sourceNonInsurancePatients: found.sourceNonInsurancePatients || found.newPatientSourceNonInsurancePatients || found.nonInsurancePatientsBySource || {},
            sourceInsuranceRatios: found.sourceInsuranceRatios || found.newPatientSourceInsuranceRatios || {},
            sourceAvgFee: found.sourceAvgFee || found.newPatientSourceAvgFee || found.averageFeeBySource || {},
            pathDistributionSummary: found.pathDistributionSummary || {},
            ages: found.ages || found.newPatientAges || {},
        };
    });
};

const loadNewPatientData = (year) => {
    try {
        const stored = localStorage.getItem('new_patient_analysis_data');
        if (stored) {
            const parsed = JSON.parse(stored);
            const normalized = normalizeYearData(parsed[year]);
            if (normalized) return normalized;
        }
    } catch (e) {
        console.error('[NewPatientAnalysis] data load error:', e);
    }

    return MOCK_NEW_PATIENT_DATA[year] || MOCK_NEW_PATIENT_DATA['2025'];
};

const NewPatientAnalysis = () => {
    const [selectedYear, setSelectedYear] = useState('2025');
    const [availableYears, setAvailableYears] = useState(['2025']);
    const [isYearOpen, setIsYearOpen] = useState(false);
    const [half, setHalf] = useState('all');
    const [subTab, setSubTab] = useState('source');
    const [selectedRatioMonthIndex, setSelectedRatioMonthIndex] = useState(0);
    const [selectedTreatmentDetailMonthIndex, setSelectedTreatmentDetailMonthIndex] = useState(0);
    const [selectedAgeRatioMonthIndex, setSelectedAgeRatioMonthIndex] = useState(0);
    const [selectedUnitPriceMonthIndex, setSelectedUnitPriceMonthIndex] = useState(0);
    const [yearData, setYearData] = useState(() => loadNewPatientData('2025'));

    useEffect(() => {
        const years = new Set(['2025']);
        try {
            const savedSales = localStorage.getItem('parsed_sales_data');
            if (savedSales) Object.keys(JSON.parse(savedSales)).forEach(year => years.add(year));
            const savedNewPatients = localStorage.getItem('new_patient_analysis_data');
            if (savedNewPatients) Object.keys(JSON.parse(savedNewPatients)).forEach(year => years.add(year));
        } catch (e) {
            console.error(e);
        }
        setAvailableYears(Array.from(years).sort((a, b) => b - a));
    }, []);

    useEffect(() => {
        setYearData(loadNewPatientData(selectedYear));
    }, [selectedYear]);

    useEffect(() => {
        const handleNewPatientUpdate = () => setYearData(loadNewPatientData(selectedYear));
        window.addEventListener('newPatientAnalysisUpdated', handleNewPatientUpdate);
        return () => window.removeEventListener('newPatientAnalysisUpdated', handleNewPatientUpdate);
    }, [selectedYear]);

    const currentHalfData = useMemo(() => {
        if (half === 'first') return yearData.slice(0, 6);
        if (half === 'second') return yearData.slice(6, 12);
        return yearData;
    }, [half, yearData]);

    const sourceSummary = useMemo(() => {
        const totals = new Map();
        currentHalfData.forEach(month => {
            Object.entries(month.sources || {}).forEach(([name, count]) => {
                totals.set(name, (totals.get(name) || 0) + Number(count || 0));
            });
        });
        return Array.from(totals.entries())
            .map(([name, value], index) => ({ name, value, color: COLORS[index % COLORS.length] }))
            .sort((a, b) => b.value - a.value);
    }, [currentHalfData]);

    const ageSummary = useMemo(() => {
        const totals = new Map();
        currentHalfData.forEach(month => {
            Object.entries(month.ages || {}).forEach(([range, count]) => {
                totals.set(range, (totals.get(range) || 0) + Number(count || 0));
            });
        });
        return ['10대', '20대', '30대', '40대', '50대', '60대+'].map(range => ({
            range,
            count: totals.get(range) || 0,
        }));
    }, [currentHalfData]);

    const unitPriceBySource = useMemo(() => {
        const counts = new Map();
        const revenues = new Map();
        currentHalfData.forEach(month => {
            Object.entries(month.sources || {}).forEach(([name, count]) => {
                counts.set(name, (counts.get(name) || 0) + Number(count || 0));
            });
            Object.entries(month.sourceRevenue || {}).forEach(([name, revenue]) => {
                revenues.set(name, (revenues.get(name) || 0) + Number(revenue || 0));
            });
        });
        return Array.from(counts.keys())
            .map((name, index) => {
                const count = counts.get(name) || 0;
                const revenue = revenues.get(name) || 0;
                const avgFee = currentHalfData.reduce((sum, month) => sum + Number((month.sourceAvgFee || {})[name] || 0), 0);
                const avgFeeCount = currentHalfData.reduce((sum, month) => sum + (Number((month.sourceAvgFee || {})[name] || 0) > 0 ? 1 : 0), 0);
                return {
                    name,
                    count,
                    revenue,
                    unitPrice: avgFeeCount > 0 ? Math.round(avgFee / avgFeeCount) : 0,
                    color: COLORS[index % COLORS.length],
                };
            })
            .sort((a, b) => b.unitPrice - a.unitPrice);
    }, [currentHalfData]);

    const getTreatmentCount = (month, name) => {
        const directCount = month.sourceTreatments?.[name] ?? month.newPatientSourceTreatments?.[name];
        if (directCount != null) return Number(directCount || 0);
        return 0;
    };

    const normalizePercent = (value) => {
        const number = Number(value || 0);
        if (!Number.isFinite(number)) return 0;
        return number <= 1 ? number * 100 : number;
    };

    const getInsuranceRatioInfo = (month, name) => {
        const ratio = month.sourceInsuranceRatios?.[name] ?? month.newPatientSourceInsuranceRatios?.[name];
        if (ratio != null) {
            const insuranceRatio = Math.max(0, Math.min(100, normalizePercent(ratio)));
            return {
                hasData: true,
                insuranceRatio,
                nonInsuranceRatio: Math.max(0, 100 - insuranceRatio),
            };
        }

        const insuranceCount = month.sourceInsurancePatients?.[name] ?? month.newPatientSourceInsurancePatients?.[name];
        const nonInsuranceCount = month.sourceNonInsurancePatients?.[name] ?? month.newPatientSourceNonInsurancePatients?.[name];
        if (insuranceCount != null && nonInsuranceCount != null) {
            const total = Number(insuranceCount || 0) + Number(nonInsuranceCount || 0);
            const insuranceRatio = total > 0 ? (Number(insuranceCount || 0) / total) * 100 : 0;
            const nonInsuranceRatio = total > 0 ? (Number(nonInsuranceCount || 0) / total) * 100 : 0;
            return { hasData: true, insuranceRatio, nonInsuranceRatio };
        }

        const patientCount = Number((month.sources || {})[name] || 0);
        if (insuranceCount != null && patientCount > 0) {
            const insuranceRatio = (Number(insuranceCount || 0) / patientCount) * 100;
            return {
                hasData: true,
                insuranceRatio,
                nonInsuranceRatio: Math.max(0, 100 - insuranceRatio),
            };
        }
        if (nonInsuranceCount != null && patientCount > 0) {
            const nonInsuranceRatio = (Number(nonInsuranceCount || 0) / patientCount) * 100;
            return {
                hasData: true,
                insuranceRatio: Math.max(0, 100 - nonInsuranceRatio),
                nonInsuranceRatio,
            };
        }

        return { hasData: false, insuranceRatio: 0, nonInsuranceRatio: 0 };
    };

    const getInsuranceRatio = (month, name) => getInsuranceRatioInfo(month, name).insuranceRatio;
    const getNonInsuranceRatio = (month, name) => getInsuranceRatioInfo(month, name).nonInsuranceRatio;

    const treatmentConversionBySource = useMemo(() => {
        const counts = new Map();
        const treatments = new Map();
        currentHalfData.forEach(month => {
            Object.entries(month.sources || {}).forEach(([name, count]) => {
                counts.set(name, (counts.get(name) || 0) + Number(count || 0));
                treatments.set(name, (treatments.get(name) || 0) + getTreatmentCount(month, name));
            });
        });
        return Array.from(counts.keys())
            .map((name, index) => {
                const count = counts.get(name) || 0;
                const treatmentCount = treatments.get(name) || 0;
                return {
                    name,
                    count,
                    treatmentCount,
                    conversionRate: count > 0 ? (treatmentCount / count) * 100 : 0,
                    color: COLORS[index % COLORS.length],
                };
            })
            .sort((a, b) => b.conversionRate - a.conversionRate);
    }, [currentHalfData]);

    const monthlyTreatmentChartData = useMemo(() => (
        currentHalfData.map(month => {
            const row = { month: month.month };
            sourceSummary.forEach(({ name }) => {
                const count = Number((month.sources || {})[name] || 0);
                row[name] = count > 0 ? Number(((getTreatmentCount(month, name) / count) * 100).toFixed(1)) : 0;
            });
            return row;
        })
    ), [currentHalfData, sourceSummary]);

    const monthlyUnitPriceChartData = useMemo(() => (
        currentHalfData.map(month => {
            const row = { month: month.month };
            sourceSummary.forEach(({ name }) => {
                const count = Number((month.sources || {})[name] || 0);
                const revenue = Number((month.sourceRevenue || {})[name] || 0);
                row[name] = Number((month.sourceAvgFee || {})[name] || 0);
            });
            return row;
        })
    ), [currentHalfData, sourceSummary]);

    const monthlySourceChartData = useMemo(() => (
        currentHalfData.map(month => ({
            month: month.month,
            ...month.sources,
        }))
    ), [currentHalfData]);

    const monthlySourceTotals = useMemo(() => (
        currentHalfData.map(month => ({
            month: month.month,
            total: Object.values(month.sources || {}).reduce((sum, count) => sum + Number(count || 0), 0),
        }))
    ), [currentHalfData]);

    const monthlyAgeTotals = useMemo(() => (
        currentHalfData.map(month => ({
            month: month.month,
            total: Object.values(month.ages || {}).reduce((sum, count) => sum + Number(count || 0), 0),
        }))
    ), [currentHalfData]);

    const totalNewPatients = sourceSummary.reduce((sum, item) => sum + item.value, 0);

    const formatRatio = (value, total) => (total ? `${((value / total) * 100).toFixed(1)}%` : '0.0%');

    const selectedRatioMonth = yearData[selectedRatioMonthIndex] || {};
    const selectedRatioMonthTotal = Object.values(selectedRatioMonth.sources || {})
        .reduce((sum, count) => sum + Number(count || 0), 0);
    const selectedTreatmentDetailMonth = yearData[selectedTreatmentDetailMonthIndex] || {};
    const selectedTreatmentDetailTotal = Object.values(selectedTreatmentDetailMonth.sources || {})
        .reduce((sum, count) => sum + Number(count || 0), 0);
    const selectedTreatmentInsuranceTotal = Object.entries(selectedTreatmentDetailMonth.sources || {})
        .reduce((sum, [name, count]) => sum + (Number(count || 0) * (getInsuranceRatio(selectedTreatmentDetailMonth, name) / 100)), 0);
    const selectedTreatmentNonInsuranceTotal = Object.entries(selectedTreatmentDetailMonth.sources || {})
        .reduce((sum, [name, count]) => sum + (Number(count || 0) * (getNonInsuranceRatio(selectedTreatmentDetailMonth, name) / 100)), 0);
    const selectedTreatmentInsuranceRatio = selectedTreatmentDetailTotal > 0
        ? (selectedTreatmentInsuranceTotal / selectedTreatmentDetailTotal) * 100
        : 0;
    const selectedTreatmentNonInsuranceRatio = selectedTreatmentDetailTotal > 0
        ? (selectedTreatmentNonInsuranceTotal / selectedTreatmentDetailTotal) * 100
        : 0;
    const selectedAgeRatioMonth = yearData[selectedAgeRatioMonthIndex] || {};
    const selectedAgeRatioMonthTotal = Object.values(selectedAgeRatioMonth.ages || {})
        .reduce((sum, count) => sum + Number(count || 0), 0);
    const selectedUnitPriceMonth = yearData[selectedUnitPriceMonthIndex] || {};
    const unitPriceSummary = selectedUnitPriceMonth.pathDistributionSummary || {};
    const unitPriceSummaryRows = [
        { key: 'total', label: '합계', values: unitPriceSummary.total || {} },
        { key: 'average', label: '평균', values: unitPriceSummary.average || {} },
    ];

    const renderTabContent = () => {
        switch (subTab) {
            case 'treatmentConversion':
                return (
                    <div className="tab-pane">
                        <div className="dashboard-stack">
                            <div className="patient-kpi-row">
                                {treatmentConversionBySource.slice(0, 4).map(({ name, conversionRate, treatmentCount, color }) => (
                                    <div key={name} className="patient-kpi-card" style={{ borderTop: `3px solid ${color}` }}>
                                        <span className="kpi-label">{name}</span>
                                        <span className="kpi-value" style={{ color }}>{conversionRate.toFixed(1)}%</span>
                                        <span className="kpi-sub">이행 {treatmentCount.toLocaleString()}명</span>
                                    </div>
                                ))}
                            </div>

                            <div className="dashboard-grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
                                <DashboardCard title="내원 경로별 치료 이행율" subtitle="월별 이행율 추이">
                                    <div style={{ height: 340, width: '100%' }}>
                                        <ResponsiveContainer>
                                            <LineChart data={monthlyTreatmentChartData} margin={{ top: 24, right: 24, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                                <YAxis tick={{ fontSize: 12 }} width={42} tickFormatter={(v) => `${v}%`} />
                                                <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} formatter={(v, name) => [`${Number(v).toFixed(1)}%`, name]} />
                                                <Legend verticalAlign="top" height={36} iconType="line" wrapperStyle={{ fontSize: '11px' }} />
                                                {treatmentConversionBySource.map(({ name, color }) => (
                                                    <Line
                                                        key={name}
                                                        type="monotone"
                                                        dataKey={name}
                                                        name={name}
                                                        stroke={color}
                                                        strokeWidth={2.5}
                                                        dot={{ r: 3, strokeWidth: 2, fill: 'var(--card-bg)' }}
                                                        activeDot={{ r: 5 }}
                                                        connectNulls
                                                    />
                                                ))}
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </DashboardCard>

                                <DashboardCard title="치료 이행율 순위" subtitle="기간 합계 기준">
                                    <div style={{ height: 300, width: '100%' }}>
                                        <ResponsiveContainer>
                                            <BarChart data={treatmentConversionBySource} layout="vertical" margin={{ top: 12, right: 24, left: 12, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-color)" />
                                                <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                                                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={86} />
                                                <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} formatter={(v) => [`${Number(v).toFixed(1)}%`, '이행율']} />
                                                <Bar dataKey="conversionRate" name="이행율" fill="#14b8a6" maxBarSize={24} radius={[0,4,4,0]}>
                                                    <LabelList dataKey="conversionRate" position="right" formatter={(v) => `${Number(v).toFixed(1)}%`} style={{ fontSize: 10, fill: '#14b8a6', fontWeight: 700 }} />
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </DashboardCard>
                            </div>

                            <DashboardCard
                                title="내원 경로별 치료 이행율 상세 데이터"
                                subtitle="선택 월 기준 보험 / 비보험 환자 비율"
                                headerRight={
                                    <div style={monthSelectWrapStyle}>
                                        <span style={monthSelectLabelStyle}>조회 월</span>
                                        <select
                                            value={selectedTreatmentDetailMonthIndex}
                                            onChange={(e) => setSelectedTreatmentDetailMonthIndex(Number(e.target.value))}
                                            style={monthSelectStyle}
                                        >
                                            {MONTHS.map((month, index) => (
                                                <option key={month} value={index}>{month}</option>
                                            ))}
                                        </select>
                                    </div>
                                }
                            >
                                <div className="treatment-data-table-container">
                                    <table className="treatment-data-table">
                                        <thead>
                                            <tr>
                                                <th className="row-header">내원경로</th>
                                                <th>{selectedTreatmentDetailMonth.month || '-'} 신환수</th>
                                                <th>보험환자 비율</th>
                                                <th>비보험환자 비율</th>
                                                <th>총 비율</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sourceSummary.map(({ name, color }) => {
                                                const count = Number((selectedTreatmentDetailMonth.sources || {})[name] || 0);
                                                const insuranceRatio = getInsuranceRatio(selectedTreatmentDetailMonth, name);
                                                const nonInsuranceRatio = getNonInsuranceRatio(selectedTreatmentDetailMonth, name);
                                                const totalRatio = formatRatio(count, selectedTreatmentDetailTotal);
                                                return (
                                                    <tr key={name}>
                                                        <td className="row-header">
                                                            <span style={{ display:'inline-block', width:10, height:10, borderRadius:'2px', background:color, marginRight:6, verticalAlign:'middle' }} />
                                                            {name}
                                                        </td>
                                                        <td className="font-bold">{count.toLocaleString()}명</td>
                                                        <td>{insuranceRatio.toFixed(1)}%</td>
                                                        <td>{nonInsuranceRatio.toFixed(1)}%</td>
                                                        <td>{totalRatio}</td>
                                                    </tr>
                                                );
                                            })}
                                            <tr className="highlight-row">
                                                <td className="row-header">총 신환수</td>
                                                <td className="font-bold">
                                                    {selectedTreatmentDetailTotal.toLocaleString()}명
                                                </td>
                                                <td>{selectedTreatmentInsuranceRatio.toFixed(1)}%</td>
                                                <td>{selectedTreatmentNonInsuranceRatio.toFixed(1)}%</td>
                                                <td className="font-bold">100.0%</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </DashboardCard>

                        </div>
                    </div>
                );

            case 'age':
                return (
                    <div className="tab-pane">
                        <div className="dashboard-stack">
                            <div className="dashboard-grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
                                <DashboardCard title="연령별 신환 현황" subtitle="연령대별 신환 수">
                                    <div style={{ height: 340, width: '100%' }}>
                                        <ResponsiveContainer>
                                            <BarChart data={ageSummary} margin={{ top: 30, right: 12, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                                <XAxis dataKey="range" tick={{ fontSize: 15, fontWeight: 700 }} />
                                                <YAxis tick={{ fontSize: 13 }} width={42} />
                                                <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} formatter={(v) => [`${v}명`, '신환']} />
                                                <Bar dataKey="count" name="신환" fill="#3b82f6" maxBarSize={46} radius={[4,4,0,0]}>
                                                    <LabelList
                                                        dataKey="count"
                                                        position="top"
                                                        formatter={(v) => `${v}명`}
                                                        style={{ fontSize: 14, fill: '#3b82f6', fontWeight: 800 }}
                                                    />
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </DashboardCard>

                                <DashboardCard title="연령별 신환 비중" subtitle="기간 합계 기준">
                                    <div style={{ height: 300, width: '100%' }}>
                                        <ResponsiveContainer>
                                            <PieChart>
                                                <Pie
                                                    data={ageSummary}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={48}
                                                    outerRadius={82}
                                                    paddingAngle={4}
                                                    dataKey="count"
                                                    nameKey="range"
                                                    label={({ range, percent }) => `${range} ${(percent * 100).toFixed(1)}%`}
                                                    labelLine={false}
                                                >
                                                    {ageSummary.map((entry, index) => <Cell key={entry.range} fill={COLORS[index % COLORS.length]} />)}
                                                </Pie>
                                                <Tooltip formatter={(v, name) => [`${v}명`, name]} />
                                                <Legend
                                                    verticalAlign="bottom"
                                                    height={24}
                                                    iconSize={10}
                                                    formatter={(value) => value}
                                                    wrapperStyle={{ fontSize: '11px' }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </DashboardCard>
                            </div>

                            <DashboardCard
                                title="연령별 신환 상세 데이터"
                                subtitle="월별 연령대와 비율"
                                headerRight={
                                    <div style={monthSelectWrapStyle}>
                                        <span style={monthSelectLabelStyle}>당월 비율</span>
                                        <select
                                            value={selectedAgeRatioMonthIndex}
                                            onChange={(e) => setSelectedAgeRatioMonthIndex(Number(e.target.value))}
                                            style={monthSelectStyle}
                                        >
                                            {MONTHS.map((month, index) => (
                                                <option key={month} value={index}>{month}</option>
                                            ))}
                                        </select>
                                    </div>
                                }
                            >
                                <div className="treatment-data-table-container">
                                    <table className="treatment-data-table">
                                        <colgroup>
                                            <col style={{ width: '96px' }} />
                                            {ageSummary.map(({ range }) => <col key={range} />)}
                                            <col style={{ width: '112px' }} />
                                        </colgroup>
                                        <thead>
                                            <tr>
                                                <th className="row-header" style={ageTableLabelCellStyle}>월</th>
                                                {ageSummary.map(({ range }) => <th key={range}>{range}</th>)}
                                                <th>총 신환 합계</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {currentHalfData.map((month, index) => {
                                                const monthTotal = monthlyAgeTotals[index]?.total || 0;
                                                return (
                                                    <tr key={month.month}>
                                                        <td className="row-header" style={ageTableLabelCellStyle}>{month.month}</td>
                                                        {ageSummary.map(({ range }) => {
                                                            const count = Number((month.ages || {})[range] || 0);
                                                            return <td key={range}>{count.toLocaleString()}명</td>;
                                                        })}
                                                        <td className="font-bold">{monthTotal.toLocaleString()}명</td>
                                                    </tr>
                                                );
                                            })}
                                            <tr className="highlight-row">
                                                <td className="row-header" style={ageTableLabelCellStyle}>소계</td>
                                                {ageSummary.map(({ range, count }, index) => (
                                                    <td key={range} className="font-bold" style={{ color: COLORS[index % COLORS.length] }}>{count.toLocaleString()}명</td>
                                                ))}
                                                <td className="font-bold">{ageSummary.reduce((sum, item) => sum + item.count, 0).toLocaleString()}명</td>
                                            </tr>
                                            <tr>
                                                <td className="row-header" style={ageTableLabelCellStyle}>당월 비율</td>
                                                {ageSummary.map(({ range }, index) => {
                                                    const count = Number((selectedAgeRatioMonth.ages || {})[range] || 0);
                                                    return <td key={range} style={{ color: COLORS[index % COLORS.length] }}>{formatRatio(count, selectedAgeRatioMonthTotal)}</td>;
                                                })}
                                                <td className="font-bold">{selectedAgeRatioMonthTotal ? '100.0%' : '0.0%'}</td>
                                            </tr>
                                            <tr>
                                                <td className="row-header" style={ageTableLabelCellStyle}>총 비율</td>
                                                {ageSummary.map(({ range, count }, index) => (
                                                    <td key={range} style={{ color: COLORS[index % COLORS.length] }}>{formatRatio(count, ageSummary.reduce((sum, item) => sum + item.count, 0))}</td>
                                                ))}
                                                <td className="font-bold">100.0%</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </DashboardCard>

                        </div>
                    </div>
                );

            case 'unitPrice':
                return (
                    <div className="tab-pane">
                        <div className="dashboard-stack">
                            <DashboardCard title="내원 경로별 객단가">
                                <div style={{ height: 360, width: '100%' }}>
                                    <ResponsiveContainer>
                                        <LineChart data={monthlyUnitPriceChartData} margin={{ top: 24, right: 28, left: 20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                            <YAxis tick={{ fontSize: 11 }} width={72} tickFormatter={(v) => formatWon(v)} />
                                            <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} formatter={(v, name) => [formatWon(v), name]} />
                                            <Legend verticalAlign="top" height={36} iconType="line" wrapperStyle={{ fontSize: '11px' }} />
                                            {sourceSummary.map(({ name, color }) => (
                                                <Line
                                                    key={name}
                                                    type="monotone"
                                                    dataKey={name}
                                                    name={name}
                                                    stroke={color}
                                                    strokeWidth={2.5}
                                                    dot={{ r: 3, strokeWidth: 2, fill: 'var(--card-bg)' }}
                                                    activeDot={{ r: 5 }}
                                                    connectNulls
                                                />
                                            ))}
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </DashboardCard>

                            <DashboardCard
                                title="내원경로별 1인당 평균 진료비 상세 데이터"
                                subtitle="선택 월 기준 총 진료비와 평균 진료비"
                                headerRight={
                                    <div style={monthSelectWrapStyle}>
                                        <span style={monthSelectLabelStyle}>조회 월</span>
                                        <select
                                            value={selectedUnitPriceMonthIndex}
                                            onChange={(e) => setSelectedUnitPriceMonthIndex(Number(e.target.value))}
                                            style={monthSelectStyle}
                                        >
                                            {MONTHS.map((month, index) => (
                                                <option key={month} value={index}>{month}</option>
                                            ))}
                                        </select>
                                    </div>
                                }
                            >
                                <div className="treatment-data-table-container">
                                    <table className="treatment-data-table">
                                        <thead>
                                            <tr>
                                                <th className="row-header">내원경로</th>
                                                <th>총 진료비</th>
                                                <th>평균 진료비</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sourceSummary.map(({ name, color }) => {
                                                const count = Number((selectedUnitPriceMonth.sources || {})[name] || 0);
                                                const revenue = Number((selectedUnitPriceMonth.sourceRevenue || {})[name] || 0);
                                                const unitPrice = Number((selectedUnitPriceMonth.sourceAvgFee || {})[name] || 0);
                                                return (
                                                    <tr key={name}>
                                                        <td className="row-header">
                                                            <MapPin size={14} style={{ color }} />
                                                            {name}
                                                        </td>
                                                        <td>{formatWon(revenue)}</td>
                                                        <td className="font-bold"><WalletCards size={14} /> {formatWon(unitPrice)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </DashboardCard>

                            <DashboardCard title="내원환자 및 진료비 요약 데이터" subtitle="선택 월 기준 엑셀 합계 / 평균">
                                <div className="treatment-data-table-container">
                                    <table className="treatment-data-table">
                                        <thead>
                                            <tr>
                                                <th className="row-header">구분</th>
                                                <th>내원환자 수</th>
                                                <th>구환 수</th>
                                                <th>신환 수</th>
                                                <th>총 내원횟수</th>
                                                <th>총 진료비</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {unitPriceSummaryRows.map(({ key, label, values }) => (
                                                <tr key={key} className={key === 'total' ? 'highlight-row' : ''}>
                                                    <td className="row-header">{label}</td>
                                                    <td>{Math.round(values.visitPatients || 0).toLocaleString()}명</td>
                                                    <td>{Math.round(values.oldPatients || 0).toLocaleString()}명</td>
                                                    <td>{Math.round(values.newPatients || 0).toLocaleString()}명</td>
                                                    <td>{Math.round(values.totalVisits || 0).toLocaleString()}회</td>
                                                    <td className="font-bold">{formatWon(values.totalFee || 0)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </DashboardCard>
                        </div>
                    </div>
                );

            case 'source':
            default:
                return (
                    <div className="tab-pane">
                        <div className="dashboard-stack">
                            <div className="patient-kpi-row">
                                <div className="patient-kpi-card kpi-total">
                                    <span className="kpi-label">신환 합계</span>
                                    <span className="kpi-value">{totalNewPatients.toLocaleString()}명</span>
                                    <span className="kpi-sub">{half === 'first' ? '상반기' : half === 'second' ? '하반기' : '전체'}</span>
                                </div>
                                {sourceSummary.slice(0, 3).map(({ name, value, color }) => (
                                    <div key={name} className="patient-kpi-card" style={{ borderTop: `3px solid ${color}` }}>
                                        <span className="kpi-label">{name}</span>
                                        <span className="kpi-value" style={{ color }}>{value.toLocaleString()}명</span>
                                        <span className="kpi-sub">비율 {totalNewPatients ? ((value / totalNewPatients) * 100).toFixed(1) : '0.0'}%</span>
                                    </div>
                                ))}
                            </div>

                            <div className="dashboard-grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
                                <DashboardCard title="신환 내원경로 현황" subtitle="월별 유입 경로">
                                    <div style={{ height: 330, width: '100%' }}>
                                        <ResponsiveContainer>
                                            <BarChart data={monthlySourceChartData} margin={{ top: 24, right: 16, left: 0, bottom: 0 }} barCategoryGap="14%" barGap={2}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                                <YAxis tick={{ fontSize: 12 }} width={42} />
                                                <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} formatter={(v, name) => [`${v}명`, name]} />
                                                <Legend verticalAlign="top" height={36} iconType="square" wrapperStyle={{ fontSize: '11px' }} />
                                                {sourceSummary.map(({ name, color }) => (
                                                    <Bar key={name} dataKey={name} name={name} fill={color} maxBarSize={34} radius={[3,3,0,0]} />
                                                ))}
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </DashboardCard>

                                <DashboardCard title="신환 내원경로 비중" subtitle="기간 합계 기준">
                                    <div style={{ height: 300, width: '100%' }}>
                                        <ResponsiveContainer>
                                            <PieChart>
                                                <Pie data={sourceSummary} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value">
                                                    {sourceSummary.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                                                </Pie>
                                                <Tooltip formatter={(v, name) => [`${v}명`, name]} />
                                                <Legend verticalAlign="bottom" height={24} iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </DashboardCard>
                            </div>

                            <DashboardCard
                                title="신환 내원경로 상세 데이터"
                                subtitle="월별 내원경로와 비율"
                                headerRight={
                                    <div style={monthSelectWrapStyle}>
                                        <span style={monthSelectLabelStyle}>당월 비율</span>
                                        <select
                                            value={selectedRatioMonthIndex}
                                            onChange={(e) => setSelectedRatioMonthIndex(Number(e.target.value))}
                                            style={monthSelectStyle}
                                        >
                                            {MONTHS.map((month, index) => (
                                                <option key={month} value={index}>{month}</option>
                                            ))}
                                        </select>
                                    </div>
                                }
                            >
                                <div className="treatment-data-table-container">
                                    <table className="treatment-data-table">
                                        <colgroup>
                                            <col style={{ width: '72px' }} />
                                            {sourceSummary.map(({ name }) => <col key={name} />)}
                                            <col style={{ width: '112px' }} />
                                        </colgroup>
                                        <thead>
                                            <tr>
                                                <th className="row-header" style={compactMonthCellStyle}>월</th>
                                                {sourceSummary.map(({ name }) => <th key={name}>{name}</th>)}
                                                <th>총 신환 합계</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {currentHalfData.map((month, index) => {
                                                const monthTotal = monthlySourceTotals[index]?.total || 0;
                                                return (
                                                    <tr key={month.month}>
                                                        <td className="row-header" style={compactMonthCellStyle}>{month.month}</td>
                                                        {sourceSummary.map(({ name }) => {
                                                            const count = Number((month.sources || {})[name] || 0);
                                                            return <td key={name}>{count.toLocaleString()}명</td>;
                                                        })}
                                                        <td className="font-bold">{monthTotal.toLocaleString()}명</td>
                                                    </tr>
                                                );
                                            })}
                                            <tr className="highlight-row">
                                                <td className="row-header" style={compactMonthCellStyle}>소계</td>
                                                {sourceSummary.map(({ name, value, color }) => (
                                                    <td key={name} className="font-bold" style={{ color }}>{value.toLocaleString()}명</td>
                                                ))}
                                                <td className="font-bold">{totalNewPatients.toLocaleString()}명</td>
                                            </tr>
                                            <tr>
                                                <td className="row-header" style={compactMonthCellStyle}>당월 비율</td>
                                                {sourceSummary.map(({ name, color }) => {
                                                    const count = Number((selectedRatioMonth.sources || {})[name] || 0);
                                                    return <td key={name} style={{ color }}>{formatRatio(count, selectedRatioMonthTotal)}</td>;
                                                })}
                                                <td className="font-bold">{selectedRatioMonthTotal ? '100.0%' : '0.0%'}</td>
                                            </tr>
                                            <tr>
                                                <td className="row-header" style={compactMonthCellStyle}>총 비율</td>
                                                {sourceSummary.map(({ name, value, color }) => (
                                                    <td key={name} style={{ color }}>{formatRatio(value, totalNewPatients)}</td>
                                                ))}
                                                <td className="font-bold">100.0%</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </DashboardCard>
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="analysis-page">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1>신환분석</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        신환 내원경로, 연령 분포, 내원 경로별 객단가를 분석합니다.
                    </p>
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
                                        onClick={() => { setSelectedYear(year); setIsYearOpen(false); }}
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
                    <li className={subTab === 'source' ? 'active' : ''} onClick={() => setSubTab('source')}>
                        <MapPin size={20} />
                        <span>신환 내원경로 현황</span>
                    </li>
                    <li className={subTab === 'treatmentConversion' ? 'active' : ''} onClick={() => setSubTab('treatmentConversion')}>
                        <ClipboardCheck size={20} />
                        <span>내원 경로별 치료 이행율</span>
                    </li>
                    <li className={subTab === 'age' ? 'active' : ''} onClick={() => setSubTab('age')}>
                        <Users size={20} />
                        <span>연령별 신환 현황</span>
                    </li>
                    <li className={subTab === 'unitPrice' ? 'active' : ''} onClick={() => setSubTab('unitPrice')}>
                        <WalletCards size={20} />
                        <span>내원 경로별 객단가</span>
                    </li>
                </ul>
            </nav>

            <div className="tab-content">
                {renderTabContent()}
            </div>
        </div>
    );
};

const compactMonthCellStyle = { minWidth: '0', width: '72px', paddingLeft: '0.75rem', whiteSpace: 'nowrap' };
const ageTableLabelCellStyle = { minWidth: '0', width: '96px', paddingLeft: '0.75rem', whiteSpace: 'nowrap' };
const monthSelectWrapStyle = { display: 'flex', alignItems: 'center', gap: '0.5rem' };
const monthSelectLabelStyle = { color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600 };
const monthSelectStyle = {
    minWidth: '96px',
    height: '34px',
    padding: '0 0.75rem',
    borderRadius: '0.45rem',
    border: '1px solid var(--border-color)',
    background: 'var(--card-bg)',
    color: 'var(--text-primary)',
    fontSize: '0.85rem',
    fontWeight: 600,
    outline: 'none',
    cursor: 'pointer',
};

export default NewPatientAnalysis;
