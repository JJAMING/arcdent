import React, { useState, useEffect } from 'react';
import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import DashboardCard from '../components/DashboardCard';

const agreementData = [
    { name: '동의', value: 85, fill: '#10b981' },
    { name: '미동의', value: 15, fill: '#f43f5e' },
];

const consultantPerformance = [
    { name: '김실장', rate: 88 },
    { name: '이팀장', rate: 82 },
    { name: '박실장', rate: 90 },
];

const reasonData = [
    { name: '비용부담', value: 45 },
    { name: '시간부족', value: 25 },
    { name: '타치과비교', value: 20 },
    { name: '기타', value: 10 },
];

const stats = [
    { label: '전체 상담', value: '450건', color: '#6366f1' },
    { label: '평균 동의율', value: '85%', color: '#10b981' },
    { label: '동의 금액', value: '3.2억', color: '#f59e0b' },
];

const ConsultationAnalysis = () => {
    const [comment, setComment] = useState('');

    useEffect(() => {
        const saved = localStorage.getItem('arcdent_consultation_comment');
        if (saved) setComment(saved);
    }, []);

    const handleSave = () => {
        localStorage.setItem('arcdent_consultation_comment', comment);
        alert('상담분석 코멘트가 저장되었습니다.');
    };

    return (
        <div className="analysis-page">
            <header className="page-header">
                <h1>상담분석</h1>
                <p>동의율과 담당자 성과를 분석합니다.</p>
            </header>

            <div className="stats-row" style={{ gap: '0.75rem', marginBottom: '1rem' }}>
                {stats.map((s, i) => (
                    <div key={i} className="stat-card" style={{ borderLeft: `3px solid ${s.color}`, padding: '0.75rem 1rem' }}>
                        <span className="stat-label" style={{ fontSize: '0.75rem' }}>{s.label}</span>
                        <span className="stat-value" style={{ fontSize: '1.1rem' }}>{s.value}</span>
                    </div>
                ))}
            </div>

            <div className="dashboard-grid">
                <DashboardCard title="동의 현황" subtitle="상담 결과 분포">
                    <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                            <Pie data={agreementData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={4} dataKey="value">
                                {agreementData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                            </Pie>
                            <Tooltip />
                            <Legend verticalAlign="bottom" height={20} iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                        </PieChart>
                    </ResponsiveContainer>
                </DashboardCard>

                <DashboardCard title="상담자별 동의율" subtitle="실장/팀장 성과 (%)">
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={consultantPerformance}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                            <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={11} />
                            <YAxis stroke="var(--text-secondary)" fontSize={11} domain={[0, 100]} />
                            <Tooltip contentStyle={{ backgroundColor: 'var(--card-bg)', borderRadius: '8px' }} />
                            <Bar dataKey="rate" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={35} />
                        </BarChart>
                    </ResponsiveContainer>
                </DashboardCard>

                <div className="grid-col-2">
                    <DashboardCard title="미동의 원인" subtitle="환자 피드백 집계">
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={reasonData} layout="vertical">
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" fontSize={11} width={80} />
                                <Tooltip contentStyle={{ backgroundColor: 'var(--card-bg)', borderRadius: '8px' }} />
                                <Bar dataKey="value" fill="#f43f5e" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </DashboardCard>
                </div>
            </div>

            <div className="comment-area" style={{ marginTop: '0.75rem' }}>
                <DashboardCard title="분석 코멘트" subtitle="상담 품질 개선 기록">
                    <textarea className="analysis-textarea" placeholder="코멘트..." value={comment} onChange={(e) => setComment(e.target.value)} style={textareaStyle} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                        <button style={saveBtnStyle} onClick={handleSave}>저장</button>
                    </div>
                </DashboardCard>
            </div>
        </div>
    );
};

const textareaStyle = { width: '100%', minHeight: '60px', padding: '0.75rem', borderRadius: '0.6rem', backgroundColor: 'var(--bg-color)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', fontSize: '0.9rem', resize: 'none', lineHeight: '1.4', outline: 'none' };
const saveBtnStyle = { padding: '0.4rem 1.25rem', borderRadius: '0.4rem', backgroundColor: 'var(--accent-primary)', color: 'white', fontWeight: '600', fontSize: '0.85rem', cursor: 'pointer' };

export default ConsultationAnalysis;
