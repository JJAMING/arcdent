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
  Users, ChevronRight, Calculator, Calendar, ChevronDown
} from 'lucide-react';
import DashboardCard from '../components/DashboardCard';
import './SalesAnalysis.css';

// --- MOCK DATA (100% Matching Structure) ---
const MOCK_DATA = [
  { month: '1월', netSales: 32000000, insurance: 8000000, total: 40000000, cash: 10000000, card: 22000000, other: 8000000, newPatient: 120, agreed: 85, newPatientSales: 12000000, doctorData: { '김원장': { pure: 15000000, insurance: 3000000 }, '이원장': { pure: 12000000, insurance: 3000000 }, '박원장': { pure: 5000000, insurance: 2000000 } } },
  { month: '2월', netSales: 35000000, insurance: 9000000, total: 44000000, cash: 11000000, card: 24000000, other: 9000000, newPatient: 140, agreed: 95, newPatientSales: 15000000, doctorData: { '김원장': { pure: 16000000, insurance: 4000000 }, '이원장': { pure: 14000000, insurance: 3000000 }, '박원장': { pure: 5000000, insurance: 2000000 } } },
  { month: '3월', netSales: 31000000, insurance: 8500000, total: 39500000, cash: 10000000, card: 21000000, other: 8500000, newPatient: 110, agreed: 75, newPatientSales: 11000000, doctorData: { '김원장': { pure: 14000000, insurance: 3500000 }, '이원장': { pure: 12000000, insurance: 3000000 }, '박원장': { pure: 5000000, insurance: 2000000 } } },
  { month: '4월', netSales: 42000000, insurance: 11000000, total: 53000000, cash: 13000000, card: 29000000, other: 11000000, newPatient: 180, agreed: 120, newPatientSales: 20000000, doctorData: { '김원장': { pure: 20000000, insurance: 5000000 }, '이원장': { pure: 15000000, insurance: 4000000 }, '박원장': { pure: 7000000, insurance: 2000000 } } },
  { month: '5월', netSales: 40000000, insurance: 10500000, total: 50500000, cash: 12500000, card: 27500000, other: 10500000, newPatient: 160, agreed: 110, newPatientSales: 18000000, doctorData: { '김원장': { pure: 18000000, insurance: 4500000 }, '이원장': { pure: 15000000, insurance: 4000000 }, '박원장': { pure: 7000000, insurance: 2000000 } } },
  { month: '6월', netSales: 48000000, insurance: 13000000, total: 61000000, cash: 15000000, card: 33000000, other: 13000000, newPatient: 210, agreed: 150, newPatientSales: 25000000, doctorData: { '김원장': { pure: 22000000, insurance: 6000000 }, '이원장': { pure: 18000000, insurance: 5000000 }, '박원장': { pure: 8000000, insurance: 2000000 } } },
  { month: '7월', netSales: 45000000, insurance: 12000000, total: 57000000, cash: 14000000, card: 31000000, other: 12000000, newPatient: 190, agreed: 130, newPatientSales: 19000000, doctorData: { '김원장': { pure: 20000000, insurance: 5500000 }, '이원장': { pure: 17000000, insurance: 4500000 }, '박원장': { pure: 8000000, insurance: 2000000 } } },
  { month: '8월', netSales: 49000000, insurance: 13000000, total: 62000000, cash: 15500000, card: 33500000, other: 13000000, newPatient: 220, agreed: 160, newPatientSales: 22000000, doctorData: { '김원장': { pure: 22000000, insurance: 6500000 }, '이원장': { pure: 19000000, insurance: 4500000 }, '박원장': { pure: 8000000, insurance: 2000000 } } },
  { month: '9월', netSales: 42000000, insurance: 11500000, total: 53500000, cash: 13000000, card: 29000000, other: 11500000, newPatient: 180, agreed: 120, newPatientSales: 18000000, doctorData: { '김원장': { pure: 19000000, insurance: 5000000 }, '이원장': { pure: 16000000, insurance: 4500000 }, '박원장': { pure: 7000000, insurance: 2000000 } } },
  { month: '10월', netSales: 51000000, insurance: 14000000, total: 65000000, cash: 16000000, card: 35000000, other: 14000000, newPatient: 230, agreed: 170, newPatientSales: 23000000, doctorData: { '김원장': { pure: 23000000, insurance: 7000000 }, '이원장': { pure: 20000000, insurance: 5000000 }, '박원장': { pure: 8000000, insurance: 2000000 } } },
  { month: '11월', netSales: 48000000, insurance: 13500000, total: 61500000, cash: 15000000, card: 33000000, other: 13500000, newPatient: 210, agreed: 150, newPatientSales: 21000000, doctorData: { '김원장': { pure: 22000000, insurance: 6000000 }, '이원장': { pure: 18500000, insurance: 5000000 }, '박원장': { pure: 7500000, insurance: 2500000 } } },
  { month: '12월', netSales: 55000000, insurance: 16000000, total: 71000000, cash: 17500000, card: 37500000, other: 16000000, newPatient: 260, agreed: 190, newPatientSales: 26000000, doctorData: { '김원장': { pure: 25000000, insurance: 8000000 }, '이원장': { pure: 21000000, insurance: 6000000 }, '박원장': { pure: 9000000, insurance: 2000000 } } }
];

// --- Error Boundary for Robustness ---
class TabErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, errorInfo) { console.error("Tab Error:", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="tab-pane active">
          <div className="empty-state" style={{ color: '#ef4444', padding: '3rem' }}>
            <h3>탭 화면을 불러오는 중 오류가 발생했습니다.</h3>
            <p>데이터 형식이 일치하지 않거나 렌더링 충돌이 발생했을 수 있습니다.</p>
            <button onClick={() => window.location.reload()} className="auth-submit-btn" style={{ marginTop: '1rem', width: 'auto', padding: '0.5rem 1.5rem' }}>새로고침</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const SalesAnalysis = () => {
  const [half, setHalf] = useState('all'); // 기본: 전체
  const [subTab, setSubTab] = useState('total'); // 기본탭: 총 매출 현황
  const [selectedYear, setSelectedYear] = useState('2025');
  const [availableYears, setAvailableYears] = useState(['2025']);
  const [isYearOpen, setIsYearOpen] = useState(false);
  
  const [salesDataMap, setSalesDataMap] = useState({ "2025": MOCK_DATA });
  const [salesData, setSalesData] = useState(MOCK_DATA);
  const [agreedPatients, setAgreedPatients] = useState([]);
  const [comment, setComment] = useState('상반기 매출이 전년 대비 15% 성장하였습니다. 특히 4월과 6월 임플란트 패키지 프로모션으로 인한 순매출 증대가 두드러집니다. 하반기에는 리콜 환자 관리를 통한 재내원율 향상이 주요 과제입니다.');

  const [topPatientsRaw, setTopPatientsRaw] = useState([]);
  const [selectedTopMonth, setSelectedTopMonth] = useState('전체');
  const [selectedDoctorMonth, setSelectedDoctorMonth] = useState('전체');

  useEffect(() => {
    // 1. 매출 데이터 로드 (연도별 맵 지원)
    const savedSales = localStorage.getItem('parsed_sales_data');
    if (savedSales) {
      try {
        const parsed = JSON.parse(savedSales);
        let finalMap = {};
        if (Array.isArray(parsed)) {
            finalMap = { "2025": parsed };
        } else {
            finalMap = parsed;
        }
        
        const years = Object.keys(finalMap).sort((a, b) => b - a);
        setAvailableYears(years.length > 0 ? years : ['2025']);
        setSalesDataMap(finalMap);
        
        // 현재 선택된 연도의 데이터로 초기화
        const initialYear = years.includes('2025') ? '2025' : (years[0] || '2025');
        setSelectedYear(initialYear);
        if (finalMap[initialYear]) setSalesData(finalMap[initialYear]);
      } catch (e) { console.error(e); }
    }

    // 2. 동의환자 데이터 로드
    const savedAgreed = localStorage.getItem('treatment_plan_data');
    if (savedAgreed) {
      try { setAgreedPatients(JSON.parse(savedAgreed)); } catch (e) { console.error(e); }
    }

    // 3. 진료비 상위 환자 데이터 로드
    const savedTop = localStorage.getItem('top_patients_raw_data');
    if (savedTop) {
      try { setTopPatientsRaw(JSON.parse(savedTop)); } catch (e) { console.error(e); }
    }

    // Storage 이벤트 리스너
    const handleStorageChange = (e) => {
      if (e.key === 'parsed_sales_data' || e.key === 'treatment_plan_data' || e.key === 'top_patients_raw_data') {
        window.location.reload();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // 연도 변경 핸들러
  const handleYearChange = (year) => {
    setSelectedYear(year);
    if (salesDataMap[year]) {
      setSalesData(salesDataMap[year]);
    }
  };

  const currentHalfData = 
    half === 'all' ? (Array.isArray(salesData) ? salesData : []) :
    half === 'first' ? (Array.isArray(salesData) ? salesData.slice(0, 6) : []) : 
    (Array.isArray(salesData) ? salesData.slice(6, 12) : []);

  
  // --- 공통 통계 계산 ---
  const totalAgreed = agreedPatients.reduce((sum, p) => sum + (Number(p.contractAmount) || 0), 0);
  const totalPaid = agreedPatients.reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0);
  const collectionRate = totalAgreed > 0 ? ((totalPaid / totalAgreed) * 100).toFixed(1) : 0;

  // --- 의사별 데이터 집계 (Stacked Bar + Line 용) ---
  const doctorNames = React.useMemo(() => {
    const names = new Set();
    const dataArray = Array.isArray(salesData) ? salesData : [];
    
    dataArray.forEach(month => {
      if (month && typeof month === 'object' && month.doctorData && typeof month.doctorData === 'object') {
        Object.keys(month.doctorData).forEach(name => {
          if (name && typeof name === 'string' && name.trim() !== '') {
            names.add(name.trim());
          }
        });
      }
    });
    return Array.from(names);
  }, [salesData]);

  const doctorChartData = React.useMemo(() => {
    const dataArray = Array.isArray(currentHalfData) ? currentHalfData : [];
    return dataArray.map(month => {
      if (!month || typeof month !== 'object') return { month: 'Unknown', total: 0, top2Names: [] };
      
      const entry = { 
        ...month,
        month: month.month || 'Unknown', 
        total: isNaN(Number(month.total)) ? 0 : Number(month.total),
        netSales: isNaN(Number(month.netSales)) ? 0 : Number(month.netSales),
        insurance: isNaN(Number(month.insurance)) ? 0 : Number(month.insurance)
      };
      
      const doctorValues = [];
      let totalPure = 0;
      let totalInsurance = 0;
      let hasDoctorData = false;

      doctorNames.forEach(name => {
        const dData = (month.doctorData && typeof month.doctorData === 'object') ? month.doctorData[name] : null;
        
        let pureVal = 0;
        let insVal = 0;
        
        if (dData) {
          hasDoctorData = true;
          if (typeof dData === 'object') {
            pureVal = Number(dData.pure || 0);
            insVal = Number(dData.insurance || 0);
          } else {
            pureVal = Number(dData || 0);
          }
        }
        
        totalPure += pureVal;
        totalInsurance += insVal;
        const combined = pureVal + insVal;
        entry[name] = isNaN(combined) ? 0 : combined;
        doctorValues.push({ name, value: entry[name] });
      });

      // 의사별 데이터가 있을 경우, 기본 지표들을 의사 합계로 갱신 (의사별 매출 -> 전체 매출 동기화)
      if (hasDoctorData) {
        entry.netSales = totalPure;
        entry.insurance = totalInsurance;
        entry.total = totalPure + totalInsurance;
      }

      // 동의환자 데이터(치료종결, 진행중) 카운트하여 동의 건수에 연동
      entry.agreed = (agreedPatients || []).filter(p => {
        // 연도 필터링
        const pYear = p.year || (p.createdAt ? p.createdAt.split('-')[0] : '');
        if (pYear && pYear !== selectedYear) return false;

        if (!p.createdAt) return false;
        // Parse month from various formats
        const mMatch = p.createdAt.match(/(\d+)월/) || p.createdAt.match(/[\.\-\/](\d{1,2})[\.\-\/]/) || p.createdAt.match(/^(\d{1,2})[\.\-\/]/);
        let mStr = null;
        if (mMatch) {
            const mNum = parseInt(mMatch[1]);
            if (mNum >= 1 && mNum <= 12) mStr = mNum + '월';
        }
        
        const status = (p.status || '').replace(/\s+/g, '');
        const statusMatch = status.includes('치료종결') || status.includes('진행중');
        
        return mStr === entry.month && statusMatch;
      }).length;

      // 해당 월의 1, 2위 의사 식별
      entry.top2Names = doctorValues
        .sort((a, b) => b.value - a.value)
        .slice(0, 2)
        .filter(d => d.value > 0)
        .map(d => d.name);

      return entry;
    });
  }, [currentHalfData, doctorNames]);



  // --- 동의환자 월별 통계 집계 (차트용) ---
  const agreedMonthlyStats = [
    { month: '1월', contract: 0, paid: 0 }, { month: '2월', contract: 0, paid: 0 },
    { month: '3월', contract: 0, paid: 0 }, { month: '4월', contract: 0, paid: 0 },
    { month: '5월', contract: 0, paid: 0 }, { month: '6월', contract: 0, paid: 0 },
    { month: '7월', contract: 0, paid: 0 }, { month: '8월', contract: 0, paid: 0 },
    { month: '9월', contract: 0, paid: 0 }, { month: '10월', contract: 0, paid: 0 },
    { month: '11월', contract: 0, paid: 0 }, { month: '12월', contract: 0, paid: 0 }
  ];

  agreedPatients.forEach(p => {
    // 연도 필터링
    const pYear = p.year || (p.createdAt ? p.createdAt.split('-')[0] : '');
    if (pYear && pYear !== selectedYear) return;

    const monthMatch = p.createdAt.match(/(\d+)월/) || p.createdAt.match(/-(\d+)-/);
    if (monthMatch) {
      const mNum = parseInt(monthMatch[1]);
      const mStr = mNum + '월';
      const stat = agreedMonthlyStats.find(s => s.month === mStr);
      if (stat) {
        stat.contract += (Number(p.contractAmount) || 0);
        stat.paid += (Number(p.paidAmount) || 0);
      }
    }
  });

  const currentHalfAgreedStats = 
    half === 'all' ? agreedMonthlyStats :
    half === 'first' ? agreedMonthlyStats.slice(0, 6) : 
    agreedMonthlyStats.slice(6, 12);

  // --- 매출 분석 정리 (Summary) 데이터 집계 ---
  const summaryMonthlyMetrics = React.useMemo(() => {
    return doctorChartData.map(d => {
      const metrics = { 
        month: d.month,
        pureRatio: d.total > 0 ? ((d.netSales / d.total) * 100).toFixed(1) : 0,
        insRatio: d.total > 0 ? ((d.insurance / d.total) * 100).toFixed(1) : 0,
        
        // 1. 진료비 상위 비중 (순매출 대비 상위 20명 수납액)
        topFeeRatio: 0,
        // 2. 동의환자 수납율 (개별 달 기준)
        agreedCollectionRate: 0,
        // 3. 신환 수익 비중
        newPatientRatio: d.netSales > 0 ? ((Number(d.newPatientSales || 0) / d.netSales) * 100).toFixed(1) : 0,
        
        // 결제 수단 비중 (순매출 대비)
        cardRatio: d.netSales > 0 ? ((Number(d.card || 0) / d.netSales) * 100).toFixed(1) : 0,
        cashRatio: d.netSales > 0 ? ((Number(d.cash || 0) / d.netSales) * 100).toFixed(1) : 0,
        otherRatio: d.netSales > 0 ? ((Number(d.other || 0) / d.netSales) * 100).toFixed(1) : 0
      };

      // 진료비 상위 비중 계산 (동일 환자 합산 후 상위 20명 기준)
      const monthlyTopData = topPatientsRaw.filter(p => p.month === d.month || (p.month && p.month.includes(d.month.replace('월', ''))));
      const monthlyAggregated = {};
      monthlyTopData.forEach(p => {
        const key = `${p.patientName}_${p.chartNo || ''}`;
        if (!monthlyAggregated[key]) monthlyAggregated[key] = 0;
        monthlyAggregated[key] += (Number(p.paid) || 0);
      });
      const top20Sum = Object.values(monthlyAggregated)
        .sort((a, b) => b - a)
        .slice(0, 20)
        .reduce((sum, val) => sum + val, 0);
      
      metrics.topFeeRatio = d.netSales > 0 ? ((top20Sum / d.netSales) * 100).toFixed(1) : 0;

      // 동의환자 수납율 계산
      const monthlyAgreed = agreedPatients.filter(p => {
        const mMatch = p.createdAt.match(/(\d+)월/) || p.createdAt.match(/-(\d+)-/);
        return mMatch && parseInt(mMatch[1]) + '월' === d.month;
      });
      const contractSum = monthlyAgreed.reduce((sum, p) => sum + (Number(p.contractAmount) || 0), 0);
      const paidSum = monthlyAgreed.reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0);
      metrics.agreedCollectionRate = contractSum > 0 ? ((paidSum / contractSum) * 100).toFixed(1) : 0;

      return metrics;
    });
  }, [doctorChartData, topPatientsRaw, agreedPatients]);

  // --- 진료비 상위 환자 (최근 월 기준) ---
  const topPatients = (currentHalfData[currentHalfData.length - 1]?.topPatients || []).slice(0, 20);

  // --- 커스텀 차트 레이블 컴포넌트 ---
  const CustomizedLabel = (props) => {
    const { x, y, width, value, fill } = props;
    if (!value || value === 0) return null;
    return (
      <g>
        <rect x={x + width/2 - 45} y={y - 25} width={90} height={20} rx={4} fill={fill} />
        <text x={x + width/2} y={y - 14} fill="#fff" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: '11px', fontWeight: 'bold' }}>
          {value.toLocaleString()}원
        </text>
      </g>
    );
  };

  const CustomizedLineLabel = (props) => {
    const { x, y, value, stroke } = props;
    if (!value || value === 0) return null;
    return (
      <g>
        <rect x={x - 45} y={y - 32} width={90} height={20} rx={4} fill={stroke} />
        <text x={x} y={y - 21} fill="#fff" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: '11px', fontWeight: 'bold' }}>
          {value.toLocaleString()}원
        </text>
      </g>
    );
  };

  const [selectedMonth, setSelectedMonth] = useState('전체');
  const [selectedAgreedMonth, setSelectedAgreedMonth] = useState('전체');

  // --- 탭별 렌더링 로직 (7개 탭) ---
  const renderTabContent = () => {
    switch (subTab) {
      case 'total': // 1. 총 매출 현황
        return (
          <div className="tab-pane active">
            <div className="dashboard-stack">
              <DashboardCard title="월별 매출 추합 및 목표 대비">
                <ResponsiveContainer width="100%" height={400}>
                  <ComposedChart data={doctorChartData} margin={{ left: 30, right: 30, top: 40, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                    <XAxis dataKey="month" stroke="var(--text-secondary)" tick={{ dy: 10 }} />
                    <YAxis 
                      stroke="var(--text-secondary)" 
                      width={80}
                      domain={[0, (dataMax) => dataMax * 1.15]}
                      tickFormatter={(v) => `${Math.floor(v/10000).toLocaleString()}만`} 
                    />
                    <Tooltip formatter={(v) => `${v.toLocaleString()}원`} contentStyle={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)', borderRadius: '12px' }} />
                    <Legend verticalAlign="top" height={36}/>
                    <Bar dataKey="netSales" name="순매출" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40}>
                      <LabelList dataKey="netSales" content={<CustomizedLabel fill="#3b82f6" />} />
                    </Bar>
                    <Bar dataKey="insurance" name="보험청구" fill="#93c5fd" radius={[4, 4, 0, 0]} barSize={40}>
                      <LabelList dataKey="insurance" content={<CustomizedLabel fill="#60a5fa" />} />
                    </Bar>
                    <Line type="monotone" dataKey="total" name="총합계" stroke="#f59e0b" strokeWidth={3} dot={{ r: 5, fill: '#f59e0b' }}>
                      <LabelList dataKey="total" content={<CustomizedLineLabel stroke="#f59e0b" />} />
                    </Line>
                  </ComposedChart>
                </ResponsiveContainer>
              </DashboardCard>
              
              <DashboardCard title="매출 통계 상세 지표">
                <div className="sales-data-table-container">
                  <table className="sales-data-table">
                    <thead>
                      <tr>
                        <th className="row-header">구분</th>
                        {doctorChartData.map(d => <th key={d.month}>{d.month}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="row-header"><span className="marker blue"></span> 순매출</td>
                        {doctorChartData.map(d => <td key={d.month}>{Number(d.netSales || 0).toLocaleString()}원</td>)}
                      </tr>
                      <tr>
                        <td className="row-header"><span className="marker green"></span> 보험청구</td>
                        {doctorChartData.map(d => <td key={d.month}>{Number(d.insurance || 0).toLocaleString()}원</td>)}
                      </tr>
                      <tr className="font-bold">
                        <td className="row-header"><span className="marker-yellow"></span> 총매출</td>
                        {doctorChartData.map(d => <td key={d.month}>{Number(d.total || 0).toLocaleString()}원</td>)}
                      </tr>
                      <tr>
                        <td className="row-header"><TrendingUp size={14} /> 신환 수</td>
                        {currentHalfData.map(d => <td key={d.month}>{d.newPatient || 0}</td>)}
                      </tr>
                      <tr>
                        <td className="row-header"><Activity size={14} /> 동의 건수</td>
                        {doctorChartData.map(d => <td key={d.month}>{d.agreed || 0}</td>)}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </DashboardCard>
            </div>
          </div>
        );

      case 'payment': // 2. 결제 분포도
        const displayData = selectedMonth === '전체' 
          ? currentHalfData 
          : currentHalfData.filter(d => d.month === selectedMonth);

        const paymentPieData = [
          { name: '카드', value: displayData.reduce((a, b) => a + (Number(b.card) || 0), 0), color: '#3b82f6' },
          { name: '현금', value: displayData.reduce((a, b) => a + (Number(b.cash) || 0), 0), color: '#10b981' },
          { name: '기타(온라인)', value: displayData.reduce((a, b) => a + (Number(b.other) || 0), 0), color: '#f59e0b' }
        ];
        
        return (
          <div className="tab-pane active">
            <div className="dashboard-stack">
              <div className="month-filter-container" style={{ marginBottom: '1rem', display: 'flex', gap: '8px' }}>
                <button 
                  className={`filter-btn ${selectedMonth === '전체' ? 'active' : ''}`}
                  onClick={() => setSelectedMonth('전체')}
                >전체보기</button>
                {currentHalfData.map(d => (
                  <button 
                    key={d.month}
                    className={`filter-btn ${selectedMonth === d.month ? 'active' : ''}`}
                    onClick={() => setSelectedMonth(d.month)}
                  >{d.month}</button>
                ))}
              </div>

              <div className="payment-charts-grid">
                <DashboardCard title={`${selectedMonth} 결제 수단별 비중 (%)`}>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={paymentPieData}
                        cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" stroke="none"
                        label={({ percent }) => `${(percent * 100).toFixed(1)}%`}
                      >
                        {paymentPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(v) => `${v.toLocaleString()}원`} />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                </DashboardCard>
                
                <DashboardCard title="월별 결제 수단 추이" className="flex-2">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={currentHalfData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" tick={{ dy: 10 }} />
                      <YAxis tickFormatter={(v) => `${Math.round(v/10000).toLocaleString()}만`} width={60} />
                      <Tooltip formatter={(v) => `${v.toLocaleString()}원`} />
                      <Legend />
                      <Bar dataKey="card" name="카드" fill="#3b82f6" />
                      <Bar dataKey="cash" name="현금" fill="#10b981" />
                      <Bar dataKey="other" name="기타(온라인)" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </DashboardCard>
              </div>

              <DashboardCard title="월별 결제 상세 내역">
                <div className="sales-data-table-container">
                  <table className="sales-data-table">
                    <thead>
                      <tr>
                        <th className="row-header">결제수단</th>
                        {currentHalfData.map(d => <th key={d.month}>{d.month}</th>)}
                        <th>합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="row-header"><span className="marker blue"></span> 카드</td>
                        {currentHalfData.map(d => <td key={d.month}>{Number(d.card || 0).toLocaleString()}원</td>)}
                        <td className="font-bold">{ currentHalfData.reduce((a,b)=>a+(Number(b.card)||0),0).toLocaleString() }원</td>
                      </tr>
                      <tr>
                        <td className="row-header"><span className="marker green"></span> 현금</td>
                        {currentHalfData.map(d => <td key={d.month}>{Number(d.cash || 0).toLocaleString()}원</td>)}
                        <td className="font-bold">{ currentHalfData.reduce((a,b)=>a+(Number(b.cash)||0),0).toLocaleString() }원</td>
                      </tr>
                      <tr>
                        <td className="row-header"><span className="marker-yellow"></span> 기타(온라인)</td>
                        {currentHalfData.map(d => <td key={d.month}>{Number(d.other || 0).toLocaleString()}원</td>)}
                        <td className="font-bold">{ currentHalfData.reduce((a,b)=>a+(Number(b.other)||0),0).toLocaleString() }원</td>
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
            <div className="dashboard-stack">
              <DashboardCard title="월별 신환 매출 기여도 비교">
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={doctorChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tick={{ dy: 10 }} />
                    <YAxis 
                        tickFormatter={(v) => `${(v/10000).toLocaleString()}만`} 
                        width={60} 
                        domain={[0, (dataMax) => dataMax * 1.15]} 
                    />
                    <Tooltip formatter={(v) => `${Number(v).toLocaleString()}원`} />
                    <Legend verticalAlign="top" align="right" height={36} />
                    <Bar dataKey="netSales" name="전체 순매출" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="netSales" content={<CustomizedLabel fill="#3b82f6" />} />
                    </Bar>
                    <Bar dataKey="newPatientSales" name="신환 매출" fill="#8b5cf6" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="newPatientSales" content={<CustomizedLabel fill="#8b5cf6" />} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </DashboardCard>
              
              <DashboardCard title="순수 매출 중 신환 수익 비중 (%)">
                <div className="sales-data-table-container">
                  <table className="sales-data-table">
                    <thead>
                      <tr>
                        <th className="row-header">분석 항목</th>
                        {doctorChartData.map(d => <th key={d.month}>{d.month}</th>)}
                        <th>평균/합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="row-header"><span className="marker blue"></span> 전체 순매출</td>
                        {doctorChartData.map(d => <td key={d.month}>{Number(d.netSales || 0).toLocaleString()}원</td>)}
                        <td className="font-bold">{ doctorChartData.reduce((a,b)=>a+(Number(b.netSales)||0),0).toLocaleString() }원</td>
                      </tr>
                      <tr>
                        <td className="row-header"><span className="marker purple"></span> 신환 매출</td>
                        {doctorChartData.map(d => <td key={d.month}>{Number(d.newPatientSales || 0).toLocaleString()}원</td>)}
                        <td className="font-bold">{ doctorChartData.reduce((a,b)=>a+(Number(b.newPatientSales)||0),0).toLocaleString() }원</td>
                      </tr>
                      <tr className="bg-highlight">
                        <td className="row-header"><span className="marker yellow"></span> 신환 수익 비중 (%)</td>
                        {doctorChartData.map(d => {
                          const ratio = (Number(d.newPatientSales || 0) / Number(d.netSales || 1)) * 100;
                          return <td key={d.month} className="highlight text-blue">{ratio.toFixed(1)}%</td>;
                        })}
                        <td className="font-bold highlight text-blue">
                          {((doctorChartData.reduce((a,b)=>a+(Number(b.newPatientSales)||0),0) / 
                            doctorChartData.reduce((a,b)=>a+(Number(b.netSales)||0), 1)) * 100).toFixed(1)}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </DashboardCard>
            </div>
          </div>
        );

      case 'agreed': // 4. 동의환자 수납액
        const currentAgreedMonths = currentHalfData.map(d => d.month);
        const filteredAgreed = selectedAgreedMonth === '전체' 
          ? agreedPatients.filter(p => {
              const mMatch = p.createdAt.match(/(\d+)월/) || p.createdAt.match(/-(\d+)-/);
              const mStr = mMatch ? parseInt(mMatch[1]) + '월' : null;
              return mStr && currentAgreedMonths.includes(mStr);
            })
          : agreedPatients.filter(p => {
              const mMatch = p.createdAt.match(/(\d+)월/) || p.createdAt.match(/-(\d+)-/);
              return mMatch && parseInt(mMatch[1]) + '월' === selectedAgreedMonth;
            });

        const fTotalAgreed = filteredAgreed.reduce((sum, p) => sum + (Number(p.contractAmount) || 0), 0);
        const fTotalPaid = filteredAgreed.reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0);
        const fRate = fTotalAgreed > 0 ? ((fTotalPaid / fTotalAgreed) * 100).toFixed(1) : 0;

        return (
          <div className="tab-pane active">
            <div className="dashboard-stack">
              {/* 월별 필터 버튼 */}
              <div className="month-filter-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {['전체', ...currentAgreedMonths].map(m => (
                  <button 
                    key={m} 
                    className={`month-filter-btn ${selectedAgreedMonth === m ? 'active' : ''}`}
                    onClick={() => setSelectedAgreedMonth(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* 통계 요약 카드 (색상 마커 포함) */}
              <div className="stats-header-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1rem' }}>
                <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
                  <span className="label">총 계약금액</span>
                  <span className="value">{fTotalAgreed.toLocaleString()}원</span>
                </div>
                <div className="stat-card" style={{ borderLeft: '4px solid #3b82f6' }}>
                  <span className="label">총 수납액</span>
                  <span className="value">{fTotalPaid.toLocaleString()}원</span>
                </div>
                <div className="stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
                  <span className="label">평균 수납률</span>
                  <span className="value highlight">{fRate}%</span>
                </div>
              </div>

              <DashboardCard title={`${selectedAgreedMonth} 치료비용계획 환자별 상세 내역`}>
                <div className="sales-data-table-container">
                  <table className="sales-data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>환자정보</th>
                        <th>작성일</th>
                        <th>진행상태</th>
                        <th>수납상태</th>
                        <th>계약금액</th>
                        <th>현재수납액</th>
                        <th>잔액</th>
                        <th>최종내원</th>
                        <th>다음 예약</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAgreed.length > 0 ? filteredAgreed.map((p, idx) => (
                        <tr key={idx}>
                          <td>{idx + 1}</td>
                          <td className="font-bold" style={{ textAlign: 'left', color: 'var(--text-primary)' }}>{p.patientName}</td>
                          <td>{p.createdAt}</td>
                          <td>{p.status}</td>
                          <td><span className={`status-pill ${p.payStatus && p.payStatus.includes('완료') ? 'complete' : ''}`}>{p.payStatus}</span></td>
                          <td style={{ textAlign: 'right' }}>{(Number(p.contractAmount) || 0).toLocaleString()}원</td>
                          <td style={{ textAlign: 'right' }}>{(Number(p.paidAmount) || 0).toLocaleString()}원</td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#ef4444' }}>{(Number(p.contractAmount - p.paidAmount) || 0).toLocaleString()}원</td>
                          <td>{p.lastVisit}</td>
                          <td>{p.nextAppt}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan="10" className="empty-state">해당 기간의 데이터가 없습니다. (치료비용계획 엑셀을 업로드해주세요)</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </DashboardCard>
            </div>
          </div>
        );

      case 'topFee': // 5. 진료비 상위
        const currentMonths = currentHalfData.map(d => d.month);
        const filteredTop = selectedTopMonth === '전체' 
          ? topPatientsRaw.filter(p => currentMonths.includes(p.month)) 
          : topPatientsRaw.filter(p => {
              const m = (p.month || '');
              return m === selectedTopMonth || m.includes(selectedTopMonth.replace('월', ''));
            });


        // --- 데이터 집계 (Aggregation) ---
        // 동일 환자가 여러 달에 걸쳐 존재할 경우 합산하여 순위 산정
        const aggregated = {};
        filteredTop.forEach(p => {
          const key = `${p.patientName}_${p.chartNo || ''}`;
          if (!aggregated[key]) {
            aggregated[key] = { ...p, revenue: 0, paid: 0 };
          }
          aggregated[key].revenue += (Number(p.revenue) || 0);
          aggregated[key].paid += (Number(p.paid) || 0);
        });

        const sortedTop = Object.values(aggregated)
          .sort((a, b) => (b.paid || 0) - (a.paid || 0))
          .slice(0, 20);

        
        const leftTop = sortedTop.slice(0, 10);
        const rightTop = sortedTop.slice(10, 20);

        // --- 정교화된 통계 계산 ---
        // 1. 순매출액: 총 매출현황의 해당 월(또는 전체) 순매출 데이터 사용
        let topNetSales = 0;
        if (selectedTopMonth === '전체') {
            topNetSales = currentHalfData.reduce((sum, d) => sum + (Number(d?.netSales) ?? 0), 0);
        } else {
            const mData = salesData.find(d => d.month === selectedTopMonth);
            topNetSales = mData ? (Number(mData?.netSales) ?? 0) : 0;
        }

        // 2. 총 수납액: 상위 20명 환자의 수납액 합계
        const topPaid = sortedTop.reduce((sum, p) => sum + (Number(p.paid) || 0), 0);

        // 3. 수납 비중: 순매출액 대비 상위 20명 수납액 비중
        const topRatio = topNetSales > 0 ? ((topPaid / topNetSales) * 100).toFixed(1) : 0;

        const renderTopTable = (patients, startRank) => (
          <div className="sales-data-table-container" style={{ marginTop: 0 }}>
            <table className="sales-data-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th>성명</th>
                  <th>담당의</th>
                  <th>총수납액</th>
                </tr>
              </thead>
              <tbody>
                {patients.length > 0 ? patients.map((p, idx) => (
                  <tr key={idx}>
                    <td className="font-bold" style={{ color: 'var(--text-secondary)' }}>{startRank + idx}</td>
                    <td className="font-bold" style={{ textAlign: 'left', color: 'var(--text-primary)' }}>{p.patientName}</td>
                    <td>{p.doctor}</td>
                    <td style={{ textAlign: 'right', color: '#3b82f6', fontWeight: 'bold' }}>{(Number(p.paid) || 0).toLocaleString()}원</td>
                  </tr>
                )) : (
                  <tr><td colSpan="4" className="empty-state" style={{ padding: '2rem 1rem' }}>데이터 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>
        );

        return (
          <div className="tab-pane active">
            <div className="dashboard-stack">
              {/* 월별 필터 버튼 */}
              <div className="month-filter-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {['전체', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'].map(m => (
                  <button 
                    key={m} 
                    className={`month-filter-btn ${selectedTopMonth === m ? 'active' : ''}`}
                    onClick={() => setSelectedTopMonth(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* 통계 요약 카드 */}
              <div className="stats-header-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1rem' }}>
                <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
                  <span className="label">순매출액</span>
                  <span className="value">{topNetSales.toLocaleString()}원</span>
                </div>
                <div className="stat-card" style={{ borderLeft: '4px solid #3b82f6' }}>
                  <span className="label">총 수납액</span>
                  <span className="value">{topPaid.toLocaleString()}원</span>
                </div>
                <div className="stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
                  <span className="label">수납 비중</span>
                  <span className="value highlight">{topRatio}%</span>
                </div>
              </div>

              <div style={{ marginTop: '1rem' }}>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                   <Award size={20} color="#f59e0b" /> {selectedTopMonth} 진료비 수납 상위 환자 (TOP 20)
                </h3>
                
                <div className="top-patients-grid">
                  <div className="top-patients-column">
                    <h4><span className="rank-badge">1 ~ 10위</span></h4>
                    {renderTopTable(leftTop, 1)}
                  </div>
                  <div className="top-patients-column">
                    <h4><span className="rank-badge">11 ~ 20위</span></h4>
                    {renderTopTable(rightTop, 11)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );


      case 'doctor': // 6. 매출분석(의사)
        const doctorColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e'];
        
        if (!Array.isArray(doctorChartData) || doctorChartData.length === 0) {
          return <div className="tab-pane active"><div className="empty-state">데이터가 없습니다.</div></div>;
        }

        return (
          <div className="tab-pane active">
            <div className="dashboard-stack">
              <DashboardCard title="월별 의사 기여도 및 병원 매출 추합">
                <ResponsiveContainer width="100%" height={450}>
                  <ComposedChart data={doctorChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                    <XAxis dataKey="month" stroke="var(--text-secondary)" tick={{ dy: 10 }} />
                    <YAxis 
                      stroke="var(--text-secondary)" 
                      width={80}
                      domain={[0, (dataMax) => dataMax * 1.15]}
                      tickFormatter={(v) => `${Math.floor(v/10000).toLocaleString()}만`} 
                    />
                    <Tooltip 
                      formatter={(v) => `${Number(v || 0).toLocaleString()}원`} 
                      contentStyle={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)', borderRadius: '12px' }} 
                    />
                    <Legend verticalAlign="top" height={36}/>
                    
                    {/* 의사별 매출 (Stacked Bar) */}
                    {(doctorNames || []).map((name, idx) => (
                      <Bar 
                        key={name} 
                        dataKey={name} 
                        name={name}
                        fill={doctorColors[idx % doctorColors.length]} 
                        barSize={15}
                        isAnimationActive={false} 
                      >
                         <LabelList 
                          dataKey={name} 
                          position="top"
                          content={(props) => {
                            const { x, y, width, value, index } = props;
                            const monthData = doctorChartData[index];
                            if (monthData?.top2Names?.includes(name)) {
                              const labelText = `${Number(value || 0).toLocaleString()}원`;
                              const textWidth = labelText.length * 6.5; 
                              return (
                                <g>
                                  <rect 
                                    x={x + width / 2 - textWidth / 2 - 5} 
                                    y={y - 25} 
                                    width={textWidth + 10} 
                                    height={20} 
                                    rx={4} 
                                    fill={doctorColors[idx % doctorColors.length]} 
                                  />
                                  <text 
                                    x={x + width / 2} 
                                    y={y - 11} 
                                    fill="#fff" 
                                    fontSize={10} 
                                    textAnchor="middle" 
                                    fontWeight="bold"
                                  >
                                    {labelText}
                                  </text>
                                </g>
                              );
                            }
                            return null;
                          }}
                        />
                      </Bar>
                    ))}
                    
                    {/* 병원 총 매출 (Line) */}
                    <Line 
                      type="monotone" 
                      dataKey="total" 
                      name="병원 총매출" 
                      stroke="#6366f1" 
                      strokeWidth={3} 
                      dot={{ r: 5, fill: '#6366f1' }}
                      isAnimationActive={false}
                    >
                      <LabelList 
                        dataKey="total" 
                        position="top" 
                        offset={15}
                        formatter={(v) => `${Number(v || 0).toLocaleString()}원`} 
                        style={{ fill: '#6366f1', fontSize: '11px', fontWeight: 'bold' }}
                      />
                    </Line>
                  </ComposedChart>
                </ResponsiveContainer>
              </DashboardCard>
              
              <DashboardCard title="의사별 월간 매출 상세 지표">
                <div className="sales-data-table-container">
                  <table className="sales-data-table">
                    <thead>
                      <tr>
                        <th className="row-header">구분</th>
                        {(currentHalfData || []).map(d => <th key={d.month}>{d.month}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {/* 의사별 행 */}
                      {(doctorNames || []).map((name, idx) => (
                        <tr key={name}>
                          <td className="row-header">
                            <span className="marker" style={{ backgroundColor: doctorColors[idx % doctorColors.length] }}></span> 
                            {name}
                          </td>
                          {(currentHalfData || []).map(d => {
                            const dData = d?.doctorData?.[name];
                            let pure = 0;
                            let insurance = 0;
                            if (dData) {
                              if (typeof dData === 'object') {
                                pure = Number(dData.pure || 0);
                                insurance = Number(dData.insurance || 0);
                              } else {
                                pure = Number(dData || 0);
                              }
                            }
                            
                            const monthEntry = doctorChartData.find(e => e.month === d.month);
                            const combined = pure + insurance;
                            
                            const hospitalTotal = monthEntry ? monthEntry.total : Number(d?.total || 1); 
                            const ratio = ((combined / (hospitalTotal || 1)) * 100).toFixed(1);
                            
                            return (
                              <td key={`${d?.month}-${name}`}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                  <div style={{ fontWeight: 'bold' }}>{pure.toLocaleString()}원 <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>(순수)</span></div>
                                  <div style={{ color: '#6366f1', fontSize: '0.85rem' }}>{insurance.toLocaleString()}원 <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>(보험)</span></div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>비중: {ratio}% <span style={{ fontSize: '0.65rem' }}>(합산기준)</span></div>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      
                      {/* 총매출 행 */}
                      <tr className="font-bold" style={{ borderTop: '2px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                        <td className="row-header"><span className="marker-yellow"></span> 총매출</td>
                        {(currentHalfData || []).map(d => {
                          const monthEntry = doctorChartData.find(e => e.month === d.month);
                          const totalVal = monthEntry ? monthEntry.total : Number(d?.total || 0);
                          return (
                            <td key={`${d?.month}-total`}>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', fontWeight: '800' }}>
                                {totalVal.toLocaleString()}원
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </DashboardCard>
            </div>
          </div>
        );






      case 'summary': // 7. 매출 분석 정리
        return (
          <div className="tab-pane active animated-fade-in">
            <div className="dashboard-stack">
              {/* 상단 통합 비중 차트 */}
              <DashboardCard title="월별 주요 비중 추이 (%)" subtitle="진료비 상위, 동의환자 수납율, 신환 수익 비중 비교">
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={summaryMonthlyMetrics} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                    <XAxis dataKey="month" tick={{ dy: 10 }} />
                    <YAxis tickFormatter={(v) => `${v}%`} width={50} domain={[0, (dataMax) => Math.max(100, dataMax * 1.1)]} />
                    <Tooltip formatter={(v) => `${v}%`} cursor={{ fill: 'var(--bg-hover)' }} />
                    <Legend verticalAlign="top" align="right" height={36} iconType="rect" />
                    
                    <Bar dataKey="topFeeRatio" name="진료비 상위" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20}>
                      <LabelList dataKey="topFeeRatio" position="top" formatter={(v) => `${v}%`} style={{ fontSize: '10px', fill: 'var(--text-secondary)' }} />
                    </Bar>
                    <Bar dataKey="agreedCollectionRate" name="동의환자 수납율" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20}>
                      <LabelList dataKey="agreedCollectionRate" position="top" formatter={(v) => `${v}%`} style={{ fontSize: '10px', fill: 'var(--text-secondary)' }} />
                    </Bar>
                    <Bar dataKey="newPatientRatio" name="신환 수익" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20}>
                      <LabelList dataKey="newPatientRatio" position="top" formatter={(v) => `${v}%`} style={{ fontSize: '10px', fill: 'var(--text-secondary)' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </DashboardCard>

              {/* 하단 매출 분석 정리 표 */}
              <DashboardCard title="매출 분석 종합 요약">
                <div className="sales-data-table-container">
                  <table className="sales-data-table summary-table">
                    <thead>
                      <tr>
                        <th style={{ width: '80px' }}>비중</th>
                        <th style={{ width: '120px' }}>구분</th>
                        <th style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>평균</th>
                        {summaryMonthlyMetrics.map(d => <th key={d.month}>{d.month}</th>)}
                        <th style={{ width: '80px' }}>증감</th>
                        <th>비고</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Section 1: 매출대비 (Now First) */}
                      <tr>
                        <td rowSpan="3" className="bg-light-gray" style={{ color: '#000', fontWeight: '900' }}>매출대비</td>
                        <td className="text-left"><span className="marker" style={{ background: '#3b82f6' }}></span> 진료비 상위</td>
                        <td className="bg-yellow font-bold" style={{ color: '#3b82f6' }}>{(summaryMonthlyMetrics.reduce((s, d) => s + Number(d.topFeeRatio), 0) / summaryMonthlyMetrics.length).toFixed(1)}%</td>
                        {summaryMonthlyMetrics.map(d => <td key={d.month} style={{ color: '#000' }}>{d.topFeeRatio}%</td>)}
                        {(() => {
                           const last = Number(summaryMonthlyMetrics[summaryMonthlyMetrics.length-1].topFeeRatio);
                           const prev = Number(summaryMonthlyMetrics[summaryMonthlyMetrics.length-2]?.topFeeRatio || last);
                           const diff = (last - prev).toFixed(1);
                           const color = diff > 0 ? '#ef4444' : (diff < 0 ? '#3b82f6' : 'inherit');
                           return <td className="font-bold" style={{ color }}>{diff > 0 ? '+' : ''}{diff}%</td>;
                        })()}
                        <td>상위 20명 매출 집중도</td>
                      </tr>
                      <tr>
                        <td className="text-left"><span className="marker" style={{ background: '#ef4444' }}></span> 동의환자결재율</td>
                        <td className="bg-yellow font-bold" style={{ color: '#ef4444' }}>{(summaryMonthlyMetrics.reduce((s, d) => s + Number(d.agreedCollectionRate), 0) / summaryMonthlyMetrics.length).toFixed(1)}%</td>
                        {summaryMonthlyMetrics.map(d => <td key={d.month} style={{ color: '#000' }}>{d.agreedCollectionRate}%</td>)}
                        {(() => {
                           const last = Number(summaryMonthlyMetrics[summaryMonthlyMetrics.length-1].agreedCollectionRate);
                           const prev = Number(summaryMonthlyMetrics[summaryMonthlyMetrics.length-2]?.agreedCollectionRate || last);
                           const diff = (last - prev).toFixed(1);
                           const color = diff > 0 ? '#ef4444' : (diff < 0 ? '#3b82f6' : 'inherit');
                           return <td className="font-bold" style={{ color }}>{diff > 0 ? '+' : ''}{diff}%</td>;
                        })()}
                        <td>계약 대비 실제 수납율</td>
                      </tr>
                      <tr>
                        <td className="text-left"><span className="marker" style={{ background: '#10b981' }}></span> 신환 수익</td>
                        <td className="bg-yellow font-bold" style={{ color: '#10b981' }}>{(summaryMonthlyMetrics.reduce((s, d) => s + Number(d.newPatientRatio), 0) / summaryMonthlyMetrics.length).toFixed(1)}%</td>
                        {summaryMonthlyMetrics.map(d => <td key={d.month} style={{ color: '#000' }}>{d.newPatientRatio}%</td>)}
                        {(() => {
                           const last = Number(summaryMonthlyMetrics[summaryMonthlyMetrics.length-1].newPatientRatio);
                           const prev = Number(summaryMonthlyMetrics[summaryMonthlyMetrics.length-2]?.newPatientRatio || last);
                           const diff = (last - prev).toFixed(1);
                           const color = diff > 0 ? '#ef4444' : (diff < 0 ? '#3b82f6' : 'inherit');
                           return <td className="font-bold" style={{ color }}>{diff > 0 ? '+' : ''}{diff}%</td>;
                        })()}
                        <td>전체 순매출 중 신환 기여도</td>
                      </tr>

                      {/* Section 2: 총매출 */}
                      <tr style={{ borderTop: '2px solid var(--border-color)' }}>
                        <td rowSpan="2" className="bg-light-gray" style={{ color: '#000', fontWeight: '900' }}>총매출</td>
                        <td className="text-left no-marker">순수매출</td>
                        <td className="bg-yellow font-bold">{(summaryMonthlyMetrics.reduce((s, d) => s + Number(d.pureRatio), 0) / summaryMonthlyMetrics.length).toFixed(1)}%</td>
                        {summaryMonthlyMetrics.map(d => <td key={d.month} style={{ color: '#000' }}>{d.pureRatio}%</td>)}
                        {(() => {
                           const last = Number(summaryMonthlyMetrics[summaryMonthlyMetrics.length-1].pureRatio);
                           const prev = Number(summaryMonthlyMetrics[summaryMonthlyMetrics.length-2]?.pureRatio || last);
                           const diff = (last - prev).toFixed(1);
                           const color = diff > 0 ? '#ef4444' : (diff < 0 ? '#3b82f6' : 'inherit');
                           return <td className="font-bold" style={{ color }}>{diff > 0 ? '+' : ''}{diff}%</td>;
                        })()}
                        <td>전체 매출 중 순수 수납 비중</td>
                      </tr>
                      <tr>
                        <td className="text-left no-marker">보험청구매출</td>
                        <td className="bg-yellow font-bold">{(summaryMonthlyMetrics.reduce((s, d) => s + Number(d.insRatio), 0) / summaryMonthlyMetrics.length).toFixed(1)}%</td>
                        {summaryMonthlyMetrics.map(d => <td key={d.month} style={{ color: '#000' }}>{d.insRatio}%</td>)}
                        {(() => {
                           const last = Number(summaryMonthlyMetrics[summaryMonthlyMetrics.length-1].insRatio);
                           const prev = Number(summaryMonthlyMetrics[summaryMonthlyMetrics.length-2]?.insRatio || last);
                           const diff = (last - prev).toFixed(1);
                           const color = diff > 0 ? '#ef4444' : (diff < 0 ? '#3b82f6' : 'inherit');
                           return <td className="font-bold" style={{ color }}>{diff > 0 ? '+' : ''}{diff}%</td>;
                        })()}
                        <td>공단 부담금 비중</td>
                      </tr>

                      {/* Section 3: 순수매출 구성 */}
                      <tr style={{ borderTop: '2px solid var(--border-color)' }}>
                        <td rowSpan="3" className="bg-light-gray" style={{ color: '#000', fontWeight: '900' }}>순수매출</td>
                        <td className="text-left no-marker">카드</td>
                        <td className="bg-yellow font-bold">{(summaryMonthlyMetrics.reduce((s, d) => s + Number(d.cardRatio), 0) / summaryMonthlyMetrics.length).toFixed(1)}%</td>
                        {summaryMonthlyMetrics.map(d => <td key={d.month} style={{ color: '#000' }}>{d.cardRatio}%</td>)}
                        <td>-</td>
                        <td>카드 결제 비중</td>
                      </tr>
                      <tr>
                        <td className="text-left no-marker">현금</td>
                        <td className="bg-yellow font-bold">{(summaryMonthlyMetrics.reduce((s, d) => s + Number(d.cashRatio), 0) / summaryMonthlyMetrics.length).toFixed(1)}%</td>
                        {summaryMonthlyMetrics.map(d => <td key={d.month} style={{ color: '#000' }}>{d.cashRatio}%</td>)}
                        <td>-</td>
                        <td>현금 수납 비중</td>
                      </tr>
                      <tr>
                        <td className="text-left no-marker">기타/무통장</td>
                        <td className="bg-yellow font-bold">{(summaryMonthlyMetrics.reduce((s, d) => s + Number(d.otherRatio), 0) / summaryMonthlyMetrics.length).toFixed(1)}%</td>
                        {summaryMonthlyMetrics.map(d => <td key={d.month} style={{ color: '#000' }}>{d.otherRatio}%</td>)}
                        <td>-</td>
                        <td>온라인/기타 수납 비중</td>
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
    <div className="sales-analysis-page">
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>매출 분석 대시보드</h1>
            <p>치과의 주요 경영 지표와 매출 통계를 한눈에 확인합니다.</p>
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
                <TabErrorBoundary key={subTab}>
                    {renderTabContent()}
                </TabErrorBoundary>
            </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default SalesAnalysis;