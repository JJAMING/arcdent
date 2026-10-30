import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, PlugZap, RefreshCw } from 'lucide-react';
import {
    DEFAULT_EMR_SETTINGS,
    describeAgentState,
    formatAgo,
    loadEmrOverview,
    saveEmrSettings,
} from '../../utils/emrIntegration';
import './EmrIntegrationPanel.css';

const REFRESH_MS = 60 * 1000;

// 관리자모드 > EMR 연동
// ① 전체 치과 연동 상태 한눈에 보기  ② 선택한 치과의 덴트웹 접속 설정(서버 IP 등)
// 덴트웹 아이디/비밀번호는 보안상 여기서 받지 않고, 각 치과 PC의 설치 화면(setup.bat)에서만 입력합니다.
const EmrIntegrationPanel = ({ clinics = [], clinicId, clinicName, onSelectClinic }) => {
    const [overview, setOverview] = useState({ settings: {}, statuses: {} });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [form, setForm] = useState({ ...DEFAULT_EMR_SETTINGS });
    const [saving, setSaving] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const [installInfo, setInstallInfo] = useState(null);

    // 새 치과 설치 파일 (빌드 때 public/agent 에 만들어짐)
    useEffect(() => {
        fetch('/agent/install.json', { cache: 'no-store' })
            .then(response => (response.ok ? response.json() : null))
            .then(setInstallInfo)
            .catch(() => setInstallInfo(null));
    }, []);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const result = await loadEmrOverview();
            setOverview(result);
            setError('');
        } catch (err) {
            setError(err.message || 'EMR 연동 정보를 불러오지 못했습니다.');
        } finally {
            setLoading(false);
            setNow(Date.now());
        }
    }, []);

    useEffect(() => {
        refresh();
        const timer = window.setInterval(refresh, REFRESH_MS);
        return () => window.clearInterval(timer);
    }, [refresh]);

    // 선택 치과가 바뀌거나 새로 불러오면 입력칸을 저장된 값으로 채웁니다.
    useEffect(() => {
        const saved = clinicId ? overview.settings[clinicId] : null;
        setForm(saved ? { ...saved } : { ...DEFAULT_EMR_SETTINGS });
    }, [clinicId, overview.settings]);

    const rows = useMemo(() => clinics.map(clinic => {
        const setting = overview.settings[clinic.id];
        const status = overview.statuses[clinic.id];
        return { clinic, setting, status, state: describeAgentState({ setting, status, now }) };
    }), [clinics, overview, now]);

    const counts = useMemo(() => rows.reduce((acc, row) => {
        acc[row.state.tone] = (acc[row.state.tone] || 0) + 1;
        return acc;
    }, {}), [rows]);

    const update = (patch) => setForm(current => ({ ...current, ...patch }));

    const handleSave = async () => {
        setSaving(true);
        try {
            await saveEmrSettings({ clinicId, settings: form });
            await refresh();
            setSuccess('저장했습니다. 중계 프로그램이 다음 전송 때(최대 몇 분) 새 설정을 적용합니다.');
            window.setTimeout(() => setSuccess(''), 4000);
        } catch (err) {
            setError(err.message || '저장에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    const selectedRow = rows.find(row => row.clinic.id === clinicId);

    return (
        <div className="admin-card emr-card">
            <div className="admin-card-header">
                <PlugZap size={24} className="admin-card-icon" />
                <h2>EMR 연동</h2>
            </div>
            <p className="admin-helper-text">
                치과별 덴트웹 서버 정보를 입력하고, 각 치과 중계 프로그램이 잘 동작하는지 확인합니다.
                덴트웹 아이디/비밀번호는 보안을 위해 치과 PC의 setup.bat 에서만 입력합니다.
            </p>
            {error && <div className="admin-history-error">{error}</div>}
            {success && <div className="admin-implant-success">{success}</div>}

            <section className="clinic-settings-section emr-install">
                <div className="emr-install-text">
                    <h3>새 치과 설치 파일</h3>
                    <p>
                        치과 PC(원격 접속 포함)에서 내려받아 <b>압축 풀기</b> → 폴더를 <code>{'C:\\arcdent-agent'}</code> 로 옮긴 뒤 <b>setup.bat</b> 을 실행하세요.
                        다른 치과의 비밀번호·기록은 들어 있지 않아 그 치과 중계 계정과 덴트웹 아이디만 새로 입력하면 됩니다.
                    </p>
                    {installInfo && !installInfo.hasDefaults && (
                        <p className="emr-install-warn">이 파일에는 Supabase 주소가 빠져 있어 setup.bat 이 주소와 키를 물어봅니다.</p>
                    )}
                </div>
                {installInfo ? (
                    <a className="admin-implant-primary-btn emr-install-btn" href={`/agent/${installInfo.file}?v=${installInfo.version}`} download="arcdent-agent.zip">
                        <Download size={15} /> 설치 파일 받기 <small>v{installInfo.version}</small>
                    </a>
                ) : (
                    <span className="admin-helper-text">설치 파일은 배포된 사이트에서 받을 수 있습니다.</span>
                )}
            </section>

            <section className="clinic-settings-section">
                <div className="clinic-settings-section-header">
                    <div>
                        <h3>전체 치과 연동 상태</h3>
                        <p>
                            정상 {counts.good || 0} · 오류 {counts.warn || 0} · 연결 끊김 {counts.bad || 0} · 미설정/중지 {counts.idle || 0}
                            <span className="emr-refresh-note"> (1분마다 자동 새로고침)</span>
                        </p>
                    </div>
                    <button type="button" className="admin-implant-secondary-btn emr-refresh-btn" onClick={refresh} disabled={loading}>
                        <RefreshCw size={15} className={loading ? 'is-spinning' : ''} /> 새로고침
                    </button>
                </div>
                <div className="emr-status-table-wrap">
                    <table className="emr-status-table">
                        <thead>
                            <tr>
                                <th>치과</th>
                                <th>상태</th>
                                <th>마지막 보고</th>
                                <th>내용</th>
                                <th>서버</th>
                                <th>설치 PC</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 ? (
                                <tr><td colSpan={6} className="emr-empty">등록된 치과가 없습니다.</td></tr>
                            ) : rows.map(({ clinic, setting, status, state }) => (
                                <tr
                                    key={clinic.id}
                                    className={clinic.id === clinicId ? 'is-selected' : ''}
                                    onClick={() => onSelectClinic?.(clinic.id)}
                                    title="클릭하면 아래에서 이 치과 설정을 수정합니다"
                                >
                                    <td className="emr-clinic-name">{clinic.name}</td>
                                    <td><span className={`emr-state tone-${state.tone}`}><i />{state.label}</span></td>
                                    <td>{status ? formatAgo(status.last_seen_at, now) : '-'}</td>
                                    <td className="emr-message" title={state.hint}>{state.hint || '-'}</td>
                                    <td>{setting?.server ? `${setting.server}${setting.port ? `:${setting.port}` : ''}` : '-'}</td>
                                    <td>{status?.hostname || '-'}{status?.agent_version ? <small> v{status.agent_version}</small> : null}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="clinic-settings-section">
                <div className="clinic-settings-section-header">
                    <div>
                        <h3>{clinicName || '치과 미선택'} — 덴트웹 접속 설정</h3>
                        <p>
                            중계 프로그램을 <strong>덴트웹 서버 PC에 설치했다면 127.0.0.1</strong>, 다른 PC에 설치했다면 서버 PC의 IP를 입력합니다.
                            {selectedRow?.status?.last_success_at ? ` 마지막 전송 성공: ${new Date(selectedRow.status.last_success_at).toLocaleString('ko-KR')}` : ''}
                        </p>
                    </div>
                    <label className="clinic-feature-toggle">
                        <input
                            type="checkbox"
                            checked={form.enabled}
                            disabled={!clinicId}
                            onChange={event => update({ enabled: event.target.checked })}
                        />
                        <span>{form.enabled ? '연동 켜짐' : '연동 중지'}</span>
                    </label>
                </div>
                <div className="emr-form-grid">
                    <label>
                        <span>서버 IP</span>
                        <input type="text" value={form.server} placeholder="예: 192.168.0.150 또는 127.0.0.1" disabled={!clinicId} onChange={event => update({ server: event.target.value })} />
                    </label>
                    <label>
                        <span>포트</span>
                        <input type="text" inputMode="numeric" value={form.port} placeholder="1436" disabled={!clinicId} onChange={event => update({ port: event.target.value.replace(/[^0-9]/g, '') })} />
                    </label>
                    <label>
                        <span>인스턴스 이름</span>
                        <input type="text" value={form.instance} placeholder="DENTWEB" disabled={!clinicId} onChange={event => update({ instance: event.target.value })} />
                        <small>포트를 비워두면 이 이름으로 접속합니다.</small>
                    </label>
                    <label>
                        <span>DB 이름</span>
                        <input type="text" value={form.databaseName} placeholder="DentWeb" disabled={!clinicId} onChange={event => update({ databaseName: event.target.value })} />
                    </label>
                    <label>
                        <span>전송 간격</span>
                        <select value={form.intervalSeconds} disabled={!clinicId} onChange={event => update({ intervalSeconds: Number(event.target.value) })}>
                            {[60, 120, 180, 300, 600].map(sec => <option key={sec} value={sec}>{sec / 60}분마다</option>)}
                        </select>
                    </label>
                </div>
                <div className="clinic-settings-actions">
                    <button type="button" className="admin-implant-primary-btn" onClick={handleSave} disabled={!clinicId || saving}>
                        {saving ? '저장 중...' : 'EMR 설정 저장'}
                    </button>
                </div>
            </section>
        </div>
    );
};

export default EmrIntegrationPanel;
