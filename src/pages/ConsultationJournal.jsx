import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ListChecks, NotebookPen, Pencil, Save, Settings2, Trash2, X } from 'lucide-react';
import JournalOptionsEditor from '../components/journal/JournalOptionsEditor';
import { useAuth } from '../context/AuthContext';
import { getActiveAnalyticsClinicId } from '../utils/supabaseAnalyticsStore';
import { canViewItem, shouldHideAmounts } from '../utils/permissions';
import { loadLatestLiveStats, toDateKey } from '../utils/clinicOperations';
import {
    INSURANCE_DECISIONS,
    RECEPTION_STATUS,
    JOURNAL_RESULTS,
    JOURNAL_RESULT_LABEL,
    deleteJournalEntry,
    diagnosisAmountOf,
    effectiveAgreedAmount,
    findLatestJournalByChart,
    isHiddenDoctor,
    loadJournalEntries,
    loadEmrDoctors,
    loadJournalOptions,
    loadTodayReceptionPatients,
    normalizeJournalOptions,
    patientTypeFromEmr,
    rejectedAmountOf,
    saveJournalEntry,
    searchRecentPatients,
    summarizeJournalEntries,
    visibleDoctorOptions,
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

// 칸 바로 아래에 펼쳐지는 목록 (몇 글자 치면 걸러지고, 목록에 없으면 그대로 직접 입력)
const DropdownInput = ({ label, value, onChange, options, placeholder }) => {
    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState(0);
    const term = String(value || '').trim();
    const filtered = term && !options.includes(term) ? options.filter(option => option.includes(term)) : options;

    const choose = (option) => {
        onChange(option);
        setOpen(false);
    };
    const handleKeyDown = (event) => {
        if (!open || filtered.length === 0) return;
        if (event.key === 'ArrowDown') { event.preventDefault(); setHighlight(h => Math.min(filtered.length - 1, h + 1)); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); setHighlight(h => Math.max(0, h - 1)); }
        else if (event.key === 'Enter') { event.preventDefault(); choose(filtered[highlight]); }
        else if (event.key === 'Escape') setOpen(false);
    };

    return (
        <label className="journal-field journal-dropdown-field">
            <span>{label}</span>
            <input
                value={value}
                onChange={event => { onChange(event.target.value); setOpen(true); setHighlight(0); }}
                onFocus={() => { setOpen(true); setHighlight(0); }}
                onBlur={() => window.setTimeout(() => setOpen(false), 150)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder || '선택 또는 입력'}
                autoComplete="off"
            />
            {open && filtered.length > 0 && (
                <div className="journal-dropdown" role="listbox">
                    {filtered.map((option, index) => (
                        <button
                            key={option}
                            type="button"
                            className={`${index === highlight ? 'active' : ''} ${option === value ? 'is-selected' : ''}`}
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => choose(option)}
                        >
                            {option}
                        </button>
                    ))}
                </div>
            )}
        </label>
    );
};

// 버튼으로 고르기 + 목록에 없으면 직접 입력 (상담자, 원장님)
const ChipPicker = ({ label, value, onChange, options }) => {
    const [typing, setTyping] = useState(false);
    const isCustom = value && !options.includes(value);
    return (
        <div className="journal-field">
            <span>{label}</span>
            <div className="journal-chip-picker">
                {options.map(option => (
                    <button key={option} type="button" className={value === option ? 'active' : ''} onClick={() => onChange(value === option ? '' : option)}>
                        {option}
                    </button>
                ))}
                {isCustom && !typing && (
                    <button type="button" className="active" onClick={() => setTyping(true)}>{value}</button>
                )}
                {typing ? (
                    <input
                        autoFocus
                        value={value}
                        onChange={event => onChange(event.target.value)}
                        onBlur={() => setTyping(false)}
                        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); setTyping(false); } }}
                        placeholder="이름 입력"
                    />
                ) : (
                    <button type="button" className="is-add" onClick={() => setTyping(true)}>+ 직접 입력</button>
                )}
            </div>
        </div>
    );
};

const genderLabel = (gender) => (gender === 'F' ? '여' : gender === 'M' ? '남' : '');
const describePatient = (patient) => {
    const parts = [];
    if (patient.birth_year) parts.push(`${String(patient.birth_year).slice(2)}년생`);
    if (genderLabel(patient.gender)) parts.push(genderLabel(patient.gender));
    return parts.join('·');
};
const receptionTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '');

// 덴트웹 최근 내원 환자 검색 (성함 또는 차트번호). 칸이 비어 있으면 오늘 접수 환자를 보여줍니다.
const PatientSearchInput = ({ label, value, onChange, onPick, search, loadToday, placeholder, required, inputMode, onBlurExtra }) => {
    const [open, setOpen] = useState(false);
    const [results, setResults] = useState([]);
    const [highlight, setHighlight] = useState(0);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return undefined;
        let cancelled = false;
        const term = String(value || '').trim();
        setLoading(true);
        const timer = window.setTimeout(() => {
            (term ? search(term) : loadToday())
                .then(list => { if (!cancelled) { setResults(list); setHighlight(0); } })
                .finally(() => { if (!cancelled) setLoading(false); });
        }, term ? 180 : 0);
        return () => { cancelled = true; window.clearTimeout(timer); };
    }, [value, open, search, loadToday]);

    const pick = (patient) => {
        onPick(patient);
        setOpen(false);
    };

    const handleKeyDown = (event) => {
        if (!open || results.length === 0) return;
        if (event.key === 'ArrowDown') { event.preventDefault(); setHighlight(h => Math.min(results.length - 1, h + 1)); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); setHighlight(h => Math.max(0, h - 1)); }
        else if (event.key === 'Enter') { event.preventDefault(); pick(results[highlight]); }
        else if (event.key === 'Escape') setOpen(false);
    };

    const term = String(value || '').trim();
    const todayIso = toDateKey(new Date());
    return (
        <label className="journal-field journal-patient-search">
            <span>{label}</span>
            <input
                value={value}
                inputMode={inputMode}
                onChange={event => { onChange(event.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onBlur={() => { window.setTimeout(() => setOpen(false), 150); onBlurExtra?.(); }}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                required={required}
                autoComplete="off"
            />
            {open && (loading || results.length > 0) && (
                <div className="journal-patient-dropdown" role="listbox">
                    <div className="journal-patient-dropdown-title">{term ? '덴트웹 최근 30일 내원 환자' : '오늘 접수 환자'}</div>
                    {loading && results.length === 0 && <div className="journal-muted journal-patient-empty">찾는 중...</div>}
                    {results.map((patient, index) => (
                        <button
                            type="button"
                            key={patient.patient_key}
                            className={index === highlight ? 'active' : ''}
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => pick(patient)}
                        >
                            <strong>{patient.name}</strong>
                            <small>{describePatient(patient)}</small>
                            <span>차트 {patient.chart_no || '-'}</span>
                            <em>
                                {patient.last_reception_at && patient.last_visit_date === todayIso
                                    ? `오늘 ${receptionTime(patient.last_reception_at)} 접수`
                                    : `${String(patient.last_visit_date || '').slice(5).replace('-', '/')} 내원`}
                            </em>
                        </button>
                    ))}
                </div>
            )}
        </label>
    );
};

// ---------------------------------------------------------------------------
// 왼쪽: 오늘 접수 현황 (덴트웹 접수 목록) — 누르면 오른쪽 작성 폼에 채움
// ---------------------------------------------------------------------------
const RECEPTION_FILTERS = [
    { key: 'todo', label: '작성 전' },
    { key: 'new', label: '신환' },
    { key: 'all', label: '전체' },
];
const TodayReceptionPanel = ({ patients, loaded, isWritten, selectedChart, onPick }) => {
    const [filter, setFilter] = useState('todo');
    const isNewToday = (patient) => String(patient.registered_date || '') === toDateKey(new Date());
    const newPatients = patients.filter(isNewToday);
    const writtenNew = newPatients.filter(isWritten).length;
    const shown = patients.filter(patient => (
        filter === 'all' ? true : filter === 'new' ? isNewToday(patient) : !isWritten(patient)
    ));

    return (
        <aside className="journal-reception">
            <div className="journal-reception-head">
                <h3>오늘 접수 현황</h3>
                <span className="journal-muted">1분마다 새로고침</span>
            </div>
            <div className="journal-reception-stats">
                <div><span>접수</span><strong>{patients.length}</strong></div>
                <div><span>신환</span><strong className="is-new">{newPatients.length}</strong></div>
                <div className={newPatients.length > writtenNew ? 'is-warn' : ''}><span>신환 작성</span><strong>{writtenNew}/{newPatients.length}</strong></div>
            </div>
            <div className="journal-segment is-small">
                {RECEPTION_FILTERS.map(item => (
                    <button key={item.key} type="button" className={filter === item.key ? 'active' : ''} onClick={() => setFilter(item.key)}>{item.label}</button>
                ))}
            </div>
            <div className="journal-reception-list">
                {!loaded && <div className="journal-muted journal-reception-empty">불러오는 중...</div>}
                {loaded && patients.length === 0 && (
                    <div className="journal-muted journal-reception-empty">오늘 접수 환자가 없습니다. (EMR 연동 치과에서만 표시됩니다)</div>
                )}
                {loaded && patients.length > 0 && shown.length === 0 && (
                    <div className="journal-muted journal-reception-empty">{filter === 'todo' ? '모두 작성했습니다 👍' : '해당 환자가 없습니다.'}</div>
                )}
                {shown.map(patient => {
                    const written = isWritten(patient);
                    const status = RECEPTION_STATUS[patient.reception_status];
                    const isNew = isNewToday(patient);
                    return (
                        <button
                            key={patient.patient_key}
                            type="button"
                            className={`journal-reception-item ${selectedChart && selectedChart === patient.chart_no ? 'is-selected' : ''} ${written ? 'is-written' : ''}`}
                            onClick={() => onPick(patient)}
                        >
                            <span className="journal-reception-time">{receptionTime(patient.last_reception_at)}</span>
                            <span className="journal-reception-main">
                                <span className="journal-reception-name">
                                    <strong>{patient.name}</strong>
                                    <small>{describePatient(patient)}</small>
                                    <span className={`journal-patient-type patient-${isNew ? 'new' : 'returning'}`}>{isNew ? '신환' : '구환'}</span>
                                </span>
                                <span className="journal-reception-sub">
                                    차트 {patient.chart_no || '-'}
                                    {patient.reception_doctor ? ` · ${patient.reception_doctor}` : ''}
                                </span>
                            </span>
                            <span className="journal-reception-side">
                                {status && <span className={`journal-status status-${status.tone}`}>{status.label}</span>}
                                <span className={`journal-written ${written ? 'is-done' : ''}`}>{written ? '✓ 작성' : '작성 전'}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </aside>
    );
};

// ---------------------------------------------------------------------------
// 선택 목록 관리 창 (관리자모드 "상담일지 설정"과 같은 편집기)
// ---------------------------------------------------------------------------
const OptionsModal = ({ clinicId, onClose, onSaved }) => (
    <div className="journal-modal-backdrop" role="dialog" aria-modal="true" aria-label="선택 목록 관리">
        <div className="journal-modal">
            <div className="journal-modal-head">
                <h3>선택 목록 관리</h3>
                <button type="button" className="journal-icon-btn" onClick={onClose} aria-label="닫기"><X size={18} /></button>
            </div>
            <p className="journal-muted">작성 화면에서 고를 수 있는 목록입니다. 목록에 없는 값도 직접 입력할 수 있습니다.</p>
            <JournalOptionsEditor clinicId={clinicId} onCancel={onClose} onSaved={(saved) => { onSaved(saved); onClose(); }} />
        </div>
    </div>
);

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
    const [emrDoctors, setEmrDoctors] = useState([]);
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
        loadEmrDoctors(activeClinicId).then(setEmrDoctors);
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
        doctors: Array.from(new Set([...emrDoctors, ...options.doctors, ...entries.map(e => e.doctor).filter(Boolean)])),
    }), [options, entries, emrDoctors]);
    // 원장님 버튼: 덴트웹 재직 의사 + 직접 추가한 이름
    const doctorOptions = useMemo(() => visibleDoctorOptions(emrDoctors, options), [emrDoctors, options]);

    // 덴트웹 최근 내원 환자 검색
    const searchPatients = useCallback((term) => searchRecentPatients(activeClinicId, term), [activeClinicId]);
    const loadTodayPatients = useCallback(() => loadTodayReceptionPatients(activeClinicId, todayKey), [activeClinicId, todayKey]);
    const [todayPatients, setTodayPatients] = useState([]);
    const [todayPatientsLoaded, setTodayPatientsLoaded] = useState(false);
    useEffect(() => {
        let cancelled = false;
        setTodayPatientsLoaded(false);
        const load = () => loadTodayPatients().then(list => {
            if (cancelled) return;
            setTodayPatients(list);
            setTodayPatientsLoaded(true);
        });
        load();
        const timer = window.setInterval(load, 60 * 1000);
        return () => { cancelled = true; window.clearInterval(timer); };
    }, [loadTodayPatients, refreshKey]);
    // 오늘 상담일지를 쓴 환자 (차트번호 또는 성함으로 확인)
    const writtenToday = useMemo(() => {
        const charts = new Set(todayEntries.map(entry => entry.chartNo).filter(Boolean));
        const names = new Set(todayEntries.map(entry => entry.patientName).filter(Boolean));
        return (patient) => (patient.chart_no ? charts.has(patient.chart_no) : false) || names.has(patient.name);
    }, [todayEntries]);

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
    const lookupChart = async (chartNo = form.chartNo) => {
        if (form.id || !String(chartNo || '').trim()) return;
        try {
            const found = await findLatestJournalByChart(activeClinicId, chartNo);
            setPrevious(found);
            if (!found) return;
            setForm(current => ({
                ...current,
                patientName: current.patientName || found.patientName,
                patientType: current.emrPicked ? current.patientType : (found.date.slice(0, 7) === current.date.slice(0, 7) ? found.patientType : 'returning'),
                visitChannel: current.visitChannel || found.visitChannel,
                counselor: current.counselor || found.counselor,
                doctor: current.doctor || found.doctor,
                treatmentCategory: current.treatmentCategory || found.treatmentCategory,
            }));
        } catch {
            setPrevious(null);
        }
    };
    // 덴트웹 환자를 고르면 성함·차트번호·신환/구환을 채우고, 이전 상담이 있으면 불러옵니다.
    const pickPatient = (patient, { fresh = false } = {}) => {
        const startFresh = fresh || Boolean(form.id);
        if (startFresh) {
            setTouched({ diagnosis: false, agreed: false });
            setPrevious(null);
        }
        const date = startFresh ? todayKey : form.date;
        const type = patientTypeFromEmr(patient, date);
        const receptionDoctor = patient.reception_doctor && !isHiddenDoctor(patient.reception_doctor, options) ? patient.reception_doctor : '';
        setForm(current => {
            const base = startFresh ? emptyForm(date) : current;
            return {
                ...base,
                patientName: patient.name || base.patientName,
                chartNo: patient.chart_no || base.chartNo,
                patientType: type || base.patientType,
                doctor: receptionDoctor || base.doctor,
                emrPicked: Boolean(type),
            };
        });
        if (patient.chart_no) lookupChart(patient.chart_no);
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
            const { emrPicked, ...formValues } = form; // eslint-disable-line no-unused-vars
            const saved = await saveJournalEntry(activeClinicId, {
                ...formValues,
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

    const handleOptionsSaved = (saved) => {
        setOptions(saved);
        setMessage({ tone: 'success', text: '선택 목록을 저장했습니다.' });
    };

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
                <div className="journal-workspace">
                <TodayReceptionPanel
                    patients={todayPatients}
                    loaded={todayPatientsLoaded}
                    isWritten={writtenToday}
                    selectedChart={form.chartNo}
                    onPick={patient => pickPatient(patient, { fresh: true })}
                />
                <form className="journal-card journal-form" onSubmit={handleSave}>
                    <div className="journal-form-grid">
                        <label className="journal-field">
                            <span>상담 날짜 *</span>
                            <input type="date" value={form.date} max={todayKey} onChange={event => update({ date: event.target.value })} required />
                        </label>
                        <PatientSearchInput
                            label="차트번호"
                            value={form.chartNo}
                            onChange={value => update({ chartNo: value })}
                            onPick={pickPatient}
                            search={searchPatients}
                            loadToday={loadTodayPatients}
                            onBlurExtra={() => lookupChart()}
                            placeholder="예: 7001"
                        />
                        <PatientSearchInput
                            label="환자 성함 *"
                            value={form.patientName}
                            onChange={value => update({ patientName: value })}
                            onPick={pickPatient}
                            search={searchPatients}
                            loadToday={loadTodayPatients}
                            placeholder="이름 일부 입력 (예: 홍길)"
                            required
                        />
                        <div className="journal-field">
                            <span>구분</span>
                            <div className="journal-segment">
                                {[['new', '신환'], ['returning', '구환']].map(([value, label]) => (
                                    <button key={value} type="button" className={`patient-${value} ${form.patientType === value ? 'active' : ''}`} onClick={() => update({ patientType: value, emrPicked: false })}>{label}</button>
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

                    <div className="journal-form-grid is-stack">
                        <ChipPicker label="상담자" value={form.counselor} onChange={value => update({ counselor: value })} options={options.counselors} />
                        <ChipPicker label="담당 원장님" value={form.doctor} onChange={value => update({ doctor: value })} options={doctorOptions} />
                    </div>

                    <div className="journal-form-grid is-two">
                        <ChipPicker label="진료분류" value={form.treatmentCategory} onChange={value => update({ treatmentCategory: value })} options={options.treatmentCategories} />
                        <DropdownInput label="내원경로" value={form.visitChannel} onChange={value => update({ visitChannel: value })} options={options.visitChannels} />
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

                    <div className="journal-options-row">
                        <div className="journal-insurance">
                            <label className="journal-check">
                                <input type="checkbox" checked={form.isInsurance} onChange={event => update({ isInsurance: event.target.checked, insuranceDecision: event.target.checked ? form.insuranceDecision : '' })} />
                                <span>보험 상담</span>
                            </label>
                            {form.isInsurance && (
                                <div className="journal-chip-picker is-compact" role="group" aria-label="보험 결정 종류">
                                    {INSURANCE_DECISIONS.filter(item => item.value).map(item => (
                                        <button
                                            key={item.value}
                                            type="button"
                                            className={form.insuranceDecision === item.value ? 'active' : ''}
                                            onClick={() => update({ insuranceDecision: form.insuranceDecision === item.value ? '' : item.value })}
                                        >
                                            {item.label.replace(/\s?보험\s?/, '')}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <label className="journal-check">
                            <input type="checkbox" checked={form.planChanged} onChange={event => update({ planChanged: event.target.checked })} />
                            <span>치료계획 변동</span>
                        </label>
                        {showReason && (
                            <DropdownInput label={form.result === 'partial' ? '부분동의 사유' : '미동의 사유'} value={form.rejectReason} onChange={value => update({ rejectReason: value })} options={options.rejectReasons} />
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
                </div>
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
                                        <td><span className={`journal-patient-type patient-${entry.patientType}`}>{entry.patientType === 'new' ? '신환' : '구환'}</span></td>
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

            {showOptions && <OptionsModal clinicId={activeClinicId} onClose={() => setShowOptions(false)} onSaved={handleOptionsSaved} />}
        </div>
    );
};

export default ConsultationJournal;
