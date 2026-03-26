import React, { useState, useEffect } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, ComposedChart, LabelList, PieChart, Pie, Cell, Line,
  ScatterChart, Scatter, ZAxis
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart3, PieChart as PieIcon, UserPlus, UserCheck, 
  Award, Activity, FileText, TrendingUp, DollarSign, 
  Users, ChevronRight, Calculator, Calendar
} from 'lucide-react';
import DashboardCard from '../components/DashboardCard';
import './SalesAnalysis.css';

// --- MOCK DATA (100% Matching Structure) ---
const MOCK_DATA = [
  { month: '1월', netSales: 32000000, insurance: 8000000, total: 40000000, cash: 10000000, card: 22000000, other: 8000000, newPatient: 120, agreed: 85, newPatientSales: 12000000, doctorData: { '김원장': 15000000, '이원장': 12000000, '박원장': 5000000 } },
  { month: '2월', netSales: 35000000, insurance: 9000000, total: 44000000, cash: 11000000, card: 24000000, other: 9000000, newPatient: 140, agreed: 95, newPatientSales: 15000000, doctorData: { '김원장': 16000000, '이원장': 14000000, '박원장': 5000000 } },
  { month: '3월', netSales: 31000000, insurance: 8500000, total: 39500000, cash: 10000000, card: 21000000, other: 8500000, newPatient: 110, agreed: 75, newPatientSales: 11000000, doctorData: { '김원장': 14000000, '이원장': 12000000, '박원장': 5000000 } },
  { month: '4월', netSales: 42000000, insurance: 11000000, total: 53000000, cash: 13000000, card: 29000000, other: 11000000, newPatient: 180, agreed: 120, newPatientSales: 20000000, doctorData: { '김원장': 20000000, '이원장': 15000000, '박원장': 7000000 } },
  { month: '5월', netSales: 40000000, insurance: 10500000, total: 50500000, cash: 12500000, card: 27500000, other: 10500000, newPatient: 160, agreed: 110, newPatientSales: 18000000, doctorData: { '김원장': 18000000, '이원장': 15000000, '박원장': 7000000 } },
  { month: '6월', netSales: 48000000, insurance: 13000000, total: 61000000, cash: 15000000, card: 33000000, other: 13000000, newPatient: 210, agreed: 150, newPatientSales: 25000000, doctorData: { '김원장': 22000000, '이원장': 18000000, '박원장': 8000000 } },
  { month: '7월', netSales: 45000000, insurance: 12000000, total: 57000000, cash: 14000000, card: 31000000, other: 12000000, newPatient: 190, agreed: 130, newPatientSales: 19000000, doctorData: { '김원장': 20000000, '이원장': 17000000, '박원장': 8000000 } },
  { month: '8월', netSales: 49000000, insurance: 13000000, total: 62000000, cash: 15500000, card: 33500000, other: 13000000, newPatient: 220, agreed: 160, newPatientSales: 22000000, doctorData: { '김원장': 22000000, '이원장': 19000000, '박원장': 8000000 } },
  { month: '9월', netSales: 42000000, insurance: 11500000, total: 53500000, cash: 13000000, card: 29000000, other: 11500000, newPatient: 180, agreed: 120, newPatientSales: 18000000, doctorData: { '김원장': 19000000, '이원장': 16000000, '박원장': 7000000 } },
  { month: '10월', netSales: 51000000, insurance: 14000000, total: 65000000, cash: 16000000, card: 35000000, other: 14000000, newPatient: 230, agreed: 170, newPatientSales: 23000000, doctorData: { '김원장': 23000000, '이원장': 20000000, '박원장': 8000000 } },
  { month: '11월', netSales: 48000000, insurance: 13500000, total: 61500000, cash: 15000000, card: 33000000, other: 13500000, newPatient: 210, agreed: 150, newPatientSales: 21000000, doctorData: { '김원장': 22000000, '이원장': 18500000, '박원장': 7500000 } },
  { month: '12월', netSales: 55000000, insurance: 16000000, total: 71000000, cash: 17500000, card: 37500000, other: 16000000, newPatient: 260, agreed: 190, newPatientSales: 26000000, doctorData: { '김원장': 25000000, '이원장': 21000000, '박원장': 9000000 } }
];

const SalesAnalysis = () => {
  const [half, setHalf] = useState('first');
  const [subTab, setSubTab] = useState('total'); // 기본탭: 총 매출 현황
  const [salesData, setSalesData] = useState(MOCK_DATA);
  const [agreedPatients, setAgreedPatients] = useState([]);
  const [comment, setComment] = useState('상반기 매출이 전년 대비 15% 성장하였습니다. 특히 4월과 6월 임플란트 패키지 프로모션으로 인한 순매출 증대가 두드러집니다. 하반기에는 리콜 환자 관리를 통한 재내원율 향상이 주요 과제입니다.');

  useEffect(() => {
    // 1. 매출 데이터 로드
    const savedSales = localStorage.getItem('parsed_sales_data');
    if (savedSales) {
      try {
        const parsed = JSON.parse(savedSales);
        if (Array.isArray(parsed) && parsed.length === 12) setSalesData(parsed);
      } catch (e) { console.error(e); }
    }

    // 2. 동의환자 데이터 로드
    const savedAgreed = localStorage.getItem('treatment_plan_data');
    if (savedAgreed) {
      try { setAgreedPatients(JSON.parse(savedAgreed)); } catch (e) { console.error(e); }
    }

    // Storage 이벤트 리스너
    const handleStorageChange = (e) => {
      if (e.key === 'parsed_sales_data' || e.key === 'treatment_plan_data') {
        window.location.reload();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const currentHalfData = half === 'first' ? salesData.slice(0, 6) : salesData.slice(6, 12);
  
  // --- 공통 통계 계산 ---
  const totalAgreed = agreedPatients.reduce((sum, p) => sum + (Number(p.contractAmount) || 0), 0);
  const totalPaid = agreedPatients.reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0);
  const collectionRate = totalAgreed > 0 ? ((totalPaid / totalAgreed) * 100).toFixed(1) : 0;

  // --- 의사별 데이터 집계 ---
  const aggregatedDoctorData = {};
  currentHalfData.forEach(month => {
    if (month.doctorData) {
      Object.entries(month.doctorData).forEach(([name, amount]) => {
        aggregatedDoctorData[name] = (aggregatedDoctorData[name] || 0) + amount;
      });
    }
  });
  const doctorChartData = Object.entries(aggregatedDoctorData)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);

  // --- 진료비 상위 환자 (최근 월 기준) ---
  const topPatients = (currentHalfData[currentHalfData.length - 1]?.topPatients || []).slice(0, 20);

  // --- 탭별 렌더링 로직 (7개 탭) ---
  const renderTabContent = () => {
    switch (subTab) {
      case 'total': // 1. 총 매출 현황
        return (
          <div className="tab-pane active">
            <div className="dashboard-stack">
              <DashboardCard title="월별 매출 추합 및 목표 대비">
                <ResponsiveContainer width="100%" height={350}>
                  <ComposedChart data={currentHalfData} margin={{ left: 30, right: 30, top: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                    <XAxis dataKey="month" stroke="var(--text-secondary)" tick={{ dy: 10 }} />
                    <YAxis 
                      stroke="var(--text-secondary)" 
                      width={80}
                      tickFormatter={(v) => `${Math.floor(v/10000).toLocaleString()}만`} 
                    />
                    <Tooltip formatter={(v) => `${v.toLocaleString()}원`} contentStyle={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)', borderRadius: '12px' }} />
                    <Legend verticalAlign="top" height={36}/>
                    <Bar dataKey="netSales" name="순매출" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40}>
                      <LabelList 
                        dataKey="netSales" 
                        position="top" 
                        offset={10}
                        formatter={(v) => v > 0 ? `${Math.floor(v/10000).toLocaleString()}만` : ''} 
                        style={{ fill: '#3b82f6', fontWeight: 'bold', fontSize: '13px' }} 
                      />
                    </Bar>
                    <Bar dataKey="insurance" name="보험청구" fill="#93c5fd" radius={[4, 4, 0, 0]} barSize={40} />
                    <Line type="monotone" dataKey="total" name="총합계" stroke="#f59e0b" strokeWidth={3} dot={{ r: 5, fill: '#f59e0b' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </DashboardCard>
              
              <DashboardCard title="매출 통계 상세 지표">
                <div className="sales-data-table-container">
                  <table className="sales-data-table">
                    <thead>
                      <tr>
                        <th className="row-header">구분</th>
                        {currentHalfData.map(d => <th key={d.month}>{d.month}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="row-header"><span className="marker blue"></span> 순매출</td>
                        {currentHalfData.map(d => <td key={d.month}>{(d.netSales/10000).toLocaleString()}만</td>)}
                      </tr>
                      <tr>
                        <td className="row-header"><span className="marker green"></span> 보험청구</td>
                        {currentHalfData.map(d => <td key={d.month}>{(d.insurance/10000).toLocaleString()}만</td>)}
                      </tr>
                      <tr className="font-bold">
                        <td className="row-header"><span className="marker-yellow"></span> 총매출</td>
                        {currentHalfData.map(d => <td key={d.month}>{(d.total/10000).toLocaleString()}만</td>)}
                      </tr>
                      <tr>
                        <td className="row-header"><TrendingUp size={14} /> 신환 수</td>
                        {currentHalfData.map(d => <td key={d.month}>{d.newPatient || 0}</td>)}
                      </tr>
                      <tr>
                        <td className="row-header"><Activity size={14} /> 동의 건수</td>
                        {currentHalfData.map(d => <td key={d.month}>{d.agreed || 0}</td>)}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </DashboardCard>
            </div>
          </div>
        );

      case 'payment': // 2. 결제 분포도
        return (
          <div className="tab-pane active">
            <div className="dashboard-grid">
              <DashboardCard title="결제 수단별 매출 비중">
                <ResponsiveContainer width="100%" height={450}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: '카드', value: currentHalfData.reduce((a, b) => a + (b.card || 0), 0), color: '#3b82f6' },
                        { name: '현금', value: currentHalfData.reduce((a, b) => a + (b.cash || 0), 0), color: '#10b981' },
                        { name: '기타/이체', value: currentHalfData.reduce((a, b) => a + (b.other || 0), 0), color: '#f59e0b' }
                      ]}
                      cx="50%" cy="50%" innerRadius={100} outerRadius={150} paddingAngle={5} dataKey="value" stroke="none"
                    >
                      {[0,1,2].map((i) => <Cell key={i} fill={['#3b82f6','#10b981','#f59e0b'][i]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => `${v.toLocaleString()}원`} />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </DashboardCard>
              <DashboardCard title="결제 수단별 세부 금액">
                <div className="table-responsive">
                    <table className="analysis-table">
                        <thead>
                            <tr>
                                <th>결제수단</th>
                                <th>금액</th>
                                <th>비율</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>카드 수입</td>
                                <td>{currentHalfData.reduce((a, b) => a + (b.card || 0), 0).toLocaleString()}원</td>
                                <td>{((currentHalfData.reduce((a,b)=>a+(b.card||0),0) / currentHalfData.reduce((a,b)=>a+(b.netSales||0),1)) * 100).toFixed(1)}%</td>
                            </tr>
                            <tr>
                                <td>현금 수입</td>
                                <td>{currentHalfData.reduce((a, b) => a + (b.cash || 0), 0).toLocaleString()}원</td>
                                <td>{((currentHalfData.reduce((a,b)=>a+(b.cash||0),0) / currentHalfData.reduce((a,b)=>a+(b.netSales||0),1)) * 100).toFixed(1)}%</td>
                            </tr>
                            <tr>
                                <td>기타 수입</td>
                                <td>{currentHalfData.reduce((a, b) => a + (b.other || 0), 0).toLocaleString()}원</td>
                                <td>{((currentHalfData.reduce((a,b)=>a+(b.other||0),0) / currentHalfData.reduce((a,b)=>a+(b.netSales||0),1)) * 100).toFixed(1)}%</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
              </DashboardCard>
            </div>
          </div>
        );

      case 'newPatient': // 3. 신환수익 비교
        return (
          <div className="tab-pane active">
            <DashboardCard title="월별 신환 매출 기여도 비교">
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={currentHalfData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                  <XAxis dataKey="month" stroke="var(--text-secondary)" />
                  <YAxis stroke="var(--text-secondary)" />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="netSales" name="전체 순매출" stroke="#3b82f6" fillOpacity={0.1} fill="#3b82f6" />
                  <Area type="monotone" dataKey="newPatientSales" name="신환 매출" stroke="#8b5cf6" fillOpacity={0.3} fill="#8b5cf6" />
                </AreaChart>
              </ResponsiveContainer>
            </DashboardCard>
          </div>
        );

      case 'agreed': // 4. 동의환자 수납액
        return (
          <div className="tab-pane active">
            <div className="stats-header-grid" style={{ marginBottom: '1.5rem' }}>
              <div className="stat-card">
                <span className="label">계약금액 합계</span>
                <span className="value">{totalAgreed.toLocaleString()}원</span>
              </div>
              <div className="stat-card">
                <span className="label">현재수납액 합계</span>
                <span className="value">{totalPaid.toLocaleString()}원</span>
              </div>
              <div className="stat-card">
                <span className="label">수납률</span>
                <span className="value highlight">{collectionRate}%</span>
              </div>
            </div>
            <DashboardCard title="치료비용계획 및 수납 현황 상세">
              <div className="table-responsive">
                <table className="analysis-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>환자정보</th>
                      <th>작성일</th>
                      <th>진행상태</th>
                      <th>수납상태</th>
                      <th style={{ textAlign: 'right' }}>계약금액</th>
                      <th style={{ textAlign: 'right' }}>현재수납액</th>
                      <th style={{ textAlign: 'right' }}>잔액</th>
                      <th>최종내원</th>
                      <th>다음 예약</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agreedPatients.length > 0 ? agreedPatients.map((p, idx) => (
                      <tr key={idx}>
                        <td>{idx + 1}</td>
                        <td>{p.patientName}</td>
                        <td>{p.createdAt}</td>
                        <td>{p.status}</td>
                        <td>{p.payStatus}</td>
                        <td style={{ textAlign: 'right' }}>{(Number(p.contractAmount) || 0).toLocaleString()}원</td>
                        <td style={{ textAlign: 'right' }}>{(Number(p.paidAmount) || 0).toLocaleString()}원</td>
                        <td style={{ textAlign: 'right' }}>{(Number(p.contractAmount - p.paidAmount) || 0).toLocaleString()}원</td>
                        <td>{p.lastVisit}</td>
                        <td>{p.nextAppt}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan="10" className="empty-state">업로드된 데이터가 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </DashboardCard>
          </div>
        );

      case 'topFee': // 5. 진료비 상위
        return (
          <div className="tab-pane active">
            <DashboardCard title="진료비 수납 상위 환자 (TOP 10)">
              <div className="table-responsive">
                <table className="analysis-table">
                  <thead>
                    <tr>
                      <th>순위</th>
                      <th>차트번호</th>
                      <th>성명</th>
                      <th>담당의</th>
                      <th style={{ textAlign: 'right' }}>총 수납액</th>
                      <th>내원경로</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topPatients.length > 0 ? topPatients.map((p, idx) => (
                      <tr key={idx}>
                        <td>{idx + 1}</td>
                        <td>{p.chartNo}</td>
                        <td>{p.name}</td>
                        <td>{p.doctor}</td>
                        <td style={{ textAlign: 'right' }}>{p.totalPaid.toLocaleString()}원</td>
                        <td>{p.path}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan="6" className="empty-state">데이터가 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </DashboardCard>
          </div>
        );

      case 'doctor': // 6. 매출분석(의사)
        return (
          <div className="tab-pane active">
            <DashboardCard title="의사별 매출 기여도 분석">
              <ResponsiveContainer width="100%" height={450}>
                <BarChart data={doctorChartData} layout="vertical" margin={{ left: 40, right: 120 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--border-color)" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} stroke="var(--text-secondary)" width={100} />
                  <Tooltip formatter={(v) => `${v.toLocaleString()}원`} />
                  <Bar dataKey="amount" name="매출액" fill="#10b981" radius={[0, 4, 4, 0]} barSize={35}>
                    <LabelList 
                      dataKey="amount" position="right" 
                      formatter={(val, entry, index) => {
                        const lbl = `${(val/10000).toLocaleString()}만`;
                        return index < 3 ? `${doctorChartData[index].name} (${lbl})` : lbl;
                      }}
                      style={{ fill: '#065f46', fontWeight: 'bold', fontSize: '13px' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </DashboardCard>
          </div>
        );

      case 'summary': // 7. 매출 분석 정리
        return (
          <div className="tab-pane active">
             <div className="dashboard-grid">
                <DashboardCard title="데이터 기반 종합 분석 리포트">
                    <div className="report-container" style={{ padding: '1rem' }}>
                        <div className="ai-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#6366f1', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', marginBottom: '1rem' }}>
                            <Activity size={14} /> AI 분석 서비스
                        </div>
                        <p style={{ fontSize: '1.05rem', lineHeight: '1.8', color: 'var(--text-primary)' }}>{comment}</p>
                        
                        <div className="divider" style={{ margin: '2rem 0', height: '1px', background: 'var(--border-color)' }}></div>
                        
                        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>매출 증대를 위한 주요 제언</h3>
                        <ul className="recommendation-list">
                            <li><TrendingUp size={16} /> 신환 상담 동의율이 74%로 양호하나, 고액 치료 계획의 분할 납부 옵션 강화 제안</li>
                            <li><Users size={16} /> 하반기 리콜 환자 예약율을 10% 높일 경우 매출액 4,500만원 추가 확보 가능</li>
                            <li><DollarSign size={16} /> 카드 결제 편중 현상 해결을 위한 현금 영수증 프로모션 검토 필요</li>
                        </ul>
                    </div>
                </DashboardCard>
             </div>
          </div>
        );

      default: return null;
    }
  };

  return (
    <div className="sales-analysis-page">
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>매출 분석 대시보드</h1>
            <p>치과의 주요 경영 지표와 매출 통계를 한눈에 확인합니다.</p>
          </div>
          <div className="period-tabs">
            <button className={half === 'first' ? 'active' : ''} onClick={() => setHalf('first')}>상반기</button>
            <button className={half === 'second' ? 'active' : ''} onClick={() => setHalf('second')}>하반기</button>
          </div>
        </div>
      </div>

      <nav className="tab-navigation">
        <ul className="tab-list">
          {[
            { id: 'total', label: '총 매출 현황', icon: <BarChart3 size={18} /> },
            { id: 'payment', label: '결제 분포도', icon: <PieIcon size={18} /> },
            { id: 'newPatient', label: '신환수익 비교', icon: <UserPlus size={18} /> },
            { id: 'agreed', label: '동의환자 수납액', icon: <UserCheck size={18} /> },
            { id: 'topFee', label: '진료비 상위', icon: <Award size={18} /> },
            { id: 'doctor', label: '매출분석(의사)', icon: <Activity size={18} /> },
            { id: 'summary', label: '매출 분석 정리', icon: <FileText size={18} /> }
          ].map(tab => (
            <li key={tab.id} className={subTab === tab.id ? 'active' : ''} onClick={() => setSubTab(tab.id)}>
              {tab.icon}
              <span>{tab.label}</span>
            </li>
          ))}
        </ul>
      </nav>

      <div className="tab-content" style={{ marginTop: '2rem' }}>
        <AnimatePresence mode="wait">
            <motion.div
                key={subTab}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
            >
                {renderTabContent()}
            </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default SalesAnalysis;