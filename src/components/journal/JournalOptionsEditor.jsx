import React, { useEffect, useState } from 'react';
import { Plus, Save, X } from 'lucide-react';
import '../../pages/ConsultationJournal.css';
import { JOURNAL_OPTION_GROUPS, isHiddenDoctor, loadEmrDoctors, loadJournalOptions, normalizeJournalOptions, saveJournalOptions } from '../../utils/consultationJournal';

// 상담일지 선택 목록 (상담자, 원장님, 내원경로, 진료분류, 미동의 사유)
//  - 상담일지 화면의 "선택 목록 관리" 창과 관리자모드 "상담일지 설정" 탭에서 같이 씁니다.
//  - 원장님은 덴트웹 재직 의사가 자동으로 들어오고, 여기서 추가한 이름은 그 뒤에 붙습니다.
const JournalOptionsEditor = ({ clinicId, onSaved, onCancel, saveLabel = '저장' }) => {
    const [draft, setDraft] = useState(() => normalizeJournalOptions());
    const [emrDoctors, setEmrDoctors] = useState([]);
    const [inputs, setInputs] = useState({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        let cancelled = false;
        setError('');
        setSuccess('');
        if (!clinicId) return undefined;
        setLoading(true);
        Promise.all([loadJournalOptions(clinicId), loadEmrDoctors(clinicId)])
            .then(([options, doctors]) => {
                if (cancelled) return;
                setDraft(options);
                setEmrDoctors(doctors);
            })
            .catch(err => { if (!cancelled) setError(err.message); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [clinicId]);

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
        setSuccess('');
        try {
            const saved = await saveJournalOptions(clinicId, draft);
            setDraft(saved);
            setSuccess('선택 목록을 저장했습니다.');
            onSaved?.(saved);
        } catch (err) {
            setError(err.message || '저장하지 못했습니다.');
        } finally {
            setSaving(false);
        }
    };

    if (!clinicId) return <div className="journal-muted">치과를 먼저 선택해 주세요.</div>;

    return (
        <div className="journal-options-editor">
            {error && <div className="journal-alert is-error">{error}</div>}
            {success && <div className="journal-alert is-success">{success}</div>}
            {loading && <div className="journal-muted">불러오는 중...</div>}
            <div className="journal-options-grid">
                {JOURNAL_OPTION_GROUPS.map(group => (
                    <section key={group.key} className="journal-options-group">
                        <h4>{group.label}</h4>
                        {group.key === 'doctors' && (
                            <>
                            <div className="journal-options-emr">
                                <span>덴트웹 자동</span>
                                {emrDoctors.length > 0
                                    ? emrDoctors.map(name => {
                                        const autoHidden = isHiddenDoctor(name, {});
                                        const hidden = isHiddenDoctor(name, draft);
                                        return (
                                            <button
                                                key={name}
                                                type="button"
                                                className={`journal-chip is-emr ${hidden ? 'is-hidden' : ''}`}
                                                disabled={autoHidden}
                                                title={autoHidden ? '공용 계정이라 자동으로 숨김' : hidden ? '눌러서 다시 보이기' : '눌러서 숨기기'}
                                                onClick={() => setDraft(current => ({
                                                    ...current,
                                                    hiddenDoctors: hidden
                                                        ? current.hiddenDoctors.filter(item => item !== name)
                                                        : [...current.hiddenDoctors, name],
                                                }))}
                                            >
                                                {name}{hidden ? ' (숨김)' : ''}
                                            </button>
                                        );
                                    })
                                    : <span className="journal-muted">EMR 연동 후 재직 의사가 자동으로 들어옵니다</span>}
                            </div>
                            {emrDoctors.length > 0 && <span className="journal-muted">덴트웹 이름을 누르면 숨기거나 다시 보이게 합니다.</span>}
                            </>
                        )}
                        <div className="journal-chips">
                            {draft[group.key].length === 0 && <span className="journal-muted">{group.key === 'doctors' ? '추가한 이름 없음' : '아직 없습니다'}</span>}
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
                {onCancel && <button type="button" className="journal-btn" onClick={onCancel}>닫기</button>}
                <button type="button" className="journal-btn is-primary" onClick={save} disabled={saving || loading}>
                    <Save size={15} /> {saving ? '저장 중...' : saveLabel}
                </button>
            </div>
        </div>
    );
};

export default JournalOptionsEditor;
