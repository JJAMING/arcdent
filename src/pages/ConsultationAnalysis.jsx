import React, { useEffect, useMemo, useState } from 'react';
import {
    Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
    ComposedChart, Line
} from 'recharts';
import { Calendar, ChevronDown, ClipboardCheck, UserCheck, UserX, Users } from 'lucide-react';
import DashboardCard from '../components/DashboardCard';
import './SalesAnalysis.css';
import './TreatmentAnalysis.css';

const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

const parseNumber = (value) => {
    if (typeof value === 'number') return value;
    const cleaned = String(value ?? '').replace(/[^0-9.-]/g, '');
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : 0;
};

const safeJson = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        console.error(`[ConsultationAnalysis] ${key} parse error`, e);
        return fallback;
    }
};

const normalizeMonth = (value) => {
    const text = String(value ?? '');
    const match = text.match(/(\d{1,2})월/) || text.match(/[-/.](\d{1,2})(?:[-/.]|$)/);
    if (!match) return '';
    const month = Number(match[1]);
    return month >= 1 && month <= 12 ? `${month}월` : '';
};

const normalizeYear = (value, fallback = '2025') => {
    const text = String(value ?? '');
    const match = text.match(/([12]\d{3})년?/) || text.match(/^(\d{2})[-/.]/);
    if (!match) return fallback;
    return match[1].length === 2 ? `20${match[1]}` : match[1];
};

const isAgreedStatus = (status) => {
    const text = String(status || '').replace(/\s+/g, '');
    return text.includes('동의') && !text.includes('미동의') && !text.includes('부동의') && !text.includes('부분동의');
};

const isPartialStatus = (status) => {
    const text = String(status || '').replace(/\s+/g, '');
    return text.includes('부분동의');
};

const isRejectedStatus = (status) => {
    const text = String(status || '').replace(/\s+/g, '');
    return text.includes('미동의') || text.includes('부동의') || text.includes('거절');
};

const getPlanYear = (plan) => String(plan.year || normalizeYear(plan.createdAt));
const getPlanMonth = (plan) => plan.month || normalizeMonth(plan.createdAt);

const getConsultantName = (plan) => {
    const keys = ['consultant', 'consultantName', 'counselor', 'manager', '담당자', '상담자', '실장'];
    for (const key of keys) {
        const value = String(plan?.[key] ?? '').trim();
        if (value) return value;
    }
    return '미지정';
};

const getFieldNumber = (item, keys) => {
    for (const key of keys) {
        if (item?.[key] !== undefined && item?.[key] !== null && item?.[key] !== '') {
            return parseNumber(item[key]);
        }
    }
    return 0;
};

const formatWon = (value) => `${Math.round(Number(value || 0)).toLocaleString()}원`;
const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

const ConsultationAnalysis = () => {
    const [selectedYear, setSelectedYear] = useState('2025');
    const [availableYears, setAvailableYears] = useState(['2025']);
    const [isYearOpen, setIsYearOpen] = useState(false);
    const [half, setHalf] = useState('all');
    const [subTab, setSubTab] = useState('overall');
    const [selectedMonth, setSelectedMonth] = useState('1월');
    const [refreshKey, setRefreshKey] = useState(0);

    const treatmentPlans = useMemo(() => safeJson('treatment_plan_data', []), [refreshKey]);

    useEffect(() => {
        const years = new Set(['2025']);
        treatmentPlans.forEach(plan => {
            const year = getPlanYear(plan);
            if (year) years.add(String(year));
        });
        setAvailableYears(Array.from(years).sort((a, b) => Number(b) - Number(a)));
    }, [treatmentPlans]);

    useEffect(() => {
        const handleUpdate = () => setRefreshKey(prev => prev + 1);
        window.addEventListener('storage', handleUpdate);
        return () => window.removeEventListener('storage', handleUpdate);
    }, []);

    const periodMonths = useMemo(() => {
        if (half === 'first') return MONTHS.slice(0, 6);
        if (half === 'second') return MONTHS.slice(6);
        return MONTHS;
    }, [half]);

    useEffect(() => {
        if (!periodMonths.includes(selectedMonth)) {
            setSelectedMonth(periodMonths[0] || '1월');
        }
    }, [periodMonths, selectedMonth]);

    const filteredPlans = useMemo(() => {
        return treatmentPlans.filter(plan => {
            const year = getPlanYear(plan);
            const month = getPlanMonth(plan);
            return year === String(selectedYear) && periodMonths.includes(month);
        });
    }, [treatmentPlans, selectedYear, periodMonths]);

    const selectedMonthPlans = useMemo(() => {
        return treatmentPlans.filter(plan => {
            const year = getPlanYear(plan);
            const month = getPlanMonth(plan);
            return year === String(selectedYear) && month === selectedMonth;
        });
    }, [treatmentPlans, selectedYear, selectedMonth]);

    const buildSummary = (plans) => {
        const agreed = plans.filter(plan => isAgreedStatus(plan.status));
        const partial = plans.filter(plan => isPartialStatus(plan.status));
        const rejected = plans.filter(plan => isRejectedStatus(plan.status));
        const consultationAmount = plans.reduce((sum, plan) => sum + getFieldNumber(plan, ['consultationAmount', 'counselAmount', 'contractAmount', '상담금액']), 0);
        const diagnosisAmount = plans.reduce((sum, plan) => sum + getFieldNumber(plan, ['diagnosisAmount', 'diagnosisFee', '진단금액']), 0) || consultationAmount;
        const rejectedAmount = rejected.reduce((sum, plan) => sum + getFieldNumber(plan, ['consultationAmount', 'counselAmount', 'contractAmount', '비동의금액']), 0);
        const agreedAmount = agreed.reduce((sum, plan) => sum + getFieldNumber(plan, ['finalAgreedAmount', 'agreedAmount', 'contractAmount', '최종동의금액']), 0);
        const paidAmount = agreed.reduce((sum, plan) => sum + getFieldNumber(plan, ['paidAmount', '수납금액']), 0);
        const newPatients = plans.reduce((sum, plan) => sum + getFieldNumber(plan, ['newPatientCount', 'newPatients', '신환수']), 0);
        const oldPatients = plans.reduce((sum, plan) => sum + getFieldNumber(plan, ['oldPatientCount', 'oldPatients', '구환수']), 0);
        const totalPatients = newPatients + oldPatients || plans.length;
        const insuranceDiagnosis = plans.reduce((sum, plan) => sum + getFieldNumber(plan, ['insuranceDiagnosis', '보험진단']), 0);
        const insuranceAgreement = plans.reduce((sum, plan) => sum + getFieldNumber(plan, ['insuranceAgreement', '보험동의']), 0);
        const implantDecision = plans.reduce((sum, plan) => sum + getFieldNumber(plan, ['insuranceImplantDecision', '보험임플결정']), 0);
        const dentureDecision = plans.reduce((sum, plan) => sum + getFieldNumber(plan, ['insuranceDentureDecision', '보험틀니결정']), 0);
        const planChange = plans.reduce((sum, plan) => sum + getFieldNumber(plan, ['treatmentPlanChange', '치료계획변동']), 0);

        return {
            totalConsultations: plans.length,
            agreedCount: agreed.length,
            partialCount: partial.length,
            rejectedCount: rejected.length,
            consultationAmount,
            diagnosisAmount,
            rejectedAmount,
            agreedAmount,
            paidAmount,
            newPatients,
            oldPatients,
            totalPatients,
            insuranceDiagnosis,
            insuranceAgreement,
            implantDecision,
            dentureDecision,
            planChange,
            patientAgreementRate: plans.length > 0 ? (agreed.length / plans.length) * 100 : 0,
            partialAgreementRate: plans.length > 0 ? (partial.length / plans.length) * 100 : 0,
            diagnosisAgreementRate: diagnosisAmount > 0 ? (agreedAmount / diagnosisAmount) * 100 : 0,
            consultationAgreementRate: consultationAmount > 0 ? (agreedAmount / consultationAmount) * 100 : 0,
            collectionRate: agreedAmount > 0 ? (paidAmount / agreedAmount) * 100 : 0,
        };
    };

    const monthSummary = useMemo(() => buildSummary(selectedMonthPlans), [selectedMonthPlans]);
    const periodLabel = half === 'first' ? '상반기' : half === 'second' ? '하반기' : '전체';

    const consultationTrendData = periodMonths.map(month => {
        const summary = buildSummary(treatmentPlans.filter(plan => getPlanYear(plan) === String(selectedYear) && getPlanMonth(plan) === month));
        return {
            month,
            최종동의금액: summary.agreedAmount,
            상담금액: summary.consultationAmount,
            진단금액: summary.diagnosisAmount,
            상담건수: summary.totalConsultations,
            동의율: Number(summary.consultationAgreementRate.toFixed(1)),
        };
    });

    const highlightMetrics = [
        {
            label: '최종동의금액',
            value: formatWon(monthSummary.agreedAmount),
            sub: `${selectedYear}년 ${selectedMonth} 기준`,
            color: '#ef4444',
            icon: ClipboardCheck,
        },
        {
            label: '진단금액 대비 동의율',
            value: formatPercent(monthSummary.diagnosisAgreementRate),
            sub: `진단금액 ${formatWon(monthSummary.diagnosisAmount)}`,
            color: '#8b5cf6',
            icon: UserCheck,
        },
        {
            label: '상담금액 대비 동의율',
            value: formatPercent(monthSummary.consultationAgreementRate),
            sub: `상담금액 ${formatWon(monthSummary.consultationAmount)}`,
            color: '#10b981',
            icon: Users,
        },
    ];

    const metricBoxStyle = {
        display: 'grid',
        gap: 6,
        padding: '0.65rem 0.5rem',
        border: '1px solid var(--border-color)',
        borderRadius: 6,
        background: 'var(--bg-color)',
        minHeight: 62,
        alignContent: 'center',
    };

    const metricLabelStyle = {
        fontSize: '0.78rem',
        color: 'var(--text-secondary)',
        fontWeight: 700,
    };

    const metricValueStyle = {
        fontSize: '0.95rem',
        fontWeight: 800,
        color: 'var(--text-primary)',
        whiteSpace: 'nowrap',
    };

    const consultantRows = useMemo(() => {
        const groups = new Map();
        selectedMonthPlans.forEach(plan => {
            const name = getConsultantName(plan);
            if (!groups.has(name)) groups.set(name, []);
            groups.get(name).push(plan);
        });

        return Array.from(groups.entries())
            .map(([name, plans]) => {
                const summary = buildSummary(plans);
                const totalAgreed = summary.agreedCount + summary.partialCount;
                const patientAgreementRate = summary.totalConsultations > 0 ? (totalAgreed / summary.totalConsultations) * 100 : 0;
                const amountAgreementRate = summary.consultationAmount > 0 ? (summary.agreedAmount / summary.consultationAmount) * 100 : 0;

                return {
                    name,
                    patientCount: summary.totalConsultations,
                    fullAgreed: summary.agreedCount,
                    partialAgreed: summary.partialCount,
                    totalAgreed,
                    rejected: summary.rejectedCount,
                    patientAgreementRate,
                    consultationAmount: summary.consultationAmount,
                    agreedAmount: summary.agreedAmount,
                    amountAgreementRate,
                };
            })
            .sort((a, b) => b.patientCount - a.patientCount || b.amountAgreementRate - a.amountAgreementRate);
    }, [selectedMonthPlans]);

    const renderOverallTab = () => (
        <div className="dashboard-stack">
            <div className="patient-kpi-row">
                {highlightMetrics.map(item => {
                    const Icon = item.icon;
                    return (
                        <div key={item.label} className="patient-kpi-card" style={{ borderTop: `4px solid ${item.color}`, minHeight: 118 }}>
                            <span className="kpi-label"><Icon size={15} /> {item.label}</span>
                            <span className="kpi-value" style={{ color: item.color, fontSize: '1.7rem' }}>{item.value}</span>
                            <span className="kpi-sub">{item.sub}</span>
                        </div>
                    );
                })}
            </div>

            <DashboardCard
                title={`전체 상담현황 [${selectedYear.slice(2)}년 ${selectedMonth}]`}
                subtitle="선택 월 기준 상담 지표"
                headerRight={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700 }}>조회 월</span>
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            style={{
                                height: 38,
                                border: '1px solid var(--border-color)',
                                borderRadius: 8,
                                padding: '0 0.75rem',
                                background: 'var(--card-bg)',
                                color: 'var(--text-primary)',
                                fontWeight: 700,
                                outline: 'none',
                            }}
                        >
                            {periodMonths.map(month => <option key={month} value={month}>{month}</option>)}
                        </select>
                    </div>
                }
            >
                <div className="treatment-data-table-container">
                    <table className="treatment-data-table">
                        <thead>
                            <tr>
                                <th>전체상담건수<br />(보험제외)</th>
                                <th>전체동의 환자수</th>
                                <th>부분동의 환자수</th>
                                <th>신환 / 구환</th>
                                <th>진단금액</th>
                                <th>상담금액</th>
                                <th>비동의금액</th>
                                <th>보험진단</th>
                                <th>보험동의</th>
                                <th>치료계획<br />변동</th>
                                <th>보험 결정</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="font-bold" style={{ minWidth: 120, padding: 8 }}>
                                    <div style={metricBoxStyle}>
                                        <span style={metricValueStyle}>{monthSummary.totalConsultations.toLocaleString()}건</span>
                                    </div>
                                </td>
                                <td style={{ minWidth: 140, padding: 8 }}>
                                    <div style={{ display: 'grid', gap: 6 }}>
                                        <div style={metricBoxStyle}>
                                            <span style={metricLabelStyle}>전체동의 환자수</span>
                                            <span style={{ ...metricValueStyle, color: '#3b82f6' }}>{monthSummary.agreedCount.toLocaleString()}명</span>
                                        </div>
                                        <div style={metricBoxStyle}>
                                            <span style={metricLabelStyle}>환자 전체동의율</span>
                                            <span style={{ ...metricValueStyle, color: '#10b981' }}>{formatPercent(monthSummary.patientAgreementRate)}</span>
                                        </div>
                                    </div>
                                </td>
                                <td style={{ minWidth: 140, padding: 8 }}>
                                    <div style={{ display: 'grid', gap: 6 }}>
                                        <div style={metricBoxStyle}>
                                            <span style={metricLabelStyle}>부분동의 환자수</span>
                                            <span style={metricValueStyle}>{monthSummary.partialCount.toLocaleString()}명</span>
                                        </div>
                                        <div style={metricBoxStyle}>
                                            <span style={metricLabelStyle}>환자 부분동의율</span>
                                            <span style={{ ...metricValueStyle, color: '#f59e0b' }}>{formatPercent(monthSummary.partialAgreementRate)}</span>
                                        </div>
                                    </div>
                                </td>
                                <td style={{ minWidth: 150, padding: 8 }}>
                                    <div style={{ display: 'grid', gap: 6 }}>
                                        <div style={metricBoxStyle}>
                                            <span style={metricLabelStyle}>신환수</span>
                                            <span style={{ ...metricValueStyle, color: '#3b82f6' }}>{monthSummary.newPatients.toLocaleString()}명</span>
                                        </div>
                                        <div style={metricBoxStyle}>
                                            <span style={metricLabelStyle}>구환수</span>
                                            <span style={{ ...metricValueStyle, color: '#64748b' }}>{monthSummary.oldPatients.toLocaleString()}명</span>
                                        </div>
                                        <div style={metricBoxStyle}>
                                            <span style={metricLabelStyle}>총 환자수</span>
                                            <span style={{ ...metricValueStyle, color: '#10b981' }}>{monthSummary.totalPatients.toLocaleString()}명</span>
                                        </div>
                                    </div>
                                </td>
                                <td style={{ padding: 8 }}><div style={metricBoxStyle}><span style={metricValueStyle}>{formatWon(monthSummary.diagnosisAmount)}</span></div></td>
                                <td style={{ padding: 8 }}><div style={metricBoxStyle}><span style={metricValueStyle}>{formatWon(monthSummary.consultationAmount)}</span></div></td>
                                <td style={{ padding: 8 }}><div style={metricBoxStyle}><span style={metricValueStyle}>{formatWon(monthSummary.rejectedAmount)}</span></div></td>
                                <td style={{ padding: 8 }}><div style={metricBoxStyle}><span style={metricValueStyle}>{monthSummary.insuranceDiagnosis.toLocaleString()}건</span></div></td>
                                <td style={{ padding: 8 }}><div style={metricBoxStyle}><span style={metricValueStyle}>{monthSummary.insuranceAgreement.toLocaleString()}건</span></div></td>
                                <td style={{ padding: 8 }}><div style={metricBoxStyle}><span style={metricValueStyle}>{monthSummary.planChange.toLocaleString()}건</span></div></td>
                                <td style={{ minWidth: 120, padding: 8 }}>
                                    <div style={{ display: 'grid', gap: 6 }}>
                                        <div style={metricBoxStyle}>
                                            <span style={metricLabelStyle}>임플</span>
                                            <span style={{ ...metricValueStyle, color: '#3b82f6' }}>{monthSummary.implantDecision.toLocaleString()}건</span>
                                        </div>
                                        <div style={metricBoxStyle}>
                                            <span style={metricLabelStyle}>틀니</span>
                                            <span style={{ ...metricValueStyle, color: '#3b82f6' }}>{monthSummary.dentureDecision.toLocaleString()}건</span>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </DashboardCard>

            <DashboardCard title="상담 현황 추이" subtitle={`${periodLabel} 기준 금액, 상담건수, 동의율`}>
                <div style={{ height: 360, width: '100%' }}>
                    <ResponsiveContainer>
                        <ComposedChart data={consultationTrendData} margin={{ top: 28, right: 42, left: 18, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                            <YAxis
                                yAxisId="amount"
                                tick={{ fontSize: 11 }}
                                width={72}
                                tickFormatter={(value) => `${Math.round(value / 1000000).toLocaleString()}백만`}
                            />
                            <YAxis yAxisId="count" hide />
                            <YAxis
                                yAxisId="rate"
                                orientation="right"
                                tick={{ fontSize: 11 }}
                                width={44}
                                tickFormatter={(value) => `${value}%`}
                                domain={[0, 100]}
                            />
                            <Tooltip
                                contentStyle={{ borderRadius: 12, fontSize: 12 }}
                                formatter={(value, name) => {
                                    if (name === '동의율') return [`${Number(value).toFixed(1)}%`, name];
                                    if (name === '상담건수') return [`${Number(value).toLocaleString()}건`, name];
                                    return [formatWon(value), name];
                                }}
                            />
                            <Legend verticalAlign="top" height={28} iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                            <Bar yAxisId="amount" dataKey="최종동의금액" fill="#8fbf4d" radius={[4, 4, 0, 0]} maxBarSize={34} />
                            <Bar yAxisId="amount" dataKey="상담금액" fill="#7c5aa6" radius={[4, 4, 0, 0]} maxBarSize={34} />
                            <Bar yAxisId="amount" dataKey="진단금액" fill="#c94f4f" radius={[4, 4, 0, 0]} maxBarSize={34} />
                            <Bar yAxisId="count" dataKey="상담건수" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={18}>
                                <LabelList dataKey="상담건수" position="insideBottom" formatter={(value) => Number(value) > 0 ? `${value}` : ''} style={{ fontSize: 10, fill: '#1e293b', fontWeight: 700 }} />
                            </Bar>
                            <Line
                                yAxisId="rate"
                                type="monotone"
                                dataKey="동의율"
                                stroke="#22a8c9"
                                strokeWidth={4}
                                dot={{ r: 5, fill: '#ef4444', stroke: '#22a8c9', strokeWidth: 2 }}
                                activeDot={{ r: 6 }}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>

                <div className="treatment-data-table-container" style={{ marginTop: '1rem' }}>
                    <table className="treatment-data-table">
                        <thead>
                            <tr>
                                <th className="row-header">구분</th>
                                {consultationTrendData.map(item => <th key={item.month}>{item.month}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                { label: '최종동의금액', key: '최종동의금액', color: '#8fbf4d', formatter: formatWon },
                                { label: '상담금액', key: '상담금액', color: '#7c5aa6', formatter: formatWon },
                                { label: '진단금액', key: '진단금액', color: '#c94f4f', formatter: formatWon },
                                { label: '상담건수', key: '상담건수', color: '#3b82f6', formatter: (value) => `${Number(value).toLocaleString()}건` },
                                { label: '동의율', key: '동의율', color: '#22a8c9', formatter: (value) => `${Number(value).toFixed(1)}%` },
                            ].map(row => (
                                <tr key={row.key}>
                                    <td className="row-header">
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ width: 10, height: 10, borderRadius: 2, background: row.color, display: 'inline-block' }} />
                                            {row.label}
                                        </span>
                                    </td>
                                    {consultationTrendData.map(item => (
                                        <td key={`${row.key}-${item.month}`} className="font-bold">
                                            {row.formatter(item[row.key])}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </DashboardCard>

        </div>
    );

    const renderConsultantTab = () => (
        <div className="dashboard-stack">
            <DashboardCard
                title={`상담자별 전체 상담 건수 및 동의율 [${selectedYear.slice(2)}년 ${selectedMonth}]`}
                subtitle="선택 월 기준 상담자별 성과"
                headerRight={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700 }}>조회 월</span>
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            style={{
                                height: 38,
                                border: '1px solid var(--border-color)',
                                borderRadius: 8,
                                padding: '0 0.75rem',
                                background: 'var(--card-bg)',
                                color: 'var(--text-primary)',
                                fontWeight: 700,
                                outline: 'none',
                            }}
                        >
                            {periodMonths.map(month => <option key={month} value={month}>{month}</option>)}
                        </select>
                    </div>
                }
            >
                <div className="treatment-data-table-container">
                    <table className="treatment-data-table">
                        <thead>
                            <tr>
                                <th style={{ width: 64 }}>No</th>
                                <th className="row-header">상담자</th>
                                <th>환자수</th>
                                <th>전체<br />동의수</th>
                                <th>부분<br />동의수</th>
                                <th>총 동의수</th>
                                <th>미동의<br />환자수</th>
                                <th>환자수<br />동의율</th>
                                <th>상담금액</th>
                                <th>동의금액</th>
                                <th>금액대비<br />동의율</th>
                            </tr>
                        </thead>
                        <tbody>
                            {consultantRows.length === 0 ? (
                                <tr>
                                    <td colSpan={11} style={{ padding: '2rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                                        선택한 월에 표시할 상담 데이터가 없습니다.
                                    </td>
                                </tr>
                            ) : consultantRows.map((row, index) => (
                                <tr key={row.name}>
                                    <td className="font-bold">{index + 1}</td>
                                    <td className="row-header">{row.name}</td>
                                    <td>{row.patientCount.toLocaleString()}명</td>
                                    <td>{row.fullAgreed.toLocaleString()}명</td>
                                    <td>{row.partialAgreed.toLocaleString()}명</td>
                                    <td className="font-bold">{row.totalAgreed.toLocaleString()}명</td>
                                    <td>{row.rejected.toLocaleString()}명</td>
                                    <td>
                                        <div style={{ ...metricBoxStyle, background: '#fffbe6', minHeight: 48 }}>
                                            <span style={{ ...metricValueStyle, color: '#ef4444' }}>{formatPercent(row.patientAgreementRate)}</span>
                                        </div>
                                    </td>
                                    <td>{formatWon(row.consultationAmount)}</td>
                                    <td>{formatWon(row.agreedAmount)}</td>
                                    <td>
                                        <div style={{ ...metricBoxStyle, background: '#fffbe6', minHeight: 48 }}>
                                            <span style={{ ...metricValueStyle, color: '#ef4444' }}>{formatPercent(row.amountAgreementRate)}</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </DashboardCard>

            <DashboardCard title="상담자별 금액대비 동의율" subtitle={`${selectedYear}년 ${selectedMonth} 기준`}>
                <div style={{ height: 340, width: '100%' }}>
                    <ResponsiveContainer>
                        <BarChart data={consultantRows} margin={{ top: 28, right: 24, left: 8, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 11 }} width={42} tickFormatter={(value) => `${value}%`} domain={[0, 100]} />
                            <Tooltip
                                contentStyle={{ borderRadius: 12, fontSize: 12 }}
                                formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
                            />
                            <Bar dataKey="amountAgreementRate" name="금액대비 동의율" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={52}>
                                <LabelList
                                    dataKey="amountAgreementRate"
                                    position="top"
                                    formatter={(value) => `${Number(value).toFixed(1)}%`}
                                    style={{ fontSize: 12, fill: '#10b981', fontWeight: 800 }}
                                />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </DashboardCard>
        </div>
    );

    const renderPlaceholderTab = (title, description) => (
        <DashboardCard title={title} subtitle={description}>
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 700 }}>
                데이터 업로드/연결 후 표시됩니다.
            </div>
        </DashboardCard>
    );

    return (
        <div className="analysis-page">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1>상담분석</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>상담 동의율과 미동의 환자 흐름을 분석합니다.</p>
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
                    <li className={subTab === 'overall' ? 'active' : ''} onClick={() => setSubTab('overall')}>
                        <ClipboardCheck size={20} />
                        <span>전체 동의율</span>
                    </li>
                    <li className={subTab === 'consultant' ? 'active' : ''} onClick={() => setSubTab('consultant')}>
                        <UserCheck size={20} />
                        <span>상담자별 동의율</span>
                    </li>
                    <li className={subTab === 'rejected' ? 'active' : ''} onClick={() => setSubTab('rejected')}>
                        <UserX size={20} />
                        <span>미동의 환자 현황</span>
                    </li>
                </ul>
            </nav>

            {subTab === 'overall' && renderOverallTab()}
            {subTab === 'consultant' && renderConsultantTab()}
            {subTab === 'rejected' && renderPlaceholderTab('미동의 환자 현황', '미동의 환자 추적')}
        </div>
    );
};

export default ConsultationAnalysis;
