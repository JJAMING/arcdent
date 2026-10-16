import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Trash2 } from 'lucide-react';
import {
    WEEKDAY_DISPLAY_ORDER,
    WEEKDAY_LABELS,
    addHoliday,
    deleteHoliday,
    getMonthBusinessDays,
    loadGoalsForYear,
    loadHolidays,
    loadOperatingHours,
    normalizeWeeklyHours,
    saveGoalsForYear,
    saveOperatingHours,
} from '../../utils/clinicOperations';
import { GOAL_SALES_BASIS_OPTIONS, loadGoalSalesBasis, saveGoalSalesBasis } from '../../utils/clinicFeatureSettings';
import './ClinicOperationsPanel.css';

const MONTH_NUMBERS = Array.from({ length: 12 }, (_, index) => index + 1);

const formatNumberInput = (value) => (value === '' || value === null || value === undefined)
    ? ''
    : Number(value).toLocaleString('ko-KR');
const parseNumberInput = (text) => {
    const digits = String(text || '').replace(/[^0-9]/g, '');
    return digits === '' ? '' : Number(digits);
};

const buildYearOptions = () => {
    const current = new Date().getFullYear();
    return [current - 1, current, current + 1];
};

// 관리자모드 > 운영 설정 / 목표
// 선택한 치과의 요일별 진료시간, 휴무일, 월별 목표(매출=수납액 기준, 신환)를 입력합니다.
// 홈 화면은 이 값으로 남은 영업일과 목표 달성률을 계산합니다.
const ClinicOperationsPanel = ({ clinicId, clinicName }) => {
    const [weekly, setWeekly] = useState(() => normalizeWeeklyHours());
    const [hoursIsDefault, setHoursIsDefault] = useState(true);
    const [hoursSaving, setHoursSaving] = useState(false);

    const [holidayYear, setHolidayYear] = useState(() => new Date().getFullYear());
    const [holidays, setHolidays] = useState([]);
    const [newHolidayDate, setNewHolidayDate] = useState('');
    const [newHolidayLabel, setNewHolidayLabel] = useState('');
    const [holidaySaving, setHolidaySaving] = useState(false);

    const [goalYear, setGoalYear] = useState(() => new Date().getFullYear());
    const [goals, setGoals] = useState({});
    const [goalSaving, setGoalSaving] = useState(false);
    const [goalSalesBasis, setGoalSalesBasis] = useState('total');
    const [basisSaving, setBasisSaving] = useState(false);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const showSuccess = (message) => {
        window.dispatchEvent(new Event('clinicOperationsUpdated'));
        setError('');
        setSuccess(message);
        window.setTimeout(() => setSuccess(current => (current === message ? '' : current)), 3000);
    };

    const refreshHolidays = useCallback(async () => {
        if (!clinicId) return;
        const rows = await loadHolidays(clinicId, { from: `${holidayYear}-01-01`, to: `${holidayYear}-12-31` });
        setHolidays(rows);
    }, [clinicId, holidayYear]);

    useEffect(() => {
        let cancelled = false;
        if (!clinicId) {
            setWeekly(normalizeWeeklyHours());
            setHolidays([]);
            setGoals({});
            return undefined;
        }
        setLoading(true);
        setError('');
        loadOperatingHours(clinicId)
            .then(result => {
                if (cancelled) return;
                setWeekly(result.weekly);
                setHoursIsDefault(result.isDefault);
            })
            .catch(err => { if (!cancelled) setError(err.message || '진료시간을 불러오지 못했습니다.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [clinicId]);

    useEffect(() => {
        refreshHolidays().catch(err => setError(err.message || '휴무일을 불러오지 못했습니다.'));
    }, [refreshHolidays]);

    useEffect(() => {
        let cancelled = false;
        if (!clinicId) return undefined;
        loadGoalsForYear(clinicId, goalYear)
            .then(result => { if (!cancelled) setGoals(result); })
            .catch(err => { if (!cancelled) setError(err.message || '목표를 불러오지 못했습니다.'); });
        return () => { cancelled = true; };
    }, [clinicId, goalYear]);

    const updateDay = (day, patch) => {
        setWeekly(current => ({ ...current, [day]: { ...current[day], ...patch } }));
    };

    const handleSaveHours = async () => {
        setHoursSaving(true);
        try {
            const saved = await saveOperatingHours({ clinicId, weekly });
            setWeekly(saved);
            setHoursIsDefault(false);
            showSuccess('진료시간을 저장했습니다.');
        } catch (err) {
            setError(err.message || '진료시간 저장에 실패했습니다.');
        } finally {
            setHoursSaving(false);
        }
    };

    const handleAddHoliday = async () => {
        setHolidaySaving(true);
        try {
            await addHoliday({ clinicId, date: newHolidayDate, label: newHolidayLabel });
            setNewHolidayDate('');
            setNewHolidayLabel('');
            const addedYear = Number(String(newHolidayDate).slice(0, 4));
            if (addedYear && addedYear !== holidayYear) setHolidayYear(addedYear);
            else await refreshHolidays();
            showSuccess('휴무일을 추가했습니다.');
        } catch (err) {
            setError(err.message || '휴무일 추가에 실패했습니다.');
        } finally {
            setHolidaySaving(false);
        }
    };

    const handleDeleteHoliday = async (holiday) => {
        if (!window.confirm(`${holiday.holiday_date}${holiday.label ? ` (${holiday.label})` : ''} 휴무일을 삭제할까요?`)) return;
        try {
            await deleteHoliday(holiday.id);
            await refreshHolidays();
            showSuccess('휴무일을 삭제했습니다.');
        } catch (err) {
            setError(err.message || '휴무일 삭제에 실패했습니다.');
        }
    };

    useEffect(() => {
        let cancelled = false;
        if (!clinicId) return undefined;
        loadGoalSalesBasis(clinicId)
            .then(basis => { if (!cancelled) setGoalSalesBasis(basis); })
            .catch(() => { if (!cancelled) setGoalSalesBasis('total'); });
        return () => { cancelled = true; };
    }, [clinicId]);

    // 기준은 고르는 즉시 저장합니다. (월별 목표 금액과 따로 저장)
    const handleChangeBasis = async (basis) => {
        const previous = goalSalesBasis;
        setGoalSalesBasis(basis);
        setBasisSaving(true);
        try {
            await saveGoalSalesBasis({ clinicId, basis });
            showSuccess(`매출 목표 기준을 "${GOAL_SALES_BASIS_OPTIONS.find(option => option.value === basis)?.label}"(으)로 저장했습니다.`);
        } catch (err) {
            setGoalSalesBasis(previous);
            setError(err.message || '매출 목표 기준 저장에 실패했습니다.');
        } finally {
            setBasisSaving(false);
        }
    };

    const updateGoal = (month, key, text) => {
        const value = parseNumberInput(text);
        setGoals(current => ({ ...current, [month]: { ...(current[month] || {}), [key]: value } }));
    };

    const handleSaveGoals = async () => {
        setGoalSaving(true);
        try {
            const filled = Object.fromEntries(MONTH_NUMBERS
                .filter(month => goals[month] && (goals[month].salesGoal !== '' || goals[month].newPatientGoal !== ''))
                .map(month => [month, goals[month]]));
            await saveGoalsForYear({ clinicId, year: goalYear, goals: filled });
            showSuccess(`${goalYear}년 목표를 저장했습니다.`);
        } catch (err) {
            setError(err.message || '목표 저장에 실패했습니다.');
        } finally {
            setGoalSaving(false);
        }
    };

    // 이번 달 영업일 미리보기 (입력 중인 진료시간 기준)
    const businessPreview = useMemo(() => {
        const now = new Date();
        const monthHolidays = holidayYear === now.getFullYear() ? holidays : [];
        return getMonthBusinessDays({ now, weekly, holidays: monthHolidays });
    }, [weekly, holidays, holidayYear]);

    const disabled = !clinicId || loading;
    const now = new Date();

    return (
        <div className="admin-card clinic-ops-card">
            <div className="admin-card-header">
                <CalendarClock size={24} className="admin-card-icon" />
                <h2>운영 설정 / 목표</h2>
            </div>
            <p className="admin-helper-text">
                선택한 치과의 진료시간, 휴무일, 월별 목표를 입력합니다. 홈 화면은 이 값으로 남은 영업일과 목표 달성률을 계산합니다.
            </p>
            <div className="admin-implant-clinic-note">
                대상 치과: <strong>{clinicName || '치과 미선택'}</strong>
            </div>
            {error && <div className="admin-history-error">{error}</div>}
            {success && <div className="admin-implant-success">{success}</div>}

            <section className="clinic-settings-section">
                <div className="clinic-settings-section-header">
                    <div>
                        <h3>요일별 진료시간</h3>
                        <p>
                            진료하지 않는 요일은 체크를 해제하세요. 점심시간은 비워두면 계산에서 빼지 않습니다.
                            {hoursIsDefault && clinicId ? ' (아직 저장된 값이 없어 기본값을 보여주고 있습니다.)' : ''}
                        </p>
                    </div>
                </div>
                <div className="clinic-ops-hours">
                    <div className="clinic-ops-hours-row clinic-ops-hours-head">
                        <span>요일</span><span>진료</span><span>진료시간</span><span>점심시간</span>
                    </div>
                    {WEEKDAY_DISPLAY_ORDER.map(day => {
                        const item = weekly[day];
                        return (
                            <div key={day} className={`clinic-ops-hours-row ${item.open ? '' : 'is-closed'}`}>
                                <span className={`clinic-ops-day ${day === 0 ? 'is-sunday' : day === 6 ? 'is-saturday' : ''}`}>
                                    {WEEKDAY_LABELS[day]}
                                </span>
                                <label className="clinic-ops-open-toggle">
                                    <input
                                        type="checkbox"
                                        checked={item.open}
                                        disabled={disabled}
                                        onChange={event => updateDay(day, { open: event.target.checked })}
                                    />
                                    <span>{item.open ? '진료' : '휴진'}</span>
                                </label>
                                <span className="clinic-ops-time-range">
                                    <input type="time" value={item.start} disabled={disabled || !item.open} onChange={event => updateDay(day, { start: event.target.value })} />
                                    <em>~</em>
                                    <input type="time" value={item.end} disabled={disabled || !item.open} onChange={event => updateDay(day, { end: event.target.value })} />
                                </span>
                                <span className="clinic-ops-time-range">
                                    <input type="time" value={item.lunchStart} disabled={disabled || !item.open} onChange={event => updateDay(day, { lunchStart: event.target.value })} />
                                    <em>~</em>
                                    <input type="time" value={item.lunchEnd} disabled={disabled || !item.open} onChange={event => updateDay(day, { lunchEnd: event.target.value })} />
                                </span>
                            </div>
                        );
                    })}
                </div>
                <div className="clinic-settings-actions">
                    <button type="button" className="admin-implant-primary-btn" onClick={handleSaveHours} disabled={disabled || hoursSaving}>
                        {hoursSaving ? '저장 중...' : '진료시간 저장'}
                    </button>
                </div>
            </section>

            <section className="clinic-settings-section">
                <div className="clinic-settings-section-header">
                    <div>
                        <h3>휴무일</h3>
                        <p>공휴일, 여름휴가, 임시휴진 등 진료하지 않는 날짜를 추가하세요. 남은 영업일 계산에서 빠집니다.</p>
                    </div>
                    <label className="clinic-ops-year-select">
                        <span>연도</span>
                        <select value={holidayYear} onChange={event => setHolidayYear(Number(event.target.value))}>
                            {buildYearOptions().map(year => <option key={year} value={year}>{year}년</option>)}
                        </select>
                    </label>
                </div>
                <div className="clinic-ops-holiday-form">
                    <input type="date" value={newHolidayDate} disabled={disabled} onChange={event => setNewHolidayDate(event.target.value)} />
                    <input
                        type="text"
                        value={newHolidayLabel}
                        disabled={disabled}
                        placeholder="사유 (예: 추석, 여름휴가)"
                        maxLength={40}
                        onChange={event => setNewHolidayLabel(event.target.value)}
                        onKeyDown={event => { if (event.key === 'Enter' && newHolidayDate) handleAddHoliday(); }}
                    />
                    <button type="button" className="admin-implant-primary-btn" onClick={handleAddHoliday} disabled={disabled || holidaySaving || !newHolidayDate}>
                        {holidaySaving ? '추가 중...' : '휴무일 추가'}
                    </button>
                </div>
                {holidays.length === 0 ? (
                    <div className="clinic-ops-empty">{holidayYear}년에 등록된 휴무일이 없습니다.</div>
                ) : (
                    <ul className="clinic-ops-holiday-list">
                        {holidays.map(holiday => {
                            const date = new Date(`${holiday.holiday_date}T00:00:00`);
                            const isPast = holiday.holiday_date < `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                            return (
                                <li key={holiday.id} className={isPast ? 'is-past' : ''}>
                                    <span className="clinic-ops-holiday-date">
                                        {holiday.holiday_date.slice(5).replace('-', '/')} ({WEEKDAY_LABELS[date.getDay()]})
                                    </span>
                                    <span className="clinic-ops-holiday-label">{holiday.label || '휴무'}</span>
                                    <button type="button" title="삭제" onClick={() => handleDeleteHoliday(holiday)}>
                                        <Trash2 size={15} />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
                {clinicId && (
                    <div className="clinic-ops-preview">
                        이번 달({now.getMonth() + 1}월) 영업일 <strong>{businessPreview.totalDays}일</strong>
                        {' · '}오늘 포함 남은 영업일 <strong>{businessPreview.remainingDayCount}일</strong>
                        <small> (진료시간은 저장 전 입력값 기준)</small>
                    </div>
                )}
            </section>

            <section className="clinic-settings-section">
                <div className="clinic-settings-section-header">
                    <div>
                        <h3>월별 목표</h3>
                        <p>
                            매출 목표 기준을 고른 뒤 월별 목표를 입력하세요. 총매출은 덴트웹 월간 장부의 "합계(청구포함)"와 같은 기준입니다.
                            비워둔 달은 홈 화면에 "목표 미설정"으로 표시됩니다.
                        </p>
                    </div>
                    <label className="clinic-ops-year-select">
                        <span>매출 목표 기준</span>
                        <select value={goalSalesBasis} disabled={disabled || basisSaving} onChange={event => handleChangeBasis(event.target.value)}>
                            {GOAL_SALES_BASIS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                    </label>
                    <label className="clinic-ops-year-select">
                        <span>연도</span>
                        <select value={goalYear} onChange={event => setGoalYear(Number(event.target.value))}>
                            {buildYearOptions().map(year => <option key={year} value={year}>{year}년</option>)}
                        </select>
                    </label>
                </div>
                <div className="clinic-ops-goal-table-wrap">
                    <table className="clinic-ops-goal-table">
                        <thead>
                            <tr><th>월</th><th>매출 목표 (원)</th><th>신환 목표 (명)</th></tr>
                        </thead>
                        <tbody>
                            {MONTH_NUMBERS.map(month => {
                                const isCurrent = goalYear === now.getFullYear() && month === now.getMonth() + 1;
                                return (
                                    <tr key={month} className={isCurrent ? 'is-current' : ''}>
                                        <td>{month}월{isCurrent ? <em>이번 달</em> : null}</td>
                                        <td>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={formatNumberInput(goals[month]?.salesGoal)}
                                                placeholder="0"
                                                disabled={disabled}
                                                onChange={event => updateGoal(month, 'salesGoal', event.target.value)}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={formatNumberInput(goals[month]?.newPatientGoal)}
                                                placeholder="0"
                                                disabled={disabled}
                                                onChange={event => updateGoal(month, 'newPatientGoal', event.target.value)}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="clinic-settings-actions">
                    <button type="button" className="admin-implant-primary-btn" onClick={handleSaveGoals} disabled={disabled || goalSaving}>
                        {goalSaving ? '저장 중...' : `${goalYear}년 목표 저장`}
                    </button>
                </div>
            </section>
        </div>
    );
};

export default ClinicOperationsPanel;
