import React, { useEffect, useRef, useState } from 'react';
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
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { isSupabaseConfigured } from './lib/supabaseClient';
import './styles/Layout.css';

const ACTIVE_TAB_SESSION_KEY = 'arcdent_active_tab';
const ADMIN_TAB_REQUESTED_SESSION_KEY = 'arcdent_admin_tab_requested';
const VALID_TABS = new Set(['home', 'sales', 'treatment', 'patient', 'new-patient', 'consultation', 'insurance', 'admin']);

const getInitialActiveTab = () => {
    if (typeof window === 'undefined') return 'home';
    const savedTab = window.sessionStorage.getItem(ACTIVE_TAB_SESSION_KEY);
    return VALID_TABS.has(savedTab) ? savedTab : 'home';
};

function AppContent() {
    const { isAuthenticated } = useAuth();
    const [activeTab, setActiveTabState] = useState(getInitialActiveTab);
    const wasAuthenticatedRef = useRef(isAuthenticated);

    const setActiveTab = (tab) => {
        const nextTab = VALID_TABS.has(tab) ? tab : 'home';
        if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(ACTIVE_TAB_SESSION_KEY, nextTab);
            if (nextTab === 'admin') {
                window.sessionStorage.setItem(ADMIN_TAB_REQUESTED_SESSION_KEY, 'true');
            } else {
                window.sessionStorage.removeItem(ADMIN_TAB_REQUESTED_SESSION_KEY);
            }
        }
        setActiveTabState(nextTab);
    };

    useEffect(() => {
        if (!wasAuthenticatedRef.current && isAuthenticated) {
            // 로그아웃으로 저장 상태가 정리된 경우에만 HOME으로 시작한다.
            // 세션이 유지된 채 화면이 다시 로드된 경우에는 마지막 메뉴를 복원한다.
            setActiveTab(getInitialActiveTab());
        }
        wasAuthenticatedRef.current = isAuthenticated;
    }, [isAuthenticated]);

    useEffect(() => {
        if (activeTab !== 'admin' || typeof window === 'undefined') return;
        const wasAdminRequested = window.sessionStorage.getItem(ADMIN_TAB_REQUESTED_SESSION_KEY) === 'true';
        if (!wasAdminRequested) {
            setActiveTab('home');
        }
    }, [activeTab]);

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

    if (!isAuthenticated) {
        return <Login />;
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
    if (!isSupabaseConfigured) {
        return (
            <ThemeProvider>
                <div style={{
                    minHeight: '100vh',
                    display: 'grid',
                    placeItems: 'center',
                    padding: '2rem',
                    background: 'var(--bg-color)',
                    color: 'var(--text-primary)',
                }}>
                    <div style={{
                        width: 'min(560px, 100%)',
                        padding: '2rem',
                        border: '1px solid var(--border-color)',
                        borderRadius: 10,
                        background: 'var(--card-bg)',
                        boxShadow: 'var(--shadow)',
                    }}>
                        <h1 style={{ margin: '0 0 0.75rem', fontSize: '1.45rem' }}>
                            Supabase 환경변수가 필요합니다
                        </h1>
                        <p style={{ margin: '0 0 1rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            앱을 실행하려면 배포 환경 또는 .env.local에 아래 값을 등록해야 합니다.
                        </p>
                        <div style={{
                            display: 'grid',
                            gap: '0.5rem',
                            padding: '1rem',
                            borderRadius: 8,
                            background: 'var(--bg-color)',
                            fontFamily: 'monospace',
                            fontSize: '0.92rem',
                        }}>
                            <span>VITE_SUPABASE_URL</span>
                            <span>VITE_SUPABASE_ANON_KEY</span>
                        </div>
                    </div>
                </div>
            </ThemeProvider>
        );
    }

    return (
        <AuthProvider>
            <ThemeProvider>
                <AppContent />
            </ThemeProvider>
        </AuthProvider>
    );
}

export default App;
