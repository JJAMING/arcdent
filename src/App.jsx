import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import HomeDashboard from './pages/HomeDashboard';
import SalesAnalysis from './pages/SalesAnalysis';
import TreatmentAnalysis from './pages/TreatmentAnalysis';
import PatientAnalysis from './pages/PatientAnalysis';
import NewPatientAnalysis from './pages/NewPatientAnalysis';
import ConsultationAnalysis from './pages/ConsultationAnalysis';
import InsuranceAnalysis from './pages/InsuranceAnalysis';
import Admin from './pages/Admin';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import './styles/Layout.css';

function AppContent() {
    const [activeTab, setActiveTab] = useState('home');

    // [긴급 조치] 2025년 2월 데이터 자동 강제 삭제 (사용자 요청)
    React.useEffect(() => {
        const cleanupKey = 'feb_2025_auto_cleanup_final_v1';
        if (!localStorage.getItem(cleanupKey)) {
            try {
                const T_YEAR = "2025";
                const isTargetMonth = (m) => {
                    const s = String(m || "").trim();
                    return s === "2" || s === "02" || s === "2월" || s === "02월";
                };

                // 1. 동의환자 계획 데이터 정리
                const plans = JSON.parse(localStorage.getItem('treatment_plan_data') || '[]');
                const filteredPlans = plans.filter(p => !((String(p.year) === T_YEAR || String(p.year).includes(T_YEAR)) && isTargetMonth(p.month)));
                localStorage.setItem('treatment_plan_data', JSON.stringify(filteredPlans));

                // 2. 수납 실적 데이터 정리
                const performance = JSON.parse(localStorage.getItem('treatment_performance_data') || '[]');
                const filteredPerf = performance.filter(p => !((String(p.year) === T_YEAR || String(p.year).includes(T_YEAR)) && isTargetMonth(p.month)));
                localStorage.setItem('treatment_performance_data', JSON.stringify(filteredPerf));

                localStorage.setItem(cleanupKey, 'true');
                console.log('%c[Emergency Cleanup] 2025-02 Data Cleared', 'color: red; font-weight: bold;');
                alert("2025년 2월 중복 데이터가 긴급 정리되었습니다. 이제 엑셀을 다시 업로드해 주세요.");
                
                // 삭제 후 원활한 반영을 위해 페이지 새로고침
                window.location.reload();
            } catch (e) {
                console.error('Auto cleanup error:', e);
            }
        }
    }, []);

    const renderContent = () => {
        switch (activeTab) {
            case 'home': return <HomeDashboard />;
            case 'sales': return <SalesAnalysis />;
            case 'treatment': return <TreatmentAnalysis />;
            case 'patient': return <PatientAnalysis />;
            case 'new-patient': return <NewPatientAnalysis />;
            case 'consultation': return <ConsultationAnalysis />;
            case 'insurance': return <InsuranceAnalysis />;
            case 'admin': return <Admin />;
            default: return <HomeDashboard />;
        }
    };

    const { isAuthenticated } = useAuth();
    const [isSignUp, setIsSignUp] = useState(false);

    if (!isAuthenticated) {
        return isSignUp ? (
            <SignUp onSwitchToLogin={() => setIsSignUp(false)} />
        ) : (
            <Login onSwitchToSignUp={() => setIsSignUp(true)} />
        );
    }

    return (
        <div className="app-container">
            <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
            <main className="main-content">
                {renderContent()}
            </main>
        </div>
    );
}

function App() {
    return (
        <AuthProvider>
            <ThemeProvider>
                <AppContent />
            </ThemeProvider>
        </AuthProvider>
    );
}

export default App;
