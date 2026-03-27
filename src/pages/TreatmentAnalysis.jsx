import React, { useState, useEffect, useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    ComposedChart, Line, Area, AreaChart, Cell, LabelList
} from 'recharts';
import { 
    Activity, ShieldCheck, TrendingUp, Calendar, FileText, 
    ChevronRight, Award, PlusCircle
} from 'lucide-react';
import DashboardCard from '../components/DashboardCard';
import './TreatmentAnalysis.css';

// --- MOCK DATA (12 Months Treatment Performance) ---
const MOCK_TREATMENT_DATA = [
    { month: '1월', surg1: 42, implantTotal: 45, osstem: 25, dentium: 15, straumann: 5, crestal: 10, lateral: 5, gbr: 12, insImp: 15, insDent: 8 },
    { month: '2월', surg1: 38, implantTotal: 40, osstem: 20, dentium: 12, straumann: 8, crestal: 8, lateral: 4, gbr: 10, insImp: 12, insDent: 10 },
    { month: '3월', surg1: 45, implantTotal: 50, osstem: 30, dentium: 15, straumann: 5, crestal: 12, lateral: 6, gbr: 15, insImp: 18, insDent: 12 },
    { month: '4월', surg1: 52, implantTotal: 58, osstem: 35, dentium: 18, straumann: 5, crestal: 15, lateral: 8, gbr: 18, insImp: 22, insDent: 15 },
    { month: '5월', surg1: 48, implantTotal: 52, osstem: 30, dentium: 15, straumann: 7, crestal: 14, lateral: 7, gbr: 16, insImp: 20, insDent: 14 },
    { month: '6월', surg1: 55, implantTotal: 62, osstem: 40, dentium: 15, straumann: 7, crestal: 18, lateral: 10, gbr: 22, insImp: 25, insDent: 18 },
    { month: '7월', surg1: 50, implantTotal: 55, osstem: 32, dentium: 15, straumann: 8, crestal: 16, lateral: 8, gbr: 18, insImp: 24, insDent: 16 },
    { month: '8월', surg1: 46, implantTotal: 50, osstem: 28, dentium: 15, straumann: 7, crestal: 15, lateral: 7, gbr: 15, insImp: 21, insDent: 15 },
    { month: '9월', surg1: 58, implantTotal: 65, osstem: 40, dentium: 20, straumann: 5, crestal: 20, lateral: 10, gbr: 25, insImp: 28, insDent: 20 },
    { month: '10월', surg1: 62, implantTotal: 70, osstem: 45, dentium: 20, straumann: 5, crestal: 22, lateral: 12, gbr: 28, insImp: 30, insDent: 22 },
    { month: '11월', surg1: 54, implantTotal: 60, osstem: 35, dentium: 20, straumann: 5, crestal: 19, lateral: 9, gbr: 20, insImp: 26, insDent: 19 },
    { month: '12월', surg1: 68, implantTotal: 75, osstem: 50, dentium: 20, straumann: 5, crestal: 25, lateral: 15, gbr: 32, insImp: 35, insDent: 25 },
];

const TreatmentAnalysis = () => {
    const [half, setHalf] = useState('first');
    const [subTab, setSubTab] = useState('implant');
    const [perfData, setPerfData] = useState(MOCK_TREATMENT_DATA);

    useEffect(() => {
        const saved = localStorage.getItem('treatment_performance_data');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length === 12) setPerfData(parsed);
            } catch (e) { console.error("Data load error:", e); }
        }
    }, []);

    const currentHalfData = useMemo(() => {
        if (half === 'all') return perfData;
        return half === 'first' ? perfData.slice(0, 6) : perfData.slice(6, 12);
    }, [half, perfData]);

    const renderTabContent = () => {
        switch (subTab) {
            case 'implant':
                return (
                    <div className="tab-pane">
                        <div className="dashboard-stack">
                            {/* 상단 2분할 차트 */}
                            <div className="dashboard-grid">
                                <DashboardCard 
                                    title="임플란트 사용개수 합계" 
                                    subtitle={`${half === 'first' ? '상반기' : half === 'second' ? '하반기' : '전체'} 사용량 추이`}
                                >
                                    <div style={{ height: 350, width: '100%' }}>
                                        <ResponsiveContainer>
                                            <BarChart data={currentHalfData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                                <YAxis tick={{ fontSize: 12 }} />
                                                <Tooltip contentStyle={{ borderRadius: '12px' }} />
                                                <Bar dataKey="implantTotal" name="총 사용개수" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                                                    <LabelList dataKey="implantTotal" position="top" style={{ fontSize: 11, fontWeight: 700 }} />
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </DashboardCard>

                                <DashboardCard 
                                    title="종류 및 수술법별 사용량" 
                                    subtitle="임플란트 종류 / Crestal, Lateral, GBR"
                                >
                                    <div style={{ height: 350, width: '100%' }}>
                                        <ResponsiveContainer>
                                            <BarChart data={currentHalfData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                                <YAxis tick={{ fontSize: 12 }} />
                                                <Tooltip contentStyle={{ borderRadius: '12px' }} />
                                                <Legend verticalAlign="top" height={36} />
                                                {/* 종류별 */}
                                                <Bar dataKey="osstem" name="오스템" fill="#3b82f6" stackId="type" />
                                                <Bar dataKey="dentium" name="덴티움" fill="#10b981" stackId="type" />
                                                <Bar dataKey="straumann" name="스트라우만" fill="#f59e0b" stackId="type" />
                                                {/* 수술법별 */}
                                                <Bar dataKey="crestal" name="Crestal" fill="#ef4444" stackId="method" />
                                                <Bar dataKey="lateral" name="Lateral" fill="#8b5cf6" stackId="method" />
                                                <Bar dataKey="gbr" name="GBR" fill="#ec4899" stackId="method" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </DashboardCard>
                            </div>

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
                                                <td className="font-bold" style={{ fontSize: '1.1rem' }}>{currentHalfData.reduce((s,d)=>s+d.implantTotal, 0)}개</td>
                                            </tr>
                                            <tr>
                                                <td className="row-header"><span className="marker blue"></span> 오스템</td>
                                                {currentHalfData.map(d => <td key={d.month}>{d.osstem}개</td>)}
                                                <td>{currentHalfData.reduce((s,d)=>s+d.osstem, 0)}개</td>
                                            </tr>
                                            <tr>
                                                <td className="row-header"><span className="marker green"></span> 덴티움</td>
                                                {currentHalfData.map(d => <td key={d.month}>{d.dentium}개</td>)}
                                                <td>{currentHalfData.reduce((s,d)=>s+d.dentium, 0)}개</td>
                                            </tr>
                                            <tr>
                                                <td className="row-header"><span className="marker orange"></span> 스트라우만</td>
                                                {currentHalfData.map(d => <td key={d.month}>{d.straumann}개</td>)}
                                                <td>{currentHalfData.reduce((s,d)=>s+d.straumann, 0)}개</td>
                                            </tr>
                                            <tr><td colSpan={currentHalfData.length + 2} style={{ height: 1, padding: 0, background: 'var(--border-color)' }}></td></tr>
                                            <tr>
                                                <td className="row-header"><FileText size={14} /> Crestal</td>
                                                {currentHalfData.map(d => <td key={d.month}>{d.crestal}개</td>)}
                                                <td>{currentHalfData.reduce((s,d)=>s+d.crestal, 0)}개</td>
                                            </tr>
                                            <tr>
                                                <td className="row-header"><FileText size={14} /> Lateral</td>
                                                {currentHalfData.map(d => <td key={d.month}>{d.lateral}개</td>)}
                                                <td>{currentHalfData.reduce((s,d)=>s+d.lateral, 0)}개</td>
                                            </tr>
                                            <tr>
                                                <td className="row-header"><FileText size={14} /> GBR</td>
                                                {currentHalfData.map(d => <td key={d.month}>{d.gbr}개</td>)}
                                                <td>{currentHalfData.reduce((s,d)=>s+d.gbr, 0)}개</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </DashboardCard>
                        </div>
                    </div>
                );
            case 'insurance':
                return (
                    <div className="tab-pane">
                        <div className="dashboard-stack">
                            <DashboardCard title="보험 임플란트 / 보험 틀니 추이">
                                <div style={{ height: 400, width: '100%' }}>
                                    <ResponsiveContainer>
                                        <BarChart data={currentHalfData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                            <YAxis tick={{ fontSize: 12 }} />
                                            <Tooltip contentStyle={{ borderRadius: '12px' }} />
                                            <Legend verticalAlign="top" align="right" height={36} />
                                            <Bar dataKey="insImp" name="보험 임플란트" fill="#10b981" radius={[4, 4, 0, 0]} stackId="a" />
                                            <Bar dataKey="insDent" name="보험 틀니" fill="#f59e0b" radius={[4, 4, 0, 0]} stackId="a" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </DashboardCard>

                            <DashboardCard title="보험 진료 상세 통계">
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
                                            <tr>
                                                <td className="row-header"><span className="marker green"></span> 보험 임플란트</td>
                                                {currentHalfData.map(d => <td key={d.month}>{d.insImp}건</td>)}
                                                <td className="font-bold">{currentHalfData.reduce((s,d)=>s+d.insImp, 0)}건</td>
                                            </tr>
                                            <tr>
                                                <td className="row-header"><span className="marker orange"></span> 보험 틀니</td>
                                                {currentHalfData.map(d => <td key={d.month}>{d.insDent}건</td>)}
                                                <td className="font-bold">{currentHalfData.reduce((s,d)=>s+d.insDent, 0)}건</td>
                                            </tr>
                                            <tr className="highlight-row">
                                                <td className="row-header font-bold"><PlusCircle size={14} /> 보험 진료 합계</td>
                                                {currentHalfData.map(d => <td key={d.month} className="font-bold">{(d.insImp + d.insDent)}건</td>)}
                                                <td className="font-bold" style={{ fontSize: '1.1rem' }}>{currentHalfData.reduce((s,d)=>s+(d.insImp+d.insDent), 0)}건</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </DashboardCard>
                        </div>
                    </div>
                );
            default: return null;
        }
    };

    return (
        <div className="treatment-analysis-page">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
                <div>
                    <h1>진료분석</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>수술 건수 및 보험 진료 현황을 분석합니다.</p>
                </div>
                <div className="period-tabs">
                    <button className={half === 'first' ? 'active' : ''} onClick={() => setHalf('first')}>상반기</button>
                    <button className={half === 'second' ? 'active' : ''} onClick={() => setHalf('second')}>하반기</button>
                    <button className={half === 'all' ? 'active' : ''} onClick={() => setHalf('all')}>전체</button>
                </div>
            </header>

            <nav className="tab-navigation">
                <ul className="tab-list">
                    <li className={subTab === 'implant' ? 'active' : ''} onClick={() => setSubTab('implant')}>
                        <Activity size={20} />
                        <span>임플란트 1차 수술</span>
                    </li>
                    <li className={subTab === 'insurance' ? 'active' : ''} onClick={() => setSubTab('insurance')}>
                        <ShieldCheck size={20} />
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
