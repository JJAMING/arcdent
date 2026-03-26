import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck } from 'lucide-react';
import './Login.css'; // Reusing the same CSS for consistency
import './SignUp.css';

const SignUp = ({ onSwitchToLogin }) => {
    const { signup } = useAuth();
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        password: '',
        clinicName: '',
        position: ''
    });
    const [privacyConsent, setPrivacyConsent] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleCheckboxChange = (e) => {
        setPrivacyConsent(e.target.checked);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');

        // Validation required fields
        const { name, phone, email, password, clinicName, position } = formData;
        if (!name || !phone || !email || !password || !clinicName || !position) {
            setError('모든 필수 항목을 입력해주세요.');
            return;
        }

        if (!privacyConsent) {
            setError('개인정보 수집 및 이용에 동의해야 회원가입이 가능합니다.');
            return;
        }

        const result = signup({ name, phone, email, password, clinicName, position });
        
        if (result.success) {
            setSuccess(true);
            setTimeout(() => {
                onSwitchToLogin();
            }, 2000);
        } else {
            setError(result.message);
        }
    };

    if (success) {
        return (
            <div className="auth-container">
                <div className="auth-card success-card">
                    <ShieldCheck size={64} className="auth-icon success-icon" />
                    <h2>회원가입 완료!</h2>
                    <p>성공적으로 가입되었습니다. 잠시 후 로그인 화면으로 이동합니다.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="auth-container signup-container">
            <div className="auth-card signup-card">
                <div className="auth-header">
                    <h1>회원가입</h1>
                    <p>Arcdent 서비스를 이용하기 위한 정보 입력</p>
                </div>

                {error && <div className="auth-error">{error}</div>}

                <form onSubmit={handleSubmit} className="auth-form signup-form">
                    <div className="form-group grid-item">
                        <label htmlFor="name">이름 <span className="required">*</span></label>
                        <input type="text" id="name" name="name" value={formData.name} onChange={handleChange} placeholder="홍길동" />
                    </div>

                    <div className="form-group grid-item">
                        <label htmlFor="phone">핸드폰 번호 <span className="required">*</span></label>
                        <input type="tel" id="phone" name="phone" value={formData.phone} onChange={handleChange} placeholder="010-0000-0000" />
                    </div>

                    <div className="form-group grid-item">
                        <label htmlFor="email">메일주소 (로그인 ID) <span className="required">*</span></label>
                        <input type="email" id="email" name="email" value={formData.email} onChange={handleChange} placeholder="example@email.com" />
                    </div>
                    
                    <div className="form-group grid-item">
                        <label htmlFor="password">비밀번호 <span className="required">*</span></label>
                        <input type="password" id="password" name="password" value={formData.password} onChange={handleChange} placeholder="비밀번호 설정" />
                    </div>

                    <div className="form-group grid-item">
                        <label htmlFor="clinicName">치과 이름 <span className="required">*</span></label>
                        <input type="text" id="clinicName" name="clinicName" value={formData.clinicName} onChange={handleChange} placeholder="치과명 입력" />
                    </div>

                    <div className="form-group grid-item">
                        <label htmlFor="position">직책 <span className="required">*</span></label>
                        <input type="text" id="position" name="position" value={formData.position} onChange={handleChange} placeholder="원장, 실장 등" />
                    </div>

                    <div className="privacy-consent">
                        <label className="checkbox-container">
                            <input 
                                type="checkbox" 
                                checked={privacyConsent} 
                                onChange={handleCheckboxChange} 
                            />
                            <span className="checkmark"></span>
                            <span className="consent-text">[필수] 개인정보 수집 및 이용에 동의합니다.</span>
                        </label>
                    </div>

                    <button type="submit" className="auth-submit-btn">가입하기</button>
                </form>

                <div className="auth-footer">
                    <span>이미 계정이 있으신가요?</span>
                    <button onClick={onSwitchToLogin} className="auth-switch-btn">
                        로그인
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SignUp;
