import React, { useEffect, useMemo, useState } from 'react';
import { Edit3, Save, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
    getActiveAnalyticsClinicId,
    loadAnalyticsData,
    saveAnalyticsData,
} from '../utils/supabaseAnalyticsStore';
import './ManagementInsight.css';

const normalizeMonth = (month) => {
    if (month === null || month === undefined || month === '') return null;
    const parsed = Number(String(month).replace(/[^0-9]/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const buildInsightSubCategory = ({ categoryKey, subCategoryKey, period }) => (
    [categoryKey, subCategoryKey || 'overview', period || 'all']
        .map(part => String(part || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_'))
        .filter(Boolean)
        .join('__')
);

const ManagementInsight = ({
    categoryKey,
    subCategoryKey = 'overview',
    year,
    period = 'all',
    month = null,
    periodLabel = '전체',
    defaultInsight = '',
}) => {
    const { clinicId, isAdmin } = useAuth();
    const activeClinicId = getActiveAnalyticsClinicId(clinicId);
    const [savedText, setSavedText] = useState('');
    const [draftText, setDraftText] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const subCategory = useMemo(() => buildInsightSubCategory({
        categoryKey,
        subCategoryKey,
        period,
    }), [categoryKey, subCategoryKey, period]);

    const targetMonth = normalizeMonth(month);
    const displayText = savedText || defaultInsight || '현재 선택한 기간의 데이터를 기준으로 경영 인사이트를 작성할 수 있습니다.';

    useEffect(() => {
        let cancelled = false;

        const loadInsight = async () => {
            setError('');
            setSavedText('');
            if (!activeClinicId || !year || !categoryKey) return;

            try {
                const rows = await loadAnalyticsData({
                    clinicId: activeClinicId,
                    category: 'management_insight',
                    subCategory,
                    year,
                });
                if (cancelled) return;

                const found = rows.find(row => {
                    const rowMonth = row.month == null ? null : Number(row.month);
                    return rowMonth === targetMonth;
                });
                setSavedText(String(found?.payload?.text || '').trim());
            } catch (err) {
                if (!cancelled) setError(err.message || '인사이트를 불러오지 못했습니다.');
            }
        };

        loadInsight();
        return () => {
            cancelled = true;
        };
    }, [activeClinicId, year, categoryKey, subCategory, targetMonth]);

    const startEdit = () => {
        setDraftText(displayText);
        setIsEditing(true);
        setError('');
    };

    const cancelEdit = () => {
        setIsEditing(false);
        setDraftText('');
        setError('');
    };

    const saveInsight = async () => {
        if (!activeClinicId || !year) {
            setError('저장할 치과와 연도를 확인해 주세요.');
            return;
        }

        setIsSaving(true);
        setError('');
        try {
            const text = draftText.trim();
            await saveAnalyticsData({
                clinicId: activeClinicId,
                category: 'management_insight',
                subCategory,
                year,
                month: targetMonth,
                payload: {
                    text,
                    categoryKey,
                    subCategoryKey,
                    period,
                    periodLabel,
                    updatedAt: new Date().toISOString(),
                },
            });
            setSavedText(text);
            setIsEditing(false);
            window.dispatchEvent(new CustomEvent('managementInsightUpdated', {
                detail: { categoryKey, subCategoryKey, year, period, month: targetMonth },
            }));
        } catch (err) {
            setError(err.message || '인사이트 저장에 실패했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <section className="management-insight-card">
            <div className="management-insight-header">
                <div>
                    <h3>경영 인사이트</h3>
                    <p>{year}년 {periodLabel} 기준</p>
                </div>
                {isAdmin && !isEditing && (
                    <button type="button" className="insight-edit-btn" onClick={startEdit}>
                        <Edit3 size={15} />
                        수정
                    </button>
                )}
            </div>

            {isEditing ? (
                <div className="management-insight-editor">
                    <textarea
                        value={draftText}
                        onChange={event => setDraftText(event.target.value)}
                        rows={5}
                        placeholder="경영 인사이트를 입력하세요."
                    />
                    <div className="management-insight-actions">
                        <button type="button" className="insight-cancel-btn" onClick={cancelEdit} disabled={isSaving}>
                            <X size={15} />
                            취소
                        </button>
                        <button type="button" className="insight-save-btn" onClick={saveInsight} disabled={isSaving}>
                            <Save size={15} />
                            {isSaving ? '저장 중' : '저장'}
                        </button>
                    </div>
                </div>
            ) : (
                <p className="management-insight-text">{displayText}</p>
            )}

            {error && <p className="management-insight-error">{error}</p>}
        </section>
    );
};

export default ManagementInsight;
