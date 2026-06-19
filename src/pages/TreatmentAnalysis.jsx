import React, { useState, useEffect, useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    LabelList
} from 'recharts';
import { 
    Activity, ShieldCheck, TrendingUp, Calendar, FileText, 
    ChevronRight, Award, PlusCircle, ChevronDown,
    Stethoscope, Smile                          // 임플 탭 아이콘: Stethoscope / 틀니: Smile
} from 'lucide-react';
import DashboardCard from '../components/DashboardCard';
import { useAuth } from '../context/AuthContext';
import { getActiveAnalyticsClinicId, loadAnalyticsData } from '../utils/supabaseAnalyticsStore';
import { getCurrentYearString, getDefaultYearOptions } from '../utils/dateUtils';
import './TreatmentAnalysis.css';
import './SalesAnalysis.css';

// --- MOCK DATA (12 Months Treatment Performance) ---
const MOCK_TREATMENT_DATA = [
    { month: '1월',  surg1: 42, implantTotal: 45, osstem: 25, dentium: 10, dio: 5, straumann: 5,  crestal: 10, lateral: 5,  gbr: 12, insImp: 15, insImpStep1: 5,  insImpStep2: 6,  insImpStep3: 4,  insDent: 8,  insDentStep1: 3, insDentStep5: 3, insDentStep6: 2 },
    { month: '2월',  surg1: 38, implantTotal: 40, osstem: 20, dentium: 8,  dio: 4, straumann: 8,  crestal: 8,  lateral: 4,  gbr: 10, insImp: 12, insImpStep1: 4,  insImpStep2: 5,  insImpStep3: 3,  insDent: 10, insDentStep1: 4, insDentStep5: 4, insDentStep6: 2 },
    { month: '3월',  surg1: 45, implantTotal: 50, osstem: 30, dentium: 10, dio: 5, straumann: 5,  crestal: 12, lateral: 6,  gbr: 15, insImp: 18, insImpStep1: 6,  insImpStep2: 7,  insImpStep3: 5,  insDent: 12, insDentStep1: 5, insDentStep5: 4, insDentStep6: 3 },
    { month: '4월',  surg1: 52, implantTotal: 58, osstem: 35, dentium: 12, dio: 6, straumann: 5,  crestal: 15, lateral: 8,  gbr: 18, insImp: 22, insImpStep1: 8,  insImpStep2: 8,  insImpStep3: 6,  insDent: 15, insDentStep1: 6, insDentStep5: 5, insDentStep6: 4 },
    { month: '5월',  surg1: 48, implantTotal: 52, osstem: 30, dentium: 10, dio: 5, straumann: 7,  crestal: 14, lateral: 7,  gbr: 16, insImp: 20, insImpStep1: 7,  insImpStep2: 7,  insImpStep3: 6,  insDent: 14, insDentStep1: 5, insDentStep5: 5, insDentStep6: 4 },
    { month: '6월',  surg1: 55, implantTotal: 62, osstem: 40, dentium: 10, dio: 5, straumann: 7,  crestal: 18, lateral: 10, gbr: 22, insImp: 25, insImpStep1: 9,  insImpStep2: 9,  insImpStep3: 7,  insDent: 18, insDentStep1: 7, insDentStep5: 6, insDentStep6: 5 },
    { month: '7월',  surg1: 50, implantTotal: 55, osstem: 32, dentium: 10, dio: 5, straumann: 8,  crestal: 16, lateral: 8,  gbr: 18, insImp: 24, insImpStep1: 8,  insImpStep2: 9,  insImpStep3: 7,  insDent: 16, insDentStep1: 6, insDentStep5: 5, insDentStep6: 5 },
    { month: '8월',  surg1: 46, implantTotal: 50, osstem: 28, dentium: 10, dio: 5, straumann: 7,  crestal: 15, lateral: 7,  gbr: 15, insImp: 21, insImpStep1: 7,  insImpStep2: 8,  insImpStep3: 6,  insDent: 15, insDentStep1: 6, insDentStep5: 5, insDentStep6: 4 },
    { month: '9월',  surg1: 58, implantTotal: 65, osstem: 40, dentium: 15, dio: 5, straumann: 5,  crestal: 20, lateral: 10, gbr: 25, insImp: 28, insImpStep1: 10, insImpStep2: 10, insImpStep3: 8,  insDent: 20, insDentStep1: 8, insDentStep5: 7, insDentStep6: 5 },
    { month: '10월', surg1: 62, implantTotal: 70, osstem: 45, dentium: 15, dio: 5, straumann: 5,  crestal: 22, lateral: 12, gbr: 28, insImp: 30, insImpStep1: 11, insImpStep2: 11, insImpStep3: 8,  insDent: 22, insDentStep1: 9, insDentStep5: 7, insDentStep6: 6 },
    { month: '11월', surg1: 54, implantTotal: 60, osstem: 35, dentium: 15, dio: 5, straumann: 5,  crestal: 19, lateral: 9,  gbr: 20, insImp: 26, insImpStep1: 9,  insImpStep2: 10, insImpStep3: 7,  insDent: 19, insDentStep1: 8, insDentStep5: 6, insDentStep6: 5 },
    { month: '12월', surg1: 68, implantTotal: 75, osstem: 50, dentium: 15, dio: 5, straumann: 5,  crestal: 25, lateral: 15, gbr: 32, insImp: 35, insImpStep1: 13, insImpStep2: 12, insImpStep3: 10, insDent: 25, insDentStep1: 10, insDentStep5: 9, insDentStep6: 6 },
];

const createEmptyTreatmentData = () => MOCK_TREATMENT_DATA.map(row => ({
    month: row.month,
    surg1: 0,
    implantTotal: 0,
    osstem: 0,
    dentium: 0,
    dio: 0,
    straumann: 0,
    crestal: 0,
    lateral: 0,
    gbr: 0,
    insImp: 0,
    insImpStep1: 0,
    insImpStep2: 0,
    insImpStep3: 0,
    insDent: 0,
    insDentStep1: 0,
    insDentStep5: 0,
    insDentStep6: 0,
}));

const buildTreatmentMapFromSupabaseRows = (implantRows = [], insuranceRows = []) => {
    const map = {};
    const ensureMonth = (year, monthNumber) => {
        const yearKey = String(year || '');
        const monthLabel = `${Number(monthNumber || 0)}월`;
        if (!yearKey || !MOCK_TREATMENT_DATA.some(row => row.month === monthLabel)) return null;
        if (!map[yearKey]) map[yearKey] = createEmptyTreatmentData();
        return map[yearKey].find(item => item.month === monthLabel);
    };

    [...implantRows, ...insuranceRows].forEach(row => {
        const target = ensureMonth(row.year, row.month);
        if (!target) return;
        Object.assign(target, row.payload || {});
    });

    return map;
};

const TreatmentAnalysis = () => {
    const { clinicId } = useAuth();
    const activeClinicId = getActiveAnalyticsClinicId(clinicId);
    const [half, setHalf] = useState('all');
    const [subTab, setSubTab] = useState('implant');
    const [selectedYear, setSelectedYear] = useState(() => getCurrentYearString());
    const [availableYears, setAvailableYears] = useState(() => getDefaultYearOptions());
    const [isYearOpen, setIsYearOpen] = useState(false);
    const [refreshTick, setRefreshTick] = useState(0);
    
    const [perfDataMap, setPerfDataMap] = useState(() => ({ [getCurrentYearString()]: createEmptyTreatmentData() }));
    const [perfData, setPerfData] = useState(() => createEmptyTreatmentData());


    useEffect(() => {
        let cancelled = false;

        const loadTreatmentData = async () => {
            const currentYear = getCurrentYearString();
            let finalMap = { [selectedYear || currentYear]: createEmptyTreatmentData() };

            try {
                if (activeClinicId) {
                    const [implantRows, insuranceRows] = await Promise.all([
                        loadAnalyticsData({ clinicId: activeClinicId, category: 'treatment', subCategory: 'implant_surgery' }),
                        loadAnalyticsData({ clinicId: activeClinicId, category: 'treatment', subCategory: 'insurance_treatment' }),
                    ]);
                    const supabaseMap = buildTreatmentMapFromSupabaseRows(implantRows, insuranceRows);
                    if (Object.keys(supabaseMap).length > 0) {
                        finalMap = supabaseMap;
                    }
                }

                if (cancelled) return;

                const years = Object.keys(finalMap).sort((a, b) => b - a);
                const yearOptions = getDefaultYearOptions(years);
                setAvailableYears(yearOptions);
                setPerfDataMap(finalMap);

                const initialYear = yearOptions.includes(selectedYear) ? selectedYear : currentYear;
                setSelectedYear(initialYear);
                if (finalMap[initialYear]) setPerfData(finalMap[initialYear]);
                else setPerfData(createEmptyTreatmentData());
            } catch (e) {
                console.error("Data load error:", e);
            }
        };

        loadTreatmentData();
        const handleClinicChange = () => setRefreshTick(tick => tick + 1);
        window.addEventListener('activeClinicChanged', handleClinicChange);
        return () => {
            cancelled = true;
            window.removeEventListener('activeClinicChanged', handleClinicChange);
        };
    }, [activeClinicId, refreshTick]);

    const handleYearChange = (year) => {
        setSelectedYear(year);
        if (perfDataMap[year]) {
            setPerfData(perfDataMap[year]);
        } else {
            setPerfData(createEmptyTreatmentData());
        }
    };


    const currentHalfData = useMemo(() => {
        if (half === 'all') return perfData;
        return half === 'first' ? perfData.slice(0, 6) : perfData.slice(6, 12);
    }, [half, perfData]);

    const renderTabContent = () => {
        switch (subTab) {
            case 'implant': {
                // 종류 및 수술법 항목 정의
                const allSeries = [
                    { key: 'osstem',    name: '오스템',     color: '#4472c4' },
                    { key: 'dentium',   name: '덴티움',     color: '#ed7d31' },
                    { key: 'dio',       name: '디오',       color: '#a9d18e' },
                    { key: 'straumann', name: '스트라우만', color: '#9dc3e6' },
                    { key: 'crestal',   name: 'Crestal',    color: '#70ad47' },
                    { key: 'lateral',   name: 'Lateral',    color: '#7030a0' },
                    { key: 'gbr',       name: 'GBR',        color: '#17becf' },
                ];

                return (
                    <div className="tab-pane">
                        <div className="dashboard-stack">
                            {/* 상단 2분할 차트 영역: 좌=1, 우=2 비율 */}
                            <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
                                {/* 좌측: 월별 총 식립개수 */}
                                <DashboardCard
                                    title="월별 임플란트 식립개수"
                                    subtitle={`${half === 'first' ? '상반기' : half === 'second' ? '하반기' : '전체'} 사용량 추이`}
                                >
                                    <div style={{ height: 350, width: '100%' }}>
                                        <ResponsiveContainer>
                                            <BarChart data={currentHalfData} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                                <YAxis tick={{ fontSize: 12 }} width={36} />
                                                <Tooltip
                                                    contentStyle={{ borderRadius: '12px' }}
                                                    formatter={(v) => [`${v}개`, '총 식립개수']}
                                                />
                                                <Bar dataKey="implantTotal" name="총 식립개수" fill="#70ad47" radius={[4, 4, 0, 0]} maxBarSize={55}>
                                                    <LabelList dataKey="implantTotal" position="top" style={{ fontSize: 12, fontWeight: 700, fill: '#555' }} />
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </DashboardCard>

                                {/* 우측: 종류 및 수술법 통합 그룹형 바차트 */}
                                <DashboardCard
                                    title="종류 및 수술법별 사용량"
                                    subtitle="오스템·덴티움·디오·스트라우만 / Crestal·Lateral·GBR"
                                >
                                    <div style={{ height: 420, width: '100%' }}>
                                        <ResponsiveContainer>
                                            <BarChart
                                                data={currentHalfData}
                                                margin={{ top: 28, right: 20, left: 0, bottom: 0 }}
                                                barCategoryGap="10%"
                                                barGap={1}
                                            >
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                                <YAxis tick={{ fontSize: 12 }} width={36} />
                                                <Tooltip
                                                    contentStyle={{ borderRadius: '12px', fontSize: '12px' }}
                                                    formatter={(v, name) => [`${v}개`, name]}
                                                />
                                                <Legend verticalAlign="top" height={36} iconType="square" wrapperStyle={{ fontSize: '11px' }} />
                                                {allSeries.map(({ key, name, color }) => (
                                                    <Bar key={key} dataKey={key} name={name} fill={color} maxBarSize={40}>
                                                        <LabelList dataKey={key} position="top" style={{ fontSize: 10, fontWeight: 700, fill: color }} />
                                                    </Bar>
                                                ))}
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </DashboardCard>
                            </div>

                            {/* 하단 상세 데이터 테이블 */}
                            <DashboardCard title="임플란트 종류 및 수술법 상세 데이터">
                                <div className="treatment-data-table-container">
                                    <table className="treatment-data-table">
                                        <thead>
                                            <tr>
                                                <th className="row-header">구분</th>
                                                {currentHalfData.map(d => <th key={d.month}>{d.month}</th>)}
                                                <th>합계</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr className="highlight-row">
                                                <td className="row-header"><PlusCircle size={14} /> 총 사용개수</td>
                                                {currentHalfData.map(d => <td key={d.month} className="font-bold">{d.implantTotal}개</td>)}
                                                <td className="font-bold" style={{ fontSize: '1.1rem' }}>{currentHalfData.reduce((s, d) => s + d.implantTotal, 0)}개</td>
                                            </tr>
                                            {allSeries.map(({ key, name, color }) => (
                                                <tr key={key}>
                                                    <td className="row-header">
                                                        <span style={{
                                                            display: 'inline-block', width: 10, height: 10,
                                                            borderRadius: '2px', background: color, marginRight: 6, verticalAlign: 'middle'
                                                        }} />
                                                        {name}
                                                    </td>
                                                    {currentHalfData.map(d => <td key={d.month}>{Number(d[key] || 0)}개</td>)}
                                                    <td className="font-bold">{currentHalfData.reduce((s, d) => s + (Number(d[key]) || 0), 0)}개</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </DashboardCard>
                        </div>
                    </div>
                );
            }
            case 'insurance': {
                // 단계별 시리즈 정의
                const impSeries = [
                    { key: 'insImpStep1', name: '임플 1단계', color: '#3b82f6' },
                    { key: 'insImpStep2', name: '임플 2단계', color: '#6366f1' },
                    { key: 'insImpStep3', name: '임플 3단계', color: '#a78bfa' },
                ];
                const dentSeries = [
                    { key: 'insDentStep1', name: '틀니 1단계', color: '#f59e0b' },
                    { key: 'insDentStep5', name: '틀니 5단계', color: '#fb923c' },
                    { key: 'insDentStep6', name: '틀니 6단계', color: '#ef4444' },
                ];

                // 데이터 없으면 insImp/insDent로 확인해 fallback
                const safeD = (d, key) => Number(d[key] || 0);

                return (
                    <div className="tab-pane">
                        <div className="dashboard-stack">
                            {/* 상단 2분할: 종합 추이 + 단계별 */}
                            <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
                                {/* 좌측: 보험 임플/틀니 요약 */}
                                <DashboardCard
                                    title="보험 임플/틀니 요약"
                                    subtitle={`${half === 'first' ? '상반기' : half === 'second' ? '하반기' : '전체'} 추이`}
                                >
                                    <div style={{ height: 350, width: '100%' }}>
                                        <ResponsiveContainer>
                                            <BarChart data={currentHalfData} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                                <YAxis tick={{ fontSize: 12 }} width={36} />
                                                <Tooltip contentStyle={{ borderRadius: '12px' }} formatter={(v, name) => [`${v}건`, name]} />
                                                <Legend verticalAlign="top" height={36} iconType="square" wrapperStyle={{ fontSize: '11px' }} />
                                                <Bar dataKey="insImp" name="보험임플" fill="#4472c4" maxBarSize={50} radius={[4,4,0,0]}>
                                                    <LabelList dataKey="insImp" position="top" style={{ fontSize: 12, fontWeight: 700, fill: '#4472c4' }} />
                                                </Bar>
                                                <Bar dataKey="insDent" name="보험틀니" fill="#f59e0b" maxBarSize={50} radius={[4,4,0,0]}>
                                                    <LabelList dataKey="insDent" position="top" style={{ fontSize: 12, fontWeight: 700, fill: '#f59e0b' }} />
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </DashboardCard>

                                {/* 우측: 단계별 그룹 바차트 */}
                                <DashboardCard
                                    title="단계별 사용량"
                                    subtitle="임플 1·2·3단계 / 틀니 1·5·6단계"
                                >
                                    <div style={{ height: 350, width: '100%' }}>
                                        <ResponsiveContainer>
                                            <BarChart
                                                data={currentHalfData}
                                                margin={{ top: 28, right: 20, left: 0, bottom: 0 }}
                                                barCategoryGap="10%"
                                                barGap={2}
                                            >
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                                <YAxis tick={{ fontSize: 12 }} width={36} />
                                                <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} formatter={(v, name) => [`${v}건`, name]} />
                                                <Legend verticalAlign="top" height={36} iconType="square" wrapperStyle={{ fontSize: '11px' }} />
                                                {[...impSeries, ...dentSeries].map(({ key, name, color }) => (
                                                    <Bar key={key} dataKey={key} name={name} fill={color} maxBarSize={32}>
                                                        <LabelList dataKey={key} position="top" style={{ fontSize: 9, fontWeight: 700, fill: color }} />
                                                    </Bar>
                                                ))}
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </DashboardCard>
                            </div>

                            {/* 하단 상세 테이블 */}
                            <DashboardCard title="보험 임플/틀니 상세 데이터">
                                <div className="treatment-data-table-container">
                                    <table className="treatment-data-table">
                                        <thead>
                                            <tr>
                                                <th className="row-header">구분</th>
                                                {currentHalfData.map(d => <th key={d.month}>{d.month}</th>)}
                                                <th>합계</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {/* 보험 임플 합계 */}
                                            <tr className="highlight-row">
                                                <td className="row-header"><PlusCircle size={14} /> 보험 임플 합계</td>
                                                {currentHalfData.map(d => <td key={d.month} className="font-bold">{safeD(d,'insImp')}건</td>)}
                                                <td className="font-bold" style={{ fontSize: '1.1rem' }}>{currentHalfData.reduce((s,d)=>s+safeD(d,'insImp'),0)}건</td>
                                            </tr>
                                            {impSeries.map(({ key, name, color }) => (
                                                <tr key={key}>
                                                    <td className="row-header">
                                                        <span style={{ display:'inline-block', width:10, height:10, borderRadius:'2px', background:color, marginRight:6, verticalAlign:'middle' }} />
                                                        {name}
                                                    </td>
                                                    {currentHalfData.map(d => <td key={d.month}>{safeD(d,key)}건</td>)}
                                                    <td className="font-bold">{currentHalfData.reduce((s,d)=>s+safeD(d,key),0)}건</td>
                                                </tr>
                                            ))}

                                            {/* 구분선 */}
                                            <tr><td colSpan={currentHalfData.length + 2} style={{ height: 1, padding: 0, background: 'var(--border-color)' }} /></tr>

                                            {/* 보험 틀니 합계 */}
                                            <tr className="highlight-row">
                                                <td className="row-header"><PlusCircle size={14} /> 보험 틀니 합계</td>
                                                {currentHalfData.map(d => <td key={d.month} className="font-bold">{safeD(d,'insDent')}건</td>)}
                                                <td className="font-bold" style={{ fontSize: '1.1rem' }}>{currentHalfData.reduce((s,d)=>s+safeD(d,'insDent'),0)}건</td>
                                            </tr>
                                            {dentSeries.map(({ key, name, color }) => (
                                                <tr key={key}>
                                                    <td className="row-header">
                                                        <span style={{ display:'inline-block', width:10, height:10, borderRadius:'2px', background:color, marginRight:6, verticalAlign:'middle' }} />
                                                        {name}
                                                    </td>
                                                    {currentHalfData.map(d => <td key={d.month}>{safeD(d,key)}건</td>)}
                                                    <td className="font-bold">{currentHalfData.reduce((s,d)=>s+safeD(d,key),0)}건</td>
                                                </tr>
                                            ))}

                                            {/* 전체 합계 */}
                                            <tr className="highlight-row" style={{ borderTop: '2px solid var(--border-color)' }}>
                                                <td className="row-header font-bold"><PlusCircle size={14} /> 보험 진료 총합계</td>
                                                {currentHalfData.map(d => <td key={d.month} className="font-bold">{safeD(d,'insImp')+safeD(d,'insDent')}건</td>)}
                                                <td className="font-bold" style={{ fontSize: '1.1rem' }}>{currentHalfData.reduce((s,d)=>s+safeD(d,'insImp')+safeD(d,'insDent'),0)}건</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </DashboardCard>
                        </div>
                    </div>
                );
            }
            default: return null;
        }
    };

    return (
        <div className="treatment-analysis-page">

            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1>진료분석</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>수술 건수 및 보험 진료 현황을 분석합니다.</p>
                </div>
                
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                    <div className="year-selector-container">
                        <button 
                            className="year-select-btn" 
                            onClick={() => setIsYearOpen(!isYearOpen)}
                        >
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
                                            handleYearChange(year);
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
                    <li className={subTab === 'implant' ? 'active' : ''} onClick={() => setSubTab('implant')}>
                        <Stethoscope size={20} />
                        <span>임플란트 1차 수술</span>
                    </li>
                    <li className={subTab === 'insurance' ? 'active' : ''} onClick={() => setSubTab('insurance')}>
                        <Smile size={20} />
                        <span>보험 임플/틀니</span>
                    </li>
                </ul>
            </nav>

            <div className="tab-content" style={{ marginTop: '1.5rem' }}>
                {renderTabContent()}
            </div>
        </div>
    );
};

export default TreatmentAnalysis;
