import React, { useEffect, useMemo, useState } from 'react';
import {
    Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    ComposedChart, Line
} from 'recharts';
import { Calendar, ChevronDown, ClipboardCheck, UserCheck, UserX, Users } from 'lucide-react';
import DashboardCard from '../components/DashboardCard';
import MonthlySnapshotBarChart from '../components/MonthlySnapshotBarChart';
import ManagementInsight from '../components/ManagementInsight';
import AnalysisPeriodControls from '../components/AnalysisPeriodControls';
import { useAuth } from '../context/AuthContext';
import { getActiveAnalyticsClinicId, loadAnalyticsData } from '../utils/supabaseAnalyticsStore';
import { getCurrentYearString, getDefaultYearOptions } from '../utils/dateUtils';
import './SalesAnalysis.css';
import './TreatmentAnalysis.css';

const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

const parseNumber = (value) => {
    if (typeof value === 'number') return value;
    const cleaned = String(value ?? '').replace(/[^0-9.-]/g, '');
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : 0;
};

const safeJson = (key, fallback) => {
    return fallback;
};

const normalizeMonth = (value) => {
    const text = String(value ?? '');
    const match = text.match(/(\d{1,2})월/) || text.match(/[-/.](\d{1,2})(?:[-/.]|$)/);
    if (!match) return '';
    const month = Number(match[1]);
    return month >= 1 && month <= 12 ? `${month}월` : '';
};

const normalizeYear = (value, fallback = getCurrentYearString()) => {
    const text = String(value ?? '');
    const match = text.match(/([12]\d{3})년?/) || text.match(/^(\d{2})[-/.]/);
    if (!match) return fallback;
    return match[1].length === 2 ? `20${match[1]}` : match[1];
};

const isAgreedStatus = (status) => {
    const text = String(status || '').replace(/\s+/g, '');
    return text.includes('동의') && !text.includes('미동의') && !text.includes('부동의') && !text.includes('부분동의');
};

const isPartialStatus = (status) => {
    const text = String(status || '').replace(/\s+/g, '');
    return text.includes('부분동의');
};

const isRejectedStatus = (status) => {
    const text = String(status || '').replace(/\s+/g, '');
    return text.includes('미동의') || text.includes('부동의') || text.includes('거절');
};

const getPlanYear = (plan) => String(plan.year || normalizeYear(plan.createdAt));
const getPlanMonth = (plan) => plan.month || normalizeMonth(plan.createdAt);

const getConsultantName = (plan) => {
    const keys = ['consultant', 'consultantName', 'counselor', 'manager', '담당자', '상담자', '실장'];
    for (const key of keys) {
        const value = String(plan?.[key] ?? '').trim();
        if (value) return value;
    }
    return '미지정';
};

const getFieldNumber = (item, keys) => {
    for (const key of keys) {
        if (item?.[key] !== undefined && item?.[key] !== null && item?.[key] !== '') {
            return parseNumber(item[key]);
        }
    }
    return 0;
};

const getFieldText = (item, keys, fallback = '-') => {
    for (const key of keys) {
        const value = String(item?.[key] ?? '').trim();
        if (value) return value;
    }
    return fallback;
};

const formatWon = (value) => `${Math.round(Number(value || 0)).toLocaleString()}원`;
const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;
const CONSULTANT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b'];
const REJECTED_ROWS_PER_PAGE = 10;

const collectConsultationYears = (plans, overallData, consultantData, rejectedData) => {
    const years = new Set(getDefaultYearOptions());
    (plans || []).forEach(plan => {
        const year = getPlanYear(plan);
        if (year) years.add(String(year));
    });
    Object.keys(overallData || {}).forEach(year => years.add(String(year)));
    Object.keys(consultantData || {}).forEach(year => years.add(String(year)));
    Object.keys(rejectedData || {}).forEach(year => years.add(String(year)));
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
};

const buildConsultationStoreFromRows = (rows = []) => rows.reduce((store, row) => {
    const year = String(row.year || '');
    const month = `${Number(row.month || 0)}월`;
    if (!year || !MONTHS.includes(month)) return store;
    if (!store[year]) store[year] = {};
    store[year][month] = row.payload || {};
    return store;
}, {});

const buildTreatmentPlansFromSupabaseRows = (rows = []) => (
    rows.flatMap(row => {
        const payloadRows = Array.isArray(row.payload?.rows) ? row.payload.rows : [];
        return payloadRows.map(item => ({
            ...item,
            year: item.year || row.year,
            month: item.month || `${Number(row.month || 0)}월`,
        }));
    })
);

const isDoctorDiagnosisName = (value) => {
    const text = String(value || '').trim();
    if (!/^[가-힣]{2,5}$/.test(text)) return false;
    return !/(상담|현황|결정|환자|진단|동의|금액|보험|치료|계획|신환|구환|전체|부분|최종|총)/.test(text);
};

const ConsultationAnalysis = () => {
    const { clinicId } = useAuth();
    const activeClinicId = getActiveAnalyticsClinicId(clinicId);
    const [selectedYear, setSelectedYear] = useState(() => getCurrentYearString());
    const [availableYears, setAvailableYears] = useState(() => getDefaultYearOptions());
    const [isYearOpen, setIsYearOpen] = useState(false);
    const [half, setHalf] = useState('all');
    const [monthFilter, setMonthFilter] = useState('all');
    const [subTab, setSubTab] = useState('overall');
    const [rejectedPage, setRejectedPage] = useState(1);
    const [refreshKey, setRefreshKey] = useState(0);

    const [treatmentPlans, setTreatmentPlans] = useState(() => []);
    const [consultationOverallData, setConsultationOverallData] = useState(() => ({}));
    const [consultationConsultantData, setConsultationConsultantData] = useState(() => ({}));
    const [consultationRejectedData, setConsultationRejectedData] = useState(() => ({}));

    useEffect(() => {
        let cancelled = false;

        const loadData = async () => {
            let nextPlans = [];
            let nextOverall = {};
            let nextConsultant = {};
            let nextRejected = {};

            if (activeClinicId) {
                try {
                    const [overallRows, consultantRows, rejectedRows, treatmentRows] = await Promise.all([
                        loadAnalyticsData({ clinicId: activeClinicId, category: 'consultation', subCategory: 'overall' }),
                        loadAnalyticsData({ clinicId: activeClinicId, category: 'consultation', subCategory: 'consultant' }),
                        loadAnalyticsData({ clinicId: activeClinicId, category: 'consultation', subCategory: 'rejected' }),
                        loadAnalyticsData({ clinicId: activeClinicId, category: 'sales', subCategory: 'treatment_plan' }),
                    ]);

                    const overallStore = buildConsultationStoreFromRows(overallRows);
                    const consultantStore = buildConsultationStoreFromRows(consultantRows);
                    const rejectedStore = buildConsultationStoreFromRows(rejectedRows);
                    const treatmentPlanRows = buildTreatmentPlansFromSupabaseRows(treatmentRows);

                    if (Object.keys(overallStore).length > 0) nextOverall = overallStore;
                    if (Object.keys(consultantStore).length > 0) nextConsultant = consultantStore;
                    if (Object.keys(rejectedStore).length > 0) nextRejected = rejectedStore;
                    if (treatmentPlanRows.length > 0) nextPlans = treatmentPlanRows;
                } catch (e) {
                    console.error('[ConsultationAnalysis] Supabase data load error:', e);
                }
            }

            if (cancelled) return;
            setTreatmentPlans(nextPlans);
            setConsultationOverallData(nextOverall);
            setConsultationConsultantData(nextConsultant);
            setConsultationRejectedData(nextRejected);
        };

        loadData();
        return () => {
            cancelled = true;
        };
    }, [activeClinicId, refreshKey]);

    useEffect(() => {
        const years = collectConsultationYears(treatmentPlans, consultationOverallData, consultationConsultantData, consultationRejectedData);
        setAvailableYears(years);
        if (!years.includes(String(selectedYear))) {
            setSelectedYear(getCurrentYearString());
        }
    }, [treatmentPlans, consultationOverallData, consultationConsultantData, consultationRejectedData, selectedYear]);

    useEffect(() => {
        const handleUpdate = () => setRefreshKey(prev => prev + 1);
        window.addEventListener('storage', handleUpdate);
        window.addEventListener('consultationAnalysisUpdated', handleUpdate);
        window.addEventListener('activeClinicChanged', handleUpdate);
        return () => {
            window.removeEventListener('storage', handleUpdate);
            window.removeEventListener('consultationAnalysisUpdated', handleUpdate);
            window.removeEventListener('activeClinicChanged', handleUpdate);
        };
    }, []);

    const periodMonths = useMemo(() => {
        if (monthFilter !== 'all') return [monthFilter];
        if (half === 'first') return MONTHS.slice(0, 6);
        if (half === 'second') return MONTHS.slice(6);
        return MONTHS;
    }, [half, monthFilter]);
    const isMonthlyView = monthFilter !== 'all';
    const selectedMonth = periodMonths[0] || MONTHS[0];

    useEffect(() => {
        setRejectedPage(1);
    }, [selectedYear, half, monthFilter]);

    const filteredPlans = useMemo(() => {
        return treatmentPlans.filter(plan => {
            const year = getPlanYear(plan);
            const month = getPlanMonth(plan);
            return year === String(selectedYear) && periodMonths.includes(month);
        });
    }, [treatmentPlans, selectedYear, periodMonths]);

    const buildSummary = (plans) => {
        const agreed = plans.filter(plan => isAgreedStatus(plan.status));
        const partial = plans.filter(plan => isPartialStatus(plan.status));
        const rejected = plans.filter(plan => isRejectedStatus(plan.status));
        const consultationAmount = plans.reduce((sum, plan) => sum + getFieldNumber(plan, ['consultationAmount', 'counselAmount', 'contractAmount', '상담금액']), 0);
        const diagnosisAmount = plans.reduce((sum, plan) => sum + getFieldNumber(plan, ['diagnosisAmount', 'diagnosisFee', '진단금액']), 0) || consultationAmount;
        const rejectedAmount = rejected.reduce((sum, plan) => sum + getFieldNumber(plan, ['consultationAmount', 'counselAmount', 'contractAmount', '비동의금액']), 0);
        const agreedAmount = agreed.reduce((sum, plan) => sum + getFieldNumber(plan, ['finalAgreedAmount', 'agreedAmount', 'contractAmount', '최종동의금액']), 0);
        const paidAmount = agreed.reduce((sum, plan) => sum + getFieldNumber(plan, ['paidAmount', '수납금액']), 0);
        const newPatients = plans.reduce((sum, plan) => sum + getFieldNumber(plan, ['newPatientCount', 'newPatients', '신환수']), 0);
        const oldPatients = plans.reduce((sum, plan) => sum + getFieldNumber(plan, ['oldPatientCount', 'oldPatients', '구환수']), 0);
        const totalPatients = newPatients + oldPatients || plans.length;
        const insuranceDiagnosis = plans.reduce((sum, plan) => sum + getFieldNumber(plan, ['insuranceDiagnosis', '보험진단']), 0);
        const insuranceAgreement = plans.reduce((sum, plan) => sum + getFieldNumber(plan, ['insuranceAgreement', '보험동의']), 0);
        const implantDecision = plans.reduce((sum, plan) => sum + getFieldNumber(plan, ['insuranceImplantDecision', '보험임플결정']), 0);
        const dentureDecision = plans.reduce((sum, plan) => sum + getFieldNumber(plan, ['insuranceDentureDecision', '보험틀니결정']), 0);
        const planChange = plans.reduce((sum, plan) => sum + getFieldNumber(plan, ['treatmentPlanChange', '치료계획변동']), 0);

        return {
            totalConsultations: plans.length,
            agreedCount: agreed.length,
            partialCount: partial.length,
            rejectedCount: rejected.length,
            consultationAmount,
            diagnosisAmount,
            rejectedAmount,
            agreedAmount,
            paidAmount,
            newPatients,
            oldPatients,
            totalPatients,
            insuranceDiagnosis,
            insuranceAgreement,
            implantDecision,
            dentureDecision,
            planChange,
            patientAgreementRate: plans.length > 0 ? (agreed.length / plans.length) * 100 : 0,
            partialAgreementRate: plans.length > 0 ? (partial.length / plans.length) * 100 : 0,
            diagnosisAgreementRate: diagnosisAmount > 0 ? (agreedAmount / diagnosisAmount) * 100 : 0,
            consultationAgreementRate: consultationAmount > 0 ? (agreedAmount / consultationAmount) * 100 : 0,
            collectionRate: agreedAmount > 0 ? (paidAmount / agreedAmount) * 100 : 0,
        };
    };

    const buildSummaryFromOverallRecord = (record) => ({
        totalConsultations: Number(record?.totalConsultations || 0),
        agreedCount: Number(record?.agreedCount || 0),
        partialCount: Number(record?.partialCount || 0),
        rejectedCount: Number(record?.rejectedCount || 0),
        consultationAmount: Number(record?.consultationAmount || 0),
        diagnosisAmount: Number(record?.diagnosisAmount || 0),
        rejectedAmount: Number(record?.rejectedAmount || 0),
        agreedAmount: Number(record?.agreedAmount || 0),
        paidAmount: Number(record?.paidAmount || 0),
        newPatients: Number(record?.newPatients || 0),
        oldPatients: Number(record?.oldPatients || 0),
        totalPatients: Number(record?.totalPatients || 0),
        insuranceDiagnosis: Number(record?.insuranceDiagnosis || 0),
        insuranceAgreement: Number(record?.insuranceAgreement || 0),
        implantDecision: Number(record?.implantDecision || 0),
        dentureDecision: Number(record?.dentureDecision || 0),
        doctorDiagnoses: Array.isArray(record?.doctorDiagnoses) ? record.doctorDiagnoses : [],
        planChange: Number(record?.planChange || 0),
        patientAgreementRate: Number(record?.patientAgreementRate || 0),
        partialAgreementRate: Number(record?.partialAgreementRate || 0),
        diagnosisAgreementRate: Number(record?.diagnosisAgreementRate || 0),
        consultationAgreementRate: Number(record?.consultationAgreementRate || 0),
        collectionRate: 0,
    });

    const getOverallSummary = (month) => {
        const yearBucket = consultationOverallData?.[selectedYear] || {};
        const record = yearBucket?.[month];
        return record ? buildSummaryFromOverallRecord(record) : null;
    };

    const getConsultantSummary = (month) => {
        const yearBucket = consultationConsultantData?.[selectedYear] || {};
        return yearBucket?.[month] || null;
    };

    const getRejectedSummary = (month) => {
        const yearBucket = consultationRejectedData?.[selectedYear] || {};
        return yearBucket?.[month] || null;
    };

    const monthSummary = useMemo(() => {
        const summaries = periodMonths
            .map(month => getOverallSummary(month))
            .filter(Boolean);

        if (summaries.length === 0) return buildSummary([]);

        const doctorDiagnoses = new Map();
        const total = summaries.reduce((acc, summary) => {
            [
                'totalConsultations', 'agreedCount', 'partialCount', 'rejectedCount',
                'consultationAmount', 'diagnosisAmount', 'rejectedAmount', 'agreedAmount',
                'paidAmount', 'newPatients', 'oldPatients', 'totalPatients',
                'insuranceDiagnosis', 'insuranceAgreement', 'implantDecision',
                'dentureDecision', 'planChange',
            ].forEach(key => {
                acc[key] += Number(summary[key] || 0);
            });

            (summary.doctorDiagnoses || []).forEach(doctor => {
                const name = String(doctor.name || '').trim();
                if (!name) return;
                const current = doctorDiagnoses.get(name) || { name, count: 0, agreedAmount: 0 };
                current.count += Number(doctor.count || 0);
                current.agreedAmount += Number(doctor.agreedAmount || doctor.amount || 0);
                doctorDiagnoses.set(name, current);
            });
            return acc;
        }, {
            totalConsultations: 0, agreedCount: 0, partialCount: 0, rejectedCount: 0,
            consultationAmount: 0, diagnosisAmount: 0, rejectedAmount: 0, agreedAmount: 0,
            paidAmount: 0, newPatients: 0, oldPatients: 0, totalPatients: 0,
            insuranceDiagnosis: 0, insuranceAgreement: 0, implantDecision: 0,
            dentureDecision: 0, planChange: 0,
        });

        if (total.totalPatients === 0) total.totalPatients = total.newPatients + total.oldPatients;
        total.doctorDiagnoses = Array.from(doctorDiagnoses.values());
        total.patientAgreementRate = total.totalConsultations > 0
            ? (total.agreedCount / total.totalConsultations) * 100
            : 0;
        total.partialAgreementRate = total.totalConsultations > 0
            ? (total.partialCount / total.totalConsultations) * 100
            : 0;
        total.diagnosisAgreementRate = total.diagnosisAmount > 0
            ? (total.agreedAmount / total.diagnosisAmount) * 100
            : 0;
        total.consultationAgreementRate = total.consultationAmount > 0
            ? (total.agreedAmount / total.consultationAmount) * 100
            : 0;
        total.collectionRate = total.agreedAmount > 0
            ? (total.paidAmount / total.agreedAmount) * 100
            : 0;

        return total;
    }, [consultationOverallData, selectedYear, periodMonths]);
    const doctorDiagnosisRows = useMemo(() => {
        return (monthSummary.doctorDiagnoses || [])
            .filter(doctor => isDoctorDiagnosisName(doctor.name) && Number(doctor.count || 0) > 0)
            .map(doctor => ({
                name: String(doctor.name).trim(),
                count: Number(doctor.count || 0),
                agreedAmount: Number(doctor.agreedAmount || doctor.amount || 0),
            }));
    }, [monthSummary]);
    const periodLabel = monthFilter !== 'all'
        ? monthFilter
        : half === 'first' ? '상반기' : half === 'second' ? '하반기' : '전체';

    const consultationTrendData = periodMonths.map(month => {
        const summary = getOverallSummary(month) || buildSummary([]);
        return {
            month,
            최종동의금액: summary.agreedAmount,
            상담금액: summary.consultationAmount,
            진단금액: summary.diagnosisAmount,
            상담건수: summary.totalConsultations,
            동의율: Number(summary.consultationAgreementRate.toFixed(1)),
        };
    });

    const highlightMetrics = [
        {
            label: '최종동의금액',
            value: formatWon(monthSummary.agreedAmount),
            sub: `${selectedYear}년 ${periodLabel} 기준`,
            color: '#ef4444',
            icon: ClipboardCheck,
        },
        {
            label: '진단금액 대비 동의율',
            value: formatPercent(monthSummary.diagnosisAgreementRate),
            sub: `진단금액 ${formatWon(monthSummary.diagnosisAmount)}`,
            color: '#8b5cf6',
            icon: UserCheck,
        },
        {
            label: '상담금액 대비 동의율',
            value: formatPercent(monthSummary.consultationAgreementRate),
            sub: `상담금액 ${formatWon(monthSummary.consultationAmount)}`,
            color: '#10b981',
            icon: Users,
        },
    ];

    const metricBoxStyle = {
        display: 'grid',
        gap: 6,
        padding: '0.65rem 0.5rem',
        border: '1px solid var(--border-color)',
        borderRadius: 6,
        background: 'var(--bg-color)',
        minHeight: 62,
        alignContent: 'center',
    };

    const metricLabelStyle = {
        fontSize: '0.78rem',
        color: 'var(--text-secondary)',
        fontWeight: 700,
    };

    const metricValueStyle = {
        fontSize: '0.95rem',
        fontWeight: 800,
        color: 'var(--text-primary)',
        whiteSpace: 'nowrap',
    };

    const selectedMonthConsultantRows = useMemo(() => {
        const stored = getConsultantSummary(selectedMonth);
        if (stored?.rows?.length) {
            return stored.rows
                .map(row => ({
                    name: String(row.name || '').trim() || '미입력',
                    patientCount: Number(row.patientCount || 0),
                    fullAgreed: Number(row.fullAgreed || 0),
                    partialAgreed: Number(row.partialAgreed || 0),
                    totalAgreed: Number(row.totalAgreed || 0),
                    rejected: Number(row.rejected || 0),
                    patientAgreementRate: Number(row.patientAgreementRate || 0),
                    consultationAmount: Number(row.consultationAmount || 0),
                    agreedAmount: Number(row.agreedAmount || 0),
                    amountAgreementRate: Number(row.amountAgreementRate || 0),
                }))
                .filter(row => row.name && row.patientCount > 0)
                .sort((a, b) => b.patientCount - a.patientCount || b.amountAgreementRate - a.amountAgreementRate);
        }

        const groups = new Map();
        filteredPlans.forEach(plan => {
            const name = getConsultantName(plan);
            if (!groups.has(name)) groups.set(name, []);
            groups.get(name).push(plan);
        });

        return Array.from(groups.entries())
            .map(([name, plans]) => {
                const summary = buildSummary(plans);
                const totalAgreed = summary.agreedCount + summary.partialCount;
                const patientAgreementRate = summary.totalConsultations > 0 ? (totalAgreed / summary.totalConsultations) * 100 : 0;
                const amountAgreementRate = summary.consultationAmount > 0 ? (summary.agreedAmount / summary.consultationAmount) * 100 : 0;

                return {
                    name,
                    patientCount: summary.totalConsultations,
                    fullAgreed: summary.agreedCount,
                    partialAgreed: summary.partialCount,
                    totalAgreed,
                    rejected: summary.rejectedCount,
                    patientAgreementRate,
                    consultationAmount: summary.consultationAmount,
                    agreedAmount: summary.agreedAmount,
                    amountAgreementRate,
                };
            })
            .sort((a, b) => b.patientCount - a.patientCount || b.amountAgreementRate - a.amountAgreementRate);
    }, [consultationConsultantData, selectedYear, selectedMonth, filteredPlans]);

    const consultantRows = useMemo(() => {
        const normalizeRow = (row) => {
            const patientCount = Number(row.patientCount || 0);
            const fullAgreed = Number(row.fullAgreed || 0);
            const partialAgreed = Number(row.partialAgreed || 0);
            const totalAgreed = Number(row.totalAgreed || fullAgreed + partialAgreed);
            const consultationAmount = Number(row.consultationAmount || 0);
            const agreedAmount = Number(row.agreedAmount || 0);
            return {
                name: String(row.name || '').trim() || '미입력',
                patientCount,
                fullAgreed,
                partialAgreed,
                totalAgreed,
                rejected: Number(row.rejected || Math.max(patientCount - totalAgreed, 0)),
                consultationAmount,
                agreedAmount,
            };
        };

        const rowsForMonth = (month) => {
            const stored = getConsultantSummary(month);
            if (stored?.rows?.length) return stored.rows.map(normalizeRow);

            const monthPlans = treatmentPlans.filter(plan => getPlanYear(plan) === String(selectedYear) && getPlanMonth(plan) === month);
            const groups = new Map();
            monthPlans.forEach(plan => {
                const name = getConsultantName(plan);
                if (!groups.has(name)) groups.set(name, []);
                groups.get(name).push(plan);
            });

            return Array.from(groups.entries()).map(([name, plans]) => {
                const summary = buildSummary(plans);
                return normalizeRow({
                    name,
                    patientCount: summary.totalConsultations,
                    fullAgreed: summary.agreedCount,
                    partialAgreed: summary.partialCount,
                    totalAgreed: summary.agreedCount + summary.partialCount,
                    rejected: summary.rejectedCount,
                    consultationAmount: summary.consultationAmount,
                    agreedAmount: summary.agreedAmount,
                });
            });
        };

        const groups = new Map();
        periodMonths.forEach(month => {
            rowsForMonth(month).forEach(row => {
                if (!groups.has(row.name)) {
                    groups.set(row.name, {
                        name: row.name,
                        patientCount: 0,
                        fullAgreed: 0,
                        partialAgreed: 0,
                        totalAgreed: 0,
                        rejected: 0,
                        consultationAmount: 0,
                        agreedAmount: 0,
                    });
                }
                const target = groups.get(row.name);
                target.patientCount += row.patientCount;
                target.fullAgreed += row.fullAgreed;
                target.partialAgreed += row.partialAgreed;
                target.totalAgreed += row.totalAgreed;
                target.rejected += row.rejected;
                target.consultationAmount += row.consultationAmount;
                target.agreedAmount += row.agreedAmount;
            });
        });

        return Array.from(groups.values())
            .map(row => ({
                ...row,
                patientAgreementRate: row.patientCount > 0 ? (row.totalAgreed / row.patientCount) * 100 : 0,
                amountAgreementRate: row.consultationAmount > 0 ? (row.agreedAmount / row.consultationAmount) * 100 : 0,
            }))
            .filter(row => row.patientCount > 0 || row.consultationAmount > 0)
            .sort((a, b) => b.patientCount - a.patientCount || b.amountAgreementRate - a.amountAgreementRate);
    }, [consultationConsultantData, treatmentPlans, selectedYear, periodMonths]);

    const consultantMonthlyChart = useMemo(() => {
        const normalizeRow = (row) => {
            const fullAgreed = Number(row.fullAgreed || 0);
            const partialAgreed = Number(row.partialAgreed || 0);
            const totalAgreed = Number(row.totalAgreed || fullAgreed + partialAgreed);
            const consultationAmount = Number(row.consultationAmount || 0);
            const agreedAmount = Number(row.agreedAmount || 0);
            return {
                name: String(row.name || '').trim() || '미입력',
                patientCount: Number(row.patientCount || 0),
                totalAgreed,
                consultationAmount,
                agreedAmount,
                amountAgreementRate: Number(row.amountAgreementRate || 0) ||
                    (consultationAmount > 0 ? (agreedAmount / consultationAmount) * 100 : 0),
            };
        };

        const rowsForMonth = (month) => {
            const stored = getConsultantSummary(month);
            if (stored?.rows?.length) return stored.rows.map(normalizeRow);

            const monthPlans = treatmentPlans.filter(plan => getPlanYear(plan) === String(selectedYear) && getPlanMonth(plan) === month);
            const groups = new Map();
            monthPlans.forEach(plan => {
                const name = getConsultantName(plan);
                if (!groups.has(name)) groups.set(name, []);
                groups.get(name).push(plan);
            });

            return Array.from(groups.entries()).map(([name, plans]) => {
                const summary = buildSummary(plans);
                return normalizeRow({
                    name,
                    patientCount: summary.totalConsultations,
                    totalAgreed: summary.agreedCount + summary.partialCount,
                    consultationAmount: summary.consultationAmount,
                    agreedAmount: summary.agreedAmount,
                });
            });
        };

        const consultantNames = new Set();
        const data = periodMonths.map(month => {
            const row = { month };
            rowsForMonth(month)
                .filter(item => item.patientCount > 0 || item.consultationAmount > 0)
                .forEach(item => {
                    consultantNames.add(item.name);
                    row[item.name] = Number(item.amountAgreementRate.toFixed(1));
                });
            return row;
        });

        return {
            data,
            names: Array.from(consultantNames),
        };
    }, [consultationConsultantData, treatmentPlans, selectedYear, periodMonths]);

    const rejectedRows = useMemo(() => {
        const makeStoredRow = (row, month, index) => ({
            id: row.id || `${selectedYear}-${month}-${index}`,
            doctor: String(row.doctor || '-').trim(),
            newPatient: String(row.newPatient || '').trim(),
            oldPatient: String(row.oldPatient || '').trim(),
            patientName: String(row.patientName || '-').trim(),
            visitDate: String(row.visitDate || '-').trim(),
            consultant: String(row.consultant || '-').trim(),
            reason: String(row.reason || '-').trim(),
            diagnosisAmount: Number(row.diagnosisAmount || 0),
            consultationAmount: Number(row.consultationAmount || 0),
            agreedAmount: Number(row.agreedAmount || 0),
            rejectedAmount: Number(row.rejectedAmount || 0),
            note: String(row.note || '').trim(),
        });

        const makeFallbackRow = (plan, month, index) => {
            const diagnosisAmount = getFieldNumber(plan, ['diagnosisAmount', 'diagnosisFee']);
            const consultationAmount = getFieldNumber(plan, ['consultationAmount', 'counselAmount', 'contractAmount']);
            const agreedAmount = getFieldNumber(plan, ['finalAgreedAmount', 'agreedAmount', 'contractAmount']);
            const explicitRejectedAmount = getFieldNumber(plan, ['rejectedAmount', 'notAgreedAmount']);
            return {
                id: `${getFieldText(plan, ['chartNo', 'patientName'], 'row')}-${month}-${index}`,
                doctor: getFieldText(plan, ['doctor', 'doctorName', 'diagnosisDoctor'], '-'),
                newPatient: getFieldNumber(plan, ['newPatientCount', 'newPatients']) > 0 ? '1명' : '0명',
                oldPatient: getFieldNumber(plan, ['oldPatientCount', 'oldPatients']) > 0 ? '1명' : '0명',
                patientName: getFieldText(plan, ['patientName', 'name'], '-'),
                visitDate: getFieldText(plan, ['visitDate', 'createdAt', 'date'], '-'),
                consultant: getConsultantName(plan),
                reason: getFieldText(plan, ['rejectReason', 'rejectedReason', 'notAgreeReason', 'reason'], getFieldText(plan, ['status'], '-')),
                diagnosisAmount,
                consultationAmount,
                agreedAmount,
                rejectedAmount: explicitRejectedAmount || Math.max(consultationAmount - agreedAmount, 0),
            };
        };

        return periodMonths.flatMap(month => {
            const stored = getRejectedSummary(month);
            if (stored?.rows?.length) return stored.rows.map((row, index) => makeStoredRow(row, month, index));

            return filteredPlans
                .filter(plan => getPlanMonth(plan) === month && isRejectedStatus(plan.status))
                .map((plan, index) => makeFallbackRow(plan, month, index));
        });
    }, [consultationRejectedData, selectedYear, periodMonths, filteredPlans]);

    const rejectedTotalAmount = rejectedRows.reduce((sum, row) => sum + row.rejectedAmount, 0);
    const consultationInsightText = (() => {
        if (subTab === 'consultant') {
            const topConsultant = consultantRows.slice().sort((a, b) => Number(b.amountAgreementRate || 0) - Number(a.amountAgreementRate || 0))[0];
            return `${selectedYear}년 ${periodLabel} 기준 상담자별 금액대비 동의율 상위는 ${topConsultant ? `${topConsultant.name}(${formatPercent(topConsultant.amountAgreementRate)})` : '데이터 없음'}입니다. 상담자별 환자수, 상담금액, 동의금액을 함께 보면서 성과 차이를 점검해 주세요.`;
        }

        if (subTab === 'rejected') {
            return `${selectedYear}년 ${periodLabel} 기준 미동의 환자는 ${rejectedRows.length.toLocaleString()}명이며 비동의금액 합계는 ${formatWon(rejectedTotalAmount)}입니다. 미동의 사유와 담당 상담자, 진단금액을 함께 보면서 후속 상담 우선순위를 정리해 주세요.`;
        }

        return `${selectedYear}년 ${periodLabel} 기준 최종동의금액은 ${formatWon(monthSummary.agreedAmount)}, 상담금액 대비 동의율은 ${formatPercent(monthSummary.consultationAgreementRate)}입니다. 전체상담건수는 ${Number(monthSummary.totalConsultations || 0).toLocaleString()}건입니다. 상담 전환율과 금액 흐름을 함께 점검해 주세요.`;
    })();
    const rejectedNewPatientCount = rejectedRows.filter(row => String(row.newPatient || '').trim()).length;
    const rejectedOldPatientCount = rejectedRows.filter(row => String(row.oldPatient || '').trim()).length;
    const rejectedTotalPages = Math.max(1, Math.ceil(rejectedRows.length / REJECTED_ROWS_PER_PAGE));
    const currentRejectedPage = Math.min(rejectedPage, rejectedTotalPages);
    const pagedRejectedRows = rejectedRows.slice(
        (currentRejectedPage - 1) * REJECTED_ROWS_PER_PAGE,
        currentRejectedPage * REJECTED_ROWS_PER_PAGE
    );
    const rejectedTableCellStyle = {
        textAlign: 'center',
        verticalAlign: 'middle',
        padding: '0.85rem 0.75rem',
        lineHeight: 1.35,
        whiteSpace: 'nowrap',
    };
    const consultantTableCellStyle = {
        textAlign: 'center',
        verticalAlign: 'middle',
        padding: '0.9rem 0.75rem',
        lineHeight: 1.35,
        minHeight: 64,
        whiteSpace: 'nowrap',
    };

    const renderOverallTab = () => (
        <div className="dashboard-stack">
            <div className="patient-kpi-row">
                {highlightMetrics.map(item => {
                    const Icon = item.icon;
                    return (
                        <div key={item.label} className="patient-kpi-card" style={{ borderTop: `4px solid ${item.color}`, minHeight: 118 }}>
                            <span className="kpi-label"><Icon size={15} /> {item.label}</span>
                            <span className="kpi-value" style={{ color: item.color, fontSize: '1.7rem' }}>{item.value}</span>
                            <span className="kpi-sub">{item.sub}</span>
                        </div>
                    );
                })}
            </div>

            <DashboardCard
                title={`전체 상담현황 [${selectedYear.slice(2)}년 ${periodLabel}]`}
                subtitle={`${periodLabel} 기준 상담 지표`}
                headerRight={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700 }}>조회 월</span>
                        <select
                            value={periodLabel}
                            disabled
                            style={{
                                height: 38,
                                border: '1px solid var(--border-color)',
                                borderRadius: 8,
                                padding: '0 0.75rem',
                                background: 'var(--card-bg)',
                                color: 'var(--text-primary)',
                                fontWeight: 700,
                                outline: 'none',
                            }}
                        >
                            <option value={periodLabel}>{periodLabel}</option>
                        </select>
                    </div>
                }
            >
                <div className="treatment-data-table-container">
                    <table className="treatment-data-table">
                        <thead>
                            <tr>
                                <th>전체상담건수<br />(보험제외)</th>
                                <th>전체동의 환자수</th>
                                <th>부분동의 환자수</th>
                                <th>신환 / 구환</th>
                                <th>진단금액</th>
                                <th>상담금액</th>
                                <th>비동의금액</th>
                                <th>보험진단</th>
                                <th>보험동의</th>
                                <th>치료계획<br />변동</th>
                                <th>보험 결정</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="font-bold" style={{ minWidth: 120, padding: 8 }}>
                                    <div style={metricBoxStyle}>
                                        <span style={metricValueStyle}>{monthSummary.totalConsultations.toLocaleString()}건</span>
                                    </div>
                                </td>
                                <td style={{ minWidth: 140, padding: 8 }}>
                                    <div style={{ display: 'grid', gap: 6 }}>
                                        <div style={metricBoxStyle}>
                                            <span style={metricLabelStyle}>전체동의 환자수</span>
                                            <span style={{ ...metricValueStyle, color: '#3b82f6' }}>{monthSummary.agreedCount.toLocaleString()}명</span>
                                        </div>
                                        <div style={metricBoxStyle}>
                                            <span style={metricLabelStyle}>환자 전체동의율</span>
                                            <span style={{ ...metricValueStyle, color: '#10b981' }}>{formatPercent(monthSummary.patientAgreementRate)}</span>
                                        </div>
                                    </div>
                                </td>
                                <td style={{ minWidth: 140, padding: 8 }}>
                                    <div style={{ display: 'grid', gap: 6 }}>
                                        <div style={metricBoxStyle}>
                                            <span style={metricLabelStyle}>부분동의 환자수</span>
                                            <span style={metricValueStyle}>{monthSummary.partialCount.toLocaleString()}명</span>
                                        </div>
                                        <div style={metricBoxStyle}>
                                            <span style={metricLabelStyle}>환자 부분동의율</span>
                                            <span style={{ ...metricValueStyle, color: '#f59e0b' }}>{formatPercent(monthSummary.partialAgreementRate)}</span>
                                        </div>
                                    </div>
                                </td>
                                <td style={{ minWidth: 150, padding: 8 }}>
                                    <div style={{ display: 'grid', gap: 6 }}>
                                        <div style={metricBoxStyle}>
                                            <span style={metricLabelStyle}>신환수</span>
                                            <span style={{ ...metricValueStyle, color: '#3b82f6' }}>{monthSummary.newPatients.toLocaleString()}명</span>
                                        </div>
                                        <div style={metricBoxStyle}>
                                            <span style={metricLabelStyle}>구환수</span>
                                            <span style={{ ...metricValueStyle, color: '#64748b' }}>{monthSummary.oldPatients.toLocaleString()}명</span>
                                        </div>
                                        <div style={metricBoxStyle}>
                                            <span style={metricLabelStyle}>총 환자수</span>
                                            <span style={{ ...metricValueStyle, color: '#10b981' }}>{monthSummary.totalPatients.toLocaleString()}명</span>
                                        </div>
                                    </div>
                                </td>
                                <td style={{ padding: 8 }}><div style={metricBoxStyle}><span style={metricValueStyle}>{formatWon(monthSummary.diagnosisAmount)}</span></div></td>
                                <td style={{ padding: 8 }}><div style={metricBoxStyle}><span style={metricValueStyle}>{formatWon(monthSummary.consultationAmount)}</span></div></td>
                                <td style={{ padding: 8 }}><div style={metricBoxStyle}><span style={metricValueStyle}>{formatWon(monthSummary.rejectedAmount)}</span></div></td>
                                <td style={{ padding: 8 }}><div style={metricBoxStyle}><span style={metricValueStyle}>{monthSummary.insuranceDiagnosis.toLocaleString()}건</span></div></td>
                                <td style={{ padding: 8 }}><div style={metricBoxStyle}><span style={metricValueStyle}>{monthSummary.insuranceAgreement.toLocaleString()}건</span></div></td>
                                <td style={{ padding: 8 }}><div style={metricBoxStyle}><span style={metricValueStyle}>{monthSummary.planChange.toLocaleString()}건</span></div></td>
                                <td style={{ minWidth: 120, padding: 8 }}>
                                    <div style={{ display: 'grid', gap: 6 }}>
                                        <div style={metricBoxStyle}>
                                            <span style={metricLabelStyle}>임플</span>
                                            <span style={{ ...metricValueStyle, color: '#3b82f6' }}>{monthSummary.implantDecision.toLocaleString()}건</span>
                                        </div>
                                        <div style={metricBoxStyle}>
                                            <span style={metricLabelStyle}>틀니</span>
                                            <span style={{ ...metricValueStyle, color: '#3b82f6' }}>{monthSummary.dentureDecision.toLocaleString()}건</span>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                            <tr className="highlight-row" style={{ background: 'var(--card-bg)' }}>
                                <td
                                    className="row-header"
                                    style={{
                                        verticalAlign: 'middle',
                                        padding: '0',
                                        fontWeight: 800,
                                        color: 'var(--text-primary)',
                                        whiteSpace: 'nowrap',
                                        background: 'var(--card-bg)',
                                        textAlign: 'center',
                                        height: 96,
                                        position: 'relative',
                                    }}
                                >
                                    <div style={{
                                        position: 'absolute',
                                        inset: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '0',
                                        textAlign: 'center',
                                    }}>
                                        의사별 진단수
                                    </div>
                                </td>
                                <td colSpan={10} style={{ padding: '0.75rem', background: 'var(--card-bg)', verticalAlign: 'middle' }}>
                                    {doctorDiagnosisRows.length > 0 ? (
                                        <div
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: `repeat(${Math.max(doctorDiagnosisRows.length, 1)}, minmax(120px, 1fr))`,
                                                gap: 8,
                                                alignItems: 'stretch',
                                                width: '100%',
                                            }}
                                        >
                                            {doctorDiagnosisRows.map((doctor, index) => (
                                                <div
                                                    key={`${doctor.name}-${index}`}
                                                    style={{
                                                        border: '1px solid var(--border-color)',
                                                        borderRadius: 6,
                                                        background: 'var(--bg-color)',
                                                        minHeight: 64,
                                                        padding: '0.65rem 0.75rem',
                                                        display: 'grid',
                                                        alignContent: 'center',
                                                        justifyItems: 'center',
                                                        gap: 4,
                                                    }}
                                                >
                                                    <span style={{ ...metricLabelStyle, fontSize: '0.82rem' }}>{doctor.name}</span>
                                                    <span style={{ ...metricValueStyle, color: '#3b82f6', fontSize: '1rem' }}>
                                                        {Number(doctor.count || 0).toLocaleString()}건
                                                    </span>
                                                    {Number(doctor.agreedAmount || 0) > 0 && (
                                                        <span style={{ ...metricValueStyle, color: '#ef4444', fontSize: '0.92rem' }}>
                                                            {formatWon(doctor.agreedAmount)}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div
                                            style={{
                                                border: '1px dashed var(--border-color)',
                                                borderRadius: 6,
                                                background: 'var(--bg-color)',
                                                minHeight: 48,
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '0 0.9rem',
                                                color: 'var(--text-secondary)',
                                                fontSize: '0.86rem',
                                                fontWeight: 700,
                                            }}
                                        >
                                            등록된 의사별 진단수가 없습니다
                                        </div>
                                    )}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </DashboardCard>

            <DashboardCard title="상담 현황 추이" subtitle={`${periodLabel} 기준 금액, 상담건수, 동의율`}>
                <div style={{ height: 360, width: '100%' }}>
                    {isMonthlyView ? (
                        <MonthlySnapshotBarChart
                            data={[
                                { name: '진단금액', value: Number(consultationTrendData[0]?.진단금액 || 0), color: '#c94f4f' },
                                { name: '상담금액', value: Number(consultationTrendData[0]?.상담금액 || 0), color: '#7c5aa6' },
                                { name: '최종동의금액', value: Number(consultationTrendData[0]?.최종동의금액 || 0), color: '#8fbf4d' },
                            ]}
                            valueLabel="금액"
                            formatValue={formatWon}
                            height={330}
                        />
                    ) : (
                    <ResponsiveContainer>
                        <ComposedChart data={consultationTrendData} margin={{ top: 28, right: 42, left: 18, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                            <YAxis
                                yAxisId="amount"
                                tick={{ fontSize: 11 }}
                                width={72}
                                tickFormatter={(value) => `${Math.round(value / 1000000).toLocaleString()}백만`}
                            />
                            <YAxis yAxisId="count" hide />
                            <YAxis
                                yAxisId="rate"
                                orientation="right"
                                tick={{ fontSize: 11 }}
                                width={44}
                                tickFormatter={(value) => `${value}%`}
                                domain={[0, 100]}
                            />
                            <Tooltip
                                contentStyle={{ borderRadius: 12, fontSize: 12 }}
                                formatter={(value, name) => {
                                    if (name === '동의율') return [`${Number(value).toFixed(1)}%`, name];
                                    if (name === '상담건수') return [`${Number(value).toLocaleString()}건`, name];
                                    return [formatWon(value), name];
                                }}
                            />
                            <Legend verticalAlign="top" height={28} iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                            <Bar yAxisId="amount" dataKey="최종동의금액" fill="#8fbf4d" radius={[4, 4, 0, 0]} maxBarSize={34} />
                            <Bar yAxisId="amount" dataKey="상담금액" fill="#7c5aa6" radius={[4, 4, 0, 0]} maxBarSize={34} />
                            <Bar yAxisId="amount" dataKey="진단금액" fill="#c94f4f" radius={[4, 4, 0, 0]} maxBarSize={34} />
                            <Bar yAxisId="count" dataKey="상담건수" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={18} />
                            <Line
                                yAxisId="rate"
                                type="monotone"
                                dataKey="동의율"
                                stroke="#22a8c9"
                                strokeWidth={4}
                                dot={{ r: 5, fill: '#ef4444', stroke: '#22a8c9', strokeWidth: 2 }}
                                activeDot={{ r: 6 }}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                    )}
                </div>

                <div className="treatment-data-table-container" style={{ marginTop: '1rem' }}>
                    <table className="treatment-data-table">
                        <thead>
                            <tr>
                                <th className="row-header">구분</th>
                                {consultationTrendData.map(item => <th key={item.month}>{item.month}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                { label: '최종동의금액', key: '최종동의금액', color: '#8fbf4d', formatter: formatWon },
                                { label: '상담금액', key: '상담금액', color: '#7c5aa6', formatter: formatWon },
                                { label: '진단금액', key: '진단금액', color: '#c94f4f', formatter: formatWon },
                                { label: '상담건수', key: '상담건수', color: '#3b82f6', formatter: (value) => `${Number(value).toLocaleString()}건` },
                                { label: '동의율', key: '동의율', color: '#22a8c9', formatter: (value) => `${Number(value).toFixed(1)}%` },
                            ].map(row => (
                                <tr key={row.key}>
                                    <td className="row-header">
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ width: 10, height: 10, borderRadius: 2, background: row.color, display: 'inline-block' }} />
                                            {row.label}
                                        </span>
                                    </td>
                                    {consultationTrendData.map(item => (
                                        <td key={`${row.key}-${item.month}`} className="font-bold">
                                            {row.formatter(item[row.key])}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </DashboardCard>

        </div>
    );

    const renderConsultantTab = () => (
        <div className="dashboard-stack">
            <DashboardCard
                title={`상담자별 전체 상담 건수 및 동의율 [${selectedYear.slice(2)}년 ${periodLabel}]`}
                subtitle={`${periodLabel} 기준 상담자별 성과`}
                headerRight={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700 }}>조회 월</span>
                        <select
                            value={periodLabel}
                            disabled
                            style={{
                                height: 38,
                                border: '1px solid var(--border-color)',
                                borderRadius: 8,
                                padding: '0 0.75rem',
                                background: 'var(--card-bg)',
                                color: 'var(--text-primary)',
                                fontWeight: 700,
                                outline: 'none',
                            }}
                        >
                            <option value={periodLabel}>{periodLabel}</option>
                        </select>
                    </div>
                }
            >
                <div className="treatment-data-table-container">
                    <table className="treatment-data-table" style={{ textAlign: 'center', tableLayout: 'fixed' }}>
                        <thead>
                            <tr>
                                <th style={{ ...consultantTableCellStyle, width: 64 }}>No</th>
                                <th style={{ ...consultantTableCellStyle, width: 180 }}>상담자</th>
                                <th style={consultantTableCellStyle}>환자수</th>
                                <th style={consultantTableCellStyle}>전체<br />동의수</th>
                                <th style={consultantTableCellStyle}>부분<br />동의수</th>
                                <th style={consultantTableCellStyle}>총 동의수</th>
                                <th style={consultantTableCellStyle}>미동의<br />환자수</th>
                                <th style={consultantTableCellStyle}>환자수<br />동의율</th>
                                <th style={consultantTableCellStyle}>상담금액</th>
                                <th style={consultantTableCellStyle}>동의금액</th>
                                <th style={consultantTableCellStyle}>금액대비<br />동의율</th>
                            </tr>
                        </thead>
                        <tbody>
                            {consultantRows.length === 0 ? (
                                <tr>
                                    <td colSpan={11} style={{ padding: '2rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                                        선택한 월에 표시할 상담 데이터가 없습니다.
                                    </td>
                                </tr>
                            ) : consultantRows.map((row, index) => (
                                <tr key={row.name}>
                                    <td className="font-bold" style={consultantTableCellStyle}>{index + 1}</td>
                                    <td style={{ ...consultantTableCellStyle, fontWeight: 800 }}>{row.name}</td>
                                    <td style={consultantTableCellStyle}>{row.patientCount.toLocaleString()}명</td>
                                    <td style={consultantTableCellStyle}>{row.fullAgreed.toLocaleString()}명</td>
                                    <td style={consultantTableCellStyle}>{row.partialAgreed.toLocaleString()}명</td>
                                    <td className="font-bold" style={consultantTableCellStyle}>{row.totalAgreed.toLocaleString()}명</td>
                                    <td style={consultantTableCellStyle}>{row.rejected.toLocaleString()}명</td>
                                    <td style={consultantTableCellStyle}>
                                        <div style={{ ...metricBoxStyle, background: '#fffbe6', minHeight: 48 }}>
                                            <span style={{ ...metricValueStyle, color: '#ef4444' }}>{formatPercent(row.patientAgreementRate)}</span>
                                        </div>
                                    </td>
                                    <td style={consultantTableCellStyle}>{formatWon(row.consultationAmount)}</td>
                                    <td style={consultantTableCellStyle}>{formatWon(row.agreedAmount)}</td>
                                    <td style={consultantTableCellStyle}>
                                        <div style={{ ...metricBoxStyle, background: '#fffbe6', minHeight: 48 }}>
                                            <span style={{ ...metricValueStyle, color: '#ef4444' }}>{formatPercent(row.amountAgreementRate)}</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </DashboardCard>

            <DashboardCard title="상담자별 금액대비 동의율" subtitle={`${selectedYear}년 ${periodLabel} 월별 기준`}>
                <div style={{ height: 340, width: '100%' }}>
                    {isMonthlyView ? (
                        <MonthlySnapshotBarChart
                            data={consultantRows.map((row, index) => ({
                                name: row.name,
                                value: Number(row.amountAgreementRate || 0),
                                color: CONSULTANT_COLORS[index % CONSULTANT_COLORS.length],
                                detail: `상담금액 ${formatWon(row.consultationAmount)}`,
                            }))}
                            valueLabel="금액대비 동의율"
                            formatValue={(value) => `${Number(value).toFixed(1)}%`}
                            height={310}
                        />
                    ) : (
                    <ResponsiveContainer>
                        <BarChart data={consultantMonthlyChart.data} margin={{ top: 28, right: 24, left: 8, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 11 }} width={42} tickFormatter={(value) => `${value}%`} domain={[0, 100]} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Tooltip
                                contentStyle={{ borderRadius: 12, fontSize: 12 }}
                                formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
                            />
                            {consultantMonthlyChart.names.map((name, index) => (
                                <Bar
                                    key={name}
                                    dataKey={name}
                                    name={name}
                                    fill={CONSULTANT_COLORS[index % CONSULTANT_COLORS.length]}
                                    radius={[4, 4, 0, 0]}
                                    maxBarSize={42}
                                />
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                    )}
                </div>
            </DashboardCard>
        </div>
    );

    const renderRejectedTableSection = (title, rows, offset) => (
        <div>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.55rem' }}>
                <span className="rank-badge">{title}</span>
            </h4>
            <div className="treatment-data-table-container">
                <table className="treatment-data-table" style={{ textAlign: 'center', minWidth: 1180 }}>
                    <thead>
                        <tr>
                            <th style={{ ...rejectedTableCellStyle, width: 48 }}>No</th>
                            <th style={rejectedTableCellStyle}>담당 Dr(진단)</th>
                            <th style={rejectedTableCellStyle}>신환</th>
                            <th style={rejectedTableCellStyle}>구환</th>
                            <th style={rejectedTableCellStyle}>환자성함</th>
                            <th style={rejectedTableCellStyle}>내원날짜</th>
                            <th style={rejectedTableCellStyle}>상담자</th>
                            <th style={rejectedTableCellStyle}>미동의사유</th>
                            <th style={rejectedTableCellStyle}>진단금액</th>
                            <th style={rejectedTableCellStyle}>상담금액</th>
                            <th style={rejectedTableCellStyle}>최종동의금액</th>
                            <th style={rejectedTableCellStyle}>비동의금액</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={12} style={{ padding: '2rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                                    표시할 미동의 환자 데이터가 없습니다.
                                </td>
                            </tr>
                        ) : rows.map((row, index) => (
                            <tr key={`${title}-${row.id}`}>
                                <td className="font-bold" style={rejectedTableCellStyle}>
                                    {(currentRejectedPage - 1) * REJECTED_ROWS_PER_PAGE + offset + index + 1}
                                </td>
                                <td style={rejectedTableCellStyle}>{row.doctor}</td>
                                <td style={rejectedTableCellStyle}>{row.newPatient}</td>
                                <td style={rejectedTableCellStyle}>{row.oldPatient}</td>
                                <td style={{ ...rejectedTableCellStyle, fontWeight: 800 }}>{row.patientName}</td>
                                <td style={rejectedTableCellStyle}>{row.visitDate}</td>
                                <td style={rejectedTableCellStyle}>{row.consultant}</td>
                                <td style={rejectedTableCellStyle}>{row.reason}</td>
                                <td style={rejectedTableCellStyle}>{formatWon(row.diagnosisAmount)}</td>
                                <td style={rejectedTableCellStyle}>{formatWon(row.consultationAmount)}</td>
                                <td style={rejectedTableCellStyle}>{formatWon(row.agreedAmount)}</td>
                                <td className="font-bold" style={{ ...rejectedTableCellStyle, color: '#ef4444' }}>
                                    {formatWon(row.rejectedAmount)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderRejectedTab = () => (
        <div className="dashboard-stack">
            <div className="patient-kpi-row">
                {[
                    { label: '비동의금액 합계', value: formatWon(rejectedTotalAmount), sub: `${selectedYear}년 ${periodLabel} 기준`, color: '#ef4444', icon: UserX },
                    { label: '신환 수', value: `${rejectedNewPatientCount.toLocaleString()}명`, sub: '미동의 환자 기준', color: '#3b82f6', icon: UserCheck },
                    { label: '구환 수', value: `${rejectedOldPatientCount.toLocaleString()}명`, sub: '미동의 환자 기준', color: '#64748b', icon: Users },
                ].map(item => {
                    const Icon = item.icon;
                    return (
                        <div key={item.label} className="patient-kpi-card" style={{ borderTop: `4px solid ${item.color}`, minHeight: 112 }}>
                            <span className="kpi-label"><Icon size={15} /> {item.label}</span>
                            <span className="kpi-value" style={{ color: item.color, fontSize: '1.55rem' }}>{item.value}</span>
                            <span className="kpi-sub">{item.sub}</span>
                        </div>
                    );
                })}
            </div>

            <DashboardCard
                title={`미동의 환자 현황 [${selectedYear.slice(2)}년 ${periodLabel}]`}
                subtitle={`${periodLabel} 기준 미동의 환자 상세`}
                headerRight={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700 }}>조회 월</span>
                        <select
                            value={periodLabel}
                            disabled
                            style={{
                                height: 38,
                                border: '1px solid var(--border-color)',
                                borderRadius: 8,
                                padding: '0 0.75rem',
                                background: 'var(--card-bg)',
                                color: 'var(--text-primary)',
                                fontWeight: 700,
                                outline: 'none',
                            }}
                        >
                            <option value={periodLabel}>{periodLabel}</option>
                        </select>
                    </div>
                }
            >
                {renderRejectedTableSection(
                    `${(currentRejectedPage - 1) * REJECTED_ROWS_PER_PAGE + 1} ~ ${Math.min(currentRejectedPage * REJECTED_ROWS_PER_PAGE, rejectedRows.length)}`,
                    pagedRejectedRows,
                    0
                )}

                {rejectedRows.length > REJECTED_ROWS_PER_PAGE && (
                    <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button
                            className="pagination-btn"
                            disabled={currentRejectedPage === 1}
                            onClick={() => setRejectedPage(1)}
                        >
                            처음
                        </button>
                        <button
                            className="pagination-btn"
                            disabled={currentRejectedPage === 1}
                            onClick={() => setRejectedPage(prev => Math.max(1, prev - 1))}
                        >
                            이전
                        </button>
                        {Array.from({ length: rejectedTotalPages }, (_, index) => index + 1).map(page => (
                            <button
                                key={page}
                                className={`pagination-number ${currentRejectedPage === page ? 'active' : ''}`}
                                onClick={() => setRejectedPage(page)}
                            >
                                {page}
                            </button>
                        ))}
                        <button
                            className="pagination-btn"
                            disabled={currentRejectedPage === rejectedTotalPages}
                            onClick={() => setRejectedPage(prev => Math.min(rejectedTotalPages, prev + 1))}
                        >
                            다음
                        </button>
                        <button
                            className="pagination-btn"
                            disabled={currentRejectedPage === rejectedTotalPages}
                            onClick={() => setRejectedPage(rejectedTotalPages)}
                        >
                            마지막
                        </button>
                    </div>
                )}

                <div
                    style={{
                        marginTop: '1rem',
                        display: 'flex',
                        justifyContent: 'flex-end',
                    }}
                >
                    <div
                        style={{
                            minWidth: 220,
                            border: '1px solid var(--border-color)',
                            borderRadius: 6,
                            background: 'var(--bg-color)',
                            padding: '0.85rem 1rem',
                            textAlign: 'center',
                            fontWeight: 800,
                        }}
                    >
                        <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem', marginBottom: 4 }}>비동의금액 합계</div>
                        <div style={{ color: '#ef4444' }}>{formatWon(rejectedTotalAmount)}</div>
                    </div>
                </div>
            </DashboardCard>
        </div>
    );

    const renderPlaceholderTab = (title, description) => (
        <DashboardCard title={title} subtitle={description}>
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 700 }}>
                데이터 업로드/연결 후 표시됩니다.
            </div>
        </DashboardCard>
    );

    return (
        <div className="analysis-page">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1>상담분석</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>상담 동의율과 미동의 환자 흐름을 분석합니다.</p>
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
                <div style={{ display: 'none' }}>
                    <div className="year-selector-container">
                        <button className="year-select-btn" onClick={() => setIsYearOpen(!isYearOpen)}>
                            <Calendar size={16} />
                            {selectedYear}년
                            <ChevronDown size={14} style={{ transform: isYearOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                        </button>
                        {isYearOpen && (
                            <div className="year-dropdown">
                                {availableYears.map(year => (
                                    <button
                                        key={year}
                                        className={`year-item ${selectedYear === year ? 'active' : ''}`}
                                        onClick={() => {
                                            setSelectedYear(year);
                                            setIsYearOpen(false);
                                        }}
                                    >
                                        {year}년
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="period-tabs">
                        <button className={half === 'all' ? 'active' : ''} onClick={() => setHalf('all')}>전체보기</button>
                        <button className={half === 'first' ? 'active' : ''} onClick={() => setHalf('first')}>상반기</button>
                        <button className={half === 'second' ? 'active' : ''} onClick={() => setHalf('second')}>하반기</button>
                    </div>
                </div>
            </header>

            <nav className="tab-navigation">
                <ul className="tab-list">
                    <li className={subTab === 'overall' ? 'active' : ''} onClick={() => setSubTab('overall')}>
                        <ClipboardCheck size={20} />
                        <span>전체 동의율</span>
                    </li>
                    <li className={subTab === 'consultant' ? 'active' : ''} onClick={() => setSubTab('consultant')}>
                        <UserCheck size={20} />
                        <span>상담자별 동의율</span>
                    </li>
                    <li className={subTab === 'rejected' ? 'active' : ''} onClick={() => setSubTab('rejected')}>
                        <UserX size={20} />
                        <span>미동의 환자 현황</span>
                    </li>
                </ul>
            </nav>

            {subTab === 'overall' && renderOverallTab()}
            {subTab === 'consultant' && renderConsultantTab()}
            {subTab === 'rejected' && renderRejectedTab()}

            <ManagementInsight
                categoryKey="consultation"
                subCategoryKey={subTab}
                year={selectedYear}
                period={monthFilter !== 'all' ? `month-${monthFilter}` : half}
                periodLabel={periodLabel}
                defaultInsight={consultationInsightText}
            />
        </div>
    );
};

export default ConsultationAnalysis;
