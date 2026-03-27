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
    { month: '1월', surg1: 42, insImp: 15, insDent: 8, total: 65 },
    { month: '2월', surg1: 38, insImp: 12, insDent: 10, total: 60 },
    { month: '3월', surg1: 45, insImp: 18, insDent: 12, total: 75 },
    { month: '4월', surg1: 52, insImp: 22, insDent: 15, total: 89 },
    { month: '5월', surg1: 48, insImp: 20, insDent: 14, total: 82 },
    { month: '6월', surg1: 55, insImp: 25, insDent: 18, total: 98 },
    { month: '7월', surg1: 50, insImp: 24, insDent: 16, total: 90 },
    { month: '8월', surg1: 46, insImp: 21, insDent: 15, total: 82 },
    { month: '9월', surg1: 58, insImp: 28, insDent: 20, total: 106 },
    { month: '10월', surg1: 62, insImp: 30, insDent: 22, total: 114 },
    { month: '11월', surg1: 54, insImp: 26, insDent: 19, total: 99 },
    { month: '12월', surg1: 68, insImp: 35, insDent: 25, total: 128 },
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
                            <DashboardCard 
                                title="임플란트 1차 수술 건수 추이" 
                                subtitle={`${half === 'first' ? '상반기' : half === 'second' ? '하반기' : '전체'} 수술 통계`}
                            >
                                <div style={{ height: 400, width: '100%' }}>
                                    <ResponsiveContainer>
                                        <ComposedChart data={currentHalfData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                            <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="var(--text-secondary)" />
                                            <YAxis tick={{ fontSize: 12 }} stroke="var(--text-secondary)" />
                                            <Tooltip 
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                                            />
                                            <Legend verticalAlign="top" align="right" height={36} />
                                            <Area type="monotone" dataKey="surg1" name="수술 건수 (배경)" fill="#3b82f6" fillOpacity={0.05} stroke="none" />
                                            <Bar dataKey="surg1" name="임플란트 1차 수술" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40}>
                                                <LabelList dataKey="surg1" position="top" style={{ fontSize: 12, fontWeight: 600, fill: '#3b82f6' }} />
                                            </Bar>
                                            <Line type="monotone" dataKey="surg1" name="추세선" stroke="#2563eb" strokeWidth={2} dot={{ r: 4, fill: '#2563eb' }} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            </DashboardCard>

                            <DashboardCard title="월별 상세 진료 횟수">
                                <div className="treatment-data-table-container">
                                    <table className="treatment-data-table">
                                        <thead>
                                            <tr>
                                                <th className="row-header">구분</th>
                                                {currentHalfData.map(d => <th key={d.month}>{d.month}</th>)}
                                                <th>평균/합계</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr className="highlight-row">
                                                <td className="row-header"><span className="marker blue"></span> 임플란트 1차 수술</td>
                                                {currentHalfData.map(d => <td key={d.month}>{d.surg1}건</td>)}
                                                <td className="font-bold">{(currentHalfData.reduce((s,d)=>s+d.surg1, 0)/currentHalfData.length).toFixed(1)}건</td>
                                            </tr>
                                            <tr>
                                                <td className="row-header"><TrendingUp size={14} /> 전월대비 증감</td>
                                                {currentHalfData.map((d, i) => {
                                                    const prev = currentHalfData[i-1]?.surg1 || d.surg1;
                                                    const diff = d.surg1 - prev;
                                                    return (
                                                        <td key={d.month} style={{ color: diff > 0 ? '#ef4444' : diff < 0 ? '#3b82f6' : 'inherit' }}>
                                                            {diff > 0 ? '+' : ''}{diff}건
                                                        </td>
                                                    );
                                                })}
                                                <td>-</td>
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
