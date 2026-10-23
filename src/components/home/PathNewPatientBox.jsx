import React, { useEffect, useMemo, useState } from 'react';
import { Route } from 'lucide-react';
import { loadAnalyticsData } from '../../utils/supabaseAnalyticsStore';

const TOP_COUNT = 5;
const SKIP_PATHS = new Set(['합계', '소계', '계', '총계', 'total']);
const pathKey = (name) => String(name || '').trim().replace(/\s+/g, '');

// 엑셀(신규환자 내원경로분포)로 올린 이번 달 경로별 신환 수를 모아 상위 5개 + 기타로 만듭니다.
const buildPathSummary = (rows, year, month) => {
    const candidates = rows
        .filter(row => Array.isArray(row.payload?.rows) && row.payload.rows.length > 0)
        .sort((a, b) => (Number(b.year) - Number(a.year)) || (Number(b.month) - Number(a.month)));
    // 이번 달 자료가 없으면 가장 최근 자료를 보여주고 몇 월 자료인지 알립니다.
    const picked = candidates.find(row => Number(row.year) === year && Number(row.month) === month)
        || candidates.find(row => (Number(row.year) * 12 + Number(row.month)) <= (year * 12 + month));
    if (!picked) return null;

    const counts = new Map();
    picked.payload.rows.forEach(item => {
        const key = pathKey(item.path);
        const count = Number(item.newPatient || 0);
        if (!key || SKIP_PATHS.has(key.toLowerCase()) || count <= 0) return;
        counts.set(key, (counts.get(key) || 0) + count);
    });
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((sum, [, count]) => sum + count, 0);
    if (total <= 0) return null;

    const top = sorted.slice(0, TOP_COUNT).map(([name, count]) => ({ name, count }));
    const restCount = sorted.slice(TOP_COUNT).reduce((sum, [, count]) => sum + count, 0);
    if (restCount > 0) top.push({ name: '기타', count: restCount, isRest: true });

    return {
        items: top,
        total,
        month: Number(picked.month),
        isCurrentMonth: Number(picked.year) === year && Number(picked.month) === month,
        updatedAt: picked.updated_at || null,
    };
};

const formatUpdated = (iso) => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getMonth() + 1}월 ${date.getDate()}일`;
};

const PathNewPatientBox = ({ clinicId, year, month }) => {
    const [rows, setRows] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        const handleUpdate = () => setRefreshKey(prev => prev + 1);
        window.addEventListener('newPatientAnalysisUpdated', handleUpdate);
        window.addEventListener('activeClinicChanged', handleUpdate);
        return () => {
            window.removeEventListener('newPatientAnalysisUpdated', handleUpdate);
            window.removeEventListener('activeClinicChanged', handleUpdate);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        if (!clinicId) return undefined;
        loadAnalyticsData({ clinicId, category: 'newPatient', subCategory: 'path_distribution' })
            .then(data => { if (!cancelled) setRows(data); })
            .catch(() => { if (!cancelled) setRows([]); });
        return () => { cancelled = true; };
    }, [clinicId, refreshKey]);

    const summary = useMemo(() => (rows ? buildPathSummary(rows, year, month) : null), [rows, year, month]);

    if (rows === null) return null;

    return (
        <div className="home-path-box">
            <div className="home-path-head">
                <span className="home-path-title"><Route size={15} /> 내원경로별 신환</span>
                {summary && <strong className="home-path-total">{summary.month}월 누적 {summary.total.toLocaleString()}명</strong>}
            </div>
            {summary ? (
                <>
                    <ul className="home-path-list">
                        {summary.items.map(item => {
                            const ratio = (item.count / summary.total) * 100;
                            return (
                                <li key={item.name} className={item.isRest ? 'is-rest' : ''}>
                                    <span className="home-path-name" title={item.name}>{item.name}</span>
                                    <span className="home-path-bar"><i style={{ width: `${Math.max(3, ratio)}%` }} /></span>
                                    <span className="home-path-count">{item.count.toLocaleString()}명 <small>{ratio.toFixed(0)}%</small></span>
                                </li>
                            );
                        })}
                    </ul>
                    <div className="home-path-note">
                        엑셀 업로드 기준{formatUpdated(summary.updatedAt) ? ` · ${formatUpdated(summary.updatedAt)} 반영` : ''}
                        {!summary.isCurrentMonth && ` · 이번 달 자료가 아직 없어 ${summary.month}월 자료입니다`}
                    </div>
                </>
            ) : (
                <div className="home-path-note">내원경로 엑셀을 업로드하면 이번 달 경로별 신환이 표시됩니다. (신환분석 메뉴)</div>
            )}
        </div>
    );
};

export default PathNewPatientBox;
