import React, { useState, useEffect, useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, LabelList
} from 'recharts';
import {
    Calendar, ChevronDown, Users, UserPlus, UserCheck,
    Wrench, PlusCircle, Stethoscope, RefreshCw
} from 'lucide-react';
import DashboardCard from '../components/DashboardCard';
import './TreatmentAnalysis.css';
import './SalesAnalysis.css';

// ── Mock 데이터 ────────────────────────────────────────────────────────────────
const MOCK_PATIENT_DATA = [
    { month: '1월',  workDays: 22, newPt: 45, oldPt: 380, total: 425, doc1: 150, doc2: 120, doc3: 95, doc4: 60, lab_crown: 18, lab_bridge: 8, lab_denture: 3, lab_implant: 12, lab_etc: 5 },
    { month: '2월',  workDays: 20, newPt: 38, oldPt: 350, total: 388, doc1: 138, doc2: 112, doc3: 88, doc4: 50, lab_crown: 14, lab_bridge: 6, lab_denture: 4, lab_implant: 10, lab_etc: 3 },
    { month: '3월',  workDays: 21, newPt: 52, oldPt: 400, total: 452, doc1: 160, doc2: 130, doc3: 102, doc4: 60, lab_crown: 20, lab_bridge: 9, lab_denture: 5, lab_implant: 14, lab_etc: 6 },
    { month: '4월',  workDays: 22, newPt: 60, oldPt: 430, total: 490, doc1: 175, doc2: 140, doc3: 110, doc4: 65, lab_crown: 22, lab_bridge: 10, lab_denture: 4, lab_implant: 16, lab_etc: 7 },
    { month: '5월',  workDays: 21, newPt: 55, oldPt: 410, total: 465, doc1: 168, doc2: 132, doc3: 105, doc4: 60, lab_crown: 19, lab_bridge: 8, lab_denture: 5, lab_implant: 15, lab_etc: 5 },
    { month: '6월',  workDays: 20, newPt: 62, oldPt: 450, total: 512, doc1: 185, doc2: 150, doc3: 115, doc4: 62, lab_crown: 24, lab_bridge: 11, lab_denture: 6, lab_implant: 18, lab_etc: 8 },
    { month: '7월',  workDays: 23, newPt: 57, oldPt: 420, total: 477, doc1: 172, doc2: 138, doc3: 108, doc4: 59, lab_crown: 21, lab_bridge: 9, lab_denture: 4, lab_implant: 15, lab_etc: 6 },
    { month: '8월',  workDays: 20, newPt: 48, oldPt: 390, total: 438, doc1: 158, doc2: 125, doc3: 98, doc4: 57, lab_crown: 17, lab_bridge: 7, lab_denture: 3, lab_implant: 13, lab_etc: 4 },
    { month: '9월',  workDays: 21, newPt: 65, oldPt: 460, total: 525, doc1: 190, doc2: 155, doc3: 118, doc4: 62, lab_crown: 25, lab_bridge: 12, lab_denture: 6, lab_implant: 20, lab_etc: 9 },
    { month: '10월', workDays: 22, newPt: 70, oldPt: 480, total: 550, doc1: 200, doc2: 160, doc3: 125, doc4: 65, lab_crown: 28, lab_bridge: 13, lab_denture: 7, lab_implant: 22, lab_etc: 10 },
    { month: '11월', workDays: 20, newPt: 58, oldPt: 440, total: 498, doc1: 180, doc2: 145, doc3: 112, doc4: 61, lab_crown: 22, lab_bridge: 10, lab_denture: 5, lab_implant: 17, lab_etc: 7 },
    { month: '12월', workDays: 21, newPt: 75, oldPt: 500, total: 575, doc1: 210, doc2: 168, doc3: 132, doc4: 65, lab_crown: 30, lab_bridge: 14, lab_denture: 8, lab_implant: 25, lab_etc: 11 },
];

const DOCTOR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899'];
const DOCTOR_KEYS   = ['doc1', 'doc2', 'doc3', 'doc4'];
const DOCTOR_NAMES  = ['원장', '부원장', '페닥1', '페닥2'];

const LAB_SERIES = [
    { key: 'lab_crown',   name: '크라운',    color: '#6366f1' },
    { key: 'lab_bridge',  name: '브릿지',    color: '#10b981' },
    { key: 'lab_denture', name: '틀니',      color: '#f59e0b' },
    { key: 'lab_implant', name: '임플란트',  color: '#3b82f6' },
    { key: 'lab_etc',     name: '기타',      color: '#94a3b8' },
];

// ── 실데이터 병합 헬퍼 (모듈 레벨 — 컴포넌트 밖) ──────────────────────────
const buildMergedData = (year) => {
    try {
        const raw = localStorage.getItem('patient_ledger_data');
        if (!raw) return MOCK_PATIENT_DATA;
        const ledger = JSON.parse(raw);
        const yearData = ledger[year] || {};
        if (Object.keys(yearData).length === 0) return MOCK_PATIENT_DATA;
        return MOCK_PATIENT_DATA.map((mock) => {
            const real = yearData[mock.month];
            if (!real) return mock;
            return {
                ...mock,
                workDays: real.workDays != null ? real.workDays : mock.workDays,
                newPt:    real.newPt    != null ? real.newPt    : mock.newPt,
                oldPt:    real.oldPt    != null ? real.oldPt    : mock.oldPt,
                total:    real.total    != null ? real.total    : mock.total,
                avgNewPt: real.avgNewPt != null ? real.avgNewPt : null,
                avgOldPt: real.avgOldPt != null ? real.avgOldPt : null,
            };
        });
    } catch (e) {
        console.error('[PatientAnalysis] buildMergedData 오류:', e);
        return MOCK_PATIENT_DATA;
    }
};

// ── 컴포넌트 ────────────────────────────────────────────────────────────────
const PatientAnalysis = () => {

    const [half, setHalf] = useState('all');
    const [subTab, setSubTab] = useState('newOld');
    const [selectedYear, setSelectedYear] = useState('2025');
    const [availableYears, setAvailableYears] = useState(['2025']);
    const [isYearOpen, setIsYearOpen] = useState(false);
    const [refreshTick, setRefreshTick] = useState(0);

    // lazy initializer: 마운트 즉시 localStorage 읽기
    const [patientData, setPatientData] = useState(() => buildMergedData('2025'));


    // localStorage 실데이터 로드 (연도 변경·강제새로고침·커스텀 이벤트 대응)
    useEffect(() => {
        const loadData = () => {
            // 연도 목록 구성
            let years = ['2025'];
            try {
                const s = localStorage.getItem('parsed_sales_data');
                if (s) {
                    const ys = Object.keys(JSON.parse(s)).sort((a, b) => b - a);
                    if (ys.length > 0) years = ys;
                }
                const raw = localStorage.getItem('patient_ledger_data');
                if (raw) {
                    const ly = Object.keys(JSON.parse(raw));
                    years = Array.from(new Set([...years, ...ly])).sort((a, b) => b - a);
                }
            } catch (e) { /* ignore */ }
            setAvailableYears(years);

            // buildMergedData로 실데이터 병합
            setPatientData(buildMergedData(selectedYear));
        };


        loadData();

        // Admin 저장 시 커스텀 이벤트 감지
        const handleLedgerUpdate = () => loadData();
        window.addEventListener('patientLedgerUpdated', handleLedgerUpdate);

        // 탭 전환 복귀 시 재로드
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') loadData();
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            window.removeEventListener('patientLedgerUpdated', handleLedgerUpdate);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [selectedYear, refreshTick]);


    const currentHalfData = useMemo(() => {
        if (half === 'all') return patientData;
        return half === 'first' ? patientData.slice(0, 6) : patientData.slice(6, 12);
    }, [half, patientData]);

    const renderTabContent = () => {
        switch (subTab) {

            // ── 탭 1: 총 환자수 (신환 / 구환) ────────────────────────────
            case 'newOld': {
                const totalNew = currentHalfData.reduce((s, d) => s + d.newPt, 0);
                const totalOld = currentHalfData.reduce((s, d) => s + d.oldPt, 0);
                const totalAll = currentHalfData.reduce((s, d) => s + d.total, 0);

                return (
                    <div className="tab-pane">
                        <div className="dashboard-stack">
                            {/* 요약 KPI 카드 3개 */}
                            <div className="patient-kpi-row">
                                <div className="patient-kpi-card kpi-total">
                                    <span className="kpi-label">총 환자 합계</span>
                                    <span className="kpi-value">{totalAll.toLocaleString()}명</span>
                                    <span className="kpi-sub">{half === 'first' ? '상반기' : half === 'second' ? '하반기' : '전체'}</span>
                                </div>
                                <div className="patient-kpi-card kpi-new">
                                    <span className="kpi-label">신환 합계</span>
                                    <span className="kpi-value">{totalNew.toLocaleString()}명</span>
                                    <span className="kpi-sub">비율 {((totalNew / totalAll) * 100).toFixed(1)}%</span>
                                </div>
                                <div className="patient-kpi-card kpi-old">
                                    <span className="kpi-label">구환 합계</span>
                                    <span className="kpi-value">{totalOld.toLocaleString()}명</span>
                                    <span className="kpi-sub">비율 {((totalOld / totalAll) * 100).toFixed(1)}%</span>
                                </div>
                            </div>

                            {/* 차트 영역 */}
                            <div className="dashboard-grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
                                {/* 막대 차트 */}
                                <DashboardCard title="월별 환자수 추이" subtitle="신환 · 구환 · 총합">
                                    <div style={{ height: 320, width: '100%' }}>
                                        <ResponsiveContainer>
                                            <BarChart data={currentHalfData} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                                <YAxis tick={{ fontSize: 12 }} width={42} />
                                                <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} formatter={(v, name) => [`${v}명`, name]} />
                                                <Legend verticalAlign="top" height={32} iconType="square" wrapperStyle={{ fontSize: '11px' }} />
                                                <Bar dataKey="oldPt" name="구환" fill="#6366f1" maxBarSize={40} radius={[3,3,0,0]}>
                                                    <LabelList dataKey="oldPt" position="top" style={{ fontSize: 10, fill: '#6366f1', fontWeight: 700 }} />
                                                </Bar>
                                                <Bar dataKey="newPt" name="신환" fill="#22c55e" maxBarSize={40} radius={[3,3,0,0]}>
                                                    <LabelList dataKey="newPt" position="top" style={{ fontSize: 10, fill: '#22c55e', fontWeight: 700 }} />
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </DashboardCard>

                                {/* 파이차트 */}
                                <DashboardCard title="신환 / 구환 비율" subtitle="전체 기간">
                                    <div style={{ height: 280, width: '100%' }}>
                                        <ResponsiveContainer>
                                            <PieChart>
                                                <Pie
                                                    data={[
                                                        { name: '신환', value: totalNew },
                                                        { name: '구환', value: totalOld },
                                                    ]}
                                                    cx="50%" cy="50%"
                                                    innerRadius={55} outerRadius={85}
                                                    paddingAngle={4}
                                                    dataKey="value"
                                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                                                    labelLine={false}
                                                >
                                                    <Cell fill="#22c55e" />
                                                    <Cell fill="#6366f1" />
                                                </Pie>
                                                <Tooltip formatter={(v) => [`${v}명`]} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </DashboardCard>
                            </div>

                            {/* 상세 테이블 + 일평균 테이블 나란히 */}
                            <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                {/* 좌: 상세 데이터 */}
                                <DashboardCard title="신환 / 구환 상세 데이터">
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
                                                    <td className="row-header" style={{ borderLeft: '3px solid #94a3b8' }}>진료일수</td>
                                                    {currentHalfData.map(d => <td key={d.month}>{d.workDays || '-'}일</td>)}
                                                    <td className="font-bold">{currentHalfData.reduce((s, d) => s + (d.workDays || 0), 0)}일</td>
                                                </tr>
                                                <tr>
                                                    <td className="row-header">
                                                        <span style={{ display:'inline-block', width:10, height:10, borderRadius:'2px', background:'#22c55e', marginRight:6, verticalAlign:'middle' }} />
                                                        신환
                                                    </td>
                                                    {currentHalfData.map(d => <td key={d.month}>{d.newPt}명</td>)}
                                                    <td className="font-bold">{totalNew}명</td>
                                                </tr>
                                                <tr>
                                                    <td className="row-header">
                                                        <span style={{ display:'inline-block', width:10, height:10, borderRadius:'2px', background:'#6366f1', marginRight:6, verticalAlign:'middle' }} />
                                                        구환
                                                    </td>
                                                    {currentHalfData.map(d => <td key={d.month}>{d.oldPt}명</td>)}
                                                    <td className="font-bold">{totalOld}명</td>
                                                </tr>
                                                <tr className="highlight-row">
                                                    <td className="row-header"><PlusCircle size={14} /> 총 접수환자수</td>
                                                    {currentHalfData.map(d => <td key={d.month} className="font-bold">{d.total}명</td>)}
                                                    <td className="font-bold" style={{ fontSize: '1.05rem' }}>{totalAll}명</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </DashboardCard>

                                {/* 우: 일평균 환자수 */}
                                <DashboardCard title="일평균 환자수" subtitle="총 접수환자수 ÷ 진료일수">
                                    <div className="treatment-data-table-container">
                                        <table className="treatment-data-table">
                                            <thead>
                                                <tr>
                                                    <th className="row-header">구분</th>
                                                    {currentHalfData.map(d => <th key={d.month}>{d.month}</th>)}
                                                    <th>평균</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    <td className="row-header" style={{ borderLeft: '3px solid #94a3b8' }}>진료일수</td>
                                                    {currentHalfData.map(d => <td key={d.month}>{d.workDays || '-'}일</td>)}
                                                    <td className="font-bold">
                                                        {(currentHalfData.reduce((s, d) => s + (d.workDays || 0), 0) / currentHalfData.length).toFixed(1)}일
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td className="row-header">
                                                        <span style={{ display:'inline-block', width:10, height:10, borderRadius:'2px', background:'#22c55e', marginRight:6, verticalAlign:'middle' }} />
                                                        신환 일평균
                                                    </td>
                                                    {currentHalfData.map(d => {
                                                        // 실데이터(avgNewPt) 우선, 없으면 계산
                                                        const avg = (d.avgNewPt != null)
                                                            ? parseFloat(d.avgNewPt).toFixed(1)
                                                            : d.workDays ? (d.newPt / d.workDays).toFixed(1) : '-';
                                                        return <td key={d.month}>{avg}명</td>;
                                                    })}
                                                    <td className="font-bold">
                                                        {(() => {
                                                            const totalDays = currentHalfData.reduce((s, d) => s + (d.workDays || 0), 0);
                                                            return totalDays ? (totalNew / totalDays).toFixed(1) : '-';
                                                        })()}명
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td className="row-header">
                                                        <span style={{ display:'inline-block', width:10, height:10, borderRadius:'2px', background:'#6366f1', marginRight:6, verticalAlign:'middle' }} />
                                                        구환 일평균
                                                    </td>
                                                    {currentHalfData.map(d => {
                                                        // 실데이터(avgOldPt) 우선, 없으면 계산
                                                        const avg = (d.avgOldPt != null)
                                                            ? parseFloat(d.avgOldPt).toFixed(1)
                                                            : d.workDays ? (d.oldPt / d.workDays).toFixed(1) : '-';
                                                        return <td key={d.month}>{avg}명</td>;
                                                    })}
                                                    <td className="font-bold">
                                                        {(() => {
                                                            const totalDays = currentHalfData.reduce((s, d) => s + (d.workDays || 0), 0);
                                                            return totalDays ? (totalOld / totalDays).toFixed(1) : '-';
                                                        })()}명
                                                    </td>
                                                </tr>
                                                <tr className="highlight-row">
                                                    <td className="row-header"><PlusCircle size={14} /> 총 일평균</td>
                                                    {currentHalfData.map(d => {
                                                        const avg = d.workDays ? (d.total / d.workDays).toFixed(1) : '-';
                                                        return <td key={d.month} className="font-bold">{avg}명</td>;
                                                    })}
                                                    <td className="font-bold" style={{ fontSize: '1.05rem' }}>
                                                        {(() => {
                                                            const totalDays = currentHalfData.reduce((s, d) => s + (d.workDays || 0), 0);
                                                            return totalDays ? (totalAll / totalDays).toFixed(1) : '-';
                                                        })()}명
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </DashboardCard>
                            </div>
                        </div>
                    </div>
                );
            }

            // ── 탭 2: 총 환자수 (의사별) ─────────────────────────────────
            case 'byDoctor': {
                const docSeries = DOCTOR_KEYS.map((key, i) => ({
                    key, name: DOCTOR_NAMES[i], color: DOCTOR_COLORS[i]
                }));
                const doctorTotals = docSeries.map(({ key, name, color }) => ({
                    name, total: currentHalfData.reduce((s, d) => s + (d[key] || 0), 0), color
                }));

                return (
                    <div className="tab-pane">
                        <div className="dashboard-stack">
                            <div className="dashboard-grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
                                {/* 좌: 의사별 그룹 바차트 */}
                                <DashboardCard title="의사별 월간 환자수" subtitle="담당 의사 기준">
                                    <div style={{ height: 350, width: '100%' }}>
                                        <ResponsiveContainer>
                                            <BarChart data={currentHalfData} margin={{ top: 24, right: 12, left: 0, bottom: 0 }} barCategoryGap="12%" barGap={2}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                                <YAxis tick={{ fontSize: 12 }} width={42} />
                                                <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} formatter={(v, name) => [`${v}명`, name]} />
                                                <Legend verticalAlign="top" height={36} iconType="square" wrapperStyle={{ fontSize: '11px' }} />
                                                {docSeries.map(({ key, name, color }) => (
                                                    <Bar key={key} dataKey={key} name={name} fill={color} maxBarSize={34} radius={[3,3,0,0]}>
                                                        <LabelList dataKey={key} position="top" style={{ fontSize: 9, fill: color, fontWeight: 700 }} />
                                                    </Bar>
                                                ))}
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </DashboardCard>

                                {/* 우: 의사별 파이차트 */}
                                <DashboardCard title="의사별 비중" subtitle="기간 합계 기준">
                                    <div style={{ height: 280, width: '100%' }}>
                                        <ResponsiveContainer>
                                            <PieChart>
                                                <Pie
                                                    data={doctorTotals}
                                                    cx="50%" cy="50%"
                                                    innerRadius={50} outerRadius={80}
                                                    paddingAngle={4}
                                                    dataKey="total"
                                                >
                                                    {doctorTotals.map((entry, i) => (
                                                        <Cell key={i} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip formatter={(v, name) => [`${v}명`, name]} />
                                                <Legend verticalAlign="bottom" height={20} iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </DashboardCard>
                            </div>

                            {/* 상세 테이블 */}
                            <DashboardCard title="의사별 환자수 상세 데이터">
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
                                                <td className="row-header"><PlusCircle size={14} /> 전체 합계</td>
                                                {currentHalfData.map(d => <td key={d.month} className="font-bold">{d.total}명</td>)}
                                                <td className="font-bold" style={{ fontSize: '1.05rem' }}>{currentHalfData.reduce((s, d) => s + d.total, 0)}명</td>
                                            </tr>
                                            {docSeries.map(({ key, name, color }) => (
                                                <tr key={key}>
                                                    <td className="row-header">
                                                        <span style={{ display:'inline-block', width:10, height:10, borderRadius:'2px', background:color, marginRight:6, verticalAlign:'middle' }} />
                                                        {name}
                                                    </td>
                                                    {currentHalfData.map(d => <td key={d.month}>{d[key] || 0}명</td>)}
                                                    <td className="font-bold">{currentHalfData.reduce((s, d) => s + (d[key] || 0), 0)}명</td>
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

            // ── 탭 3: 기공물 의뢰 현황 ───────────────────────────────────
            case 'labRequest': {
                const totalByLab = LAB_SERIES.map(({ key, name, color }) => ({
                    name, total: currentHalfData.reduce((s, d) => s + (d[key] || 0), 0), color
                }));
                const grandTotal = totalByLab.reduce((s, v) => s + v.total, 0);

                return (
                    <div className="tab-pane">
                        <div className="dashboard-stack">
                            {/* KPI 요약 */}
                            <div className="patient-kpi-row">
                                {totalByLab.map(({ name, total, color }) => (
                                    <div key={name} className="patient-kpi-card" style={{ borderTop: `3px solid ${color}` }}>
                                        <span className="kpi-label">{name}</span>
                                        <span className="kpi-value" style={{ color }}>{total}건</span>
                                        <span className="kpi-sub">비율 {((total / grandTotal) * 100).toFixed(1)}%</span>
                                    </div>
                                ))}
                            </div>

                            <div className="dashboard-grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
                                {/* 좌: 월별 종류 그룹 바차트 */}
                                <DashboardCard title="기공물 종류별 월간 의뢰 현황" subtitle="크라운 · 브릿지 · 틀니 · 임플란트 · 기타">
                                    <div style={{ height: 350, width: '100%' }}>
                                        <ResponsiveContainer>
                                            <BarChart data={currentHalfData} margin={{ top: 24, right: 12, left: 0, bottom: 0 }} barCategoryGap="10%" barGap={2}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                                <YAxis tick={{ fontSize: 12 }} width={36} />
                                                <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} formatter={(v, name) => [`${v}건`, name]} />
                                                <Legend verticalAlign="top" height={36} iconType="square" wrapperStyle={{ fontSize: '11px' }} />
                                                {LAB_SERIES.map(({ key, name, color }) => (
                                                    <Bar key={key} dataKey={key} name={name} fill={color} maxBarSize={34} radius={[3,3,0,0]}>
                                                        <LabelList dataKey={key} position="top" style={{ fontSize: 9, fill: color, fontWeight: 700 }} />
                                                    </Bar>
                                                ))}
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </DashboardCard>

                                {/* 우: 기공물 비중 파이 */}
                                <DashboardCard title="기공물 비중" subtitle="기간 합계 기준">
                                    <div style={{ height: 280, width: '100%' }}>
                                        <ResponsiveContainer>
                                            <PieChart>
                                                <Pie data={totalByLab} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="total">
                                                    {totalByLab.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                                                </Pie>
                                                <Tooltip formatter={(v, name) => [`${v}건`, name]} />
                                                <Legend verticalAlign="bottom" height={20} iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </DashboardCard>
                            </div>

                            {/* 상세 테이블 */}
                            <DashboardCard title="기공물 의뢰 상세 데이터">
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
                                                <td className="row-header"><PlusCircle size={14} /> 전체 합계</td>
                                                {currentHalfData.map(d => {
                                                    const t = LAB_SERIES.reduce((s, { key }) => s + (d[key] || 0), 0);
                                                    return <td key={d.month} className="font-bold">{t}건</td>;
                                                })}
                                                <td className="font-bold" style={{ fontSize: '1.05rem' }}>{grandTotal}건</td>
                                            </tr>
                                            {LAB_SERIES.map(({ key, name, color }) => (
                                                <tr key={key}>
                                                    <td className="row-header">
                                                        <span style={{ display:'inline-block', width:10, height:10, borderRadius:'2px', background:color, marginRight:6, verticalAlign:'middle' }} />
                                                        {name}
                                                    </td>
                                                    {currentHalfData.map(d => <td key={d.month}>{d[key] || 0}건</td>)}
                                                    <td className="font-bold">{currentHalfData.reduce((s, d) => s + (d[key] || 0), 0)}건</td>
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

            default: return null;
        }
    };

    return (
        <div className="treatment-analysis-page">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1>환자분석</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        신환 · 구환 · 의사별 · 기공물 의뢰 현황을 분석합니다.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                    {/* 연도 선택 */}
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
                                        onClick={() => { setSelectedYear(year); setIsYearOpen(false); }}
                                    >
                                        {year}년
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 상/하반기 탭 */}
                    <div className="period-tabs">
                        <button className={half === 'all' ? 'active' : ''} onClick={() => setHalf('all')}>전체보기</button>
                        <button className={half === 'first' ? 'active' : ''} onClick={() => setHalf('first')}>상반기</button>
                        <button className={half === 'second' ? 'active' : ''} onClick={() => setHalf('second')}>하반기</button>
                    </div>

                    {/* 데이터 새로고침 */}
                    <button
                        onClick={() => setRefreshTick(t => t + 1)}
                        title="데이터 새로고침"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            padding: '0.4rem 0.8rem', borderRadius: '0.5rem',
                            border: '1px solid var(--border-color)',
                            background: 'var(--card-bg)', color: 'var(--text-secondary)',
                            fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-primary)'; e.currentTarget.style.borderColor = 'var(--accent-primary)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                    >
                        🔄 새로고침
                    </button>
                </div>
            </header>

            {/* 서브탭 네비게이션 */}
            <nav className="tab-navigation">
                <ul className="tab-list">
                    <li className={subTab === 'newOld' ? 'active' : ''} onClick={() => setSubTab('newOld')}>
                        <Users size={20} />
                        <span>총 환자수 (신환/구환)</span>
                    </li>
                    <li className={subTab === 'byDoctor' ? 'active' : ''} onClick={() => setSubTab('byDoctor')}>
                        <Stethoscope size={20} />
                        <span>총 환자수 (의사)</span>
                    </li>
                    <li className={subTab === 'labRequest' ? 'active' : ''} onClick={() => setSubTab('labRequest')}>
                        <Wrench size={20} />
                        <span>기공물 의뢰 현황</span>
                    </li>
                </ul>
            </nav>

            {/* 탭 콘텐츠 */}
            <div className="tab-content">
                {renderTabContent()}
            </div>
        </div>
    );
};

export default PatientAnalysis;
