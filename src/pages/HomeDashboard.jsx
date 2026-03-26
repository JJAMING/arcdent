import React, { useState, useEffect } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend, BarChart, Bar
} from 'recharts';
import DashboardCard from '../components/DashboardCard';

const salesData = [
    { month: '11월', amount: 65000000 },
    { month: '12월', amount: 78000000 },
    { month: '1월', amount: 72000000 },
];

const patientData = [
    { name: '신환', value: 22, color: '#3b82f6' },
    { name: '재내원', value: 78, color: '#10b981' },
];

const consultationData = [
    { name: '상담 건수', value: 450 },
    { name: '동의 건수', value: 382 },
];

const HomeDashboard = () => {
    const [comment, setComment] = useState('');

    const formatCurrency = (val) => typeof val === 'number' ? new Intl.NumberFormat('ko-KR').format(val) : val;
    const formatCurrencyWon = (val) => typeof val === 'number' ? new Intl.NumberFormat('ko-KR').format(val) + '원' : val;

    useEffect(() => {
        const saved = localStorage.getItem('arcdent_home_comment');
        if (saved) setComment(saved);
    }, []);

    const handleSave = () => {
        localStorage.setItem('arcdent_home_comment', comment);
        alert('대시보드 코멘트가 저장되었습니다.');
    };

    return (
        <div className="analysis-page">
            <header className="page-header">
                <h1>종합 대시보드</h1>
                <p>병원의 주요 지표를 전반적으로 분석합니다.</p>
            </header>

            <div className="stats-row">
                <div className="stat-card" style={{ borderLeft: '4px solid #3b82f6' }}>
                    <span className="stat-label">당월 총 매출</span>
                    <span className="stat-value">72,000,000원</span>
                </div>
                <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
                    <span className="stat-label">당월 내원 환자</span>
                    <span className="stat-value">1,720명</span>
                </div>
                <div className="stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
                    <span className="stat-label">상담 동의율</span>
                    <span className="stat-value">85%</span>
                </div>
                <div className="stat-card" style={{ borderLeft: '4px solid #ec4899' }}>
                    <span className="stat-label">신환 비중</span>
                    <span className="stat-value">22%</span>
                </div>
            </div>

            <div className="dashboard-grid">
                <div className="grid-col-2">
                    <DashboardCard title="매출 추이" subtitle="최근 3개월 (원)">
                        <ResponsiveContainer width="100%" height={200}>
                            <AreaChart data={salesData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                                <XAxis dataKey="month" stroke="var(--text-secondary)" fontSize={11} />
                                <YAxis stroke="var(--text-secondary)" fontSize={11} width={85} tickFormatter={formatCurrency} />
                                <Tooltip formatter={formatCurrencyWon} contentStyle={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)', borderRadius: '8px' }} />
                                <Area type="monotone" dataKey="amount" name="매출액" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </DashboardCard>
                </div>

                <DashboardCard title="환자 구성" subtitle="신객 vs 재내원">
                    <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                            <Pie
                                data={patientData}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={70}
                                paddingAngle={4}
                                dataKey="value"
                            >
                                {patientData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend verticalAlign="bottom" height={20} iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                        </PieChart>
                    </ResponsiveContainer>
                </DashboardCard>

                <DashboardCard title="상담 성과" subtitle="평균 동의 현황">
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={consultationData}>
                            <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={11} />
                            <YAxis stroke="var(--text-secondary)" fontSize={11} />
                            <Tooltip contentStyle={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)', borderRadius: '8px' }} />
                            <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={30} />
                        </BarChart>
                    </ResponsiveContainer>
                </DashboardCard>
            </div>

            <div className="comment-area" style={{ marginTop: '1.25rem' }}>
                <DashboardCard title="분석 코멘트" subtitle="주요 특이사항">
                    <textarea
                        className="analysis-textarea"
                        placeholder="코멘트를 입력하세요..."
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        style={textareaStyle}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                        <button style={saveBtnStyle} onClick={handleSave}>저장</button>
                    </div>
                </DashboardCard>
            </div>
        </div>
    );
};

const textareaStyle = { width: '100%', minHeight: '80px', padding: '1rem', borderRadius: '0.75rem', backgroundColor: 'var(--bg-color)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', fontSize: '0.95rem', fontFamily: 'inherit', resize: 'none', lineHeight: '1.5', outline: 'none' };
const saveBtnStyle = { padding: '0.5rem 1.5rem', borderRadius: '0.5rem', backgroundColor: 'var(--accent-primary)', color: 'white', fontWeight: '600', fontSize: '0.9rem', cursor: 'pointer' };

export default HomeDashboard;
