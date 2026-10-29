import React, { useCallback, useEffect, useState } from 'react';
import { Copy, MessageCircle, Plus, RefreshCw, Send, Trash2 } from 'lucide-react';
import { loadReportLogs, loadReportSettings, previewReport, saveReportSettings, sendTestReport } from '../../utils/dailyReport';
import './DailyReportPanel.css';

const SEND_TIMES = ['19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00'];
const STATUS_LABEL = { sent: '발송', failed: '실패', skipped: '건너뜀' };
const formatPhone = (value) => {
    const d = String(value || '').replace(/\D/g, '').slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`;
};

// 관리자모드 > 알림톡: 매일 저녁 카카오 알림톡 마감 보고 (치과별)
const DailyReportPanel = ({ clinicId, clinicName }) => {
    const [settings, setSettings] = useState(null);
    const [preview, setPreview] = useState(null);
    const [logs, setLogs] = useState([]);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const loadAll = useCallback(async () => {
        if (!clinicId) return;
        setError('');
        try {
            setSettings(await loadReportSettings(clinicId));
            setLogs(await loadReportLogs(clinicId));
        } catch (err) {
            setError(err.message);
        }
        previewReport(clinicId).then(setPreview).catch(err => setPreview({ error: err.message }));
    }, [clinicId]);

    useEffect(() => {
        setSettings(null);
        setPreview(null);
        setSuccess('');
        loadAll();
    }, [loadAll]);

    const updateRecipient = (index, patch) => setSettings(current => ({
        ...current,
        recipients: current.recipients.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));

    const handleSave = async () => {
        setBusy('save');
        setError('');
        setSuccess('');
        try {
            await saveReportSettings(clinicId, settings);
            setSuccess('알림톡 설정을 저장했습니다.');
            await loadAll();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy('');
        }
    };

    const handleTest = async () => {
        if (!window.confirm('저장된 받는 사람에게 지금 숫자로 테스트 알림톡을 보낼까요?')) return;
        setBusy('test');
        setError('');
        setSuccess('');
        try {
            const result = await sendTestReport(clinicId);
            setSuccess(result.message);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy('');
            setLogs(await loadReportLogs(clinicId));
        }
    };

    const copyTemplate = async () => {
        try {
            await navigator.clipboard.writeText(preview.templateText);
            setSuccess('알림톡 양식을 복사했습니다. 솔라피 → 카카오 알림톡 템플릿 등록에 그대로 붙여넣으세요.');
        } catch {
            setError('복사하지 못했습니다. 양식 칸을 직접 선택해서 복사해 주세요.');
        }
    };

    if (!clinicId) return <div className="admin-card"><p className="admin-helper-text">치과를 먼저 선택해 주세요.</p></div>;

    return (
        <div className="admin-card report-card">
            <div className="admin-card-header">
                <MessageCircle size={24} className="admin-card-icon" />
                <h2>알림톡 마감 보고 · {clinicName}</h2>
            </div>
            <p className="admin-helper-text">
                매일 정한 시각에 오늘 매출 · 신환 · 내원과 목표를 카카오 알림톡으로 보냅니다. 휴진일이거나 오늘 EMR 자료가 없으면 보내지 않습니다.
            </p>
            {error && <div className="admin-history-error">{error}</div>}
            {success && <div className="admin-implant-success">{success}</div>}
            {preview?.missingEnv?.length > 0 && (
                <div className="report-warning">
                    아직 발송 준비가 끝나지 않았습니다. Vercel 환경변수 필요: <b>{preview.missingEnv.join(', ')}</b>
                </div>
            )}

            <div className="report-grid">
                <section className="clinic-settings-section">
                    <h3>발송 설정</h3>
                    {!settings ? <p className="admin-helper-text">불러오는 중...</p> : (
                        <>
                            <label className="report-switch">
                                <input type="checkbox" checked={settings.enabled} onChange={event => setSettings(current => ({ ...current, enabled: event.target.checked }))} />
                                <span>매일 자동 발송 {settings.enabled ? '켜짐' : '꺼짐'}</span>
                            </label>
                            <label className="report-field">
                                <span>발송 시각</span>
                                <select value={settings.sendTime} onChange={event => setSettings(current => ({ ...current, sendTime: event.target.value }))}>
                                    {SEND_TIMES.map(time => <option key={time} value={time}>{time}</option>)}
                                </select>
                                <small>10분 간격으로 확인해서 보내므로 최대 10분 늦을 수 있습니다.</small>
                            </label>
                            <div className="report-field">
                                <span>받는 사람</span>
                                {settings.recipients.map((recipient, index) => (
                                    <div key={index} className="report-recipient">
                                        <input value={recipient.name} onChange={event => updateRecipient(index, { name: event.target.value })} placeholder="이름" maxLength={20} />
                                        <input value={formatPhone(recipient.phone)} onChange={event => updateRecipient(index, { phone: event.target.value })} placeholder="010-1234-5678" inputMode="tel" />
                                        {settings.recipients.length > 1 && (
                                            <button type="button" className="report-icon-btn" onClick={() => setSettings(current => ({ ...current, recipients: current.recipients.filter((_, i) => i !== index) }))} aria-label="삭제">
                                                <Trash2 size={15} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {settings.recipients.length < 5 && (
                                    <button type="button" className="admin-implant-secondary-btn report-add" onClick={() => setSettings(current => ({ ...current, recipients: [...current.recipients, { name: '', phone: '' }] }))}>
                                        <Plus size={14} /> 받는 사람 추가
                                    </button>
                                )}
                            </div>
                            <div className="clinic-settings-actions">
                                <button type="button" className="admin-implant-secondary-btn" onClick={handleTest} disabled={Boolean(busy)}>
                                    <Send size={14} /> {busy === 'test' ? '보내는 중...' : '테스트 발송'}
                                </button>
                                <button type="button" className="admin-implant-primary-btn" onClick={handleSave} disabled={Boolean(busy)}>
                                    {busy === 'save' ? '저장 중...' : '저장'}
                                </button>
                            </div>
                        </>
                    )}
                </section>

                <section className="clinic-settings-section">
                    <div className="report-preview-head">
                        <h3>지금 보내면 이렇게 갑니다</h3>
                        <button type="button" className="report-icon-btn" onClick={() => previewReport(clinicId).then(setPreview).catch(err => setPreview({ error: err.message }))} aria-label="새로고침">
                            <RefreshCw size={15} />
                        </button>
                    </div>
                    {!preview && <p className="admin-helper-text">불러오는 중...</p>}
                    {preview?.error && <p className="admin-helper-text">{preview.error}</p>}
                    {preview?.text && (
                        <>
                            <pre className="report-bubble">{preview.text}</pre>
                            <div className="report-bubble-button">{preview.templateButton?.name}</div>
                            {!preview.hasData && <p className="admin-helper-text">⚠️ 오늘 EMR 자료가 없어 자동 발송 시에는 건너뜁니다.</p>}
                            {!preview.openToday && <p className="admin-helper-text">⚠️ 오늘은 휴진일이라 자동 발송 시에는 건너뜁니다.</p>}
                        </>
                    )}
                </section>
            </div>

            {preview?.templateText && (
                <section className="clinic-settings-section">
                    <div className="report-preview-head">
                        <h3>솔라피에 등록할 알림톡 양식 (한 번만)</h3>
                        <button type="button" className="admin-implant-secondary-btn" onClick={copyTemplate}><Copy size={14} /> 양식 복사</button>
                    </div>
                    <pre className="report-template">{preview.templateText}</pre>
                    <p className="admin-helper-text">
                        버튼: {preview.templateButton?.type} · 이름 "{preview.templateButton?.name}" · 주소 {preview.templateButton?.url}
                        {preview.smsFallback ? ' · 알림톡 실패 시 문자로 대신 발송' : ' · 문자 대체발송 꺼짐 (SOLAPI_SENDER 없음)'}
                    </p>
                </section>
            )}

            <section className="clinic-settings-section">
                <h3>최근 발송 기록</h3>
                {logs.length === 0 ? <p className="admin-helper-text">아직 기록이 없습니다.</p> : (
                    <div className="table-responsive">
                        <table className="admin-table">
                            <thead><tr><th>시각</th><th>구분</th><th>결과</th><th>받는 사람</th><th>내용</th></tr></thead>
                            <tbody>
                                {logs.map((row, index) => (
                                    <tr key={index}>
                                        <td>{new Date(row.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                                        <td>{row.kind === 'test' ? '테스트' : '자동'}</td>
                                        <td><span className={`report-status status-${row.status}`}>{STATUS_LABEL[row.status] || row.status}</span></td>
                                        <td>{row.recipient || '-'}</td>
                                        <td className="report-log-message" title={row.message}>{row.message.split('\n')[0]}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
};

export default DailyReportPanel;
