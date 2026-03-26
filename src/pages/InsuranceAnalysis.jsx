import React, { useState, useEffect } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar
} from 'recharts';
import DashboardCard from '../components/DashboardCard';

const claimData = [
    { month: '8월', amount: 8500000 },
    { month: '9월', amount: 9200000 },
    { month: '10월', amount: 8800000 },
    { month: '11월', amount: 10500000 },
    { month: '12월', amount: 12000000 },
    { month: '1월', amount: 11000000 },
];

const feeStats = [
    { code: '기본진찰', count: 450, amount: 4500000 },
    { code: '파노라마', count: 120, amount: 2400000 },
    { code: '구내취영', count: 80, amount: 800000 },
    { code: '치석제거', count: 150, amount: 6000000 },
    { code: '침윤마취', count: 200, amount: 1000000 },
];

const InsuranceAnalysis = () => {
    const [comment, setComment] = useState('');

    const formatCurrency = (val) => typeof val === 'number' ? new Intl.NumberFormat('ko-KR').format(val) : val;
    const formatCurrencyWon = (val) => typeof val === 'number' ? new Intl.NumberFormat('ko-KR').format(val) + '원' : val;

    useEffect(() => {
        const saved = localStorage.getItem('arcdent_insurance_comment');
        if (saved) setComment(saved);
    }, []);

    const handleSave = () => {
        localStorage.setItem('arcdent_insurance_comment', comment);
        alert('보험청구분석 코멘트가 저장되었습니다.');
    };

    return (
        <div className="analysis-page">
            <header className="page-header">
                <h1>보험청구분석</h1>
                <p>보험 청구 및 수가 통계를 분석합니다.</p>
            </header>

            <div className="dashboard-grid">
                <div className="grid-col-2">
                    <DashboardCard title="총 청구액 현황" subtitle="단위: 원">
                        <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={claimData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                                <XAxis dataKey="month" stroke="var(--text-secondary)" fontSize={11} />
                                <YAxis stroke="var(--text-secondary)" fontSize={11} width={85} tickFormatter={formatCurrency} />
                                <Tooltip formatter={formatCurrencyWon} contentStyle={{ backgroundColor: 'var(--card-bg)', borderRadius: '8px' }} />
                                <Line type="monotone" dataKey="amount" name="청구액" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </DashboardCard>
                </div>

                <DashboardCard title="보험수가 빈도" subtitle="상위 5개 항목">
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={feeStats}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                            <XAxis dataKey="code" stroke="var(--text-secondary)" fontSize={9} />
                            <YAxis stroke="var(--text-secondary)" fontSize={11} />
                            <Tooltip />
                            <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30} />
                        </BarChart>
                    </ResponsiveContainer>
                </DashboardCard>

                <DashboardCard title="보험수가 청구액" subtitle="항목별 합계 (단위: 원)">
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={feeStats} layout="vertical" margin={{ left: 10, right: 20 }}>
                            <XAxis type="number" hide />
                            <YAxis dataKey="code" type="category" stroke="var(--text-secondary)" fontSize={9} width={50} />
                            <Tooltip formatter={formatCurrencyWon} />
                            <Bar dataKey="amount" name="청구액" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                    </ResponsiveContainer>
                </DashboardCard>
            </div>

            <div className="comment-area" style={{ marginTop: '0.75rem' }}>
                <DashboardCard title="분석 코멘트" subtitle="보험 효율 관리">
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

export default InsuranceAnalysis;
