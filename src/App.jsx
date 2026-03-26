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
