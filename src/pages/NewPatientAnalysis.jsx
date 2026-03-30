import React, { useState, useEffect } from 'react';
import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { Calendar, ChevronDown } from 'lucide-react';
import DashboardCard from '../components/DashboardCard';
import './SalesAnalysis.css'; // 연도 선택 드롭다운 스타일 재사용

const sourceData = [
    { name: '지인소개', value: 35, color: '#3b82f6' },
    { name: '네이버예약', value: 25, color: '#10b981' },
    { name: '블로그/SNS', value: 20, color: '#f59e0b' },
    { name: '간판/외부', value: 15, color: '#ec4899' },
    { name: '기타', value: 5, color: '#8b5cf6' },
];

const ageData = [
    { range: '10대', count: 45 },
    { range: '20대', count: 120 },
    { range: '30대', count: 180 },
    { range: '40대', count: 150 },
    { range: '50대', count: 90 },
    { range: '60대+', count: 60 },
];

const NewPatientAnalysis = () => {
    const [comment, setComment] = useState('');
    const [selectedYear, setSelectedYear] = useState('2025');
    const [availableYears, setAvailableYears] = useState(['2025']);
    const [isYearOpen, setIsYearOpen] = useState(false);
    const [half, setHalf] = useState('all');

    useEffect(() => {
        const savedComment = localStorage.getItem('arcdent_new_patient_comment');
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
    };

    const handleSave = () => {
        localStorage.setItem('arcdent_new_patient_comment', comment);
        alert('신환분석 코멘트가 저장되었습니다.');
    };

    return (
        <div className="analysis-page">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1>신환분석</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>환자 유입 경로를 분석합니다.</p>
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
                <DashboardCard title="내원경로 현황" subtitle="유입 경로별 비중">
                    <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                            <Pie data={sourceData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} dataKey="value">
                                {sourceData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                            </Pie>
                            <Tooltip />
                            <Legend verticalAlign="bottom" height={20} iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                        </PieChart>
                    </ResponsiveContainer>
                </DashboardCard>

                <DashboardCard title="연령별 현황" subtitle="신환 연령 분포">
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={ageData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                            <XAxis dataKey="range" stroke="var(--text-secondary)" fontSize={11} />
                            <YAxis stroke="var(--text-secondary)" fontSize={11} />
                            <Tooltip contentStyle={{ backgroundColor: 'var(--card-bg)', borderRadius: '8px' }} />
                            <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={25} />
                        </BarChart>
                    </ResponsiveContainer>
                </DashboardCard>

                <div className="grid-col-2">
                    <DashboardCard title="경로별 상세" subtitle="최근 6개월 누적">
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={sourceData} layout="vertical">
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" fontSize={11} width={80} />
                                <Tooltip contentStyle={{ backgroundColor: 'var(--card-bg)', borderRadius: '8px' }} />
                                <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </DashboardCard>
                </div>
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

export default NewPatientAnalysis;
