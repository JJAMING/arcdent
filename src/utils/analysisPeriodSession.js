import { useEffect, useState } from 'react';
import { getCurrentYearString } from './dateUtils';

export const ANALYSIS_PERIOD_SESSION_KEY_PREFIX = 'arcdent_analysis_period:';

const MONTH_PATTERN = /^(?:[1-9]|1[0-2])월$/;
const HALF_VALUES = new Set(['all', 'first', 'second']);

const getStorageKey = (scope) => `${ANALYSIS_PERIOD_SESSION_KEY_PREFIX}${scope}`;

const getDefaultPeriod = () => ({
    selectedYear: getCurrentYearString(),
    half: 'all',
    monthFilter: 'all',
});

const readPeriod = (scope) => {
    const fallback = getDefaultPeriod();
    if (typeof window === 'undefined') return fallback;

    try {
        const saved = JSON.parse(window.sessionStorage.getItem(getStorageKey(scope)) || 'null');
        if (!saved || typeof saved !== 'object') return fallback;

        return {
            selectedYear: /^\d{4}$/.test(String(saved.selectedYear || '')) ? String(saved.selectedYear) : fallback.selectedYear,
            half: HALF_VALUES.has(saved.half) ? saved.half : fallback.half,
            monthFilter: saved.monthFilter === 'all' || MONTH_PATTERN.test(String(saved.monthFilter || ''))
                ? saved.monthFilter
                : fallback.monthFilter,
        };
    } catch {
        return fallback;
    }
};

// 분석 화면이 다시 마운트되어도 현재 로그인 세션의 기간 선택을 유지한다.
export const useSessionAnalysisPeriod = (scope) => {
    const [period, setPeriod] = useState(() => readPeriod(scope));

    useEffect(() => {
        try {
            window.sessionStorage.setItem(getStorageKey(scope), JSON.stringify(period));
        } catch {
            // 브라우저 저장소를 사용할 수 없는 환경에서는 현재 화면 상태만 사용한다.
        }
    }, [scope, period]);

    return {
        selectedYear: period.selectedYear,
        half: period.half,
        monthFilter: period.monthFilter,
        setSelectedYear: (nextYear) => setPeriod(current => ({
            ...current,
            selectedYear: typeof nextYear === 'function' ? nextYear(current.selectedYear) : String(nextYear),
        })),
        setHalf: (nextHalf) => setPeriod(current => ({
            ...current,
            half: typeof nextHalf === 'function' ? nextHalf(current.half) : nextHalf,
        })),
        setMonthFilter: (nextMonth) => setPeriod(current => ({
            ...current,
            monthFilter: typeof nextMonth === 'function' ? nextMonth(current.monthFilter) : nextMonth,
        })),
    };
};

export const clearSessionAnalysisPeriods = () => {
    if (typeof sessionStorage === 'undefined') return;

    Object.keys(sessionStorage)
        .filter(key => key.startsWith(ANALYSIS_PERIOD_SESSION_KEY_PREFIX))
        .forEach(key => sessionStorage.removeItem(key));
};
