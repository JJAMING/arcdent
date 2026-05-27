import React, { useEffect, useMemo, useState } from 'react';
import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList
} from 'recharts';
import { Calendar, ChevronDown, ClipboardCheck, UserCheck, UserX, Users } from 'lucide-react';
import DashboardCard from '../components/DashboardCard';
import './SalesAnalysis.css';
import './TreatmentAnalysis.css';

const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6'];

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
    return text.includes('동의') && !text.includes('미동의') && !text.includes('부동의');
};

const isRejectedStatus = (status) => {
    const text = String(status || '').replace(/\s+/g, '');
    return text.includes('미동의') || text.includes('부동의') || text.includes('거절');
};

const ConsultationAnalysis = () => {
    const [selectedYear, setSelectedYear] = useState('2025');
    const [availableYears, setAvailableYears] = useState(['2025']);
    const [isYearOpen, setIsYearOpen] = useState(false);
    const [half, setHalf] = useState('all');
    const [subTab, setSubTab] = useState('overall');
    const [refreshKey, setRefreshKey] = useState(0);

    const treatmentPlans = useMemo(() => safeJson('treatment_plan_data', []), [refreshKey]);

    useEffect(() => {
        const years = new Set(['2025']);
        treatmentPlans.forEach(plan => {
            const year = plan.year || normalizeYear(plan.createdAt);
            if (year) years.add(String(year));
        });
        setAvailableYears(Array.from(years).sort((a, b) => Number(b) - Number(a)));
    }, [treatmentPlans]);

    useEffect(() => {
        const handleUpdate = () => setRefreshKey(prev => prev + 1);
        window.addEventListener('storage', handleUpdate);
        return () => window.removeEventListener('storage', handleUpdate);
    }, []);

    const filteredPlans = useMemo(() => {
        const months = half === 'first'
            ? MONTHS.slice(0, 6)
            : half === 'second'
                ? MONTHS.slice(6)
                : MONTHS;
        return treatmentPlans.filter(plan => {
            const year = String(plan.year || normalizeYear(plan.createdAt));
            const month = plan.month || normalizeMonth(plan.createdAt);
            return year === String(selectedYear) && months.includes(month);
        });
    }, [treatmentPlans, selectedYear, half]);

    const totalConsultations = filteredPlans.length;
    const agreedPlans = filteredPlans.filter(plan => isAgreedStatus(plan.status));
    const rejectedPlans = filteredPlans.filter(plan => isRejectedStatus(plan.status));
    const pendingPlans = filteredPlans.filter(plan => !isAgreedStatus(plan.status) && !isRejectedStatus(plan.status));
    const agreedAmount = agreedPlans.reduce((sum, plan) => sum + parseNumber(plan.contractAmount), 0);
    const totalAmount = filteredPlans.reduce((sum, plan) => sum + parseNumber(plan.contractAmount), 0);
    const paidAmount = agreedPlans.reduce((sum, plan) => sum + parseNumber(plan.paidAmount), 0);
    const agreementRate = totalConsultations > 0 ? (agreedPlans.length / totalConsultations) * 100 : 0;
    const rejectedRate = totalConsultations > 0 ? (rejectedPlans.length / totalConsultations) * 100 : 0;
    const amountAgreementRate = totalAmount > 0 ? (agreedAmount / totalAmount) * 100 : 0;
    const collectionRate = agreedAmount > 0 ? (paidAmount / agreedAmount) * 100 : 0;
    const periodLabel = half === 'first' ? '상반기' : half === 'second' ? '하반기' : '전체';

    const statusChart = [
        { name: '동의', value: agreedPlans.length, fill: '#10b981' },
        { name: '미동의', value: rejectedPlans.length, fill: '#ef4444' },
        { name: '진행/미분류', value: pendingPlans.length, fill: '#64748b' },
    ];

    const monthlyChart = MONTHS.map(month => {
        const monthPlans = filteredPlans.filter(plan => (plan.month || normalizeMonth(plan.createdAt)) === month);
        const agreed = monthPlans.filter(plan => isAgreedStatus(plan.status)).length;
        const total = monthPlans.length;
        return {
            month,
            전체상담: total,
            동의환자: agreed,
            동의율: total > 0 ? Number(((agreed / total) * 100).toFixed(1)) : 0,
        };
    });

    const renderOverallTab = () => (
        <div className="dashboard-stack">
            <div className="patient-kpi-row">
                {[
                    { label: '전체 상담건수', value: `${totalConsultations.toLocaleString()}건`, sub: '보험 제외', color: '#3b82f6', icon: ClipboardCheck },
                    { label: '전체동의 환자수', value: `${agreedPlans.length.toLocaleString()}명`, sub: `동의율 ${agreementRate.toFixed(1)}%`, color: '#10b981', icon: UserCheck },
                    { label: '부분동의 환자수', value: '0명', sub: '데이터 연결 전', color: '#f59e0b', icon: Users },
                    { label: '미동의 환자수', value: `${rejectedPlans.length.toLocaleString()}명`, sub: `미동의율 ${rejectedRate.toFixed(1)}%`, color: '#ef4444', icon: UserX },
                    { label: '동의 금액', value: formatWon(agreedAmount), sub: `금액 동의율 ${amountAgreementRate.toFixed(1)}%`, color: '#8b5cf6', icon: ClipboardCheck },
                    { label: '상담금액 대비 수납', value: formatWon(paidAmount), sub: `수납율 ${collectionRate.toFixed(1)}%`, color: '#14b8a6', icon: UserCheck },
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

            <div className="dashboard-grid" style={{ gridTemplateColumns: '1.25fr 0.75fr' }}>
                <DashboardCard title="월별 전체 동의율" subtitle={`${periodLabel} 기준`}>
                    <div style={{ height: 320, width: '100%' }}>
                        <ResponsiveContainer>
                            <BarChart data={monthlyChart} margin={{ top: 28, right: 24, left: 4, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                <YAxis tick={{ fontSize: 11 }} width={42} tickFormatter={(value) => `${value}%`} />
                                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(value, name) => [name === '동의율' ? `${Number(value).toFixed(1)}%` : `${Number(value).toLocaleString()}건`, name]} />
                                <Bar dataKey="동의율" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={42}>
                                    <LabelList dataKey="동의율" position="top" formatter={(value) => `${Number(value).toFixed(1)}%`} style={{ fontSize: 11, fill: '#10b981', fontWeight: 700 }} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </DashboardCard>

                <DashboardCard title="상담 결과 비중" subtitle="환자 수 기준">
                    <div style={{ height: 300, width: '100%' }}>
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie data={statusChart} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value" nameKey="name">
                                    {statusChart.map(entry => <Cell key={entry.name} fill={entry.fill} />)}
                                </Pie>
                                <Tooltip formatter={(value, name) => [`${Number(value).toLocaleString()}명`, name]} />
                                <Legend verticalAlign="bottom" height={24} iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </DashboardCard>
            </div>

            <DashboardCard title="전체 동의율 상세 데이터" subtitle="선택 기간 합계 기준">
                <div className="treatment-data-table-container">
                    <table className="treatment-data-table">
                        <thead>
                            <tr>
                                <th className="row-header">구분</th>
                                <th>환자수</th>
                                <th>비율</th>
                                <th>금액</th>
                                <th>수납액</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="row-header">전체 상담</td>
                                <td className="font-bold">{totalConsultations.toLocaleString()}명</td>
                                <td>100.0%</td>
                                <td>{formatWon(totalAmount)}</td>
                                <td>{formatWon(paidAmount)}</td>
                            </tr>
                            <tr>
                                <td className="row-header">동의</td>
                                <td className="font-bold">{agreedPlans.length.toLocaleString()}명</td>
                                <td>{agreementRate.toFixed(1)}%</td>
                                <td>{formatWon(agreedAmount)}</td>
                                <td>{formatWon(paidAmount)}</td>
                            </tr>
                            <tr>
                                <td className="row-header">부분동의</td>
                                <td className="font-bold">0명</td>
                                <td>0.0%</td>
                                <td>{formatWon(0)}</td>
                                <td>{formatWon(0)}</td>
                            </tr>
                            <tr>
                                <td className="row-header">미동의</td>
                                <td className="font-bold">{rejectedPlans.length.toLocaleString()}명</td>
                                <td>{rejectedRate.toFixed(1)}%</td>
                                <td>{formatWon(0)}</td>
                                <td>{formatWon(0)}</td>
                            </tr>
                        </tbody>
                    </table>
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
            {subTab === 'consultant' && renderPlaceholderTab('상담자별 동의율', '상담자별 상담 성과')}
            {subTab === 'rejected' && renderPlaceholderTab('미동의 환자 현황', '미동의 환자 추적')}
        </div>
    );
};

const formatWon = (value) => `${Math.round(Number(value || 0)).toLocaleString()}원`;

export default ConsultationAnalysis;
