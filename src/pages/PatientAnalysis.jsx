import React, { useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import { Calendar, ChevronDown } from 'lucide-react';
import DashboardCard from '../components/DashboardCard';
import './SalesAnalysis.css'; // 연도 선택 드롭다운 스타일 재사용

const patientStats = [
    { month: '8월', total: 1450, daily: 58 },
    { month: '9월', total: 1520, daily: 61 },
    { month: '10월', total: 1480, daily: 59 },
    { month: '11월', total: 1650, daily: 66 },
    { month: '12월', total: 1820, daily: 71 },
    { month: '1월', total: 1720, daily: 68 },
];

const doctorData = [
    { name: '김원장', patients: 650, color: '#3b82f6' },
    { name: '이원장', patients: 480, color: '#10b981' },
    { name: '박원장', patients: 320, color: '#f59e0b' },
    { name: '최원장', patients: 270, color: '#ec4899' },
];

const PatientAnalysis = () => {
    const [comment, setComment] = useState('');
    const [selectedYear, setSelectedYear] = useState('2025');
    const [availableYears, setAvailableYears] = useState(['2025']);
    const [isYearOpen, setIsYearOpen] = useState(false);
    const [half, setHalf] = useState('all');

    useEffect(() => {
        const savedComment = localStorage.getItem('arcdent_patient_comment');
        if (savedComment) setComment(savedComment);

        const savedSales = localStorage.getItem('parsed_sales_data');
        if (savedSales) {
            try {
                const parsed = JSON.parse(savedSales);
                const years = Object.keys(parsed).sort((a, b) => b - a);
                setAvailableYears(years.length > 0 ? years : ['2025']);
            } catch (e) { console.error(e); }
        }
    }, []);

    const handleYearChange = (year) => {
        setSelectedYear(year);
        // 향후 연도별 데이터 필터링 로직 추가 가능
    };

    const handleSave = () => {
        localStorage.setItem('arcdent_patient_comment', comment);
        alert('환자분석 코멘트가 저장되었습니다.');
    };

    return (
        <div className="analysis-page">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1>환자분석</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>환자 유입 및 의사별 현황을 분석합니다.</p>
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

            <div className="dashboard-grid">
                <div className="grid-col-2">
                    <DashboardCard title="환자 수 및 일평균" subtitle="월간 방문 통계">
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={patientStats}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                                <XAxis dataKey="month" stroke="var(--text-secondary)" fontSize={11} />
                                <YAxis yAxisId="left" stroke="var(--text-secondary)" fontSize={11} />
                                <YAxis yAxisId="right" orientation="right" stroke="var(--text-secondary)" fontSize={11} />
                                <Tooltip contentStyle={{ backgroundColor: 'var(--card-bg)', borderRadius: '8px' }} />
                                <Legend iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                                <Bar yAxisId="left" dataKey="total" name="총 환자" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                <Bar yAxisId="right" dataKey="daily" name="일평균" fill="#10b981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </DashboardCard>
                </div>

                <DashboardCard title="의사별 분포" subtitle="진료 환자 비중">
                    <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                            <Pie data={doctorData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={4} dataKey="patients">
                                {doctorData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                            </Pie>
                            <Tooltip />
                            <Legend verticalAlign="bottom" height={20} iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                        </PieChart>
                    </ResponsiveContainer>
                </DashboardCard>

                <DashboardCard title="의사별 월간" subtitle="환자 수 실적">
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={doctorData}>
                            <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={11} />
                            <YAxis stroke="var(--text-secondary)" fontSize={11} />
                            <Tooltip />
                            <Bar dataKey="patients" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={35} />
                        </BarChart>
                    </ResponsiveContainer>
                </DashboardCard>
            </div>

            <div className="comment-area" style={{ marginTop: '0.75rem' }}>
                <DashboardCard title="분석 코멘트" subtitle="특이사항">
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

export default PatientAnalysis;
