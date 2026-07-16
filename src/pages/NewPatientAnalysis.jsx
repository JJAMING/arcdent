import React, { useState, useEffect, useMemo } from 'react';
import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, LineChart, Line
} from 'recharts';
import { Calendar, ChevronDown, ClipboardCheck, MapPin, Users, WalletCards } from 'lucide-react';
import DashboardCard from '../components/DashboardCard';
import MonthlySnapshotBarChart from '../components/MonthlySnapshotBarChart';
import ManagementInsight from '../components/ManagementInsight';
import AnalysisPeriodControls from '../components/AnalysisPeriodControls';
import { useAuth } from '../context/AuthContext';
import { getActiveAnalyticsClinicId, loadAnalyticsData } from '../utils/supabaseAnalyticsStore';
import { getCurrentYearString, getDefaultYearOptions } from '../utils/dateUtils';
import './SalesAnalysis.css';
import './TreatmentAnalysis.css';

const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b'];
const AGE_RANGES = ['0대', '10대', '20대', '30대', '40대', '50대', '60대', '70대+'];
const AGE_RATIO_SCOPES = [
    { value: 'all', label: '전체 비율' },
    { value: 'first', label: '상반기 비율' },
    { value: 'second', label: '하반기 비율' },
];
const DEFAULT_TREATMENT_RATES = {
    '지인소개': 0.72,
    '네이버예약': 0.64,
    '블로그/SNS': 0.58,
    '간판/외부': 0.52,
    '기타': 0.45,
};
const DEFAULT_INSURANCE_RATES = {
    '지인소개': 0.68,
    '네이버예약': 0.62,
    '블로그/SNS': 0.58,
    '간판/외부': 0.55,
    '기타': 0.50,
};

const MOCK_NEW_PATIENT_DATA = {
    '2025': MONTHS.map((month, index) => ({
        month,
        sources: {
            '지인소개': 18 + (index % 4) * 3,
            '네이버예약': 14 + (index % 3) * 4,
            '블로그/SNS': 11 + (index % 5) * 2,
            '간판/외부': 8 + (index % 2) * 3,
            '기타': 5 + (index % 3),
        },
        sourceRevenue: {
            '지인소개': 7200000 + index * 280000,
            '네이버예약': 6100000 + index * 240000,
            '블로그/SNS': 4300000 + index * 210000,
            '간판/외부': 2600000 + index * 160000,
            '기타': 1200000 + index * 90000,
        },
        ages: {
            '0대': 0,
            '10대': 4 + (index % 2),
            '20대': 13 + (index % 4),
            '30대': 22 + (index % 5),
            '40대': 19 + (index % 4),
            '50대': 12 + (index % 3),
            '60대': 8 + (index % 2),
            '70대+': 0,
        },
    })),
};

const formatWon = (value) => `${Math.round(value || 0).toLocaleString()}원`;

const normalizeAgeBuckets = (ages = {}) => {
    const normalized = Object.fromEntries(AGE_RANGES.map(range => [range, 0]));
    Object.entries(ages || {}).forEach(([range, count]) => {
        const key = range === '60대+' ? '60대' : range;
        if (key in normalized) normalized[key] += Number(count || 0);
    });
    return normalized;
};

const normalizeYearData = (rawYearData) => {
    if (!Array.isArray(rawYearData)) return null;
    return MONTHS.map((month) => {
        const found = rawYearData.find(item => item.month === month) || {};
        return {
            month,
            sources: found.sources || found.newPatientSources || {},
            sourceRevenue: found.sourceRevenue || found.newPatientSourceRevenue || {},
            sourceTreatments: found.sourceTreatments || found.newPatientSourceTreatments || {},
            sourceOldPatients: found.sourceOldPatients || found.oldPatientsBySource || {},
            sourceVisitPatients: found.sourceVisitPatients || found.visitPatientsBySource || {},
            sourceInsurancePatients: found.sourceInsurancePatients || found.newPatientSourceInsurancePatients || found.insurancePatientsBySource || {},
            sourceNonInsurancePatients: found.sourceNonInsurancePatients || found.newPatientSourceNonInsurancePatients || found.nonInsurancePatientsBySource || {},
            sourceInsuranceRatios: found.sourceInsuranceRatios || found.newPatientSourceInsuranceRatios || {},
            sourceNonInsuranceRatios: found.sourceNonInsuranceRatios || found.newPatientSourceNonInsuranceRatios || {},
            sourceAvgFee: found.sourceAvgFee || found.newPatientSourceAvgFee || found.averageFeeBySource || {},
            pathDistributionSummary: found.pathDistributionSummary || {},
            ages: normalizeAgeBuckets(found.ages || found.newPatientAges || {}),
        };
    });
};

const loadNewPatientData = (year) => {
    return normalizeYearData([]);
};

const buildNewPatientMapFromSupabaseRows = (pathRows = [], ageRows = []) => {
    const map = {};
    const ensureMonth = (year, monthNumber) => {
        const yearKey = String(year || '');
        const monthLabel = `${Number(monthNumber)}월`;
        if (!yearKey || !MONTHS.includes(monthLabel)) return null;
        if (!map[yearKey]) map[yearKey] = normalizeYearData([]);
        return map[yearKey].find(item => item.month === monthLabel);
    };

    pathRows.forEach(row => {
        const target = ensureMonth(row.year, row.month);
        if (!target) return;
        const payload = row.payload || {};
        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        if (rows.length > 0) {
            const sources = {};
            const sourceRevenue = {};
            const sourceAvgFee = {};
            const sourceOldPatients = {};
            const sourceVisitPatients = {};
            const sourceInsurancePatients = {};
            const sourceNonInsurancePatients = {};

            rows.forEach(item => {
                const path = item.path;
                if (!path) return;
                const newPatient = Number(item.newPatient || 0);
                const oldPatient = Number(item.oldPatient || item.oldPatients || 0);
                const visitPatient = Number(item.visitPatient || item.visitPatients || item.visitPatientsCount || (newPatient + oldPatient) || 0);
                sources[path] = newPatient;
                sourceOldPatients[path] = oldPatient;
                sourceVisitPatients[path] = visitPatient;
                sourceRevenue[path] = Number(item.totalFee || 0);
                sourceAvgFee[path] = Number(item.avgFee || 0);
                sourceInsurancePatients[path] = Number(item.insurancePatients || 0);
                sourceNonInsurancePatients[path] = Number(item.nonInsurancePatients || 0);
            });

            Object.assign(target, {
                sources,
                sourceRevenue,
                sourceAvgFee,
                sourceOldPatients,
                sourceVisitPatients,
                sourceInsurancePatients,
                sourceNonInsurancePatients,
                pathDistributionSummary: payload.summary || {},
            });
        }

        if (payload.insuranceRatios && Object.keys(payload.insuranceRatios).length > 0) {
            target.sourceInsuranceRatios = {
                ...(target.sourceInsuranceRatios || {}),
                ...payload.insuranceRatios,
            };
        }
        if (payload.nonInsuranceRatios && Object.keys(payload.nonInsuranceRatios).length > 0) {
            target.sourceNonInsuranceRatios = {
                ...(target.sourceNonInsuranceRatios || {}),
                ...payload.nonInsuranceRatios,
            };
        }
    });

    ageRows.forEach(row => {
        const target = ensureMonth(row.year, row.month);
        if (!target) return;
        target.ages = normalizeAgeBuckets(row.payload?.ages || {});
    });

    return map;
};

const collectNewPatientYears = (supabaseMap = null, includeLocal = true) => {
    const years = new Set(getDefaultYearOptions());
    try {
        if (includeLocal) {
            // Supabase 전환 후 로컬 캐시는 연도 산정에 사용하지 않습니다.
        }
        if (supabaseMap) Object.keys(supabaseMap).forEach(year => years.add(String(year)));
    } catch (e) {
        console.error(e);
    }
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
};

const NewPatientAnalysis = () => {
    const { clinicId } = useAuth();
    const activeClinicId = getActiveAnalyticsClinicId(clinicId);
    const [selectedYear, setSelectedYear] = useState(() => getCurrentYearString());
    const [availableYears, setAvailableYears] = useState(() => getDefaultYearOptions());
    const [isYearOpen, setIsYearOpen] = useState(false);
    const [half, setHalf] = useState('all');
    const [monthFilter, setMonthFilter] = useState('all');
    const [subTab, setSubTab] = useState('source');
    const [yearData, setYearData] = useState(() => normalizeYearData([]));
    const [supabaseNewPatientMap, setSupabaseNewPatientMap] = useState(null);

    useEffect(() => {
        const years = collectNewPatientYears(supabaseNewPatientMap, !activeClinicId);
        setAvailableYears(years);
        if (!years.includes(String(selectedYear))) setSelectedYear(getCurrentYearString());
    }, [supabaseNewPatientMap, selectedYear, activeClinicId]);

    useEffect(() => {
        let cancelled = false;

        const loadData = async () => {
            let supabaseMap = null;
            if (activeClinicId) {
                try {
                    const [pathRows, ageRows] = await Promise.all([
                        loadAnalyticsData({ clinicId: activeClinicId, category: 'newPatient', subCategory: 'path_distribution' }),
                        loadAnalyticsData({ clinicId: activeClinicId, category: 'newPatient', subCategory: 'age_distribution' }),
                    ]);
                    const nextMap = buildNewPatientMapFromSupabaseRows(pathRows, ageRows);
                    supabaseMap = Object.keys(nextMap).length > 0 ? nextMap : null;
                } catch (e) {
                    console.error('[NewPatientAnalysis] Supabase data load error:', e);
                }
            }

            if (cancelled) return;
            setSupabaseNewPatientMap(supabaseMap);
            setYearData(supabaseMap?.[selectedYear] || normalizeYearData([]));
        };

        loadData();
        return () => {
            cancelled = true;
        };
    }, [activeClinicId, selectedYear]);

    useEffect(() => {
        const handleNewPatientUpdate = () => {
            setSupabaseNewPatientMap(null);
            setAvailableYears(collectNewPatientYears(null, false));
            setYearData(normalizeYearData([]));
        };
        window.addEventListener('newPatientAnalysisUpdated', handleNewPatientUpdate);
        window.addEventListener('storage', handleNewPatientUpdate);
        window.addEventListener('activeClinicChanged', handleNewPatientUpdate);
        return () => {
            window.removeEventListener('newPatientAnalysisUpdated', handleNewPatientUpdate);
            window.removeEventListener('storage', handleNewPatientUpdate);
            window.removeEventListener('activeClinicChanged', handleNewPatientUpdate);
        };
    }, [selectedYear, activeClinicId]);

    const currentHalfData = useMemo(() => {
        if (monthFilter !== 'all') return yearData.filter(item => item.month === monthFilter);
        if (half === 'first') return yearData.slice(0, 6);
        if (half === 'second') return yearData.slice(6, 12);
        return yearData;
    }, [half, monthFilter, yearData]);
    const isMonthlyView = monthFilter !== 'all';

    const sourceSummary = useMemo(() => {
        const totals = new Map();
        currentHalfData.forEach(month => {
            Object.entries(month.sources || {}).forEach(([name, count]) => {
                totals.set(name, (totals.get(name) || 0) + Number(count || 0));
            });
        });
        return Array.from(totals.entries())
            .map(([name, value], index) => ({ name, value, color: COLORS[index % COLORS.length] }))
            .sort((a, b) => b.value - a.value);
    }, [currentHalfData]);

    const ageSummary = useMemo(() => {
        const totals = new Map();
        currentHalfData.forEach(month => {
            Object.entries(month.ages || {}).forEach(([range, count]) => {
                totals.set(range, (totals.get(range) || 0) + Number(count || 0));
            });
        });
        return AGE_RANGES.map(range => ({
            range,
            count: totals.get(range) || 0,
        }));
    }, [currentHalfData]);

    const unitPriceBySource = useMemo(() => {
        const counts = new Map();
        const revenues = new Map();
        currentHalfData.forEach(month => {
            Object.entries(month.sources || {}).forEach(([name, count]) => {
                counts.set(name, (counts.get(name) || 0) + Number(count || 0));
            });
            Object.entries(month.sourceRevenue || {}).forEach(([name, revenue]) => {
                revenues.set(name, (revenues.get(name) || 0) + Number(revenue || 0));
            });
        });
        return Array.from(counts.keys())
            .map((name, index) => {
                const count = counts.get(name) || 0;
                const revenue = revenues.get(name) || 0;
                const avgFee = currentHalfData.reduce((sum, month) => sum + Number((month.sourceAvgFee || {})[name] || 0), 0);
                const avgFeeCount = currentHalfData.reduce((sum, month) => sum + (Number((month.sourceAvgFee || {})[name] || 0) > 0 ? 1 : 0), 0);
                return {
                    name,
                    count,
                    revenue,
                    unitPrice: avgFeeCount > 0 ? Math.round(avgFee / avgFeeCount) : 0,
                    color: COLORS[index % COLORS.length],
                };
            })
            .sort((a, b) => b.unitPrice - a.unitPrice);
    }, [currentHalfData]);

    const getTreatmentCount = (month, name) => {
        const directCount = month.sourceTreatments?.[name] ?? month.newPatientSourceTreatments?.[name];
        if (directCount != null) return Number(directCount || 0);
        return 0;
    };

    const normalizePercent = (value) => {
        const number = Number(value || 0);
        if (!Number.isFinite(number)) return 0;
        return number <= 1 ? number * 100 : number;
    };

    const getInsuranceRatioInfo = (month, name) => {
        const ratio = month.sourceInsuranceRatios?.[name] ?? month.newPatientSourceInsuranceRatios?.[name];
        const nonRatio = month.sourceNonInsuranceRatios?.[name] ?? month.newPatientSourceNonInsuranceRatios?.[name];
        if (ratio != null) {
            const insuranceRatio = Math.max(0, Math.min(100, normalizePercent(ratio)));
            return {
                hasData: true,
                insuranceRatio,
                // The uploaded insurance item is the source of truth. The remainder represents all non-insurance items.
                nonInsuranceRatio: Math.max(0, 100 - insuranceRatio),
            };
        }
        if (nonRatio != null) {
            const nonInsuranceRatio = Math.max(0, Math.min(100, normalizePercent(nonRatio)));
            return {
                hasData: true,
                insuranceRatio: Math.max(0, 100 - nonInsuranceRatio),
                nonInsuranceRatio,
            };
        }

        const insuranceCount = month.sourceInsurancePatients?.[name] ?? month.newPatientSourceInsurancePatients?.[name];
        const nonInsuranceCount = month.sourceNonInsurancePatients?.[name] ?? month.newPatientSourceNonInsurancePatients?.[name];
        if (insuranceCount != null && nonInsuranceCount != null) {
            const total = Number(insuranceCount || 0) + Number(nonInsuranceCount || 0);
            if (total <= 0) {
                return { hasData: false, insuranceRatio: 0, nonInsuranceRatio: 0 };
            }
            const insuranceRatio = total > 0 ? (Number(insuranceCount || 0) / total) * 100 : 0;
            const nonInsuranceRatio = total > 0 ? (Number(nonInsuranceCount || 0) / total) * 100 : 0;
            return { hasData: true, insuranceRatio, nonInsuranceRatio };
        }

        const patientCount = Number((month.sources || {})[name] || 0);
        if (insuranceCount != null && patientCount > 0) {
            const insuranceRatio = (Number(insuranceCount || 0) / patientCount) * 100;
            return {
                hasData: true,
                insuranceRatio,
                nonInsuranceRatio: Math.max(0, 100 - insuranceRatio),
            };
        }
        if (nonInsuranceCount != null && patientCount > 0) {
            const nonInsuranceRatio = (Number(nonInsuranceCount || 0) / patientCount) * 100;
            return {
                hasData: true,
                insuranceRatio: Math.max(0, 100 - nonInsuranceRatio),
                nonInsuranceRatio,
            };
        }

        return { hasData: false, insuranceRatio: 0, nonInsuranceRatio: 0 };
    };

    const getInsuranceRatio = (month, name) => getInsuranceRatioInfo(month, name).insuranceRatio;
    const getNonInsuranceRatio = (month, name) => getInsuranceRatioInfo(month, name).nonInsuranceRatio;

    const treatmentSourceSummary = useMemo(() => {
        const byName = new Map(sourceSummary.map(item => [item.name, { ...item }]));
        currentHalfData.forEach(month => {
            [
                ...Object.keys(month.sourceInsuranceRatios || {}),
                ...Object.keys(month.sourceNonInsuranceRatios || {}),
            ].forEach(name => {
                if (!name || byName.has(name)) return;
                byName.set(name, {
                    name,
                    value: currentHalfData.reduce((sum, item) => sum + Number((item.sources || {})[name] || 0), 0),
                    color: COLORS[byName.size % COLORS.length],
                });
            });
        });
        return Array.from(byName.values())
            .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'ko'));
    }, [currentHalfData, sourceSummary]);

    const treatmentConversionBySource = useMemo(() => {
        const counts = new Map();
        const ratioSums = new Map();
        const ratioCounts = new Map();
        currentHalfData.forEach(month => {
            Object.entries(month.sources || {}).forEach(([name, count]) => {
                counts.set(name, (counts.get(name) || 0) + Number(count || 0));
                const ratioInfo = getInsuranceRatioInfo(month, name);
                if (ratioInfo.hasData) {
                    ratioSums.set(name, (ratioSums.get(name) || 0) + ratioInfo.insuranceRatio);
                    ratioCounts.set(name, (ratioCounts.get(name) || 0) + 1);
                }
            });
        });
        return Array.from(counts.keys())
            .map((name, index) => {
                const count = counts.get(name) || 0;
                const ratioCount = ratioCounts.get(name) || 0;
                const conversionRate = ratioCount > 0 ? (ratioSums.get(name) || 0) / ratioCount : 0;
                return {
                    name,
                    count,
                    treatmentCount: Math.round(count * (conversionRate / 100)),
                    conversionRate,
                    color: COLORS[index % COLORS.length],
                };
            })
            .sort((a, b) => b.conversionRate - a.conversionRate);
    }, [currentHalfData]);

    const monthlyTreatmentChartData = useMemo(() => (
        currentHalfData.map(month => {
            const row = { month: month.month };
            const monthTotal = Object.values(month.sources || {})
                .reduce((sum, count) => sum + Number(count || 0), 0);
            treatmentSourceSummary.forEach(({ name }) => {
                const ratioInfo = getInsuranceRatioInfo(month, name);
                const count = Number((month.sources || {})[name] || 0);
                row[name] = ratioInfo.hasData && monthTotal > 0 ? Number(((count / monthTotal) * 100).toFixed(1)) : 0;
            });
            return row;
        })
    ), [currentHalfData, treatmentSourceSummary]);

    const totalNewPatients = sourceSummary.reduce((sum, item) => sum + item.value, 0);

    const insightPeriodLabel = monthFilter !== 'all'
        ? monthFilter
        : half === 'first' ? '상반기' : half === 'second' ? '하반기' : '전체';
    const insightTopSource = sourceSummary[0];
    const insightTopAge = ageSummary.slice().sort((a, b) => b.count - a.count)[0];
    const insightTopUnitPrice = unitPriceBySource[0];

    const treatmentRankByTotalRatio = useMemo(() => {
        const treatmentCounts = new Map();
        currentHalfData.forEach(month => {
            Object.entries(month.sources || {}).forEach(([name, count]) => {
                const ratioInfo = getInsuranceRatioInfo(month, name);
                if (!ratioInfo.hasData) return;
                treatmentCounts.set(name, (treatmentCounts.get(name) || 0) + Number(count || 0));
            });
        });
        const treatmentTotal = Array.from(treatmentCounts.values())
            .reduce((sum, count) => sum + Number(count || 0), 0);

        return treatmentSourceSummary
            .map(item => {
                const value = Number(treatmentCounts.get(item.name) || 0);
                return {
                    ...item,
                    value,
                    totalRatio: treatmentTotal > 0 ? (value / treatmentTotal) * 100 : 0,
                };
            })
            .sort((a, b) => b.totalRatio - a.totalRatio || b.value - a.value);
    }, [currentHalfData, treatmentSourceSummary]);

    const topTreatmentConversionRows = useMemo(
        () => treatmentRankByTotalRatio.slice(0, 10),
        [treatmentRankByTotalRatio]
    );

    const newPatientInsightText = (() => {
        if (subTab === 'treatmentConversion') {
            const topTreatment = treatmentRankByTotalRatio[0];
            return `${selectedYear}년 ${insightPeriodLabel} 기준 치료 이행 관련 주요 경로는 ${topTreatment?.name || '-'}입니다. 해당 경로의 총 비율은 ${Number(topTreatment?.totalRatio || 0).toFixed(1)}%이며, 보험/비보험 비율과 신환 수를 함께 확인해 실제 진료 전환 흐름을 점검해 주세요.`;
        }

        if (subTab === 'age') {
            return `${selectedYear}년 ${insightPeriodLabel} 기준 주요 신환 연령대는 ${insightTopAge?.range || '-'}(${Number(insightTopAge?.count || 0).toLocaleString()}명)입니다. 연령대별 비중과 월별 변화를 함께 보면서 주력 연령층과 신규 유입 변화를 확인해 주세요.`;
        }

        if (subTab === 'unitPrice') {
            return `${selectedYear}년 ${insightPeriodLabel} 기준 객단가 상위 내원경로는 ${insightTopUnitPrice?.name || '-'}(${Math.round(Number(insightTopUnitPrice?.unitPrice || 0)).toLocaleString()}원)입니다. 환자수와 총진료비, 평균진료비를 함께 비교해 유입 경로별 수익성을 확인해 주세요.`;
        }

        return `${selectedYear}년 ${insightPeriodLabel} 기준 신환 수는 ${totalNewPatients.toLocaleString()}명입니다. 주요 내원경로는 ${insightTopSource?.name || '-'}(${Number(insightTopSource?.value || 0).toLocaleString()}명)입니다. 경로별 신환수와 비중을 함께 보면서 유입 채널의 강약을 확인해 주세요.`;
    })();

    const monthlyUnitPriceChartData = useMemo(() => (
        currentHalfData.map(month => {
            const row = { month: month.month };
            sourceSummary.forEach(({ name }) => {
                const count = Number((month.sources || {})[name] || 0);
                const revenue = Number((month.sourceRevenue || {})[name] || 0);
                row[name] = Number((month.sourceAvgFee || {})[name] || 0);
            });
            return row;
        })
    ), [currentHalfData, sourceSummary]);

    const monthlySourceChartData = useMemo(() => (
        currentHalfData.map(month => ({
            month: month.month,
            ...month.sources,
        }))
    ), [currentHalfData]);

    const formatRatio = (value, total) => (total ? `${((value / total) * 100).toFixed(1)}%` : '0.0%');

    const fullYearSourceTotals = yearData.reduce((acc, month) => {
        Object.entries(month.sources || {}).forEach(([name, count]) => {
            acc[name] = (acc[name] || 0) + Number(count || 0);
        });
        return acc;
    }, {});
    const fullYearTotalNewPatients = Object.values(fullYearSourceTotals)
        .reduce((sum, count) => sum + Number(count || 0), 0);
    const detailSourceSummary = Object.entries(fullYearSourceTotals)
        .map(([name, value], index) => ({ name, value, color: COLORS[index % COLORS.length] }))
        .sort((a, b) => b.value - a.value);
    const selectedRatioDetailRows = currentHalfData;
    const selectedRatioDetailSourceTotals = detailSourceSummary.reduce((acc, { name }) => {
        acc[name] = selectedRatioDetailRows.reduce(
            (sum, month) => sum + Number((month.sources || {})[name] || 0),
            0
        );
        return acc;
    }, {});
    const selectedRatioDetailGrandTotal = Object.values(selectedRatioDetailSourceTotals)
        .reduce((sum, count) => sum + Number(count || 0), 0);
    const treatmentDetailRows = treatmentSourceSummary.map(({ name, color }) => {
        let count = 0;
        let insuranceWeighted = 0;
        let nonInsuranceWeighted = 0;
        let hasData = false;

        currentHalfData.forEach(month => {
            const currentCount = Number((month.sources || {})[name] || 0);
            const ratioInfo = getInsuranceRatioInfo(month, name);
            count += currentCount;
            if (ratioInfo.hasData) {
                hasData = true;
                insuranceWeighted += currentCount * (ratioInfo.insuranceRatio / 100);
                nonInsuranceWeighted += currentCount * (ratioInfo.nonInsuranceRatio / 100);
            }
        });

        return {
            name,
            color,
            count,
            hasData,
            insuranceCount: insuranceWeighted,
            nonInsuranceCount: nonInsuranceWeighted,
            insuranceRatio: count > 0 && hasData ? (insuranceWeighted / count) * 100 : 0,
            nonInsuranceRatio: count > 0 && hasData ? (nonInsuranceWeighted / count) * 100 : 0,
        };
    });
    const selectedTreatmentDetailTotal = treatmentDetailRows
        .reduce((sum, row) => sum + row.count, 0);
    const selectedTreatmentInsuranceTotal = treatmentDetailRows
        .reduce((sum, row) => sum + row.insuranceCount, 0);
    const selectedTreatmentNonInsuranceTotal = treatmentDetailRows
        .reduce((sum, row) => sum + row.nonInsuranceCount, 0);
    const selectedTreatmentHasData = treatmentDetailRows.some(row => row.hasData);
    const selectedTreatmentInsuranceRatio = selectedTreatmentDetailTotal > 0
        ? (selectedTreatmentInsuranceTotal / selectedTreatmentDetailTotal) * 100
        : 0;
    const selectedTreatmentNonInsuranceRatio = selectedTreatmentDetailTotal > 0
        ? (selectedTreatmentNonInsuranceTotal / selectedTreatmentDetailTotal) * 100
        : 0;
    const treatmentPayerMixData = treatmentDetailRows
        .filter((row) => row.count > 0 && row.hasData)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map((row) => ({
            name: row.name,
            insuranceRatio: Number(row.insuranceRatio || 0),
            nonInsuranceRatio: Number(row.nonInsuranceRatio || 0),
            count: Number(row.count || 0),
        }));
    const selectedAgeDetailData = useMemo(() => {
        const months = currentHalfData;
        const totals = Object.fromEntries(AGE_RANGES.map(range => [range, 0]));
        months.forEach(month => {
            AGE_RANGES.forEach(range => {
                totals[range] += Number((month.ages || {})[range] || 0);
            });
        });
        return {
            months,
            totals,
            total: Object.values(totals).reduce((sum, count) => sum + Number(count || 0), 0),
            label: monthFilter !== 'all' ? '당월 비율' : (half === 'first' ? '상반기 비율' : half === 'second' ? '하반기 비율' : '전체 비율'),
        };
    }, [currentHalfData, half, monthFilter]);

    const ageScopedSummary = useMemo(() => AGE_RANGES.map(range => ({
        range,
        count: Number((selectedAgeDetailData.totals || {})[range] || 0),
    })), [selectedAgeDetailData]);

    const selectedAgeTableData = selectedAgeDetailData;

    const fullYearAgeTotals = useMemo(() => {
        const totals = Object.fromEntries(AGE_RANGES.map(range => [range, 0]));
        yearData.forEach(month => {
            AGE_RANGES.forEach(range => {
                totals[range] += Number((month.ages || {})[range] || 0);
            });
        });
        return totals;
    }, [yearData]);
    const fullYearAgeTotal = Object.values(fullYearAgeTotals)
        .reduce((sum, count) => sum + Number(count || 0), 0);

    const selectedUnitPriceRows = useMemo(() => (
        sourceSummary
            .map(({ name, color }) => {
                const totals = currentHalfData.reduce((acc, month) => {
                    acc.newPatientCount += Number((month.sources || {})[name] || 0);
                    acc.oldPatientCount += Number((month.sourceOldPatients || {})[name] || 0);
                    acc.visitPatientCount += Number((month.sourceVisitPatients || {})[name] || 0);
                    acc.revenue += Number((month.sourceRevenue || {})[name] || 0);
                    return acc;
                }, { newPatientCount: 0, oldPatientCount: 0, visitPatientCount: 0, revenue: 0 });
                const totalVisitPatients = totals.visitPatientCount || (totals.newPatientCount + totals.oldPatientCount);
                return {
                    name,
                    color,
                    ...totals,
                    unitPrice: totalVisitPatients > 0 ? totals.revenue / totalVisitPatients : 0,
                };
            })
            .sort((a, b) => b.unitPrice - a.unitPrice)
    ), [currentHalfData, sourceSummary]);
    const unitPriceSummary = currentHalfData.reduce((acc, month) => {
        const total = month.pathDistributionSummary?.total || {};
        Object.entries(total).forEach(([key, value]) => {
            acc[key] = Number(acc[key] || 0) + Number(value || 0);
        });
        return acc;
    }, {});
    const summaryMonthCount = currentHalfData.filter(month => Object.keys(month.pathDistributionSummary?.total || {}).length > 0).length;
    const unitPriceSummaryRows = [
        { key: 'total', label: '합계', values: unitPriceSummary },
        {
            key: 'average',
            label: '평균',
            values: Object.fromEntries(Object.entries(unitPriceSummary).map(([key, value]) => [key, summaryMonthCount > 0 ? Number(value || 0) / summaryMonthCount : 0])),
        },
    ];

    const renderSourcePieTooltip = ({ active, payload }) => {
        if (!active || !payload?.length) return null;
        return renderSourceTooltipPanel({
            title: '내원경로 비중',
            rows: sourceSummary,
            highlightName: payload[0]?.payload?.name,
        });

        const item = active ? payload?.[0]?.payload : null;
        if (!item) return null;
        const ratio = totalNewPatients > 0 ? (Number(item.value || 0) / totalNewPatients) * 100 : 0;

        return (
            <div style={{
                minWidth: '176px',
                background: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                boxShadow: 'var(--shadow)',
                padding: '0.7rem 0.8rem',
                color: 'var(--text-primary)',
            }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>내원경로</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '13px', fontWeight: 800, marginBottom: '0.45rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: item.color }} />
                    <span>{item.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '12px' }}>
                    <span>신환 수</span>
                    <strong style={{ color: item.color }}>{Number(item.value || 0).toLocaleString()}명</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '12px', marginTop: '0.25rem' }}>
                    <span>비중</span>
                    <strong style={{ color: item.color }}>{ratio.toFixed(1)}%</strong>
                </div>
            </div>
        );
    };

    const renderSourceBarTooltip = ({ active, label, payload }) => {
        if (!active || !label) return null;
        const monthData = monthlySourceChartData.find(item => item.month === label) || {};
        return renderSourceTooltipPanel({
            title: `${label} 내원경로별 신환 수`,
            rows: sourceSummary
                .map(({ name, color }) => ({ name, color, value: Number(monthData[name] || 0) }))
                .sort((a, b) => b.value - a.value),
            highlightName: payload?.[0]?.name,
        });

        const item = active ? payload?.[0] : null;
        if (!item) return null;

        return (
            <div style={{
                minWidth: '164px',
                background: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                boxShadow: 'var(--shadow)',
                padding: '0.7rem 0.8rem',
                color: 'var(--text-primary)',
            }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>{label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '13px', fontWeight: 800, marginBottom: '0.45rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: item.color }} />
                    <span>{item.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '12px' }}>
                    <span>신환 수</span>
                    <strong style={{ color: item.color }}>{Number(item.value || 0).toLocaleString()}명</strong>
                </div>
            </div>
        );
    };

    const renderSourceTooltipPanel = ({ title, rows, highlightName }) => {
        if (!rows.length) return null;

        return (
            <div style={{
                width: '760px',
                maxWidth: 'calc(100vw - 2rem)',
                background: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                boxShadow: 'var(--shadow)',
                padding: '0.7rem 0.8rem',
                color: 'var(--text-primary)',
            }}>
                <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '0.5rem' }}>{title}</div>
                <div style={{
                    display: 'grid',
                    gridAutoFlow: 'column',
                    gridTemplateRows: 'repeat(10, minmax(0, auto))',
                    gridAutoColumns: 'minmax(0, 1fr)',
                    columnGap: '0.8rem',
                    rowGap: '0.08rem',
                }}>
                    {rows.map(({ name, value, color }) => {
                        const ratio = totalNewPatients > 0 ? (Number(value || 0) / totalNewPatients) * 100 : 0;
                        const highlighted = highlightName === name;
                        return (
                            <div
                                key={name}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '10px minmax(118px, 1fr) auto',
                                    alignItems: 'center',
                                    gap: '0.45rem',
                                    padding: '0.3rem 0.25rem',
                                    borderRadius: '6px',
                                    background: 'transparent',
                                    fontSize: '12px',
                                }}
                            >
                                <span style={{ width: 9, height: 9, borderRadius: 2, background: color }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: highlighted ? 800 : 600 }}>{name}</span>
                                <strong style={{ color, whiteSpace: 'nowrap' }}>{Number(value || 0).toLocaleString()}명 · {ratio.toFixed(1)}%</strong>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderTreatmentConversionTooltipPanel = ({ title, rows, highlightName }) => {
        if (!rows.length) return null;

        return (
            <div style={{
                width: '760px',
                maxWidth: 'calc(100vw - 2rem)',
                background: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                boxShadow: 'var(--shadow)',
                padding: '0.7rem 0.8rem',
                color: 'var(--text-primary)',
            }}>
                <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '0.5rem' }}>{title}</div>
                <div style={{
                    display: 'grid',
                    gridAutoFlow: 'column',
                    gridTemplateRows: 'repeat(10, minmax(0, auto))',
                    gridAutoColumns: 'minmax(0, 1fr)',
                    columnGap: '0.8rem',
                    rowGap: '0.08rem',
                }}>
                    {rows.map(({ name, color, ratio, count }) => {
                        const highlighted = highlightName === name;
                        return (
                            <div
                                key={name}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '10px minmax(118px, 1fr) auto',
                                    alignItems: 'center',
                                    gap: '0.45rem',
                                    padding: '0.3rem 0.25rem',
                                    borderRadius: '6px',
                                    background: 'transparent',
                                    fontSize: '12px',
                                }}
                            >
                                <span style={{ width: 9, height: 9, borderRadius: 2, background: color }} />
                                <span style={{
                                    minWidth: 0,
                                    whiteSpace: 'normal',
                                    overflowWrap: 'anywhere',
                                    lineHeight: 1.35,
                                    fontWeight: highlighted ? 800 : 600,
                                }}>
                                    {name}
                                </span>
                                <strong style={{ color, whiteSpace: 'nowrap' }}>
                                    {Number(ratio || 0).toFixed(1)}% · {Number(count || 0).toLocaleString()}명
                                </strong>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderTreatmentConversionTooltip = ({ active, label, payload }) => {
        if (!active) return null;

        const highlightedName = payload?.[0]?.payload?.name || payload?.[0]?.name;
        const selectedMonth = label
            ? currentHalfData.find(month => month.month === label)
            : null;
        const selectedMonthChart = label
            ? monthlyTreatmentChartData.find(month => month.month === label)
            : null;
        const rows = treatmentRankByTotalRatio.map(({ name, color, totalRatio, value }) => ({
            name,
            color,
            ratio: selectedMonthChart ? Number(selectedMonthChart[name] || 0) : totalRatio,
            count: selectedMonth ? Number((selectedMonth.sources || {})[name] || 0) : value,
        }));

        return renderTreatmentConversionTooltipPanel({
            title: label ? `${label} 내원경로별 치료 이행율` : `${insightPeriodLabel} 내원경로별 치료 이행율`,
            rows,
            highlightName: highlightedName,
        });
    };

    const renderUnitPriceTooltip = ({ active, label, payload }) => {
        if (!active || !payload?.length) return null;
        const sortedPayload = [...payload]
            .filter(item => Number(item.value || 0) > 0)
            .sort((a, b) => Number(b.value || 0) - Number(a.value || 0));

        return (
            <div style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                boxShadow: 'var(--shadow)',
                padding: '0.75rem 0.85rem',
                fontSize: '12px',
                color: 'var(--text-primary)',
            }}>
                <div style={{ fontWeight: 700, marginBottom: '0.45rem' }}>{label}</div>
                {sortedPayload.map(item => (
                    <div key={item.dataKey} style={{ color: item.color, lineHeight: 1.8 }}>
                        {item.name} : {formatWon(item.value)}
                    </div>
                ))}
            </div>
        );
    };

    const renderTabContent = () => {
        switch (subTab) {
            case 'treatmentConversion':
                return (
                    <div className="tab-pane">
                        <div className="dashboard-stack">
                            <div className="patient-kpi-row">
                                {treatmentRankByTotalRatio.slice(0, 4).map(({ name, totalRatio, value, color }) => (
                                    <div key={name} className="patient-kpi-card" style={{ borderTop: `3px solid ${color}` }}>
                                        <span className="kpi-label">{name}</span>
                                        <span className="kpi-value" style={{ color }}>{totalRatio.toFixed(1)}%</span>
                                        <span className="kpi-sub">신환 {Number(value || 0).toLocaleString()}명</span>
                                    </div>
                                ))}
                            </div>

                            <div className="dashboard-grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
                                <DashboardCard title="내원 경로별 치료 이행율" subtitle="월별 총 비율 추이">
                                    <div style={{ height: 340, width: '100%' }}>
                                        {isMonthlyView ? (
                                            <MonthlySnapshotBarChart
                                                data={topTreatmentConversionRows.map(({ name, totalRatio, value, color }) => ({
                                                    name,
                                                    value: totalRatio,
                                                    color,
                                                    detail: `신환 ${Number(value || 0).toLocaleString()}명`,
                                                }))}
                                                valueLabel="치료 이행율"
                                                formatValue={(value) => `${Number(value).toFixed(1)}%`}
                                                height={310}
                                                tooltipContent={renderTreatmentConversionTooltip}
                                            />
                                        ) : (
                                        <ResponsiveContainer>
                                            <LineChart data={monthlyTreatmentChartData} margin={{ top: 24, right: 24, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                                <YAxis tick={{ fontSize: 12 }} width={42} tickFormatter={(v) => `${v}%`} />
                                                <Tooltip content={renderTreatmentConversionTooltip} cursor={false} wrapperStyle={{ zIndex: 10 }} />
                                                <Legend verticalAlign="top" height={36} iconType="line" wrapperStyle={{ fontSize: '11px' }} />
                                                {topTreatmentConversionRows.map(({ name, color }) => (
                                                    <Line
                                                        key={name}
                                                        type="monotone"
                                                        dataKey={name}
                                                        name={name}
                                                        stroke={color}
                                                        strokeWidth={2.5}
                                                        dot={{ r: 3, strokeWidth: 2, fill: 'var(--card-bg)' }}
                                                        activeDot={{ r: 5 }}
                                                        connectNulls
                                                    />
                                                ))}
                                            </LineChart>
                                        </ResponsiveContainer>
                                        )}
                                    </div>
                                </DashboardCard>

                                <DashboardCard title="내원경로별 보험·비보험 구성" subtitle="신환 수 상위 10개 경로 기준">
                                    <div style={{ height: 300, width: '100%' }}>
                                        {treatmentPayerMixData.length > 0 ? (
                                            <ResponsiveContainer>
                                                <BarChart
                                                    data={treatmentPayerMixData}
                                                    layout="vertical"
                                                    margin={{ top: 12, right: 18, left: 12, bottom: 0 }}
                                                    barCategoryGap="18%"
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-color)" />
                                                    <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                                                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={92} />
                                                    <Tooltip
                                                        contentStyle={{ borderRadius: '12px', fontSize: '12px' }}
                                                        formatter={(value, name, item) => [
                                                            `${Number(value || 0).toFixed(1)}%`,
                                                            name === '보험 비율' ? '보험 항목 비율' : '비보험 항목 비율',
                                                        ]}
                                                        labelFormatter={(label, payload) => {
                                                            const count = payload?.[0]?.payload?.count || 0;
                                                            return `${label} · 신환 ${Number(count).toLocaleString()}명`;
                                                        }}
                                                    />
                                                    <Legend verticalAlign="top" height={30} iconType="square" wrapperStyle={{ fontSize: '11px' }} />
                                                    <Bar dataKey="insuranceRatio" name="보험 비율" stackId="payer" fill="#3b82f6" radius={[4, 0, 0, 4]} />
                                                    <Bar dataKey="nonInsuranceRatio" name="비보험 비율" stackId="payer" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <div className="chart-empty-state">보험·비보험 구성 데이터가 없습니다.</div>
                                        )}
                                    </div>
                                </DashboardCard>
                            </div>

                            <DashboardCard
                                title="내원 경로별 치료 이행율 상세 데이터"
                                subtitle={`${insightPeriodLabel} 기준 보험 / 비보험 항목 비율`}
                                headerRight={
                                    <div style={monthSelectWrapStyle}>
                                        <span style={monthSelectLabelStyle}>표시 범위</span>
                                        <strong style={monthSelectLabelStyle}>{insightPeriodLabel}</strong>
                                    </div>
                                }
                            >
                                <div className="treatment-data-table-container">
                                    <table className="treatment-data-table">
                                        <thead>
                                            <tr>
                                                <th className="row-header">내원경로</th>
                                                <th>{insightPeriodLabel} 신환수</th>
                                                <th>보험 항목 비율</th>
                                                <th>비보험 항목 비율</th>
                                                <th>총 비율</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {treatmentDetailRows.map(({ name, color, count, hasData, insuranceRatio, nonInsuranceRatio }) => {
                                                const totalRatio = hasData ? formatRatio(count, selectedTreatmentDetailTotal) : '0.0%';
                                                return (
                                                    <tr key={name}>
                                                        <td className="row-header">
                                                            <span style={{ display:'inline-block', width:10, height:10, borderRadius:'2px', background:color, marginRight:6, verticalAlign:'middle' }} />
                                                            {name}
                                                        </td>
                                                        <td className="font-bold">{count.toLocaleString()}명</td>
                                                        <td>{insuranceRatio.toFixed(1)}%</td>
                                                        <td>{nonInsuranceRatio.toFixed(1)}%</td>
                                                        <td>{totalRatio}</td>
                                                    </tr>
                                                );
                                            })}
                                            <tr className="highlight-row">
                                                <td className="row-header">총 신환수</td>
                                                <td className="font-bold">
                                                    {selectedTreatmentDetailTotal.toLocaleString()}명
                                                </td>
                                                <td>{selectedTreatmentInsuranceRatio.toFixed(1)}%</td>
                                                <td>{selectedTreatmentNonInsuranceRatio.toFixed(1)}%</td>
                                                <td className="font-bold">{selectedTreatmentHasData && selectedTreatmentDetailTotal > 0 ? '100.0%' : '0.0%'}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </DashboardCard>

                        </div>
                    </div>
                );

            case 'age':
                return (
                    <div className="tab-pane">
                        <div className="dashboard-stack">
                            <div className="dashboard-grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
                                <DashboardCard title="연령별 신환 현황" subtitle={`${selectedAgeDetailData.label} 기준 신환 수`}>
                                    <div style={{ height: 340, width: '100%' }}>
                                        <ResponsiveContainer>
                                            <BarChart data={ageScopedSummary} margin={{ top: 30, right: 12, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                                <XAxis dataKey="range" tick={{ fontSize: 15, fontWeight: 700 }} />
                                                <YAxis tick={{ fontSize: 13 }} width={42} />
                                                <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} formatter={(v) => [`${v}명`, '신환']} />
                                                <Bar dataKey="count" name="신환" fill="#3b82f6" maxBarSize={46} radius={[4,4,0,0]}>
                                                    <LabelList
                                                        dataKey="count"
                                                        position="top"
                                                        formatter={(v) => `${v}명`}
                                                        style={{ fontSize: 14, fill: '#3b82f6', fontWeight: 800 }}
                                                    />
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </DashboardCard>

                                <DashboardCard title="연령별 신환 비중" subtitle={`${selectedAgeDetailData.label} 기준`}>
                                    <div style={{ height: 300, width: '100%' }}>
                                        <ResponsiveContainer>
                                            <PieChart>
                                                <Pie
                                                    data={ageScopedSummary}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={48}
                                                    outerRadius={82}
                                                    paddingAngle={4}
                                                    dataKey="count"
                                                    nameKey="range"
                                                    label={({ range, percent }) => `${range} ${(percent * 100).toFixed(1)}%`}
                                                    labelLine={{ stroke: 'var(--border-color)', strokeWidth: 1 }}
                                                >
                                                    {ageScopedSummary.map((entry, index) => <Cell key={entry.range} fill={COLORS[index % COLORS.length]} />)}
                                                </Pie>
                                                <Tooltip formatter={(v, name) => [`${v}명`, name]} />
                                                <Legend
                                                    verticalAlign="bottom"
                                                    height={24}
                                                    iconSize={10}
                                                    formatter={(value) => value}
                                                    wrapperStyle={{ fontSize: '11px' }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </DashboardCard>
                            </div>

                            <DashboardCard
                                title="연령별 신환 상세 데이터"
                                subtitle={`${insightPeriodLabel} 기준 월별 인원수와 연령대 비율`}
                                headerRight={
                                    <div style={monthSelectWrapStyle}>
                                        <span style={monthSelectLabelStyle}>표시 범위</span>
                                        <strong style={monthSelectLabelStyle}>{insightPeriodLabel}</strong>
                                    </div>
                                }
                            >
                                <div className="treatment-data-table-container">
                                    <table className="treatment-data-table">
                                        <colgroup>
                                            <col style={{ width: '96px' }} />
                                            {ageSummary.map(({ range }) => <col key={range} />)}
                                            <col style={{ width: '112px' }} />
                                        </colgroup>
                                        <thead>
                                            <tr>
                                                <th className="row-header" style={ageTableLabelCellStyle}>월</th>
                                                {ageSummary.map(({ range }) => <th key={range}>{range}</th>)}
                                                <th>총 신환 합계</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedAgeTableData.months.map((month) => {
                                                const monthTotal = AGE_RANGES.reduce((sum, range) => sum + Number((month.ages || {})[range] || 0), 0);
                                                return (
                                                    <tr key={month.month}>
                                                        <td className="row-header" style={ageTableLabelCellStyle}>{month.month}</td>
                                                        {ageSummary.map(({ range }) => {
                                                            const count = Number((month.ages || {})[range] || 0);
                                                            return <td key={range}>{count.toLocaleString()}명</td>;
                                                        })}
                                                        <td className="font-bold">{monthTotal.toLocaleString()}명</td>
                                                    </tr>
                                                );
                                            })}
                                            <tr className="highlight-row">
                                                <td className="row-header" style={ageTableLabelCellStyle}>소계</td>
                                                {ageSummary.map(({ range }, index) => {
                                                    const count = Number((selectedAgeTableData.totals || {})[range] || 0);
                                                    return <td key={range} className="font-bold" style={{ color: COLORS[index % COLORS.length] }}>{count.toLocaleString()}명</td>;
                                                })}
                                                <td className="font-bold">{selectedAgeTableData.total.toLocaleString()}명</td>
                                            </tr>
                                            <tr>
                                                <td className="row-header" style={ageTableLabelCellStyle}>{selectedAgeTableData.label}</td>
                                                {ageSummary.map(({ range }, index) => {
                                                    const count = Number((selectedAgeTableData.totals || {})[range] || 0);
                                                    return <td key={range} style={{ color: COLORS[index % COLORS.length] }}>{formatRatio(count, selectedAgeTableData.total)}</td>;
                                                })}
                                                <td className="font-bold">{selectedAgeTableData.total ? '100.0%' : '0.0%'}</td>
                                            </tr>
                                            <tr>
                                                <td className="row-header" style={ageTableLabelCellStyle}>전체 비율</td>
                                                {ageSummary.map(({ range }, index) => {
                                                    const count = Number((fullYearAgeTotals || {})[range] || 0);
                                                    return <td key={range} style={{ color: COLORS[index % COLORS.length] }}>{formatRatio(count, fullYearAgeTotal)}</td>;
                                                })}
                                                <td className="font-bold">{fullYearAgeTotal ? '100.0%' : '0.0%'}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </DashboardCard>

                        </div>
                    </div>
                );

            case 'unitPrice':
                return (
                    <div className="tab-pane">
                        <div className="dashboard-stack">
                            <DashboardCard title="내원 경로별 객단가">
                                <div style={{ height: 360, width: '100%' }}>
                                    {isMonthlyView ? (
                                        <MonthlySnapshotBarChart
                                            data={selectedUnitPriceRows.map(({ name, unitPrice, color, visitPatientCount, newPatientCount, oldPatientCount }) => ({
                                                name,
                                                value: unitPrice,
                                                color,
                                                detail: `내원환자 ${Number(visitPatientCount || (newPatientCount + oldPatientCount)).toLocaleString()}명`,
                                            }))}
                                            valueLabel="평균 진료비"
                                            formatValue={formatWon}
                                            height={330}
                                        />
                                    ) : (
                                    <ResponsiveContainer>
                                        <LineChart data={monthlyUnitPriceChartData} margin={{ top: 24, right: 28, left: 20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                            <YAxis tick={{ fontSize: 11 }} width={72} tickFormatter={(v) => formatWon(v)} />
                                            <Tooltip content={renderUnitPriceTooltip} />
                                            <Legend verticalAlign="top" height={36} iconType="line" wrapperStyle={{ fontSize: '11px' }} />
                                            {sourceSummary.map(({ name, color }) => (
                                                <Line
                                                    key={name}
                                                    type="monotone"
                                                    dataKey={name}
                                                    name={name}
                                                    stroke={color}
                                                    strokeWidth={2.5}
                                                    dot={{ r: 3, strokeWidth: 2, fill: 'var(--card-bg)' }}
                                                    activeDot={{ r: 5 }}
                                                    connectNulls
                                                />
                                            ))}
                                        </LineChart>
                                    </ResponsiveContainer>
                                    )}
                                </div>
                            </DashboardCard>

                            <DashboardCard
                                title="내원경로별 1인당 평균 진료비 상세 데이터"
                                subtitle={`${insightPeriodLabel} 기준 총 진료비와 평균 진료비`}
                                headerRight={
                                    <div style={monthSelectWrapStyle}>
                                        <span style={monthSelectLabelStyle}>표시 범위</span>
                                        <strong style={monthSelectLabelStyle}>{insightPeriodLabel}</strong>
                                    </div>
                                }
                            >
                                <div className="treatment-data-table-container">
                                    <table className="treatment-data-table">
                                        <thead>
                                            <tr>
                                                <th className="row-header">내원경로</th>
                                                <th>신환수</th>
                                                <th>구환수</th>
                                                <th>총 내원환자수</th>
                                                <th>총 진료비</th>
                                                <th>평균 진료비</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedUnitPriceRows.map(({ name, color, newPatientCount, oldPatientCount, visitPatientCount, revenue, unitPrice }) => {
                                                const totalVisitPatients = visitPatientCount || (newPatientCount + oldPatientCount);
                                                return (
                                                    <tr key={name}>
                                                        <td className="row-header">
                                                            <MapPin size={14} style={{ color }} />
                                                            {name}
                                                        </td>
                                                        <td>{newPatientCount.toLocaleString()}명</td>
                                                        <td>{oldPatientCount.toLocaleString()}명</td>
                                                        <td className="font-bold">{totalVisitPatients.toLocaleString()}명</td>
                                                        <td>{formatWon(revenue)}</td>
                                                        <td className="font-bold"><WalletCards size={14} /> {formatWon(unitPrice)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </DashboardCard>

                            <DashboardCard title="내원환자 및 진료비 요약 데이터" subtitle={`${insightPeriodLabel} 기준 엑셀 합계 / 평균`}>
                                <div className="treatment-data-table-container">
                                    <table className="treatment-data-table">
                                        <thead>
                                            <tr>
                                                <th className="row-header">구분</th>
                                                <th>내원환자 수</th>
                                                <th>구환 수</th>
                                                <th>신환 수</th>
                                                <th>총 내원횟수</th>
                                                <th>총 진료비</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {unitPriceSummaryRows.map(({ key, label, values }) => (
                                                <tr key={key} className={key === 'total' ? 'highlight-row' : ''}>
                                                    <td className="row-header">{label}</td>
                                                    <td>{Math.round(values.visitPatients || 0).toLocaleString()}명</td>
                                                    <td>{Math.round(values.oldPatients || 0).toLocaleString()}명</td>
                                                    <td>{Math.round(values.newPatients || 0).toLocaleString()}명</td>
                                                    <td>{Math.round(values.totalVisits || 0).toLocaleString()}회</td>
                                                    <td className="font-bold">{formatWon(values.totalFee || 0)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </DashboardCard>
                        </div>
                    </div>
                );

            case 'source':
            default:
                return (
                    <div className="tab-pane">
                        <div className="dashboard-stack">
                            <div className="patient-kpi-row">
                                <div className="patient-kpi-card kpi-total">
                                    <span className="kpi-label">신환 합계</span>
                                    <span className="kpi-value">{totalNewPatients.toLocaleString()}명</span>
                                    <span className="kpi-sub">{half === 'first' ? '상반기' : half === 'second' ? '하반기' : '전체'}</span>
                                </div>
                                {sourceSummary.slice(0, 3).map(({ name, value, color }) => (
                                    <div key={name} className="patient-kpi-card" style={{ borderTop: `3px solid ${color}` }}>
                                        <span className="kpi-label">{name}</span>
                                        <span className="kpi-value" style={{ color }}>{value.toLocaleString()}명</span>
                                        <span className="kpi-sub">비율 {totalNewPatients ? ((value / totalNewPatients) * 100).toFixed(1) : '0.0'}%</span>
                                    </div>
                                ))}
                            </div>

                            <div className="dashboard-grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
                                <DashboardCard title="신환 내원경로 현황" subtitle="월별 유입 경로">
                                    <div
                                        aria-label="신환 내원경로 상위 10개"
                                        style={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            justifyContent: 'center',
                                            gap: '0.35rem 0.65rem',
                                            padding: '0.05rem 0.2rem 0.55rem',
                                        }}
                                    >
                                        {sourceSummary.slice(0, 10).map(({ name, color }, index) => (
                                            <span
                                                key={name}
                                                title={`${index + 1}위 · ${name}`}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '0.28rem',
                                                    minWidth: 0,
                                                    color: 'var(--text-secondary)',
                                                    fontSize: '11px',
                                                    lineHeight: 1.3,
                                                }}
                                            >
                                                <span style={{ width: 8, height: 8, borderRadius: 2, flex: '0 0 auto', background: color }} />
                                                <strong style={{ color, fontSize: '10px' }}>{index + 1}위</strong>
                                                <span style={{ maxWidth: '7.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                                            </span>
                                        ))}
                                    </div>
                                    <div style={{ height: 286, width: '100%' }}>
                                        <ResponsiveContainer>
                                            <BarChart data={monthlySourceChartData} margin={{ top: 12, right: 16, left: 0, bottom: 0 }} barCategoryGap="14%" barGap={2}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                                <YAxis tick={{ fontSize: 12 }} width={42} />
                                                <Tooltip content={renderSourceBarTooltip} cursor={false} wrapperStyle={{ zIndex: 10 }} />
                                                {sourceSummary.map(({ name, color }) => (
                                                    <Bar key={name} dataKey={name} name={name} fill={color} maxBarSize={34} radius={[3,3,0,0]} />
                                                ))}
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </DashboardCard>

                                <DashboardCard title="신환 내원경로 비중" subtitle="기간 합계 기준">
                                    <div style={{ height: 300, width: '100%' }}>
                                        <ResponsiveContainer>
                                            <PieChart>
                                                <Pie
                                                    data={sourceSummary}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={52}
                                                    outerRadius={78}
                                                    paddingAngle={4}
                                                    dataKey="value"
                                                    nameKey="name"
                                                    labelLine={false}
                                                >
                                                    {sourceSummary.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                                                </Pie>
                                                <Tooltip content={renderSourcePieTooltip} cursor={false} wrapperStyle={{ zIndex: 10 }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </DashboardCard>
                            </div>

                            <DashboardCard
                                title="신환 내원경로 상세 데이터"
                                subtitle={`${insightPeriodLabel} 기준 월별 내원경로와 비율`}
                                headerRight={
                                    <div style={monthSelectWrapStyle}>
                                        <span style={monthSelectLabelStyle}>표시 범위</span>
                                        <strong style={monthSelectLabelStyle}>{insightPeriodLabel}</strong>
                                    </div>
                                }
                            >
                                <div className="treatment-data-table-container">
                                    <table className="treatment-data-table">
                                        <colgroup>
                                            <col style={{ width: '72px' }} />
                                            {detailSourceSummary.map(({ name }) => <col key={name} />)}
                                            <col style={{ width: '112px' }} />
                                        </colgroup>
                                        <thead>
                                            <tr>
                                                <th className="row-header" style={compactMonthCellStyle}>월</th>
                                                {detailSourceSummary.map(({ name }) => <th key={name}>{name}</th>)}
                                                <th>총 신환 합계</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedRatioDetailRows.map((month) => {
                                                const monthTotal = Object.values(month.sources || {})
                                                    .reduce((sum, count) => sum + Number(count || 0), 0);
                                                return (
                                                    <tr key={month.month}>
                                                        <td className="row-header" style={compactMonthCellStyle}>{month.month}</td>
                                                        {detailSourceSummary.map(({ name }) => {
                                                            const count = Number((month.sources || {})[name] || 0);
                                                            return <td key={name}>{count.toLocaleString()}명</td>;
                                                        })}
                                                        <td className="font-bold">{monthTotal.toLocaleString()}명</td>
                                                    </tr>
                                                );
                                            })}
                                            <tr className="highlight-row">
                                                <td className="row-header" style={compactMonthCellStyle}>소계</td>
                                                {detailSourceSummary.map(({ name, color }) => {
                                                    const value = Number(selectedRatioDetailSourceTotals[name] || 0);
                                                    return <td key={name} className="font-bold" style={{ color }}>{value.toLocaleString()}명</td>;
                                                })}
                                                <td className="font-bold">{selectedRatioDetailGrandTotal.toLocaleString()}명</td>
                                            </tr>
                                            <tr>
                                                <td className="row-header" style={compactMonthCellStyle}>{monthFilter !== 'all' ? '당월 비율' : '기간 비율'}</td>
                                                {detailSourceSummary.map(({ name, color }) => {
                                                    const count = Number(selectedRatioDetailSourceTotals[name] || 0);
                                                    return <td key={name} style={{ color }}>{formatRatio(count, selectedRatioDetailGrandTotal)}</td>;
                                                })}
                                                <td className="font-bold">{selectedRatioDetailGrandTotal ? '100.0%' : '0.0%'}</td>
                                            </tr>
                                            <tr>
                                                <td className="row-header" style={compactMonthCellStyle}>총 비율</td>
                                                {detailSourceSummary.map(({ name, color }) => (
                                                    <td key={name} style={{ color }}>{formatRatio(fullYearSourceTotals[name] || 0, fullYearTotalNewPatients)}</td>
                                                ))}
                                                <td className="font-bold">{fullYearTotalNewPatients ? '100.0%' : '0.0%'}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </DashboardCard>
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="analysis-page">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1>신환분석</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        신환 내원경로, 연령 분포, 내원 경로별 객단가를 분석합니다.
                    </p>
                </div>

                <AnalysisPeriodControls
                    selectedYear={selectedYear}
                    availableYears={availableYears}
                    onYearChange={setSelectedYear}
                    half={half}
                    onHalfChange={setHalf}
                    monthFilter={monthFilter}
                    onMonthFilterChange={setMonthFilter}
                />
            </header>

            <nav className="tab-navigation">
                <ul className="tab-list">
                    <li className={subTab === 'source' ? 'active' : ''} onClick={() => setSubTab('source')}>
                        <MapPin size={20} />
                        <span>신환 내원경로 현황</span>
                    </li>
                    <li className={subTab === 'treatmentConversion' ? 'active' : ''} onClick={() => setSubTab('treatmentConversion')}>
                        <ClipboardCheck size={20} />
                        <span>내원 경로별 치료 이행율</span>
                    </li>
                    <li className={subTab === 'age' ? 'active' : ''} onClick={() => setSubTab('age')}>
                        <Users size={20} />
                        <span>연령별 신환 현황</span>
                    </li>
                    <li className={subTab === 'unitPrice' ? 'active' : ''} onClick={() => setSubTab('unitPrice')}>
                        <WalletCards size={20} />
                        <span>내원 경로별 객단가</span>
                    </li>
                </ul>
            </nav>

            <div className="tab-content">
                {renderTabContent()}
            </div>
            <ManagementInsight
                categoryKey="new_patient"
                subCategoryKey={subTab}
                year={selectedYear}
                period={monthFilter !== 'all' ? `month-${monthFilter}` : half}
                periodLabel={insightPeriodLabel}
                defaultInsight={newPatientInsightText}
            />
        </div>
    );
};

const compactMonthCellStyle = { minWidth: '0', width: '72px', paddingLeft: '0.75rem', whiteSpace: 'nowrap' };
const ageTableLabelCellStyle = { minWidth: '0', width: '96px', paddingLeft: '0.75rem', whiteSpace: 'nowrap' };
const monthSelectWrapStyle = { display: 'flex', alignItems: 'center', gap: '0.5rem' };
const monthSelectLabelStyle = { color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600 };
const monthSelectStyle = {
    minWidth: '96px',
    height: '34px',
    padding: '0 0.75rem',
    borderRadius: '0.45rem',
    border: '1px solid var(--border-color)',
    background: 'var(--card-bg)',
    color: 'var(--text-primary)',
    fontSize: '0.85rem',
    fontWeight: 600,
    outline: 'none',
    cursor: 'pointer',
};

export default NewPatientAnalysis;
