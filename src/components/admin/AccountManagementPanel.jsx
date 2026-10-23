import React, { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Plus, RefreshCw, ShieldCheck, Trash2, UserCog, X } from 'lucide-react';
import {
    ACCOUNT_KIND_LABEL,
    LOGIN_DOMAIN,
    LOGIN_ID_RE,
    createAccount,
    deleteAccount,
    listAccounts,
    resetAccountPassword,
    setAccountEnabled,
    updateAccount,
} from '../../utils/adminAccounts';
import { EMPTY_PERMISSIONS, PERMISSION_CATALOG, describePermissions, normalizePermissions } from '../../utils/permissions';
import './AccountManagementPanel.css';

const formatDateTime = (iso) => (iso ? new Date(iso).toLocaleString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');

// ---------------------------------------------------------------------------
// 병원관리자 권한 편집: 메뉴 → 세부 항목 체크 + 금액 숨기기
// ---------------------------------------------------------------------------
const PermissionEditor = ({ value, onChange }) => {
    const permissions = normalizePermissions(value) || { ...EMPTY_PERMISSIONS };
    const hiddenMenus = new Set(permissions.hiddenMenus);
    const hiddenItems = new Set(permissions.hiddenItems);

    const update = (patch) => onChange(normalizePermissions({ ...permissions, ...patch }));
    const toggleMenu = (menu, visible) => {
        const nextMenus = new Set(hiddenMenus);
        const nextItems = new Set(hiddenItems);
        if (visible) {
            nextMenus.delete(menu);
            // 메뉴를 다시 켜면 세부 항목도 모두 켬
            PERMISSION_CATALOG.find(entry => entry.menu === menu)?.items.forEach(item => nextItems.delete(`${menu}:${item.key}`));
        } else {
            nextMenus.add(menu);
        }
        update({ hiddenMenus: Array.from(nextMenus), hiddenItems: Array.from(nextItems) });
    };
    const toggleItem = (menu, key, visible) => {
        const next = new Set(hiddenItems);
        if (visible) next.delete(`${menu}:${key}`);
        else next.add(`${menu}:${key}`);
        update({ hiddenItems: Array.from(next) });
    };

    return (
        <div className="account-permission-editor">
            <label className="account-permission-amount">
                <input type="checkbox" checked={permissions.hideAmounts} onChange={event => update({ hideAmounts: event.target.checked })} />
                <span>
                    <strong>금액 숨기기</strong>
                    <small>HOME 화면의 매출·수납 금액을 가립니다. (내원·신환 수는 보임)</small>
                </span>
            </label>
            <div className="account-permission-grid">
                {PERMISSION_CATALOG.map(entry => {
                    const menuVisible = !hiddenMenus.has(entry.menu);
                    return (
                        <div key={entry.menu} className={`account-permission-menu ${menuVisible ? '' : 'is-off'}`}>
                            <label className="account-permission-menu-title">
                                <input type="checkbox" checked={menuVisible} onChange={event => toggleMenu(entry.menu, event.target.checked)} />
                                <strong>{entry.label}</strong>
                            </label>
                            <div className="account-permission-items">
                                {entry.items.map(item => (
                                    <label key={item.key} className={menuVisible ? '' : 'is-disabled'}>
                                        <input
                                            type="checkbox"
                                            disabled={!menuVisible}
                                            checked={menuVisible && !hiddenItems.has(`${entry.menu}:${item.key}`)}
                                            onChange={event => toggleItem(entry.menu, item.key, event.target.checked)}
                                        />
                                        <span>{item.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
            <p className="account-permission-note">체크한 항목만 보입니다. 메뉴를 끄면 서버에서도 그 메뉴의 데이터를 막습니다.</p>
        </div>
    );
};

// ---------------------------------------------------------------------------
// 비밀번호 안내 (한 번만 표시)
// ---------------------------------------------------------------------------
const CredentialNotice = ({ notice, onClose }) => {
    const [copied, setCopied] = useState(false);
    if (!notice) return null;
    const text = notice.kind === 'agent'
        ? `중계 계정 이메일: ${notice.email}\n비밀번호: ${notice.password}`
        : `아크덴트 로그인\n아이디: ${notice.loginId}\n비밀번호: ${notice.password}\n주소: https://arcdent.vercel.app`;
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch { /* 복사 권한 없음 */ }
    };
    return (
        <div className="account-credential">
            <div className="account-credential-head">
                <strong><KeyRound size={16} /> {notice.title}</strong>
                <button type="button" onClick={onClose} title="닫기"><X size={16} /></button>
            </div>
            <pre>{text}</pre>
            <div className="account-credential-actions">
                <button type="button" className="admin-implant-primary-btn" onClick={copy}><Copy size={14} /> {copied ? '복사했습니다' : '복사'}</button>
                <span>⚠️ 비밀번호는 지금 한 번만 보입니다. 잊어버리면 [비밀번호 재설정]으로 새로 만드세요.</span>
            </div>
            {notice.kind === 'agent' && (
                <p className="account-credential-help">
                    치과 PC에서 <b>setup.bat</b> 실행 → "중계 계정 이메일 / 비밀번호"에 위 값을 넣으세요.
                    서버 IP는 <b>EMR 연동</b> 탭에서 입력합니다.
                </p>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// 관리자모드 > 계정 관리
// ---------------------------------------------------------------------------
const emptyForm = () => ({ loginId: '', displayName: '', kind: 'director', permissions: { ...EMPTY_PERMISSIONS } });

const AccountManagementPanel = ({ clinicId, clinicName, clinicCode }) => {
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [notice, setNotice] = useState(null);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(null); // { userId, displayName, kind, permissions }

    const refresh = useCallback(async () => {
        if (!clinicId) { setAccounts([]); return; }
        setLoading(true);
        try {
            setAccounts(await listAccounts(clinicId));
            setError('');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [clinicId]);

    useEffect(() => {
        setCreating(false);
        setEditing(null);
        setNotice(null);
        refresh();
    }, [refresh]);

    const flash = (message) => {
        setError('');
        setSuccess(message);
        window.setTimeout(() => setSuccess(current => (current === message ? '' : current)), 3500);
    };

    const openCreate = (kind = 'director') => {
        const code = String(clinicCode || '').toLowerCase().replace(/[^a-z0-9._-]/g, '');
        setForm({
            ...emptyForm(),
            kind,
            loginId: kind === 'agent' && code ? `${code}-agent` : kind === 'manager' && code ? `${code}-manager` : '',
            displayName: kind === 'agent' ? 'EMR 중계' : kind === 'manager' ? '실장님' : '원장님',
        });
        setCreating(true);
        setEditing(null);
    };

    const handleCreate = async () => {
        const loginId = form.loginId.trim().toLowerCase();
        if (!LOGIN_ID_RE.test(loginId)) {
            setError('아이디는 영문 소문자·숫자로 시작하는 3~30자입니다. (영문·숫자·. _ - 만 사용)');
            return;
        }
        setSaving(true);
        try {
            const result = await createAccount({
                clinicId,
                loginId,
                displayName: form.displayName,
                kind: form.kind,
                permissions: form.kind === 'manager' ? form.permissions : null,
            });
            setNotice({
                kind: form.kind,
                title: `${ACCOUNT_KIND_LABEL[form.kind]} 계정을 만들었습니다`,
                loginId: result.loginId,
                email: result.email,
                password: result.password,
            });
            setCreating(false);
            flash(result.message);
            refresh();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async (account) => {
        if (!window.confirm(`"${account.loginId}" 비밀번호를 새로 만들까요? 기존 비밀번호로는 더 이상 로그인할 수 없습니다.`)) return;
        try {
            const result = await resetAccountPassword(account.userId);
            setNotice({ kind: account.kind, title: `"${account.loginId}" 새 비밀번호`, loginId: account.loginId, email: account.email, password: result.password });
            flash(result.message);
        } catch (err) {
            setError(err.message);
        }
    };

    const handleToggle = async (account) => {
        const next = !account.enabled;
        if (!next && !window.confirm(`"${account.loginId}" 계정을 사용 중지할까요? 바로 로그인할 수 없게 됩니다.`)) return;
        try {
            const result = await setAccountEnabled(account.userId, next);
            flash(result.message);
            refresh();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleDelete = async (account) => {
        if (!window.confirm(`"${account.loginId}" 계정을 삭제할까요? 되돌릴 수 없습니다.`)) return;
        try {
            const result = await deleteAccount(account.userId);
            flash(result.message);
            refresh();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleSaveEdit = async () => {
        setSaving(true);
        try {
            const result = await updateAccount(editing);
            setEditing(null);
            flash(result.message);
            refresh();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const missingKey = /SERVICE_ROLE_KEY/.test(error);

    return (
        <div className="admin-card account-card">
            <div className="admin-card-header">
                <UserCog size={24} className="admin-card-icon" />
                <h2>계정 관리</h2>
            </div>
            <p className="admin-helper-text">
                선택한 치과의 로그인 계정을 만들고 관리합니다. 병원관리자 계정은 메뉴·세부 항목·금액별로 보이는 범위를 정할 수 있습니다.
            </p>
            <div className="admin-implant-clinic-note">대상 치과: <strong>{clinicName || '치과 미선택'}</strong></div>
            {error && (
                <div className="admin-history-error">
                    {error}
                    {missingKey && (
                        <div className="account-setup-help">
                            설정 방법: Supabase → Project Settings → API Keys에서 <b>service_role(secret)</b> 키 복사 →
                            Vercel → 프로젝트 → Settings → Environment Variables에 이름 <b>SUPABASE_SERVICE_ROLE_KEY</b>로 추가 → Deployments에서 Redeploy
                        </div>
                    )}
                </div>
            )}
            {success && <div className="admin-implant-success">{success}</div>}

            <CredentialNotice notice={notice} onClose={() => setNotice(null)} />

            <section className="clinic-settings-section">
                <div className="clinic-settings-section-header">
                    <div>
                        <h3>계정 목록</h3>
                        <p>로그인 아이디는 앱 로그인 화면에 그대로 입력합니다. (내부적으로 아이디@{LOGIN_DOMAIN})</p>
                    </div>
                    <div className="account-header-actions">
                        <button type="button" className="admin-implant-secondary-btn" onClick={refresh} disabled={loading || !clinicId}>
                            <RefreshCw size={14} /> 새로고침
                        </button>
                        <button type="button" className="admin-implant-secondary-btn" onClick={() => openCreate('agent')} disabled={!clinicId}>
                            <Plus size={14} /> 중계 계정
                        </button>
                        <button type="button" className="admin-implant-primary-btn" onClick={() => openCreate('director')} disabled={!clinicId}>
                            <Plus size={14} /> 계정 만들기
                        </button>
                    </div>
                </div>

                {creating && (
                    <div className="account-form">
                        <div className="account-form-row">
                            <label>
                                <span>계정 종류</span>
                                <div className="account-kind-tabs">
                                    {['director', 'manager', 'agent'].map(kind => (
                                        <button key={kind} type="button" className={form.kind === kind ? 'active' : ''} onClick={() => setForm(current => ({ ...current, kind }))}>
                                            {ACCOUNT_KIND_LABEL[kind]}
                                        </button>
                                    ))}
                                </div>
                            </label>
                            <label>
                                <span>로그인 아이디</span>
                                <input value={form.loginId} placeholder="예: barum" onChange={event => setForm(current => ({ ...current, loginId: event.target.value }))} />
                            </label>
                            <label>
                                <span>이름 (목록 표시용)</span>
                                <input value={form.displayName} maxLength={30} onChange={event => setForm(current => ({ ...current, displayName: event.target.value }))} />
                            </label>
                        </div>
                        <p className="account-kind-help">
                            {form.kind === 'director' && '원장님: 모든 메뉴를 볼 수 있습니다.'}
                            {form.kind === 'manager' && '병원관리자: 아래에서 체크한 메뉴·항목만 볼 수 있습니다.'}
                            {form.kind === 'agent' && 'EMR 중계 계정: 치과 PC의 중계 프로그램(setup.bat)에 넣는 계정입니다. 앱 화면에는 로그인할 수 없습니다.'}
                        </p>
                        {form.kind === 'manager' && (
                            <PermissionEditor value={form.permissions} onChange={permissions => setForm(current => ({ ...current, permissions }))} />
                        )}
                        <div className="clinic-settings-actions">
                            <button type="button" className="admin-implant-secondary-btn" onClick={() => setCreating(false)}>취소</button>
                            <button type="button" className="admin-implant-primary-btn" onClick={handleCreate} disabled={saving}>
                                {saving ? '만드는 중...' : '계정 만들기'}
                            </button>
                        </div>
                    </div>
                )}

                <div className="account-table-wrap">
                    <table className="account-table">
                        <thead>
                            <tr>
                                <th>아이디</th>
                                <th>이름</th>
                                <th>종류</th>
                                <th>보이는 범위</th>
                                <th>마지막 로그인</th>
                                <th>상태</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {loading && accounts.length === 0 ? (
                                <tr><td colSpan={7} className="account-empty">불러오는 중입니다.</td></tr>
                            ) : accounts.length === 0 ? (
                                <tr><td colSpan={7} className="account-empty">{clinicId ? '등록된 계정이 없습니다.' : '치과를 먼저 선택해 주세요.'}</td></tr>
                            ) : accounts.map(account => (
                                <React.Fragment key={account.userId}>
                                    <tr className={account.enabled ? '' : 'is-disabled'}>
                                        <td className="account-login">{account.loginId}</td>
                                        <td>{account.displayName || '-'}</td>
                                        <td><span className={`account-kind kind-${account.kind}`}>{ACCOUNT_KIND_LABEL[account.kind]}</span></td>
                                        <td className="account-scope">{account.kind === 'agent' ? '중계 프로그램 전용' : describePermissions(account.permissions)}</td>
                                        <td>{formatDateTime(account.lastSignInAt)}</td>
                                        <td><span className={`account-status ${account.enabled ? 'on' : 'off'}`}>{account.enabled ? '사용 중' : '중지'}</span></td>
                                        <td className="account-actions">
                                            {account.kind !== 'agent' && (
                                                <button type="button" title="권한·이름 수정" onClick={() => { setEditing({ userId: account.userId, displayName: account.displayName, kind: account.kind, permissions: account.permissions || { ...EMPTY_PERMISSIONS } }); setCreating(false); }}>
                                                    <ShieldCheck size={15} /> 권한
                                                </button>
                                            )}
                                            <button type="button" title="비밀번호 재설정" onClick={() => handleReset(account)}><KeyRound size={15} /> 비밀번호</button>
                                            <button type="button" title={account.enabled ? '사용 중지' : '다시 사용'} onClick={() => handleToggle(account)}>
                                                {account.enabled ? '중지' : '재개'}
                                            </button>
                                            <button type="button" className="danger" title="삭제" onClick={() => handleDelete(account)}><Trash2 size={15} /></button>
                                        </td>
                                    </tr>
                                    {editing?.userId === account.userId && (
                                        <tr className="account-edit-row">
                                            <td colSpan={7}>
                                                <div className="account-form">
                                                    <div className="account-form-row">
                                                        <label>
                                                            <span>계정 종류</span>
                                                            <div className="account-kind-tabs">
                                                                {['director', 'manager'].map(kind => (
                                                                    <button key={kind} type="button" className={editing.kind === kind ? 'active' : ''} onClick={() => setEditing(current => ({ ...current, kind }))}>
                                                                        {ACCOUNT_KIND_LABEL[kind]}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </label>
                                                        <label>
                                                            <span>이름</span>
                                                            <input value={editing.displayName} maxLength={30} onChange={event => setEditing(current => ({ ...current, displayName: event.target.value }))} />
                                                        </label>
                                                    </div>
                                                    {editing.kind === 'manager' && (
                                                        <PermissionEditor value={editing.permissions} onChange={permissions => setEditing(current => ({ ...current, permissions }))} />
                                                    )}
                                                    <div className="clinic-settings-actions">
                                                        <button type="button" className="admin-implant-secondary-btn" onClick={() => setEditing(null)}>취소</button>
                                                        <button type="button" className="admin-implant-primary-btn" onClick={handleSaveEdit} disabled={saving}>
                                                            {saving ? '저장 중...' : '저장'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};

export default AccountManagementPanel;
