import React from 'react';

// 앱 어디선가 예상치 못한 오류가 나도 흰 화면 대신 안내를 보여주는 안전장치입니다.
// 처음 한 번은 자동으로 새로고침하고(1분에 1번까지), 그래도 안 되면 오류 내용과 버튼을 보여줍니다.
const AUTO_RELOAD_KEY = 'arcdent_error_auto_reload_at';

class AppErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('[Arcdent] 화면 오류:', error, info?.componentStack);
        try {
            const last = Number(window.sessionStorage.getItem(AUTO_RELOAD_KEY) || 0);
            if (Date.now() - last > 60 * 1000) {
                window.sessionStorage.setItem(AUTO_RELOAD_KEY, String(Date.now()));
                window.location.reload();
            }
        } catch {
            // 저장소를 못 쓰는 환경이면 자동 새로고침 없이 안내만 표시
        }
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;
        return (
            <div style={{
                minHeight: '100vh',
                display: 'grid',
                placeItems: 'center',
                padding: '1.5rem',
                background: 'var(--bg-color, #f8fafc)',
                color: 'var(--text-primary, #1e293b)',
            }}>
                <div style={{ maxWidth: 440, display: 'grid', gap: '0.9rem', justifyItems: 'center', textAlign: 'center' }}>
                    <img src="/icon-192.png" alt="" width="72" height="72" />
                    <strong style={{ fontSize: '1.1rem' }}>화면을 불러오는 중 문제가 발생했습니다</strong>
                    <span style={{ color: 'var(--text-secondary, #64748b)', lineHeight: 1.6 }}>
                        새로고침하면 대부분 해결됩니다. 계속 반복되면 아래 내용을 캡처해서 알려주세요.
                    </span>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        style={{ padding: '0.6rem 1.4rem', border: 0, borderRadius: '0.6rem', background: '#3b82f6', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
                    >
                        새로고침
                    </button>
                    <code style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748b)', wordBreak: 'break-all' }}>
                        {String(error?.message || error)}
                    </code>
                </div>
            </div>
        );
    }
}

export default AppErrorBoundary;
