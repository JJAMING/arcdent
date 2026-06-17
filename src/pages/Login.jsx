import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck } from 'lucide-react';
import './Login.css';

const Login = () => {
    const { login } = useAuth();
    const [credentials, setCredentials] = useState({ loginId: '', password: '' });
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
