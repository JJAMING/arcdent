import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck } from 'lucide-react';
import './Login.css';

const SAVED_LOGIN_ID_KEY = 'arcdent_saved_login_id';

// 아이디 저장은 이 브라우저(localStorage)에만 남고, 비밀번호는 절대 저장하지 않습니다.
// 시크릿 모드 등에서 저장소 접근이 막혀도 로그인 자체는 되도록 try/catch로 감쌉니다.
const readSavedLoginId = () => {
    try {
        return window.localStorage.getItem(SAVED_LOGIN_ID_KEY) || '';
    } catch {
        return '';
    }
};

const Login = () => {
    const { login } = useAuth();
    const [savedLoginId] = useState(readSavedLoginId);
    const [credentials, setCredentials] = useState({ loginId: savedLoginId, password: '' });
    const [rememberId, setRememberId] = useState(Boolean(savedLoginId));
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = (event) => {
        const { name, value } = event.target;
        setCredentials(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');

        if (!credentials.loginId.trim() || !credentials.password) {
            setError('아이디와 비밀번호를 모두 입력해주세요.');
            return;
        }

        setIsSubmitting(true);
        const result = await login(credentials.loginId, credentials.password);
        setIsSubmitting(false);

        if (!result.success) {
            setError(result.message);
            return;
        }

        try {
            if (rememberId) {
                window.localStorage.setItem(SAVED_LOGIN_ID_KEY, credentials.loginId.trim());
            } else {
                window.localStorage.removeItem(SAVED_LOGIN_ID_KEY);
            }
        } catch {
            // 저장소를 쓸 수 없는 환경이면 아이디 저장만 건너뜁니다.
        }

        if (typeof window !== 'undefined') {
            window.sessionStorage.setItem('arcdent_active_tab', 'home');
            window.sessionStorage.removeItem('arcdent_admin_tab_requested');
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <ShieldCheck size={48} className="auth-icon" />
                    <h1>Arcdent</h1>
                    <p>발급받은 치과 계정으로 로그인하세요.</p>
                </div>

                {error && <div className="auth-error">{error}</div>}

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <label htmlFor="loginId">아이디 또는 이메일</label>
                        <input
                            type="text"
                            id="loginId"
                            name="loginId"
                            value={credentials.loginId}
                            onChange={handleChange}
                            placeholder="예: aclinic 또는 aclinic@arcdent.local"
                            autoComplete="username"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">비밀번호</label>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            value={credentials.password}
                            onChange={handleChange}
                            placeholder="비밀번호를 입력하세요"
                            autoComplete="current-password"
                        />
                    </div>

                    <label className="auth-remember" htmlFor="rememberId">
                        <input
                            type="checkbox"
                            id="rememberId"
                            checked={rememberId}
                            onChange={(event) => setRememberId(event.target.checked)}
                        />
                        <span>아이디 저장</span>
                    </label>

                    <button type="submit" className="auth-submit-btn" disabled={isSubmitting}>
                        {isSubmitting ? '로그인 중...' : '로그인'}
                    </button>
                </form>

                <div className="auth-footer">
                    <span>계정은 관리자에게 발급받아 사용합니다.</span>
                </div>
            </div>
        </div>
    );
};

export default Login;
