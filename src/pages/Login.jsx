import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck } from 'lucide-react';
import './Login.css';

const Login = ({ onSwitchToSignUp }) => {
    const { login } = useAuth();
    const [credentials, setCredentials] = useState({ email: '', password: '' });
    const [error, setError] = useState('');

    const handleChange = (e) => {
        const { name, value } = e.target;
        setCredentials(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');

        if (!credentials.email || !credentials.password) {
            setError('이메일과 비밀번호를 모두 입력해주세요.');
            return;
        }

        const result = login(credentials.email, credentials.password);
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
                    <p>로그인 후 서비스를 이용하실 수 있습니다.</p>
                </div>

                {error && <div className="auth-error">{error}</div>}

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <label htmlFor="email">이메일</label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            value={credentials.email}
                            onChange={handleChange}
                            placeholder="이메일을 입력하세요"
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
                        />
                    </div>

                    <button type="submit" className="auth-submit-btn">로그인</button>
                </form>

                <div className="auth-footer">
                    <span>계정이 없으신가요?</span>
                    <button onClick={onSwitchToSignUp} className="auth-switch-btn">
                        회원가입
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Login;
