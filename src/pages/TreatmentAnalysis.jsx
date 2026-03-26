import React, { useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import DashboardCard from '../components/DashboardCard';

const treatmentData = [
    { month: '8월', surg1: 45, insImp: 25, insDent: 15 },
    { month: '9월', surg1: 52, insImp: 30, insDent: 18 },
    { month: '10월', surg1: 48, insImp: 28, insDent: 20 },
    { month: '11월', surg1: 65, insImp: 35, insDent: 22 },
    { month: '12월', surg1: 72, insImp: 42, insDent: 25 },
    { month: '1월', surg1: 68, insImp: 38, insDent: 24 },
];

const TreatmentAnalysis = () => {
    const [comment, setComment] = useState('');

    useEffect(() => {
        const saved = localStorage.getItem('arcdent_treatment_comment');
        if (saved) setComment(saved);
    }, []);

    const handleSave = () => {
        localStorage.setItem('arcdent_treatment_comment', comment);
        alert('진료분석 코멘트가 저장되었습니다.');
    };

    return (
        <div className="analysis-page">
            <header className="page-header">
                <h1>진료분석</h1>
                <p>수술 및 보험 진료 현황을 분석합니다.</p>
            </header>

            <div className="dashboard-grid">
                <div className="grid-col-2">
                    <DashboardCard title="월별 진료 통계" subtitle="임플란트 및 보험">
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={treatmentData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                                <XAxis dataKey="month" stroke="var(--text-secondary)" fontSize={11} />
                                <YAxis stroke="var(--text-secondary)" fontSize={11} />
                                <Tooltip contentStyle={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)', borderRadius: '8px' }} />
                                <Legend iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                                <Bar dataKey="surg1" name="임플란트 1차" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="insImp" name="보험 임플란트" fill="#10b981" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="insDent" name="보험 틀니" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </DashboardCard>
                </div>

                <DashboardCard title="보험 진료 비율" subtitle="6개월 합계">
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart
                            data={[
                                { name: '보험 임플란트', value: 160 },
                                { name: '보험 틀니', value: 120 },
                            ]}
                            layout="vertical"
                        >
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" fontSize={11} width={100} />
                            <Tooltip contentStyle={{ backgroundColor: 'var(--card-bg)', borderRadius: '8px' }} />
                            <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={25} />
                        </BarChart>
                    </ResponsiveContainer>
                </DashboardCard>
            </div>

            <div className="comment-area" style={{ marginTop: '0.75rem' }}>
                <DashboardCard title="분석 코멘트" subtitle="특이사항">
                    <textarea
                        className="analysis-textarea"
                        placeholder="코멘트..."
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        style={textareaStyle}
                    />
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

export default TreatmentAnalysis;
