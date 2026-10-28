import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ListChecks, NotebookPen, Pencil, Plus, Save, Settings2, Trash2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getActiveAnalyticsClinicId } from '../utils/supabaseAnalyticsStore';
import { canViewItem, shouldHideAmounts } from '../utils/permissions';
import { loadLatestLiveStats, toDateKey } from '../utils/clinicOperations';
import {
    INSURANCE_DECISIONS,
    JOURNAL_OPTION_GROUPS,
    JOURNAL_RESULTS,
    JOURNAL_RESULT_LABEL,
    deleteJournalEntry,
    diagnosisAmountOf,
    effectiveAgreedAmount,
    findLatestJournalByChart,
    loadJournalEntries,
    loadJournalOptions,
    normalizeJournalOptions,
    rejectedAmountOf,
    saveJournalEntry,
    saveJournalOptions,
    summarizeJournalEntries,
} from '../utils/consultationJournal';
import './SalesAnalysis.css';
import './ConsultationJournal.css';

const ROWS_PER_PAGE = 20;
const won = (value) => `${Math.round(Number(value || 0)).toLocaleString()}원`;
const digits = (value) => String(value ?? '').replace(/[^\d]/g, '');
const withComma = (value) => (digits(value) ? Number(digits(value)).toLocaleString() : '');
const amountOf = (value) => Number(digits(value) || 0);
const monthKeyOf = (date) => toDateKey(date).slice(0, 7);
const shiftMonth = (monthKey, diff) => {
    const [y, m] = monthKey.split('-').map(Number);
    return monthKeyOf(new Date(y, m - 1 + diff, 1));
};
const monthRange = (monthKey) => {
    const [y, m] = monthKey.split('-').map(Number);
    return { from: `${monthKey}-01`, to: toDateKey(new Date(y, m, 0)) };
};

const emptyForm = (date) => ({
    id: null,
    date,
    chartNo: '',
    patientName: '',
    patientType: 'new',
    counselor: '',
    doctor: '',
    visitChannel: '',
    treatmentCategory: '',
    consultedTeeth: '',
    agreedTeeth: '',
    result: 'full',
    diagnosisAmount: '',
    consultationAmount: '',
    agreedAmount: '',
    isInsurance: false,
    insuranceDecision: '',
    planChanged: false,
    rejectReason: '',
    memo: '',
});

const toForm = (entry) => ({
    ...emptyForm(entry.date),
    ...entry,
    consultedTeeth: entry.consultedTeeth ? String(entry.consultedTeeth) : '',
    agreedTeeth: entry.agreedTeeth ? String(entry.agreedTeeth) : '',
    diagnosisAmount: withComma(entry.diagnosisAmount),
    consultationAmount: withComma(entry.consultationAmount),
    agreedAmount: withComma(entry.agreedAmount),
});

// 목록에 있는 값 + 직접 입력 (datalist)
const ChoiceInput = ({ id, label, value, onChange, options, placeholder }) => (
    <label className="journal-field">
        <span>{label}</span>
        <input list={`${id}-list`} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder || '선택 또는 입력'} />
        <datalist id={`${id}-list`}>
            {options.map(option => <option key={option} value={option} />)}
        </datalist>
    </label>
);

// ---------------------------------------------------------------------------
// 선택 목록 관리 (상담자, 원장님, 내원경로, 진료분류, 미동의 사유)
// ---------------------------------------------------------------------------
const OptionsEditor = ({ options, onClose, onSave }) => {
    const [draft, setDraft] = useState(() => normalizeJournalOptions(options));
    const [inputs, setInputs] = useState({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const add = (key) => {
        const value = String(inputs[key] || '').trim();
        if (!value) return;
        setDraft(current => ({ ...current, [key]: Array.from(new Set([...current[key], value])) }));
        setInputs(current => ({ ...current, [key]: '' }));
    };
    const remove = (key, value) => setDraft(current => ({ ...current, [key]: current[key].filter(item => item !== value) }));
    const save = async () => {
        setSaving(true);
        setError('');
        try {
            await onSave(draft);
            onClose();
        } catch (err) {
            setError(err.message || '저장하지 못했습니다.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="journal-modal-backdrop" role="dialog" aria-modal="true" aria-label="선택 목록 관리">
            <div className="journal-modal">
                <div className="journal-modal-head">
                    <h3>선택 목록 관리</h3>
                    <button type="button" className="journal-icon-btn" onClick={onClose} aria-label="닫기"><X size={18} /></button>
                </div>
                <p className="journal-muted">작성 화면에서 고를 수 있는 목록입니다. 목록에 없는 값도 직접 입력할 수 있습니다.</p>
                {error && <div className="journal-alert is-error">{error}</div>}
                <div className="journal-options-grid">
                    {JOURNAL_OPTION_GROUPS.map(group => (
                        <section key={group.key} className="journal-options-group">
                            <h4>{group.label}</h4>
                            <div className="journal-chips">
                                {draft[group.key].length === 0 && <span className="journal-muted">아직 없습니다</span>}
                                {draft[group.key].map(item => (
                                    <span key={item} className="journal-chip">
                                        {item}
                                        <button type="button" onClick={() => remove(group.key, item)} aria-label={`${item} 삭제`}><X size={12} /></button>
                                    </span>
                                ))}
                            </div>
                            <div className="journal-options-add">
                                <input
                                    value={inputs[group.key] || ''}
                                    onChange={event => setInputs(current => ({ ...current, [group.key]: event.target.value }))}
                                    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add(group.key); } }}
                                    placeholder={`${group.label} 추가`}
                                />
                                <button type="button" className="journal-btn" onClick={() => add(group.key)}><Plus size={14} /> 추가</button>
                            </div>
                        </section>
                    ))}
                </div>
                <div className="journal-modal-actions">
                    <button type="button" className="journal-btn" onClick={onClose}>취소</button>
                    <button type="button" className="journal-btn is-primary" onClick={save} disabled={saving}>
                        <Save size={15} /> {saving ? '저장 중...' : '저장'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const ConsultationJournal = () => {
    const { clinicId, isAdmin, permissions } = useAuth();
    const activeClinicId = getActiveAnalyticsClinicId(clinicId);
    const canWrite = isAdmin || canViewItem(permissions, 'journal', 'write');
    const canList = isAdmin || canViewItem(permissions, 'journal', 'list');
    const hideMoney = !isAdmin && shouldHideAmounts(permissions);
    const money = (value) => (hideMoney ? '비공개' : won(value));

    const todayKey = toDateKey(new Date());
    const [tab, setTab] = useState(canWrite ? 'write' : 'list');
    const [monthKey, setMonthKey] = useState(() => todayKey.slice(0, 7));
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(false);
    const [options, setOptions] = useState(() => normalizeJournalOptions());
    const [showOptions, setShowOptions] = useState(false);
    const [form, setForm] = useState(() => emptyForm(todayKey));
    const [touched, setTouched] = useState({ diagnosis: false, agreed: false });
    const [previous, setPrevious] = useState(null);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ tone: '', text: '' });
    const [todayNewPatients, setTodayNewPatients] = useState(null);
    const [filters, setFilters] = useState({ search: '', counselor: '', doctor: '', result: '' });
    const [page, setPage] = useState(1);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        if (!canWrite && tab === 'write') setTab('list');
    }, [canWrite, tab]);

    // 선택 목록
    useEffect(() => {
        if (!activeClinicId) return;
        loadJournalOptions(activeClinicId).then(setOptions).catch(err => setMessage({ tone: 'error', text: err.message }));
    }, [activeClinicId]);

    // 선택한 달의 상담일지
    useEffect(() => {
        let cancelled = false;
        if (!activeClinicId) {
            setEntries([]);
            return undefined;
        }
        setLoading(true);
        loadJournalEntries(activeClinicId, monthRange(monthKey))
            .then(list => { if (!cancelled) setEntries(list); })
            .catch(err => { if (!cancelled) setMessage({ tone: 'error', text: err.message }); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [activeClinicId, monthKey, refreshKey]);

    // 작성 누락 확인용: EMR 연동 치과의 오늘 신환 수 (숫자만)
    useEffect(() => {
        let cancelled = false;
        setTodayNewPatients(null);
        if (!activeClinicId) return undefined;
        loadLatestLiveStats(activeClinicId)
            .then(row => {
                if (cancelled || !row || String(row.stat_date) !== todayKey) return;
                setTodayNewPatients(Number(row.payload?.today?.newPatients || 0));
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [activeClinicId, todayKey, refreshKey]);

    useEffect(() => {
        const handle = () => setRefreshKey(key => key + 1);
        window.addEventListener('activeClinicChanged', handle);
        return () => window.removeEventListener('activeClinicChanged', handle);
    }, []);

    useEffect(() => { setPage(1); }, [monthKey, filters]);

    const summary = useMemo(() => summarizeJournalEntries(entries), [entries]);
    const todayEntries = useMemo(() => entries.filter(entry => entry.date === todayKey), [entries, todayKey]);
    const todayNewEntries = todayEntries.filter(entry => entry.patientType === 'new').length;
    const isCurrentMonth = monthKey === todayKey.slice(0, 7);

    const listOptions = useMemo(() => ({
        counselors: Array.from(new Set([...options.counselors, ...entries.map(e => e.counselor).filter(Boolean)])),
        doctors: Array.from(new Set([...options.doctors, ...entries.map(e => e.doctor).filter(Boolean)])),
    }), [options, entries]);

    const filteredEntries = useMemo(() => {
        const search = filters.search.trim();
        return entries.filter(entry => (
            (!search || entry.patientName.includes(search) || entry.chartNo.includes(search))
            && (!filters.counselor || entry.counselor === filters.counselor)
            && (!filters.doctor || entry.doctor === filters.doctor)
            && (!filters.result || entry.result === filters.result)
        ));
    }, [entries, filters]);
    const totalPages = Math.max(1, Math.ceil(filteredEntries.length / ROWS_PER_PAGE));
    const currentPage = Math.min(page, totalPages);
    const pagedEntries = filteredEntries.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

    // -----------------------------------------------------------------------
    // 작성 폼
    // -----------------------------------------------------------------------
    const update = (patch) => setForm(current => ({ ...current, ...patch }));

    const handleConsultationAmount = (value) => {
        const formatted = withComma(value);
        setForm(current => ({
            ...current,
            consultationAmount: formatted,
            // 진단금액은 처음엔 상담금액과 같게 (다르면 직접 고침)
            diagnosisAmount: touched.diagnosis ? current.diagnosisAmount : formatted,
            // 전체동의면 동의금액 = 상담금액
            agreedAmount: current.result === 'full' && !touched.agreed ? formatted : current.agreedAmount,
        }));
    };

    const handleResult = (result) => {
        setTouched(current => ({ ...current, agreed: false }));
        setForm(current => ({
            ...current,
            result,
            agreedAmount: result === 'full' ? current.consultationAmount : result === 'partial' ? current.agreedAmount : '',
            agreedTeeth: result === 'full' ? current.consultedTeeth : result === 'partial' ? current.agreedTeeth : '',
            rejectReason: result === 'full' ? '' : current.rejectReason,
        }));
    };

    const handleConsultedTeeth = (value) => {
        const clean = digits(value);
        setForm(current => ({ ...current, consultedTeeth: clean, agreedTeeth: current.result === 'full' ? clean : current.agreedTeeth }));
    };

    // 차트번호로 이전 상담 찾기 → 이름·구분·경로 자동 채움
    const lookupChart = async () => {
        if (form.id || !form.chartNo.trim()) return;
        try {
            const found = await findLatestJournalByChart(activeClinicId, form.chartNo);
            setPrevious(found);
            if (!found) return;
            setForm(current => ({
                ...current,
                patientName: current.patientName || found.patientName,
                patientType: found.date.slice(0, 7) === current.date.slice(0, 7) ? found.patientType : 'returning',
                visitChannel: current.visitChannel || found.visitChannel,
                counselor: current.counselor || found.counselor,
                doctor: current.doctor || found.doctor,
                treatmentCategory: current.treatmentCategory || found.treatmentCategory,
            }));
        } catch {
            setPrevious(null);
        }
    };
    const planChangeSuggested = Boolean(previous && !form.planChanged && amountOf(form.consultationAmount) > 0
        && amountOf(form.consultationAmount) !== Number(previous.consultationAmount || 0));

    const resetForm = (date = form.date || todayKey) => {
        setForm(emptyForm(date));
        setTouched({ diagnosis: false, agreed: false });
        setPrevious(null);
    };

    const handleSave = async (event) => {
        event.preventDefault();
        setSaving(true);
        setMessage({ tone: '', text: '' });
        try {
            const saved = await saveJournalEntry(activeClinicId, {
                ...form,
                diagnosisAmount: amountOf(form.diagnosisAmount),
                consultationAmount: amountOf(form.consultationAmount),
                agreedAmount: amountOf(form.agreedAmount),
            });
            setMessage({ tone: 'success', text: `${saved.patientName}님 상담일지를 ${form.id ? '수정' : '저장'}했습니다.` });
            if (saved.date.slice(0, 7) !== monthKey) setMonthKey(saved.date.slice(0, 7));
            setRefreshKey(key => key + 1);
            if (form.id) setTab('list');
            resetForm(saved.date);
        } catch (err) {
            setMessage({ tone: 'error', text: err.message || '저장하지 못했습니다.' });
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (entry) => {
        setForm(toForm(entry));
        setTouched({ diagnosis: true, agreed: true });
        setPrevious(null);
        setMessage({ tone: '', text: '' });
        setTab('write');
    };

    const handleDelete = async (entry) => {
        if (!window.confirm(`${entry.date} ${entry.patientName}님 상담일지를 삭제할까요? 삭제하면 되돌릴 수 없습니다.`)) return;
        try {
            await deleteJournalEntry(entry.id);
            setMessage({ tone: 'success', text: '삭제했습니다.' });
            setRefreshKey(key => key + 1);
        } catch (err) {
            setMessage({ tone: 'error', text: err.message || '삭제하지 못했습니다.' });
        }
    };

    const handleSaveOptions = useCallback(async (draft) => {
        const saved = await saveJournalOptions(activeClinicId, draft);
        setOptions(saved);
        setMessage({ tone: 'success', text: '선택 목록을 저장했습니다.' });
    }, [activeClinicId]);

    if (!activeClinicId) {
        return (
            <div className="analysis-page">
                <header className="page-header"><h1>상담일지</h1></header>
                <div className="journal-empty">관리자 모드에서 치과를 먼저 선택해 주세요.</div>
            </div>
        );
    }

    const [viewYear, viewMonth] = monthKey.split('-').map(Number);
    const showReason = form.result !== 'full';

    return (
        <div className="analysis-page journal-page">
            <header className="page-header journal-header">
                <div>
                    <h1>상담일지</h1>
                    <p className="journal-muted">상담 1건마다 기록하면 상담분석이 자동으로 채워집니다.</p>
                </div>
                <div className="journal-month-nav">
                    <button type="button" className="journal-icon-btn" onClick={() => setMonthKey(key => shiftMonth(key, -1))} aria-label="이전 달"><ChevronLeft size={18} /></button>
                    <strong>{viewYear}년 {viewMonth}월</strong>
                    <button type="button" className="journal-icon-btn" onClick={() => setMonthKey(key => shiftMonth(key, 1))} disabled={isCurrentMonth} aria-label="다음 달"><ChevronRight size={18} /></button>
                </div>
            </header>

            <div className="journal-summary">
                <div><span>상담</span><strong>{summary.total.toLocaleString()}건</strong><small>전체동의 {summary.full} · 부분 {summary.partial} · 미동의 {summary.rejected}</small></div>
                <div><span>동의율 (전체+부분)</span><strong>{summary.totalAgreementRate.toFixed(1)}%</strong><small>전체동의만 {summary.patientAgreementRate.toFixed(1)}%</small></div>
                <div><span>최종동의금액</span><strong>{money(summary.agreedAmount)}</strong><small>상담금액 대비 {hideMoney ? '-' : `${summary.amountAgreementRate.toFixed(1)}%`}</small></div>
                <div><span>비동의금액</span><strong className="is-danger">{money(summary.rejectedAmount)}</strong><small>부분·미동의·취소 합계</small></div>
                {isCurrentMonth && (
                    <div className={todayNewPatients !== null && todayNewEntries < todayNewPatients ? 'is-warn' : ''}>
                        <span>오늘 작성</span>
                        <strong>{todayEntries.length.toLocaleString()}건</strong>
                        <small>
                            {todayNewPatients !== null
                                ? `오늘 신환 ${todayNewPatients}명 · 신환 상담일지 ${todayNewEntries}건`
                                : `신환 ${todayNewEntries}건 · 구환 ${todayEntries.length - todayNewEntries}건`}
                        </small>
                    </div>
                )}
            </div>

            <nav className="tab-navigation">
                <ul className="tab-list">
                    {canWrite && (
                        <li className={tab === 'write' ? 'active' : ''} onClick={() => setTab('write')}>
                            <NotebookPen size={20} /><span>{form.id ? '상담일지 수정' : '작성'}</span>
                        </li>
                    )}
                    {canList && (
                        <li className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>
                            <ListChecks size={20} /><span>목록 ({entries.length})</span>
                        </li>
                    )}
                </ul>
                {canWrite && (
                    <button type="button" className="journal-btn journal-options-btn" onClick={() => setShowOptions(true)}>
                        <Settings2 size={15} /> 선택 목록 관리
                    </button>
                )}
            </nav>

            {message.text && <div className={`journal-alert is-${message.tone}`}>{message.text}</div>}

            {tab === 'write' && canWrite && (
                <form className="journal-card journal-form" onSubmit={handleSave}>
                    <div className="journal-form-grid">
                        <label className="journal-field">
                            <span>상담 날짜 *</span>
                            <input type="date" value={form.date} max={todayKey} onChange={event => update({ date: event.target.value })} required />
                        </label>
                        <label className="journal-field">
                            <span>차트번호</span>
                            <input value={form.chartNo} onChange={event => update({ chartNo: event.target.value })} onBlur={lookupChart} placeholder="예: 7001" />
                        </label>
                        <label className="journal-field">
                            <span>환자 성함 *</span>
                            <input value={form.patientName} onChange={event => update({ patientName: event.target.value })} placeholder="홍길동" required />
                        </label>
                        <div className="journal-field">
                            <span>구분</span>
                            <div className="journal-segment">
                                {[['new', '신환'], ['returning', '구환']].map(([value, label]) => (
                                    <button key={value} type="button" className={form.patientType === value ? 'active' : ''} onClick={() => update({ patientType: value })}>{label}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                    {previous && (
                        <div className="journal-hint">
                            이전 상담: {previous.date} · {JOURNAL_RESULT_LABEL[previous.result]} · 상담금액 {won(previous.consultationAmount)}
                            {planChangeSuggested && (
                                <button type="button" className="journal-link-btn" onClick={() => update({ planChanged: true })}>
                                    금액이 달라졌어요 → 치료계획 변동 체크
                                </button>
                            )}
                        </div>
                    )}

                    <div className="journal-form-grid">
                        <ChoiceInput id="journal-counselor" label="상담자" value={form.counselor} onChange={value => update({ counselor: value })} options={options.counselors} />
                        <ChoiceInput id="journal-doctor" label="담당 원장님 (진단)" value={form.doctor} onChange={value => update({ doctor: value })} options={options.doctors} />
                        <ChoiceInput id="journal-channel" label="내원경로" value={form.visitChannel} onChange={value => update({ visitChannel: value })} options={options.visitChannels} />
                        <ChoiceInput id="journal-category" label="진료분류" value={form.treatmentCategory} onChange={value => update({ treatmentCategory: value })} options={options.treatmentCategories} />
                    </div>

                    <div className="journal-field">
                        <span>상담결과 *</span>
                        <div className="journal-segment is-result">
                            {JOURNAL_RESULTS.map(item => (
                                <button key={item.value} type="button" className={`${form.result === item.value ? 'active' : ''} result-${item.value}`} onClick={() => handleResult(item.value)}>{item.label}</button>
                            ))}
                        </div>
                    </div>

                    <div className="journal-form-grid is-amounts">
                        <label className="journal-field">
                            <span>진단금액</span>
                            <input inputMode="numeric" value={form.diagnosisAmount} onChange={event => { setTouched(t => ({ ...t, diagnosis: true })); update({ diagnosisAmount: withComma(event.target.value) }); }} placeholder="원장님 제안 금액" />
                        </label>
                        <label className="journal-field">
                            <span>상담금액</span>
                            <input inputMode="numeric" value={form.consultationAmount} onChange={event => handleConsultationAmount(event.target.value)} placeholder="0" />
                        </label>
                        <label className="journal-field">
                            <span>동의금액</span>
                            <input
                                inputMode="numeric"
                                value={form.agreedAmount}
                                onChange={event => { setTouched(t => ({ ...t, agreed: true })); update({ agreedAmount: withComma(event.target.value) }); }}
                                disabled={form.result === 'declined' || form.result === 'cancelled'}
                                placeholder={form.result === 'declined' || form.result === 'cancelled' ? '0' : '동의한 금액'}
                            />
                        </label>
                        <label className="journal-field">
                            <span>상담치아</span>
                            <input inputMode="numeric" value={form.consultedTeeth} onChange={event => handleConsultedTeeth(event.target.value)} placeholder="개" />
                        </label>
                        <label className="journal-field">
                            <span>동의치아</span>
                            <input inputMode="numeric" value={form.agreedTeeth} onChange={event => update({ agreedTeeth: digits(event.target.value) })} disabled={form.result === 'declined' || form.result === 'cancelled'} placeholder="개" />
                        </label>
                    </div>
                    {showReason && amountOf(form.consultationAmount) > 0 && (
                        <div className="journal-hint">
                            비동의금액 {won(Math.max(0, amountOf(form.consultationAmount) - (form.result === 'partial' ? amountOf(form.agreedAmount) : 0)))} 으로 집계됩니다.
                        </div>
                    )}

                    <div className="journal-form-grid">
                        <label className="journal-check">
                            <input type="checkbox" checked={form.isInsurance} onChange={event => update({ isInsurance: event.target.checked, insuranceDecision: event.target.checked ? form.insuranceDecision : '' })} />
                            <span>보험 상담</span>
                        </label>
                        {form.isInsurance && (
                            <label className="journal-field">
                                <span>보험 결정 종류</span>
                                <select value={form.insuranceDecision} onChange={event => update({ insuranceDecision: event.target.value })}>
                                    {INSURANCE_DECISIONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                                </select>
                            </label>
                        )}
                        <label className="journal-check">
                            <input type="checkbox" checked={form.planChanged} onChange={event => update({ planChanged: event.target.checked })} />
                            <span>치료계획 변동</span>
                        </label>
                        {showReason && (
                            <ChoiceInput id="journal-reason" label={form.result === 'partial' ? '부분동의 사유' : '미동의 사유'} value={form.rejectReason} onChange={value => update({ rejectReason: value })} options={options.rejectReasons} />
                        )}
                    </div>

                    <label className="journal-field">
                        <span>상담 내용</span>
                        <textarea rows={3} value={form.memo} onChange={event => update({ memo: event.target.value })} placeholder="상담 내용, 다음 연락 계획 등" />
                    </label>

                    <div className="journal-form-actions">
                        {form.id && <button type="button" className="journal-btn" onClick={() => { resetForm(todayKey); setTab('list'); }}>수정 취소</button>}
                        {!form.id && <button type="button" className="journal-btn" onClick={() => resetForm()}>새로 쓰기</button>}
                        <button type="submit" className="journal-btn is-primary" disabled={saving}>
                            <Save size={15} /> {saving ? '저장 중...' : form.id ? '수정 저장' : '저장'}
                        </button>
                    </div>
                </form>
            )}

            {tab === 'list' && canList && (
                <div className="journal-card">
                    <div className="journal-filters">
                        <input value={filters.search} onChange={event => setFilters(f => ({ ...f, search: event.target.value }))} placeholder="성함·차트번호 검색" />
                        <select value={filters.counselor} onChange={event => setFilters(f => ({ ...f, counselor: event.target.value }))}>
                            <option value="">상담자 전체</option>
                            {listOptions.counselors.map(name => <option key={name} value={name}>{name}</option>)}
                        </select>
                        <select value={filters.doctor} onChange={event => setFilters(f => ({ ...f, doctor: event.target.value }))}>
                            <option value="">원장님 전체</option>
                            {listOptions.doctors.map(name => <option key={name} value={name}>{name}</option>)}
                        </select>
                        <select value={filters.result} onChange={event => setFilters(f => ({ ...f, result: event.target.value }))}>
                            <option value="">결과 전체</option>
                            {JOURNAL_RESULTS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                        </select>
                    </div>
                    <div className="sales-data-table-container">
                        <table className="sales-data-table journal-table">
                            <thead>
                                <tr>
                                    <th>날짜</th><th>성함</th><th>차트번호</th><th>구분</th><th>상담자</th><th>원장님</th>
                                    <th>내원경로</th><th>진료분류</th><th>치아<br />(상담/동의)</th><th>결과</th>
                                    <th>진단금액</th><th>상담금액</th><th>동의금액</th><th>비동의금액</th>
                                    <th>보험</th><th>계획<br />변동</th><th>사유</th><th>상담 내용</th>
                                    {canWrite && <th>관리</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {loading && <tr><td colSpan={canWrite ? 19 : 18} className="journal-muted">불러오는 중...</td></tr>}
                                {!loading && pagedEntries.length === 0 && (
                                    <tr><td colSpan={canWrite ? 19 : 18} className="journal-muted">{entries.length === 0 ? '이 달에 작성한 상담일지가 없습니다.' : '조건에 맞는 상담이 없습니다.'}</td></tr>
                                )}
                                {!loading && pagedEntries.map(entry => (
                                    <tr key={entry.id}>
                                        <td>{entry.date.slice(5).replace('-', '/')}</td>
                                        <td className="font-bold">{entry.patientName}</td>
                                        <td>{entry.chartNo || '-'}</td>
                                        <td>{entry.patientType === 'new' ? '신환' : '구환'}</td>
                                        <td>{entry.counselor || '-'}</td>
                                        <td>{entry.doctor || '-'}</td>
                                        <td>{entry.visitChannel || '-'}</td>
                                        <td>{entry.treatmentCategory || '-'}</td>
                                        <td>{entry.consultedTeeth || entry.agreedTeeth ? `${entry.consultedTeeth}/${entry.agreedTeeth}` : '-'}</td>
                                        <td><span className={`journal-result result-${entry.result}`}>{JOURNAL_RESULT_LABEL[entry.result]}</span></td>
                                        <td>{money(diagnosisAmountOf(entry))}</td>
                                        <td>{money(entry.consultationAmount)}</td>
                                        <td>{money(effectiveAgreedAmount(entry))}</td>
                                        <td className={rejectedAmountOf(entry) > 0 ? 'is-danger' : ''}>{money(rejectedAmountOf(entry))}</td>
                                        <td>{entry.isInsurance ? (INSURANCE_DECISIONS.find(item => item.value === entry.insuranceDecision)?.label || '보험') : '-'}</td>
                                        <td>{entry.planChanged ? '변동' : '-'}</td>
                                        <td>{entry.rejectReason || '-'}</td>
                                        <td className="journal-memo" title={entry.memo}>{entry.memo || '-'}</td>
                                        {canWrite && (
                                            <td className="journal-row-actions">
                                                <button type="button" className="journal-icon-btn" onClick={() => handleEdit(entry)} aria-label="수정"><Pencil size={15} /></button>
                                                <button type="button" className="journal-icon-btn is-danger" onClick={() => handleDelete(entry)} aria-label="삭제"><Trash2 size={15} /></button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {totalPages > 1 && (
                        <div className="journal-pagination">
                            <button type="button" className="journal-icon-btn" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} aria-label="이전 쪽"><ChevronLeft size={16} /></button>
                            <span>{currentPage} / {totalPages}</span>
                            <button type="button" className="journal-icon-btn" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} aria-label="다음 쪽"><ChevronRight size={16} /></button>
                        </div>
                    )}
                </div>
            )}

            {showOptions && <OptionsEditor options={options} onClose={() => setShowOptions(false)} onSave={handleSaveOptions} />}
        </div>
    );
};

export default ConsultationJournal;
