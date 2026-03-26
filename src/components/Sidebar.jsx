import React from 'react';
import {
    BarChart3,
    Stethoscope,
    Users,
    UserPlus,
    MessageSquare,
    ShieldCheck,
    Sun,
    Moon,
    Activity,
    Settings
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import './Sidebar.css';

const Sidebar = ({ activeTab, setActiveTab }) => {
    const { isDarkMode, toggleTheme } = useTheme();

    const menuItems = [
        { id: 'home', icon: <Activity size={20} />, label: 'HOME' },
        { id: 'sales', icon: <BarChart3 size={20} />, label: '매출분석' },
        { id: 'treatment', icon: <Stethoscope size={20} />, label: '진료분석' },
        { id: 'patient', icon: <Users size={20} />, label: '환자분석' },
        { id: 'new-patient', icon: <UserPlus size={20} />, label: '신환분석' },
        { id: 'consultation', icon: <MessageSquare size={20} />, label: '상담분석' },
        { id: 'insurance', icon: <ShieldCheck size={20} />, label: '보험청구분석' },
    ];

    return (
        <aside className="sidebar">
            <div className="logo">
                <Activity size={32} />
                <span>Arcdent</span>
            </div>

            <ul className="nav-list">
                {menuItems.map((item) => (
                    <li
                        key={item.id}
                        className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(item.id)}
                    >
                        {item.icon}
                        <span>{item.label}</span>
                    </li>
                ))}
            </ul>

            <div className="sidebar-footer">
                <button className="theme-toggle" onClick={toggleTheme}>
                    {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                    <span>{isDarkMode ? '라이트 모드' : '다크 모드'}</span>
                </button>
                <button 
                    className={`admin-toggle ${activeTab === 'admin' ? 'active' : ''}`} 
                    onClick={() => setActiveTab('admin')}
                    title="관리자 설정"
                >
                    <Settings size={18} />
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
