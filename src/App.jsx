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
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { isSupabaseConfigured } from './lib/supabaseClient';
import './styles/Layout.css';

const ACTIVE_TAB_SESSION_KEY = 'arcdent_active_tab';
const VALID_TABS = new Set(['home', 'sales', 'treatment', 'patient', 'new-patient', 'consultation', 'insurance', 'admin']);

const getInitialActiveTab = () => {
    if (typeof window === 'undefined') return 'home';
    const savedTab = window.sessionStorage.getItem(ACTIVE_TAB_SESSION_KEY);
    return VALID_TABS.has(savedTab) ? savedTab : 'home';
};

function AppContent() {
    const [activeTab, setActiveTabState] = useState(getInitialActiveTab);

    const setActiveTab = (tab) => {
        const nextTab = VALID_TABS.has(tab) ? tab : 'home';
        if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(ACTIVE_TAB_SESSION_KEY, nextTab);
        }
        setActiveTabState(nextTab);
    };

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
