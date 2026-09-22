import React, { useEffect, useState } from 'react';
import { History, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { loadLoginLogs } from '../utils/supabaseAnalyticsStore';
import { describeUserAgent } from '../utils/userAgent';
import { useAuth } from '../context/AuthContext';

const formatLoginDate = (value) => {
    if (!value) return '-';
    return new Date(value).toLocaleString('ko-KR', {
        year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
};

// 관리자는 전체 치과, 치과 계정은 본인 치과의 로그인 기록만 보입니다.
// 이건 클라이언트에서 분기한 게 아니라 login_logs 테이블의 RLS(서버 권한 정책)가
// 자동으로 걸러주는 것입니다 — 어떤 계정으로 조회하든 같은 쿼리를 씁니다.
const LoginHistoryModal = ({ onClose }) => {
    const { isAdmin } = useAuth();
    const [logs, setLogs] = useState([]);
    const [clinicNames, setClinicNames] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError('');
            try {
                const rows = await loadLoginLogs({ limit: 50 });
                if (cancelled) return;
                setLogs(rows);

                if (isAdmin) {
                    const clinicIds = Array.from(new Set(rows.map(row => row.clinic_id).filter(Boolean)));
                    if (clinicIds.length > 0) {
                        const { data } = await supabase.from('clinics').select('id, name').in('id', clinicIds);
                        if (!cancelled && data) {
                            setClinicNames(Object.fromEntries(data.map(item => [item.id, item.name])));
                        }
                    }
                }
            } catch (err) {
                if (!cancelled) setError(err.message || '로그인 기록을 불러오지 못했습니다.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => { cancelled = true; };
    }, [isAdmin]);

    const columnCount = isAdmin ? 4 : 3;

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1000, padding: '1rem',
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: 'var(--card-bg)', borderRadius: '1.2rem',
                    boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
                    width: '100%', maxWidth: '720px',
                    maxHeight: '80vh', overflowY: 'auto', padding: '1.75rem',
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <History size={20} color="var(--text-primary)" />
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                            로그인 기록
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                    >
                        <X size={22} />
                    </button>
                </div>

                {error && (
                    <div style={{ padding: '0.75rem 1rem', borderRadius: '0.6rem', background: '#fef2f2', color: '#b91c1c', fontSize: '0.85rem', marginBottom: '1rem' }}>
                        {error}
                    </div>
                )}

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{ textAlign: 'left', padding: '0.6rem 0.5rem', color: 'var(--text-secondary)', fontWeight: 700 }}>일시</th>
                                {isAdmin && (
                                    <th style={{ textAlign: 'left', padding: '0.6rem 0.5rem', color: 'var(--text-secondary)', fontWeight: 700 }}>치과</th>
                                )}
                                <th style={{ textAlign: 'left', padding: '0.6rem 0.5rem', color: 'var(--text-secondary)', fontWeight: 700 }}>이메일</th>
                                <th style={{ textAlign: 'left', padding: '0.6rem 0.5rem', color: 'var(--text-secondary)', fontWeight: 700 }}>기기</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={columnCount} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>불러오는 중입니다.</td></tr>
                            ) : logs.length === 0 ? (
                                <tr><td colSpan={columnCount} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>로그인 기록이 없습니다.</td></tr>
                            ) : logs.map(log => (
                                <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '0.55rem 0.5rem', color: 'var(--text-primary)' }}>{formatLoginDate(log.created_at)}</td>
                                    {isAdmin && (
                                        <td style={{ padding: '0.55rem 0.5rem', color: 'var(--text-primary)' }}>{clinicNames[log.clinic_id] || '-'}</td>
                                    )}
                                    <td style={{ padding: '0.55rem 0.5rem', color: 'var(--text-primary)' }}>{log.email || '-'}</td>
                                    <td style={{ padding: '0.55rem 0.5rem', color: 'var(--text-primary)' }} title={log.user_agent || ''}>
                                        {describeUserAgent(log.user_agent)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default LoginHistoryModal;
