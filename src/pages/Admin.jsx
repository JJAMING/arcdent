import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertTriangle, X, FileDown, LockKeyhole, LogOut } from 'lucide-react';
import * as XLSX from 'xlsx';
import Tesseract from 'tesseract.js';
import { parseImplantExcel } from '../utils/implantExcelParser';
import { parseInsuranceExcel } from '../utils/insuranceExcelParser';
import { parseLedgerImage, parseLedgerText, extractYearMonthFromFileName } from '../utils/ledgerImageParser';
import { supabase } from '../lib/supabaseClient';
import {
    loadClinicImplantTypes,
    loadAnalyticsAuditLogs,
    loadAnalyticsData,
    replaceClinicImplantTypes,
    saveAnalyticsAuditLog,
    saveAnalyticsData,
} from '../utils/supabaseAnalyticsStore';
import { DEFAULT_IMPLANT_TYPES, IMPLANT_TYPE_COLORS, getImplantTypeCounts, getReconciledImplantTotal, normalizeImplantTypes } from '../utils/implantTypes';
import { getCurrentYearString, getRollingYearOptions } from '../utils/dateUtils';
import { useAuth } from '../context/AuthContext';
import './Admin.css';

// ── 모달/버튼 스타일 상수 ────────────────────────────────────────────────────
const selectStyle = {
    padding: '0.4rem 0.6rem', borderRadius: '0.4rem',
    border: '1px solid var(--border-color)', background: 'var(--card-bg)',
    color: 'var(--text-primary)', fontSize: '0.85rem', cursor: 'pointer',
};
const inputStyle = {
    flex: 1, padding: '0.45rem 0.7rem', borderRadius: '0.4rem',
    border: '1px solid var(--border-color)', background: 'var(--card-bg)',
    color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none',
};
const saveBtnStyle = {
    padding: '0.55rem 1.4rem', borderRadius: '0.5rem',
    background: 'var(--accent-primary)', color: '#fff',
    fontWeight: 700, fontSize: '0.9rem', border: 'none', cursor: 'pointer',
};
const cancelBtnStyle = {
    padding: '0.55rem 1.4rem', borderRadius: '0.5rem',
    background: 'var(--bg-color)', color: 'var(--text-secondary)',
    fontWeight: 600, fontSize: '0.9rem',
    border: '1px solid var(--border-color)', cursor: 'pointer',
};

const YEARS  = getRollingYearOptions({ past: 3, future: 1 });
const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const REPORT_CATEGORIES = [
    { key: 'home', label: 'HOME 종합 대시보드' },
    { key: 'sales', label: '매출분석' },
    { key: 'treatment', label: '진료분석' },
    { key: 'patient', label: '환자분석' },
    { key: 'newPatient', label: '신환분석' },
    { key: 'consultation', label: '상담분석' },
    { key: 'insurance', label: '보험청구분석' },
];
const AUDIT_CATEGORY_LABELS = {
    home: 'HOME',
    sales: '매출분석',
    treatment: '진료분석',
    patient: '환자분석',
    newPatient: '신환분석',
    consultation: '상담분석',
    insurance: '보험청구분석',
};
const AUDIT_SUBCATEGORY_LABELS = {
    total_revenue: '총 매출 현황',
    doctor_revenue: '매출분석(의사)',
    new_patient_revenue: '신환수익 비교',
    treatment_plan: '동의환자 수납액',
    top_patients: '진료비 상위',
    implant_surgery: '임플란트',
    insurance_treatment: '보험 임플/틀니',
    fee_stats: '보험수가별 통계',
    total_patients_ledger: '총 환자수(신환/구환)',
    lab_requests: '기공물 의뢰 현황',
    path_distribution: '신환 내원경로 현황',
    age_distribution: '연령별 신환 현황',
    overall: '전체 동의율',
    consultant: '상담자별 동의율',
    rejected: '미동의 환자 현황',
    claim: '보험청구액 통계',
};
const REPORT_SUBTABS = {
    home: [{ key: 'all', label: '종합 대시보드' }],
    sales: [
        { key: 'all', label: '전체 탭' },
        { key: 'revenue', label: '총매출현황' },
        { key: 'topPatients', label: '진료비 상위' },
        { key: 'newPatientRevenue', label: '신환수익비교' },
        { key: 'doctorRevenue', label: '매출분석(의사)' },
    ],
    treatment: [
        { key: 'all', label: '전체 탭' },
        { key: 'implant', label: '임플란트' },
        { key: 'insuranceImplant', label: '보험 임플란트' },
        { key: 'insuranceDenture', label: '보험 틀니' },
    ],
    patient: [
        { key: 'all', label: '전체 탭' },
        { key: 'newOld', label: '총 환자수(신환/구환)' },
        { key: 'doctorPatients', label: '총 환자수(의사)' },
        { key: 'labRequests', label: '기공물 의뢰 현황' },
    ],
    newPatient: [
        { key: 'all', label: '전체 탭' },
        { key: 'path', label: '신환 내원경로 현황' },
        { key: 'treatmentRate', label: '내원 경로별 치료 이행율' },
        { key: 'age', label: '연령별 신환 현황' },
        { key: 'unitPrice', label: '내원 경로별 객단가' },
    ],
    consultation: [
        { key: 'all', label: '전체 탭' },
        { key: 'overall', label: '전체 동의율' },
        { key: 'consultant', label: '상담자별 동의율' },
        { key: 'rejected', label: '미동의 환자 현황' },
    ],
    insurance: [
        { key: 'all', label: '전체 탭' },
        { key: 'claim', label: '보험청구액 통계' },
        { key: 'fee', label: '보험수가별 통계' },
    ],
};
const REPORT_PERIODS = [
    { key: 'all', label: '전체보기' },
    { key: 'first', label: '상반기' },
    { key: 'second', label: '하반기' },
    { key: 'month', label: '월별' },
];
const NEW_PATIENT_STORAGE_KEY = 'new_patient_analysis_data';
const CONSULTATION_CONSULTANT_STORAGE_KEY = 'consultation_consultant_data';
const CONSULTATION_REJECTED_STORAGE_KEY = 'consultation_rejected_data';
const ADMIN_AUTH_SESSION_KEY = 'arcdent_admin_authenticated';
const ADMIN_AUTH_PENDING_KEY = 'arcdent_admin_auth_pending';
const AGE_RANGES = ['0대', '10대', '20대', '30대', '40대', '50대', '60대', '70대+'];
const normalizeAdminLoginId = (value) => {
    const loginId = value.trim();
    if (loginId.includes('@')) return loginId;
    return `${loginId}@arcdent.local`;
};
const OCR_FIELDS = [
    { key: 'workDays', label: '진료일수',        unit: '일' },
    { key: 'newPt',    label: '신환',            unit: '명' },
    { key: 'oldPt',    label: '구환',            unit: '명' },
    { key: 'totalVisits', label: '총 내원횟수', unit: '회' },
    { key: 'total',    label: '총 접수 환자 수 (자동)', unit: '명', readOnly: true },
    { key: 'avgNewPt', label: '신환 일평균',      unit: '명' },
    { key: 'avgOldPt', label: '구환 일평균 (자동)', unit: '명', readOnly: true },
];

const CONSULTATION_OCR_FIELDS = [
    { key: 'totalConsultations', label: '전체상담건수 (보험제외)', unit: '건' },
    { key: 'agreedCount', label: '전체동의 환자수', unit: '명' },
    { key: 'partialCount', label: '부분동의 환자수', unit: '명' },
    { key: 'patientAgreementRate', label: '환자 전체동의율', unit: '%' },
    { key: 'partialAgreementRate', label: '환자 부분동의율', unit: '%' },
    { key: 'newPatients', label: '신환수', unit: '명' },
    { key: 'oldPatients', label: '구환수', unit: '명' },
    { key: 'totalPatients', label: '총 환자수', unit: '명' },
    { key: 'diagnosisAmount', label: '진단금액', unit: '원' },
    { key: 'consultationAmount', label: '상담금액', unit: '원' },
    { key: 'rejectedAmount', label: '비동의금액', unit: '원' },
    { key: 'agreedAmount', label: '최종동의금액', unit: '원' },
    { key: 'diagnosisAgreementRate', label: '진단금액 대비 동의율', unit: '%' },
    { key: 'consultationAgreementRate', label: '상담금액 대비 동의율', unit: '%' },
    { key: 'insuranceDiagnosis', label: '보험진단', unit: '건' },
    { key: 'insuranceAgreement', label: '보험동의', unit: '건' },
    { key: 'planChange', label: '치료계획변동', unit: '건' },
    { key: 'implantDecision', label: '보험 결정 임플', unit: '건' },
    { key: 'dentureDecision', label: '보험 결정 틀니', unit: '건' },
];

const parseNumber = (val) => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const cleaned = val.replace(/[^0-9.,-]/g, '');
        const num = parseFloat(cleaned.replace(/,/g, ''));
        return Number.isFinite(num) ? num : 0;
    }
    return 0;
};

const normalizeHeader = (val) => String(val ?? '').trim().replace(/\s+/g, '');

const isNewPatientPathDistributionFile = (filename) => (
    /^[12]\d{3}년\d{1,2}월내원환자내원경로분포/.test(normalizeHeader(filename))
);

const isNewPatientTreatmentRateFile = (filename) => {
    const normalized = normalizeHeader(filename);
    return /^[12]\d{3}년?\d{1,2}월/.test(normalized) &&
        normalized.includes('내원경로') &&
        /(?:치료)?이행[율률]/.test(normalized);
};

const isNewPatientAgeDistributionFile = (filename) => (
    /^[12]\d{3}년\d{1,2}월내원환자연령분포/.test(normalizeHeader(filename))
);

const isInsuranceClaimFile = (filename) => (
    /^[12]\d{3}년.*보험청구액/.test(normalizeHeader(filename))
);

const notifyInsuranceClaimUpdated = ({ year }) => {
    window.dispatchEvent(new CustomEvent('insuranceClaimUpdated', { detail: { year } }));
};

const parseInsuranceClaimRows = (rows, fileName) => {
    const year = extractYearMonthFromFileName(fileName)?.year || String(fileName).match(/([12]\d{3})년/)?.[1];
    if (!year) throw new Error('파일명에서 연도를 찾을 수 없습니다. 예: 2025년 보험청구액.xlsx');

    let headerIdx = -1;
    let columns = { month: -1, health: -1, medicalAid: -1 };
    for (let i = 0; i < Math.min(rows.length, 50); i++) {
        const row = rows[i] || [];
        const currentColumns = { month: -1, health: -1, medicalAid: -1 };
        row.forEach((cell, idx) => {
            const text = normalizeHeader(cell);
            if (!text) return;
            if (text === '월' || text.includes('청구월') || text.includes('진료월') || text.includes('년월')) {
                currentColumns.month = idx;
            }
            if (text.includes('청구액') && text.includes('건강보험')) {
                currentColumns.health = idx;
            }
            if (text.includes('청구액') && text.includes('의료급여')) {
                currentColumns.medicalAid = idx;
            }
        });
        if (currentColumns.health !== -1 && currentColumns.medicalAid !== -1) {
            headerIdx = i;
            columns = currentColumns;
            break;
        }
    }

    if (headerIdx === -1) {
        throw new Error('청구액(건강보험)/청구액(의료급여) 컬럼을 찾을 수 없습니다.');
    }

    const extractMonthFromValue = (value) => {
        const text = String(value ?? '').trim();
        let match = text.match(/(\d{1,2})\s*월/);
        if (!match) match = text.match(/[./-](\d{1,2})(?!\d)/);
        if (!match) match = text.match(/^(\d{1,2})$/);
        if (!match) return null;
        const monthNumber = Number(match[1]);
        return monthNumber >= 1 && monthNumber <= 12 ? `${monthNumber}월` : null;
    };

    const monthly = {};
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const month = columns.month !== -1
            ? extractMonthFromValue(row[columns.month])
            : row.map(extractMonthFromValue).find(Boolean);
        if (!month) continue;
        const health = parseNumber(row[columns.health]);
        const medicalAid = parseNumber(row[columns.medicalAid]);
        if (health === 0 && medicalAid === 0) continue;
        if (!monthly[month]) monthly[month] = { month, health: 0, medicalAid: 0, amount: 0 };
        monthly[month].health += health;
        monthly[month].medicalAid += medicalAid;
        monthly[month].amount += health + medicalAid;
    }

    const parsedRows = Object.values(monthly);
    if (parsedRows.length === 0) {
        throw new Error('저장할 월별 보험청구액 데이터가 없습니다.');
    }

    return { year, rows: parsedRows };
};

const parseInsuranceClaimExcel = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const workbook = XLSX.read(event.target.result, { type: 'binary' });
            const allRows = workbook.SheetNames.flatMap(sheetName => (
                XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' })
            ));
            resolve(parseInsuranceClaimRows(allRows, file.name));
        } catch (err) {
            reject(err);
        }
    };
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    reader.readAsBinaryString(file);
});

const notifyInsuranceFeeStatsUpdated = ({ year, month }) => {
    window.dispatchEvent(new CustomEvent('insuranceFeeStatsUpdated', { detail: { year, month } }));
};

const parseInsuranceFeeStatsRows = (rows, fileName) => {
    const yearMonth = extractYearMonthFromFileName(fileName);
    if (!yearMonth) {
        throw new Error('파일명에서 연월을 찾을 수 없습니다. 예: 2025년01월보험수가별통계.xlsx');
    }

    let headerIdx = -1;
    let columns = { code: -1, name: -1, patients: -1, visits: -1, treatmentAmount: -1 };
    for (let i = 0; i < Math.min(rows.length, 60); i++) {
        const row = rows[i] || [];
        const currentColumns = { code: -1, name: -1, patients: -1, visits: -1, treatmentAmount: -1 };
        row.forEach((cell, idx) => {
            const text = normalizeHeader(cell);
            if (!text) return;
            if (text === '코드' || text === '수가코드' || text === '보험코드') {
                currentColumns.code = idx;
            }
            if (text === '수가명' || text === '보험수가명' || text === '명칭' || text === '항목명') {
                currentColumns.name = idx;
            }
            if (text === '환자수' || text === '환자') {
                currentColumns.patients = idx;
            }
            if (text === '진료횟수' || text === '횟수' || text === '입력횟수' || text === '건수') {
                currentColumns.visits = idx;
            }
            if (text === '진료금액' || text === '진료비' || text === '총진료금액' || text === '총진료비') {
                currentColumns.treatmentAmount = idx;
            }
        });
        if (currentColumns.code !== -1 && currentColumns.name !== -1 && currentColumns.patients !== -1 && currentColumns.visits !== -1) {
            headerIdx = i;
            columns = currentColumns;
            break;
        }
    }

    if (headerIdx === -1) {
        throw new Error('코드/수가명/환자수/진료횟수 컬럼을 찾을 수 없습니다.');
    }

    const grouped = {};
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const code = String(row[columns.code] || '').trim();
        const name = String(row[columns.name] || '').trim();
        if (!code || !name || code === '합계' || name === '합계') continue;

        const patients = parseNumber(row[columns.patients]);
        const visits = parseNumber(row[columns.visits]);
        const treatmentAmount = columns.treatmentAmount === -1 ? 0 : parseNumber(row[columns.treatmentAmount]);
        if (patients <= 0 && visits <= 0 && treatmentAmount <= 0) continue;

        const key = `${code}|||${name}`;
        if (!grouped[key]) grouped[key] = { code, name, patients: 0, visits: 0, treatmentAmount: 0 };
        grouped[key].patients += patients;
        grouped[key].visits += visits;
        grouped[key].treatmentAmount += treatmentAmount;
    }

    const parsedRows = Object.values(grouped);
    if (parsedRows.length === 0) {
        throw new Error('저장할 보험수가별 통계 데이터가 없습니다.');
    }

    return { ...yearMonth, rows: parsedRows };
};

const parseInsuranceFeeStatsExcel = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const workbook = XLSX.read(event.target.result, { type: 'binary' });
            const allRows = workbook.SheetNames.flatMap(sheetName => (
                XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' })
            ));
            resolve(parseInsuranceFeeStatsRows(allRows, file.name));
        } catch (err) {
            reject(err);
        }
    };
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    reader.readAsBinaryString(file);
});

const normalizeAgeRange = (value) => {
    const text = normalizeHeader(value);
    const numbers = text.match(/\d+/g)?.map(Number) || [];
    if (/70대\+|70세이상|70이상|70~99세/.test(text)) return '70대+';
    if (/60대\+/.test(text)) return '60대';
    const startAge = numbers.length > 0 ? numbers[0] : null;
    if (startAge == null) return '';
    if (startAge <= 9) return '0대';
    if (startAge <= 19) return '10대';
    if (startAge <= 29) return '20대';
    if (startAge <= 39) return '30대';
    if (startAge <= 49) return '40대';
    if (startAge <= 59) return '50대';
    if (startAge <= 69) return '60대';
    return '70대+';
};

const extractPathFromDistributionFileName = (filename) => {
    const baseName = filename.split(/[\\/]/).pop().replace(/\.[^.]+$/, '').trim();
    const spacedMatch = baseName.match(/내원환자\s*내원경로\s*분포\s*[-_\s]*(.+)$/);
    const compactMatch = normalizeHeader(baseName).match(/내원환자내원경로분포(.+)$/);
    const path = spacedMatch?.[1] || compactMatch?.[1] || '';
    return path.trim().replace(/^[-_\s]+|[-_\s]+$/g, '');
};

const readRatioNumber = (value) => {
    const match = String(value ?? '').match(/(\d{1,3}(?:[\.,]\d+)?)/);
    if (!match) return null;
    const number = parseFloat(match[1].replace(',', '.'));
    if (!Number.isFinite(number)) return null;
    const clamped = Math.max(0, Math.min(100, number));
    return Math.trunc(clamped * 10) / 10;
};

const readFirstPercentLikeNumber = (value) => {
    const text = String(value ?? '');
    const match =
        text.match(/(\d{1,3}(?:[\.,]\d+)?)\s*%/) ||
        text.match(/[(（]\s*(\d{1,3}(?:[\.,]\d+)?)\s*[)）]/);
    return match ? readRatioNumber(match[1]) : null;
};

const readPercentCellValue = (value) => {
    if (typeof value === 'number') {
        const percent = value > 0 && value <= 1 ? value * 100 : value;
        const clamped = Math.max(0, Math.min(100, percent));
        return Math.trunc(clamped * 10) / 10;
    }
    const text = String(value ?? '').trim();
    if (!text) return null;

    if (text.includes('%')) {
        return readRatioNumber(text);
    }

    const numericText = text.replace(/[^0-9.,-]/g, '');
    if (!numericText) return null;
    const normalizedText = numericText.includes(',') && !numericText.includes('.') && /,\d{1,3}$/.test(numericText)
        ? numericText.replace(',', '.')
        : numericText.replace(/,/g, '');
    const parsed = parseFloat(normalizedText);
    if (!Number.isFinite(parsed)) return null;

    const percent = parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
    const clamped = Math.max(0, Math.min(100, percent));
    return Math.trunc(clamped * 10) / 10;
};

const parseNewPatientPathTreatmentRatioRows = (rows, fileName) => {
    const yearMonth = extractYearMonthFromFileName(fileName);
    if (!yearMonth) {
        throw new Error(`파일명에서 연월을 찾을 수 없습니다. 예: 2026년06월내원경로별치료이행율.xlsx`);
    }

    let headerIdx = -1;
    let columns = { path: -1, insurance: -1, nonInsurance: [] };

    for (let i = 0; i < Math.min(rows.length, 60); i++) {
        const headers = (rows[i] || []).map(normalizeHeader);
        const path = findColumn(headers, ['내원경로', '유입경로']);
        const insurance = findColumn(headers, ['보험항목', '보험항목비율', '보험']);
        if (path === -1 || insurance === -1) continue;

        const nonInsurance = headers
            .map((header, index) => ({ header, index }))
            .filter(({ header, index }) => (
                index !== path &&
                index !== insurance &&
                header &&
                /임플란트|보철|보존|미용|기타|비보험/.test(header)
            ))
            .map(({ index }) => index);

        if (nonInsurance.length > 0) {
            headerIdx = i;
            columns = { path, insurance, nonInsurance };
            break;
        }
    }

    if (headerIdx === -1) {
        throw new Error('내원경로/보험항목/비보험 항목 비율 컬럼을 찾을 수 없습니다.');
    }

    const insuranceRatios = {};
    const nonInsuranceRatios = {};
    const ratioRows = [];

    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const path = String(row[columns.path] || '').trim();
        const normalizedPath = normalizeHeader(path);
        if (!normalizedPath || ['합계', '총합계', '평균', '월평균', '일평균'].includes(normalizedPath)) continue;

        const insuranceRatio = Math.max(0, Math.min(100, readPercentCellValue(row[columns.insurance]) ?? 0));
        // The insurance item is explicitly supplied by the report. Everything outside that item is non-insurance.
        const normalizedNonInsurance = Math.round((100 - insuranceRatio) * 10) / 10;

        insuranceRatios[path] = insuranceRatio;
        nonInsuranceRatios[path] = normalizedNonInsurance;
        ratioRows.push({
            path,
            insuranceRatio,
            nonInsuranceRatio: normalizedNonInsurance,
        });
    }

    if (ratioRows.length === 0) {
        throw new Error('저장할 내원경로별 보험/비보험 비율 데이터가 없습니다.');
    }

    return { ...yearMonth, rows: ratioRows, insuranceRatios, nonInsuranceRatios };
};

const extractInsuranceRatioFromOcrText = (text, words = []) => {
    const compactText = text.replace(/\s+/g, ' ');
    const noSpaceText = text.replace(/\s+/g, '');
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    const textPatterns = [
        /보\s*험\s*항\s*목[\s\S]{0,120}?(\d{1,3}(?:[\.,]\d+)?)\s*%?/,
        /보험항목[^\d]{0,80}(\d{1,3}(?:[\.,]\d+)?)%?/,
        /보\s*험[\s\S]{0,30}?항\s*목[\s\S]{0,120}?(\d{1,3}(?:[\.,]\d+)?)\s*%?/,
    ];
    const candidates = [
        ...textPatterns.map(pattern => compactText.match(pattern)),
        ...textPatterns.map(pattern => noSpaceText.match(pattern)),
        ...text
            .split('\n')
            .map(line => line.trim())
            .filter(line => /보\s*험/.test(line) && /항\s*목/.test(line))
            .map(line => line.match(/(\d{1,3}(?:[\.,]\d+)?)\s*%?/)),
    ];
    const match = candidates.find(Boolean);
    const ratioFromText = match ? readRatioNumber(match[1]) : null;
    if (ratioFromText != null) return ratioFromText;

    const itemIndex = compactText.search(/항\s*[목득독묵]/);
    if (itemIndex !== -1) {
        const itemChunkRatio = readFirstPercentLikeNumber(compactText.slice(itemIndex, itemIndex + 100));
        if (itemChunkRatio != null) return itemChunkRatio;
    }

    const noSpaceItemIndex = noSpaceText.search(/항[목득독묵]/);
    if (noSpaceItemIndex !== -1) {
        const itemChunkRatio = readFirstPercentLikeNumber(noSpaceText.slice(noSpaceItemIndex, noSpaceItemIndex + 100));
        if (itemChunkRatio != null) return itemChunkRatio;
    }

    // OCR sometimes drops "보험" and reads the legend as "E 항목(22.4)" or "EE 항득(22.4)".
    // In this chart, the only legend item containing "항목" is "보험 항목".
    const itemLineRatio = lines
        .filter(line => /항\s*[목득독묵]/.test(line) && /(\d{1,3}(?:[\.,]\d+)?)\s*%?/.test(line))
        .map(line => (
            readFirstPercentLikeNumber(line.match(/항\s*[목득독묵][\s\S]{0,80}/)?.[0] || line) ??
            readRatioNumber(line.match(/항\s*[목득독묵][\s\S]{0,60}?(\d{1,3}(?:[\.,]\d+)?)\s*%?/)?.[1] || line)
        ))
        .find(ratio => ratio != null);
    if (itemLineRatio != null) return itemLineRatio;

    const tokens = (words || [])
        .map(word => typeof word === 'string' ? word : word?.text)
        .map(word => String(word || '').trim())
        .filter(Boolean);
    for (let i = 0; i < tokens.length; i++) {
        const windowText = tokens.slice(i, i + 10).join('');
        const normalizedWindow = normalizeHeader(windowText);
        if (!/항[목득독묵]/.test(normalizedWindow)) continue;
        const ratio = readFirstPercentLikeNumber(tokens.slice(i, i + 10).join(' ')) ?? readRatioNumber(tokens.slice(i, i + 10).join(' '));
        if (ratio != null) return ratio;
    }

    const firstPercentLikeNumber = readFirstPercentLikeNumber(compactText);
    if (firstPercentLikeNumber != null) return firstPercentLikeNumber;

    return null;
};

const createEmptyNewPatientYearData = () => MONTHS.map(month => ({
    month,
    sources: {},
    sourceRevenue: {},
    sourceInsurancePatients: {},
    sourceNonInsurancePatients: {},
    sourceInsuranceRatios: {},
    ages: {},
}));

const findColumn = (headers, patterns) => (
    headers.findIndex(header => patterns.some(pattern => header.includes(pattern)))
);

const parseNewPatientAgeRows = (rows, fileName) => {
    const yearMonth = extractYearMonthFromFileName(fileName);
    if (!yearMonth) {
        throw new Error('파일명에서 연월을 찾을 수 없습니다. 예: 2025년01월내원환자연령분포.xlsx');
    }

    let headerIdx = -1;
    let columns = {};
    for (let i = 0; i < Math.min(rows.length, 40); i++) {
        const headers = (rows[i] || []).map(normalizeHeader);
        const age = findColumn(headers, ['연령대', '연령', '나이']);
        const newPatient = findColumn(headers, ['신환수', '신환', '신규환자']);
        if (age !== -1 && newPatient !== -1) {
            headerIdx = i;
            columns = { age, newPatient };
            break;
        }
    }

    if (headerIdx === -1) {
        throw new Error('연령대/신환수 컬럼을 찾을 수 없습니다.');
    }

    const ages = Object.fromEntries(AGE_RANGES.map(range => [range, 0]));
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const ageRange = normalizeAgeRange(row[columns.age]);
        if (!ageRange) continue;
        ages[ageRange] += parseNumber(row[columns.newPatient]);
    }

    const total = Object.values(ages).reduce((sum, count) => sum + Number(count || 0), 0);
    if (total === 0) {
        throw new Error('저장할 연령별 신환수 데이터가 없습니다.');
    }

    return { ...yearMonth, ages };
};

const parseNewPatientAgeExcel = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const workbook = XLSX.read(event.target.result, { type: 'binary' });
            const targetSheetName = workbook.SheetNames.find(sheetName => (
                normalizeHeader(sheetName).includes('연령분포')
            )) || workbook.SheetNames[0];
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[targetSheetName], { header: 1 });
            resolve(parseNewPatientAgeRows(rows, file.name));
        } catch (err) {
            reject(err);
        }
    };
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    reader.readAsBinaryString(file);
});

const parseNewPatientPathRows = (rows, fileName) => {
    const yearMonth = extractYearMonthFromFileName(fileName);
    if (!yearMonth) {
        throw new Error(`파일명에서 연월을 찾을 수 없습니다. 예: 2025년01월내원환자내원경로분포.xlsx`);
    }

    let headerIdx = -1;
    let columns = {};

    for (let i = 0; i < Math.min(rows.length, 40); i++) {
        const headers = (rows[i] || []).map(normalizeHeader);
        const path = findColumn(headers, ['내원경로', '유입경로']);
        const visitPatients = findColumn(headers, ['내원환자수', '내원환자']);
        const oldPatient = findColumn(headers, ['구환수', '구환']);
        const newPatient = findColumn(headers, ['신환수', '신환', '신규환자']);
        const totalVisits = findColumn(headers, ['총내원횟수', '총내원수', '내원횟수']);
        const totalFee = findColumn(headers, ['총진료비', '총진료', '총진료금액', '진료비합계']);
        const avgFee = findColumn(headers, ['평균진료비', '평균진료', '1인당평균', '객단가']);
        const item = findColumn(headers, ['항목', '구분', '보험구분']);
        const insuranceCount = findColumn(headers, ['보험환자수', '보험환자', '보험신환']);
        const nonInsuranceCount = findColumn(headers, ['비보험환자수', '비보험환자', '비보험신환']);

        if (path !== -1 && (newPatient !== -1 || totalFee !== -1 || avgFee !== -1)) {
            headerIdx = i;
            columns = { path, visitPatients, oldPatient, newPatient, totalVisits, totalFee, avgFee, item, insuranceCount, nonInsuranceCount };
            break;
        }
    }

    if (headerIdx === -1) {
        throw new Error('내원경로/신환수/진료비 컬럼을 찾을 수 없습니다.');
    }

    const grouped = {};
    const summary = {
        total: { visitPatients: 0, oldPatients: 0, newPatients: 0, totalVisits: 0, totalFee: 0 },
        average: { visitPatients: 0, oldPatients: 0, newPatients: 0, totalVisits: 0, totalFee: 0 },
    };
    const shouldSkipPath = (value) => {
        const normalized = normalizeHeader(value);
        return !normalized || ['합계', '총합계', '평균', '월평균', '일평균'].includes(normalized);
    };
    const readSummaryValues = (row) => ({
        visitPatients: columns.visitPatients !== -1 ? parseNumber(row[columns.visitPatients]) : 0,
        oldPatients: columns.oldPatient !== -1 ? parseNumber(row[columns.oldPatient]) : 0,
        newPatients: columns.newPatient !== -1 ? parseNumber(row[columns.newPatient]) : 0,
        totalVisits: columns.totalVisits !== -1 ? parseNumber(row[columns.totalVisits]) : 0,
        totalFee: columns.totalFee !== -1 ? parseNumber(row[columns.totalFee]) : 0,
    });
    const headerPathLabel = normalizeHeader(rows[headerIdx]?.[columns.path]);
    let hasReadPatientPathRows = false;
    let blankRowsAfterData = 0;

    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const isBlankRow = row.every(cell => String(cell ?? '').trim() === '');
        if (isBlankRow) {
            if (hasReadPatientPathRows) {
                blankRowsAfterData += 1;
                if (blankRowsAfterData >= 2) break;
            }
            continue;
        }
        blankRowsAfterData = 0;

        const path = String(row[columns.path] || '').trim();
        const normalizedPath = normalizeHeader(path);
        if (hasReadPatientPathRows && headerPathLabel && normalizedPath === headerPathLabel) {
            break;
        }
        if (['합계', '총합계'].includes(normalizedPath)) {
            summary.total = readSummaryValues(row);
            hasReadPatientPathRows = true;
            continue;
        }
        if (['평균', '월평균', '일평균'].includes(normalizedPath)) {
            summary.average = readSummaryValues(row);
            hasReadPatientPathRows = true;
            continue;
        }
        if (shouldSkipPath(path)) continue;

        const oldPatient = columns.oldPatient !== -1 ? parseNumber(row[columns.oldPatient]) : 0;
        const newPatient = columns.newPatient !== -1 ? parseNumber(row[columns.newPatient]) : 0;
        const visitPatient = (oldPatient + newPatient) || (columns.visitPatients !== -1 ? parseNumber(row[columns.visitPatients]) : 0);
        const totalFee = columns.totalFee !== -1 ? parseNumber(row[columns.totalFee]) : 0;
        const avgFee = columns.avgFee !== -1 ? parseNumber(row[columns.avgFee]) : 0;
        const unitCount = visitPatient || newPatient || 1;

        if (!grouped[path]) {
            grouped[path] = { path, oldPatient: 0, newPatient: 0, visitPatient: 0, totalFee: 0, avgFee: 0, avgFeeCount: 0, insurancePatients: 0, nonInsurancePatients: 0 };
        }

        grouped[path].oldPatient += oldPatient;
        grouped[path].newPatient += newPatient;
        grouped[path].visitPatient += visitPatient;
        grouped[path].totalFee += totalFee || (avgFee * unitCount);
        if (avgFee > 0) {
            grouped[path].avgFee += avgFee;
            grouped[path].avgFeeCount += 1;
        }

        if (columns.insuranceCount !== -1 || columns.nonInsuranceCount !== -1) {
            grouped[path].insurancePatients += columns.insuranceCount !== -1 ? parseNumber(row[columns.insuranceCount]) : 0;
            grouped[path].nonInsurancePatients += columns.nonInsuranceCount !== -1 ? parseNumber(row[columns.nonInsuranceCount]) : 0;
        } else if (columns.item !== -1) {
            const item = normalizeHeader(row[columns.item]);
            if (item.includes('보험항목') || item === '보험') {
                grouped[path].insurancePatients += unitCount;
            } else if (item) {
                grouped[path].nonInsurancePatients += unitCount;
            }
        }
        hasReadPatientPathRows = true;
    }

    const parsedRows = Object.values(grouped)
        .filter(row => row.path && (row.newPatient > 0 || row.totalFee > 0))
        .map(row => ({
            ...row,
            avgFee: row.avgFeeCount > 0 ? Math.round(row.avgFee / row.avgFeeCount) : 0,
        }));

    if (parsedRows.length === 0) {
        throw new Error('저장할 내원경로 데이터가 없습니다.');
    }

    return { ...yearMonth, rows: parsedRows, summary };
};

const parseNewPatientPathExcel = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const workbook = XLSX.read(event.target.result, { type: 'binary' });
            const targetSheetName = workbook.SheetNames.find(sheetName => (
                normalizeHeader(sheetName).includes('내원경로분포')
            ));
            const candidateSheetNames = targetSheetName ? [targetSheetName] : workbook.SheetNames;
            let firstError = null;

            for (const sheetName of candidateSheetNames) {
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
                try {
                    resolve(parseNewPatientPathRows(rows, file.name));
                    return;
                } catch (err) {
                    if (!firstError) firstError = err;
                }
            }

            throw firstError || new Error('엑셀 파일에서 내원경로 분포 데이터를 찾을 수 없습니다.');
        } catch (err) {
            reject(err);
        }
    };
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    reader.readAsBinaryString(file);
});

const parseNewPatientTreatmentRateExcel = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const workbook = XLSX.read(event.target.result, { type: 'binary' });
            const targetSheetName = workbook.SheetNames.find(sheetName => {
                const normalized = normalizeHeader(sheetName);
                return normalized.includes('치료이행') || normalized.includes('보험항목');
            });
            const candidateSheetNames = targetSheetName ? [targetSheetName] : workbook.SheetNames;
            let firstError = null;

            for (const sheetName of candidateSheetNames) {
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
                try {
                    const parsed = parseNewPatientPathTreatmentRatioRows(rows, file.name);
                    resolve({
                        year: parsed.year,
                        month: parsed.month,
                        rows: [],
                        summary: {},
                        insuranceRatios: parsed.insuranceRatios || {},
                        nonInsuranceRatios: parsed.nonInsuranceRatios || {},
                    });
                    return;
                } catch (err) {
                    if (!firstError) firstError = err;
                }
            }

            throw firstError || new Error('엑셀 파일에서 내원경로별 치료이행율 데이터를 찾을 수 없습니다.');
        } catch (err) {
            reject(err);
        }
    };
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    reader.readAsBinaryString(file);
});

const parseNewPatientPathText = (text, fileName, words = []) => {
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    const rows = lines.map(line => line.split(/\s{2,}|\t|,/).map(cell => cell.trim()).filter(Boolean));
    try {
        return parseNewPatientPathRows(rows, fileName);
    } catch (tableErr) {
        const yearMonth = extractYearMonthFromFileName(fileName) || (() => {
            const match = text.match(/([12]\d{3})년\s*(\d{1,2})월/);
            return match ? { year: match[1], month: parseInt(match[2]) + '월' } : null;
        })();
        if (!yearMonth) {
            throw new Error(`사진에서 연월을 찾을 수 없습니다. (${tableErr.message})`);
        }

        const compactText = text.replace(/\s+/g, ' ');
        const pathMatch =
            compactText.match(/검색기간\s*[\[【(]\s*([^\]】)]+?)\s*[\]】)]/) ||
            compactText.match(/\[\s*([^\]]+?)\s*\]\s*내원환자/);
        const path = extractPathFromDistributionFileName(fileName) || (pathMatch ? pathMatch[1].trim() : '');
        if (!path) {
            throw new Error('사진에서 검색기간의 내원경로를 찾을 수 없습니다.');
        }

        const insuranceRatio = extractInsuranceRatioFromOcrText(text, words);
        if (insuranceRatio == null) {
            const insuranceLines = lines
                .filter(line => /보|험|항|목/.test(line))
                .slice(0, 3)
                .join(' / ');
            throw new Error(`사진에서 보험 항목 비율을 찾을 수 없습니다. OCR 확인: ${insuranceLines || compactText.slice(0, 120)}`);
        }

        return {
            ...yearMonth,
            rows: [],
            summary: {},
            insuranceRatios: {
                [path]: insuranceRatio,
            },
            nonInsuranceRatios: {
                [path]: Math.max(0, 100 - insuranceRatio),
            },
        };
    }
};

const notifyNewPatientAnalysisUpdated = ({ year, month }) => {
    window.dispatchEvent(new CustomEvent('newPatientAnalysisUpdated', { detail: { year, month } }));
};

const Admin = () => {
    const { isAdmin, profileError } = useAuth();
    const fileInputRef  = useRef(null);
    const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(() => (
        sessionStorage.getItem(ADMIN_AUTH_SESSION_KEY) === 'true'
    ));
    const [adminLoginId, setAdminLoginId] = useState('');
    const [adminLoginPassword, setAdminLoginPassword] = useState('');
    const [adminLoginError, setAdminLoginError] = useState('');
    const [verifiedAdminUserId, setVerifiedAdminUserId] = useState('');
    const [uploadLog, setUploadLog]       = useState([]);
    const [isDragOver, setIsDragOver]     = useState(false);
    const [pendingNewPatientUploads, setPendingNewPatientUploads] = useState([]);
    const [pendingConsultationBundle, setPendingConsultationBundle] = useState(null);
    const [pendingClinicUpload, setPendingClinicUpload] = useState(null);
    const [reportMode, setReportMode] = useState('single');
    const [reportCategory, setReportCategory] = useState('home');
    const [reportSubTab, setReportSubTab] = useState('all');
    const [reportBundleCategories, setReportBundleCategories] = useState(['home', 'sales', 'patient', 'newPatient', 'consultation']);
    const [reportYear, setReportYear] = useState(() => getCurrentYearString());
    const [availableReportYears, setAvailableReportYears] = useState(YEARS);
    const [reportPeriod, setReportPeriod] = useState('all');
    const [reportMonth, setReportMonth] = useState('1월');
    const reportStoreRef = useRef(null);
    const [adminClinics, setAdminClinics] = useState([]);
    const [selectedAdminClinicId, setSelectedAdminClinicId] = useState(() => (
        sessionStorage.getItem('arcdent_admin_selected_clinic_id') || ''
    ));
    const [clinicSelectLoading, setClinicSelectLoading] = useState(false);
    const [clinicSelectError, setClinicSelectError] = useState('');
    const [adminPanelTab, setAdminPanelTab] = useState('upload');
    const [implantTypeRows, setImplantTypeRows] = useState([]);
    const [implantTypeLoading, setImplantTypeLoading] = useState(false);
    const [implantTypeSaving, setImplantTypeSaving] = useState(false);
    const [implantTypeError, setImplantTypeError] = useState('');
    const [implantTypeSuccess, setImplantTypeSuccess] = useState('');
    const [auditLogs, setAuditLogs] = useState([]);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditError, setAuditError] = useState('');
    const [auditFilters, setAuditFilters] = useState({
        status: 'all',
        category: 'all',
        year: 'all',
        month: 'all',
    });
    const [selectedAuditLog, setSelectedAuditLog] = useState(null);
    const hasAdminPanelAccess = isAdminAuthenticated && (isAdmin || Boolean(verifiedAdminUserId));

    // OCR 모달
    const [ocrModal, setOcrModal]   = useState(null);
    const [ocrProcessingFile, setOcrProcessingFile] = useState('');

    useEffect(() => {
        localStorage.removeItem('admin_uploaded_images');
    }, []);

    useEffect(() => {
        if (!isAdmin) {
            if (verifiedAdminUserId) return;
            if (sessionStorage.getItem(ADMIN_AUTH_PENDING_KEY) === 'true') return;
            sessionStorage.removeItem(ADMIN_AUTH_SESSION_KEY);
            setIsAdminAuthenticated(false);
            setVerifiedAdminUserId('');
            return;
        }
        sessionStorage.removeItem(ADMIN_AUTH_PENDING_KEY);
    }, [isAdmin, verifiedAdminUserId]);

    useEffect(() => {
        if (!hasAdminPanelAccess) return;

        let isMounted = true;

        const loadAdminClinics = async () => {
            setClinicSelectLoading(true);
            setClinicSelectError('');

            const { data, error } = await supabase
                .from('clinics')
                .select('id, name, code')
                .order('name', { ascending: true });

            if (!isMounted) return;

            if (error) {
                setAdminClinics([]);
                setClinicSelectError(error.message);
                setClinicSelectLoading(false);
                return;
            }

            const clinics = data || [];
            setAdminClinics(clinics);

            const savedClinicId = sessionStorage.getItem('arcdent_admin_selected_clinic_id') || '';
            const hasSavedClinic = clinics.some(item => item.id === savedClinicId);
            const nextClinicId = hasSavedClinic ? savedClinicId : clinics[0]?.id || '';

            setSelectedAdminClinicId(nextClinicId);

            if (nextClinicId) {
                sessionStorage.setItem('arcdent_admin_selected_clinic_id', nextClinicId);
            } else {
                sessionStorage.removeItem('arcdent_admin_selected_clinic_id');
            }

            setClinicSelectLoading(false);
        };

        loadAdminClinics();

        return () => {
            isMounted = false;
        };
    }, [hasAdminPanelAccess]);

    useEffect(() => {
        if (!hasAdminPanelAccess || !selectedAdminClinicId) {
            setAvailableReportYears(YEARS);
            return;
        }

        let isMounted = true;
        const loadReportYears = async () => {
            const { data, error } = await supabase
                .from('analytics_data')
                .select('year')
                .eq('clinic_id', selectedAdminClinicId);

            if (!isMounted) return;
            if (error) {
                setAvailableReportYears(YEARS);
                return;
            }

            const years = Array.from(new Set([
                ...YEARS,
                ...(data || []).map(row => String(row.year)).filter(Boolean),
            ])).sort((a, b) => Number(b) - Number(a));
            setAvailableReportYears(years);
            if (!years.includes(reportYear)) {
                setReportYear(years.includes(getCurrentYearString()) ? getCurrentYearString() : (years[0] || getCurrentYearString()));
            }
        };

        loadReportYears();
        return () => {
            isMounted = false;
        };
    }, [hasAdminPanelAccess, selectedAdminClinicId, reportYear]);

    useEffect(() => {
        if (!hasAdminPanelAccess || !selectedAdminClinicId) {
            setAuditLogs([]);
            return;
        }

        let isMounted = true;
        const loadLogs = async () => {
            setAuditLoading(true);
            setAuditError('');
            try {
                const rows = await loadAnalyticsAuditLogs({
                    clinicId: selectedAdminClinicId,
                    ...auditFilters,
                });
                if (isMounted) setAuditLogs(rows);
            } catch (err) {
                if (isMounted) setAuditError(err.message || '이력 데이터를 불러오지 못했습니다.');
            } finally {
                if (isMounted) setAuditLoading(false);
            }
        };

        loadLogs();
        return () => {
            isMounted = false;
        };
    }, [hasAdminPanelAccess, selectedAdminClinicId, auditFilters]);

    useEffect(() => {
        if (!hasAdminPanelAccess || !selectedAdminClinicId) {
            setImplantTypeRows([]);
            return;
        }

        let isMounted = true;
        const loadTypes = async () => {
            setImplantTypeLoading(true);
            setImplantTypeError('');
            setImplantTypeSuccess('');
            try {
                const rows = await loadClinicImplantTypes(selectedAdminClinicId);
                if (isMounted) setImplantTypeRows(normalizeImplantTypes(rows));
            } catch (err) {
                if (isMounted) {
                    setImplantTypeRows(normalizeImplantTypes());
                    setImplantTypeError(err.message || '임플란트 종류를 불러오지 못했습니다.');
                }
            } finally {
                if (isMounted) setImplantTypeLoading(false);
            }
        };

        loadTypes();
        return () => {
            isMounted = false;
        };
    }, [hasAdminPanelAccess, selectedAdminClinicId]);

    const handleAdminLogin = async (event) => {
        event.preventDefault();
        setAdminLoginError('');

        const email = normalizeAdminLoginId(adminLoginId);
        if (!adminLoginId.trim() || !adminLoginPassword) {
            setAdminLoginError('관리자 계정 아이디와 비밀번호를 입력해 주세요.');
            return;
        }

        sessionStorage.setItem(ADMIN_AUTH_PENDING_KEY, 'true');

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password: adminLoginPassword,
        });

        if (error || !data?.user?.id) {
            sessionStorage.removeItem(ADMIN_AUTH_PENDING_KEY);
            setAdminLoginError('관리자 계정 아이디 또는 비밀번호가 올바르지 않습니다.');
            return;
        }

        const { data: profileData, error: profileFetchError } = await supabase
            .from('profiles')
            .select('role')
            .eq('user_id', data.user.id)
            .maybeSingle();

        if (profileFetchError || profileData?.role !== 'admin') {
            await supabase.auth.signOut();
            sessionStorage.removeItem(ADMIN_AUTH_PENDING_KEY);
            sessionStorage.removeItem(ADMIN_AUTH_SESSION_KEY);
            sessionStorage.removeItem('arcdent_admin_selected_clinic_id');
            setIsAdminAuthenticated(false);
            setAdminLoginError('관리자 권한이 없는 계정입니다. 관리자 계정으로 로그인해 주세요.');
            return;
        }

        setVerifiedAdminUserId(data.user.id);
        sessionStorage.removeItem(ADMIN_AUTH_PENDING_KEY);
        sessionStorage.setItem(ADMIN_AUTH_SESSION_KEY, 'true');
        setIsAdminAuthenticated(true);
        setAdminLoginError('');
        setAdminLoginPassword('');
    };

    const handleAdminLogout = async () => {
        sessionStorage.removeItem(ADMIN_AUTH_PENDING_KEY);
        sessionStorage.removeItem(ADMIN_AUTH_SESSION_KEY);
        sessionStorage.removeItem('arcdent_admin_selected_clinic_id');
        setIsAdminAuthenticated(false);
        setVerifiedAdminUserId('');
        setAdminLoginId('');
        setAdminLoginPassword('');
        setAdminLoginError('');
        await supabase.auth.signOut();
    };

    if (!hasAdminPanelAccess) {
        return (
            <div className="admin-auth-container">
                <form className="admin-auth-card" onSubmit={handleAdminLogin}>
                    <div className="admin-auth-header">
                        <LockKeyhole size={34} className="admin-auth-icon" />
                        <h1>관리자 계정 로그인</h1>
                        <p>관리자 모드는 Supabase 관리자 계정으로 로그인한 경우에만 이용할 수 있습니다.</p>
                    </div>

                    {adminLoginError && (
                        <div className="admin-auth-error">{adminLoginError}</div>
                    )}
                    {!isAdmin && profileError && (
                        <div className="admin-auth-error">{profileError}</div>
                    )}

                    <label className="admin-auth-field">
                        <span>관리자 계정 아이디</span>
                        <input
                            type="text"
                            value={adminLoginId}
                            onChange={(event) => setAdminLoginId(event.target.value)}
                            autoComplete="username"
                            autoFocus
                        />
                    </label>

                    <label className="admin-auth-field">
                        <span>비밀번호</span>
                        <input
                            type="password"
                            value={adminLoginPassword}
                            onChange={(event) => setAdminLoginPassword(event.target.value)}
                            autoComplete="current-password"
                        />
                    </label>

                    <button type="submit" className="admin-auth-submit">
                        관리자 모드 진입
                    </button>
                </form>
            </div>
        );
    }

    const addLog = (type, msg) => {
        setUploadLog(prev => [...prev, { type, msg, id: Date.now() }]);
    };

    const selectedAdminClinic = adminClinics.find(item => item.id === selectedAdminClinicId) || null;

    const updateImplantTypeRow = (index, patch) => {
        setImplantTypeRows(prev => prev.map((row, rowIndex) => (
            rowIndex === index ? { ...row, ...patch } : row
        )));
        setImplantTypeSuccess('');
    };

    const addImplantTypeRow = () => {
        setImplantTypeRows(prev => [
            ...prev,
            {
                name: '',
                color: IMPLANT_TYPE_COLORS[prev.length % IMPLANT_TYPE_COLORS.length],
                sort_order: prev.length + 1,
                is_active: true,
            },
        ]);
        setImplantTypeSuccess('');
    };

    const removeImplantTypeRow = (index) => {
        setImplantTypeRows(prev => prev.filter((_, rowIndex) => rowIndex !== index));
        setImplantTypeSuccess('');
    };

    const saveImplantTypeRows = async () => {
        if (!selectedAdminClinicId) {
            setImplantTypeError('임플란트 종류를 저장할 치과를 먼저 선택해 주세요.');
            return;
        }

        const rows = implantTypeRows
            .map((row, index) => ({
                ...row,
                name: String(row.name || '').trim(),
                sort_order: index + 1,
            }))
            .filter(row => row.name);

        if (rows.length === 0) {
            setImplantTypeError('임플란트 종류를 1개 이상 입력해 주세요.');
            return;
        }

        setImplantTypeSaving(true);
        setImplantTypeError('');
        setImplantTypeSuccess('');
        try {
            const savedRows = await replaceClinicImplantTypes({
                clinicId: selectedAdminClinicId,
                types: rows,
            });
            setImplantTypeRows(savedRows);
            setImplantTypeSuccess(`${selectedAdminClinic?.name || '선택 치과'} 임플란트 종류를 저장했습니다.`);
            window.dispatchEvent(new Event('implantTypesUpdated'));
        } catch (err) {
            setImplantTypeError(err.message || '임플란트 종류 저장에 실패했습니다.');
        } finally {
            setImplantTypeSaving(false);
        }
    };

    const loadAuditLogList = async (filters = auditFilters) => {
        if (!selectedAdminClinicId) {
            setAuditLogs([]);
            return;
        }

        setAuditLoading(true);
        setAuditError('');
        try {
            const rows = await loadAnalyticsAuditLogs({
                clinicId: selectedAdminClinicId,
                ...filters,
            });
            setAuditLogs(rows);
        } catch (err) {
            setAuditError(err.message || '이력 데이터를 불러오지 못했습니다.');
        } finally {
            setAuditLoading(false);
        }
    };

    const recordAuditLog = async ({
        category,
        subCategory,
        year,
        month,
        status,
        actionType = 'upload',
        errorMessage = '',
        summary = {},
        metadata = {},
    }) => {
        if (!selectedAdminClinicId) return;

        try {
            await saveAnalyticsAuditLog({
                clinicId: selectedAdminClinicId,
                category,
                subCategory,
                year,
                month,
                status,
                actionType,
                summary,
                errorMessage,
                metadata,
            });
            if (adminPanelTab === 'history') {
                await loadAuditLogList();
            }
        } catch (auditErr) {
            console.warn('Failed to save analytics audit log', auditErr);
        }
    };

    const handleAdminClinicChange = (event) => {
        const clinicId = event.target.value;
        setSelectedAdminClinicId(clinicId);

        if (clinicId) {
            sessionStorage.setItem('arcdent_admin_selected_clinic_id', clinicId);
        } else {
            sessionStorage.removeItem('arcdent_admin_selected_clinic_id');
        }
        window.dispatchEvent(new Event('activeClinicChanged'));
    };

    const getExistingAnalyticsPayload = async ({ category, subCategory, year, month }) => {
        const rows = await loadAnalyticsData({
            clinicId: selectedAdminClinicId,
            category,
            subCategory,
            year,
        });
        const monthNumber = month == null
            ? null
            : Number(String(month).replace(/[^0-9]/g, ''));
        const found = rows.find(row => (
            monthNumber == null
                ? row.month == null
                : Number(row.month) === monthNumber
        ));
        return found?.payload || {};
    };

    const mergeAnalyticsPayload = (existingPayload, nextPayload) => {
        const merged = {
            ...(existingPayload || {}),
            ...(nextPayload || {}),
        };

        if (Array.isArray(nextPayload?.rows) && nextPayload.rows.length === 0 && Array.isArray(existingPayload?.rows)) {
            merged.rows = existingPayload.rows;
        }
        if ((!nextPayload?.summary || Object.keys(nextPayload.summary || {}).length === 0) && existingPayload?.summary) {
            merged.summary = existingPayload.summary;
        }
        if (existingPayload?.insuranceRatios || nextPayload?.insuranceRatios) {
            merged.insuranceRatios = {
                ...(existingPayload?.insuranceRatios || {}),
                ...(nextPayload?.insuranceRatios || {}),
            };
        }
        if (existingPayload?.nonInsuranceRatios || nextPayload?.nonInsuranceRatios) {
            merged.nonInsuranceRatios = {
                ...(existingPayload?.nonInsuranceRatios || {}),
                ...(nextPayload?.nonInsuranceRatios || {}),
            };
        }

        return merged;
    };

    const saveSelectedClinicAnalytics = async ({ category, subCategory, year, month, payload, mergeExisting = false, auditSummary = {}, auditMetadata = {} }) => {
        if (!selectedAdminClinicId) {
            const err = new Error('업로드 대상 치과를 먼저 선택해주세요.');
            addLog('error', `❌ [Supabase 저장 실패] ${err.message}`);
            await recordAuditLog({
                category,
                subCategory,
                year,
                month,
                status: 'failed',
                actionType: mergeExisting ? 'update' : 'upload',
                errorMessage: err.message,
                summary: auditSummary,
                metadata: auditMetadata,
            });
            throw err;
        }

        try {
            const finalPayload = mergeExisting
                ? mergeAnalyticsPayload(
                    await getExistingAnalyticsPayload({ category, subCategory, year, month }),
                    payload
                )
                : payload;

            let lastError = null;
            for (let attempt = 1; attempt <= 3; attempt += 1) {
                try {
                    await saveAnalyticsData({
                        clinicId: selectedAdminClinicId,
                        category,
                        subCategory,
                        year,
                        month,
                        payload: finalPayload,
                    });
                    lastError = null;
                    break;
                } catch (saveError) {
                    lastError = saveError;
                    if (attempt < 3) {
                        await new Promise(resolve => setTimeout(resolve, attempt * 350));
                    }
                }
            }
            if (lastError) {
                await recordAuditLog({
                    category,
                    subCategory,
                    year,
                    month,
                    status: 'failed',
                    actionType: mergeExisting ? 'update' : 'upload',
                    errorMessage: lastError.message,
                    summary: auditSummary,
                    metadata: auditMetadata,
                });
                throw lastError;
            }
            addLog(
                'success',
                `✅ [Supabase] ${selectedAdminClinic?.name || '선택 치과'} ${year}년 ${month ? `${month}월 ` : ''}${category}/${subCategory} 저장 완료`
            );
            await recordAuditLog({
                category,
                subCategory,
                year,
                month,
                status: 'success',
                actionType: mergeExisting ? 'update' : 'upload',
                summary: {
                    mergeExisting,
                    ...auditSummary,
                },
                metadata: auditMetadata,
            });
            return true;
        } catch (err) {
            addLog('error', `❌ [Supabase 저장 실패] ${err.message}`);
            throw err;
        }
    };

    const getReportYears = () => availableReportYears;

    const reportMonths = reportPeriod === 'month'
        ? [reportMonth]
        : reportPeriod === 'first'
            ? MONTHS.slice(0, 6)
            : reportPeriod === 'second'
                ? MONTHS.slice(6)
                : MONTHS;

    const reportPeriodLabel = reportPeriod === 'month'
        ? reportMonth
        : REPORT_PERIODS.find(item => item.key === reportPeriod)?.label || '전체보기';
    const reportSubTabs = REPORT_SUBTABS[reportCategory] || [{ key: 'all', label: '전체 탭' }];
    const reportSubTabLabel = reportSubTabs.find(item => item.key === reportSubTab)?.label || reportSubTabs[0]?.label || '전체 탭';

    const readReportStore = (key, fallback = {}) => {
        return reportStoreRef.current?.[key] ?? fallback;
    };

    const normalizeReportRows = (store, year, emptyRow = {}) => {
        const yearData = store?.[year];
        return MONTHS.map(month => {
            const found = Array.isArray(yearData)
                ? yearData.find(row => row.month === month)
                : yearData?.[month];
            return { month, ...emptyRow, ...(found || {}) };
        }).filter(row => reportMonths.includes(row.month));
    };

    const reportNumber = (value, digits = 0) => {
        const number = Number(value || 0);
        return number.toLocaleString('ko-KR', { maximumFractionDigits: digits });
    };
    const reportWon = (value) => `${Math.round(Number(value || 0)).toLocaleString('ko-KR')}원`;
    const reportPercent = (value) => `${Number(value || 0).toFixed(1)}%`;
    const reportSum = (rows, key) => rows.reduce((acc, row) => acc + Number(row?.[key] || 0), 0);
    const escapeReportHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const reportTable = (headers, rows) => `
        <table>
            <thead><tr>${headers.map(header => `<th>${escapeReportHtml(header)}</th>`).join('')}</tr></thead>
            <tbody>
                ${rows.length > 0
                    ? rows.map(row => `<tr>${row.map(cell => `<td>${escapeReportHtml(cell)}</td>`).join('')}</tr>`).join('')
                    : `<tr><td colspan="${headers.length}">데이터가 없습니다.</td></tr>`}
            </tbody>
        </table>
    `;

    const reportCards = (items) => `
        <div class="cards">
            ${items.map(item => `
                <div class="card">
                    <span>${escapeReportHtml(item.label)}</span>
                    <strong>${escapeReportHtml(item.value)}</strong>
                    <small>${escapeReportHtml(item.sub || '')}</small>
                </div>
            `).join('')}
        </div>
    `;

    const getReportMonthLabel = (month) => {
        const index = Number(month) - 1;
        return MONTHS[index] || `${Number(month)}월`;
    };

    const emptyReportMonthStore = (year) => ({ [String(year)]: {} });

    const putReportPayload = (store, year, row, payloadMapper = payload => payload || {}) => {
        const monthLabel = getReportMonthLabel(row.month);
        if (!monthLabel) return;
        if (!store[String(year)]) store[String(year)] = {};
        store[String(year)][monthLabel] = {
            ...(store[String(year)][monthLabel] || {}),
            month: monthLabel,
            ...payloadMapper(row.payload || {}, row),
        };
    };

    const mapNewPatientPathReportPayload = (payload = {}) => {
        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        if (rows.length === 0) return payload || {};

        const sources = {};
        const sourceOldPatients = {};
        const sourceVisitPatients = {};
        const sourceRevenue = {};
        const sourceAvgFee = {};
        const sourceInsurancePatients = {};
        const sourceNonInsurancePatients = {};

        rows.forEach(item => {
            const path = item.path || item.name || item.source;
            if (!path) return;
            const newPatient = Number(item.newPatient || item.newPatients || item.count || 0);
            const oldPatient = Number(item.oldPatient || item.oldPatients || 0);
            const visitPatient = Number(item.visitPatient || item.visitPatients || item.visitPatientsCount || (newPatient + oldPatient) || 0);
            sources[path] = (sources[path] || 0) + newPatient;
            sourceOldPatients[path] = (sourceOldPatients[path] || 0) + oldPatient;
            sourceVisitPatients[path] = (sourceVisitPatients[path] || 0) + visitPatient;
            sourceRevenue[path] = (sourceRevenue[path] || 0) + Number(item.totalFee || item.revenue || 0);
            sourceAvgFee[path] = Number(item.avgFee || item.averageFee || 0);
            sourceInsurancePatients[path] = (sourceInsurancePatients[path] || 0) + Number(item.insurancePatients || 0);
            sourceNonInsurancePatients[path] = (sourceNonInsurancePatients[path] || 0) + Number(item.nonInsurancePatients || 0);
        });

        return {
            sources,
            sourceOldPatients,
            sourceVisitPatients,
            sourceRevenue,
            sourceAvgFee,
            sourceInsurancePatients,
            sourceNonInsurancePatients,
            sourceInsuranceRatios: payload.insuranceRatios || {},
            sourceNonInsuranceRatios: payload.nonInsuranceRatios || {},
            pathDistributionSummary: payload.summary || {},
            rows,
        };
    };

    const loadReportStoresFromSupabase = async (year) => {
        if (!selectedAdminClinicId) {
            throw new Error('PDF 보고서를 만들 치과를 먼저 선택해주세요.');
        }

        const fetchRows = (category, subCategory) => loadAnalyticsData({
            clinicId: selectedAdminClinicId,
            category,
            subCategory,
            year,
        });

        const [
            salesTotalRows,
            salesDoctorRows,
            salesNewPatientRows,
            salesTreatmentPlanRows,
            salesTopPatientRows,
            patientLedgerRows,
            treatmentImplantRows,
            treatmentInsuranceRows,
            newPatientPathRows,
            newPatientAgeRows,
            consultationOverallRows,
            consultationConsultantRows,
            consultationRejectedRows,
            insuranceClaimRows,
            insuranceFeeRows,
        ] = await Promise.all([
            fetchRows('sales', 'total_revenue'),
            fetchRows('sales', 'doctor_revenue'),
            fetchRows('sales', 'new_patient_revenue'),
            fetchRows('sales', 'treatment_plan'),
            fetchRows('sales', 'top_patients'),
            fetchRows('patient', 'total_patients_ledger'),
            fetchRows('treatment', 'implant_surgery'),
            fetchRows('treatment', 'insurance_treatment'),
            fetchRows('newPatient', 'path_distribution'),
            fetchRows('newPatient', 'age_distribution'),
            fetchRows('consultation', 'overall'),
            fetchRows('consultation', 'consultant'),
            fetchRows('consultation', 'rejected'),
            fetchRows('insurance', 'claim'),
            fetchRows('insurance', 'fee_stats'),
        ]);

        const stores = {
            parsed_sales_data: emptyReportMonthStore(year),
            patient_ledger_data: emptyReportMonthStore(year),
            treatment_performance_data: emptyReportMonthStore(year),
            [NEW_PATIENT_STORAGE_KEY]: emptyReportMonthStore(year),
            consultation_overall_data: emptyReportMonthStore(year),
            [CONSULTATION_CONSULTANT_STORAGE_KEY]: emptyReportMonthStore(year),
            [CONSULTATION_REJECTED_STORAGE_KEY]: emptyReportMonthStore(year),
            insurance_claim_data: emptyReportMonthStore(year),
            insurance_fee_stats_data: emptyReportMonthStore(year),
            top_patients_raw_data: [],
        };

        salesTotalRows.forEach(row => putReportPayload(stores.parsed_sales_data, year, row));
        salesDoctorRows.forEach(row => putReportPayload(stores.parsed_sales_data, year, row));
        salesNewPatientRows.forEach(row => putReportPayload(stores.parsed_sales_data, year, row));
        salesTreatmentPlanRows.forEach(row => putReportPayload(stores.parsed_sales_data, year, row, payload => ({
            treatmentPlans: payload.rows || [],
        })));
        salesTopPatientRows.forEach(row => {
            const monthLabel = getReportMonthLabel(row.month);
            (row.payload?.rows || []).forEach(item => {
                stores.top_patients_raw_data.push({ ...item, year: String(year), month: monthLabel });
            });
        });

        patientLedgerRows.forEach(row => putReportPayload(stores.patient_ledger_data, year, row));
        treatmentImplantRows.forEach(row => putReportPayload(stores.treatment_performance_data, year, row));
        treatmentInsuranceRows.forEach(row => putReportPayload(stores.treatment_performance_data, year, row));
        newPatientPathRows.forEach(row => putReportPayload(stores[NEW_PATIENT_STORAGE_KEY], year, row, mapNewPatientPathReportPayload));
        newPatientAgeRows.forEach(row => putReportPayload(stores[NEW_PATIENT_STORAGE_KEY], year, row, payload => ({
            ages: payload.ages || {},
        })));
        consultationOverallRows.forEach(row => putReportPayload(stores.consultation_overall_data, year, row));
        consultationConsultantRows.forEach(row => putReportPayload(stores[CONSULTATION_CONSULTANT_STORAGE_KEY], year, row));
        consultationRejectedRows.forEach(row => putReportPayload(stores[CONSULTATION_REJECTED_STORAGE_KEY], year, row));
        insuranceClaimRows.forEach(row => putReportPayload(stores.insurance_claim_data, year, row));
        insuranceFeeRows.forEach(row => putReportPayload(stores.insurance_fee_stats_data, year, row, payload => ({
            fees: payload.rows || payload.fees || [],
        })));

        return stores;
    };

    const buildReportSections = (category, year, tab = 'all') => {
        const includeTab = (key) => tab === 'all' || tab === key;
        const salesRows = normalizeReportRows(readReportStore('parsed_sales_data'), year, {
            total: 0, netSales: 0, insurance: 0, newPatient: 0, newPatientSales: 0,
        });
        const ledgerRows = normalizeReportRows(readReportStore('patient_ledger_data'), year, {
            workDays: 0, newPt: 0, oldPt: 0, totalVisits: 0, total: 0,
        });
        const treatmentRows = normalizeReportRows(readReportStore('treatment_performance_data'), year, {
            surg1: 0, implantTotal: 0, insImp: 0, insDent: 0,
        });
        const newPatientRows = normalizeReportRows(readReportStore(NEW_PATIENT_STORAGE_KEY), year, {
            sources: {}, sourceRevenue: {}, sourceAvgFee: {},
        });
        const consultationRows = normalizeReportRows(readReportStore('consultation_overall_data'), year, {
            totalConsultations: 0, agreedCount: 0, partialCount: 0, agreedAmount: 0,
            diagnosisAmount: 0, consultationAmount: 0, consultationAgreementRate: 0,
        });
        const consultantRows = normalizeReportRows(readReportStore(CONSULTATION_CONSULTANT_STORAGE_KEY), year, { rows: [] });
        const rejectedRows = normalizeReportRows(readReportStore(CONSULTATION_REJECTED_STORAGE_KEY), year, { rows: [] });
        const claimRows = normalizeReportRows(readReportStore('insurance_claim_data'), year, { health: 0, medicalAid: 0, amount: 0 });
        const feeRows = normalizeReportRows(readReportStore('insurance_fee_stats_data'), year, { fees: [] });
        const topPatientStore = readReportStore('top_patients_raw_data', []);
        const topPatients = (Array.isArray(topPatientStore) ? topPatientStore : [])
            .filter(item => {
                const itemYear = String(item.year || item.연도 || year);
                const itemMonth = item.month || item.월 || item.createdMonth || '';
                return itemYear === String(year) && (reportPeriod !== 'month' || !itemMonth || itemMonth === reportMonth);
            })
            .slice(0, 30);

        const salesCards = [
            { label: '총매출', value: reportWon(reportSum(salesRows, 'total')), sub: reportPeriodLabel },
            { label: '순매출', value: reportWon(reportSum(salesRows, 'netSales')), sub: '현금+카드+기타' },
            { label: '보험청구', value: reportWon(reportSum(salesRows, 'insurance')), sub: '공단부담/청구액' },
        ];
        const getLedgerPatientTotal = (row = {}) => Number(row.newPt || 0) + Number(row.oldPt || 0);

        if (category === 'home') {
            const totalPatients = ledgerRows.reduce((acc, row) => acc + getLedgerPatientTotal(row), 0);
            const newPatients = ledgerRows.reduce((acc, row, index) => acc + Number(row.newPt || salesRows[index]?.newPatient || 0), 0);
            const consultationAmount = reportSum(consultationRows, 'consultationAmount');
            const agreedAmount = reportSum(consultationRows, 'agreedAmount');
            const consultationRate = consultationAmount > 0 ? (agreedAmount / consultationAmount) * 100 : 0;
            return `
                ${reportCards([...salesCards,
                    { label: '총 내원 환자수', value: `${reportNumber(totalPatients)}명`, sub: reportPeriodLabel },
                    { label: '신환 수', value: `${reportNumber(newPatients)}명`, sub: reportPeriodLabel },
                    { label: '상담 동의율', value: reportPercent(consultationRate), sub: '상담금액 대비' },
                ])}
                <h2>월별 핵심 지표</h2>
                ${reportTable(['월', '총매출', '순매출', '보험청구', '신환수'], salesRows.map((row, index) => [
                    row.month, reportWon(row.total), reportWon(row.netSales), reportWon(row.insurance), `${reportNumber(ledgerRows[index]?.newPt || row.newPatient)}명`,
                ]))}
            `;
        }

        if (category === 'sales') {
            const doctorTotals = {};
            salesRows.forEach(row => {
                Object.entries(row.doctorData || {}).forEach(([name, data]) => {
                    doctorTotals[name] = doctorTotals[name] || { pure: 0, insurance: 0, total: 0 };
                    doctorTotals[name].pure += Number(data.pure || 0);
                    doctorTotals[name].insurance += Number(data.insurance || 0);
                    doctorTotals[name].total += Number(data.pure || 0) + Number(data.insurance || 0);
                });
            });
            return `
                ${includeTab('revenue') ? `
                    ${reportCards(salesCards)}
                    <h2>총매출현황</h2>
                    ${reportTable(['월', '총매출', '순매출', '보험청구'], salesRows.map(row => [
                        row.month, reportWon(row.total), reportWon(row.netSales), reportWon(row.insurance),
                    ]))}
                ` : ''}
                ${includeTab('topPatients') ? `
                    <h2>진료비 상위</h2>
                    ${reportTable(['환자명', '차트번호', '총 진료비', '수납액'], topPatients.map(item => [
                        item.patientName || item.name || item.환자명 || '-',
                        item.chartNo || item.chartNumber || item.차트번호 || '-',
                        reportWon(item.totalAmount || item.totalFee || item.총진료비 || item.amount),
                        reportWon(item.paidAmount || item.payment || item.수납액 || 0),
                    ]))}
                ` : ''}
                ${includeTab('newPatientRevenue') ? `
                    <h2>신환수익비교</h2>
                    ${reportTable(['월', '순매출', '신환 매출', '신환 수익 비중'], salesRows.map(row => [
                        row.month,
                        reportWon(row.netSales),
                        reportWon(row.newPatientSales),
                        reportPercent(Number(row.netSales || 0) > 0 ? (Number(row.newPatientSales || 0) / Number(row.netSales || 0)) * 100 : 0),
                    ]))}
                ` : ''}
                ${includeTab('doctorRevenue') ? `
                    <h2>매출분석(의사)</h2>
                    ${reportTable(['의사', '순수매출', '보험청구', '총매출'], Object.entries(doctorTotals).map(([name, value]) => [
                        name, reportWon(value.pure), reportWon(value.insurance), reportWon(value.total),
                    ]))}
                ` : ''}
            `;
        }

        if (category === 'treatment') {
            const implantTypeNames = Array.from(new Set(
                treatmentRows.flatMap(row => Object.keys(row.implantTypes || {}))
            ));
            const reportImplantTypes = normalizeImplantTypes(
                implantTypeNames.length > 0
                    ? implantTypeNames.map(name => ({ name }))
                    : DEFAULT_IMPLANT_TYPES
            );
            const reconciledTreatmentRows = treatmentRows.map(row => ({
                ...row,
                implantTotal: getReconciledImplantTotal(row, reportImplantTypes),
                surg1: getReconciledImplantTotal(row, reportImplantTypes),
            }));
            return `
                ${reportCards([
                    ...(includeTab('implant') ? [{ label: '임플란트 총계', value: `${reportNumber(reportSum(reconciledTreatmentRows, 'implantTotal'))}건`, sub: reportPeriodLabel }] : []),
                    ...(includeTab('insuranceImplant') ? [{ label: '보험 임플란트', value: `${reportNumber(reportSum(treatmentRows, 'insImp'))}건`, sub: reportPeriodLabel }] : []),
                    ...(includeTab('insuranceDenture') ? [{ label: '보험 틀니', value: `${reportNumber(reportSum(treatmentRows, 'insDent'))}건`, sub: reportPeriodLabel }] : []),
                ])}
                ${includeTab('implant') ? `
                    <h2>임플란트</h2>
                    ${reportTable(['월', '수술 1차', '임플란트 총계', ...reportImplantTypes.map(type => type.name)], reconciledTreatmentRows.map(row => [
                        row.month,
                        reportNumber(row.surg1),
                        reportNumber(row.implantTotal),
                        ...reportImplantTypes.map(type => reportNumber(getImplantTypeCounts(row, reportImplantTypes)[type.name] || 0)),
                    ]))}
                ` : ''}
                ${includeTab('insuranceImplant') ? `
                    <h2>보험 임플란트</h2>
                    ${reportTable(['월', '보험 임플란트', '1단계', '2단계', '3단계'], treatmentRows.map(row => [
                        row.month, reportNumber(row.insImp), reportNumber(row.insImpStep1), reportNumber(row.insImpStep2), reportNumber(row.insImpStep3),
                    ]))}
                ` : ''}
                ${includeTab('insuranceDenture') ? `
                    <h2>보험 틀니</h2>
                    ${reportTable(['월', '보험 틀니', '1단계', '5단계', '6단계'], treatmentRows.map(row => [
                        row.month, reportNumber(row.insDent), reportNumber(row.insDentStep1), reportNumber(row.insDentStep5), reportNumber(row.insDentStep6),
                    ]))}
                ` : ''}
            `;
        }

        if (category === 'patient') {
            const doctorTotals = {};
            const labTotals = {};
            ledgerRows.forEach(row => {
                Object.entries(row.doctorPatients || {}).forEach(([name, value]) => {
                    doctorTotals[name] = (doctorTotals[name] || 0) + Number(value || 0);
                });
                (row.labRequests || []).forEach(item => {
                    const key = `${item.category || item.group || item.type || item.kind || '미분류'} - ${item.name || item.labType || item.item || item.type || '미분류'}`;
                    labTotals[key] = (labTotals[key] || 0) + Number(item.count || item.value || item.teeth || 0);
                });
            });
            return `
                ${includeTab('newOld') ? `
                    ${reportCards([
                        { label: '신환 합계', value: `${reportNumber(reportSum(ledgerRows, 'newPt'))}명`, sub: reportPeriodLabel },
                        { label: '구환 합계', value: `${reportNumber(reportSum(ledgerRows, 'oldPt'))}명`, sub: reportPeriodLabel },
                        { label: '총 내원 환자수', value: `${reportNumber(ledgerRows.reduce((acc, row) => acc + getLedgerPatientTotal(row), 0))}명`, sub: reportPeriodLabel },
                    ])}
                    <h2>총 환자수(신환/구환)</h2>
                    ${reportTable(['월', '진료일수', '신환', '구환', '총 내원 환자수'], ledgerRows.map(row => [
                        row.month, `${reportNumber(row.workDays)}일`, `${reportNumber(row.newPt)}명`, `${reportNumber(row.oldPt)}명`, `${reportNumber(getLedgerPatientTotal(row))}명`,
                    ]))}
                ` : ''}
                ${includeTab('doctorPatients') ? `
                    <h2>총 환자수(의사)</h2>
                    ${reportTable(['의사', '진료 환자수'], Object.entries(doctorTotals).sort((a, b) => b[1] - a[1]).map(([name, value]) => [
                        name, `${reportNumber(value)}명`,
                    ]))}
                ` : ''}
                ${includeTab('labRequests') ? `
                    <h2>기공물 의뢰 현황</h2>
                    ${reportTable(['구분 / 기공물 종류', '건수'], Object.entries(labTotals).sort((a, b) => b[1] - a[1]).map(([name, value]) => [
                        name, `${reportNumber(value)}건`,
                    ]))}
                ` : ''}
            `;
        }

        if (category === 'newPatient') {
            const sourceTotals = {};
            const treatmentRates = {};
            const ageTotals = {};
            const avgFeeTotals = {};
            const avgFeeCounts = {};
            newPatientRows.forEach(row => {
                Object.entries(row.sources || {}).forEach(([name, value]) => {
                    sourceTotals[name] = (sourceTotals[name] || 0) + Number(value || 0);
                });
                Object.entries(row.sourceInsuranceRatios || {}).forEach(([name, value]) => {
                    const rate = Number((value?.insurance ?? value?.insuranceRate ?? value) || 0);
                    if (rate > 0) {
                        treatmentRates[name] = treatmentRates[name] || { sum: 0, count: 0 };
                        treatmentRates[name].sum += rate;
                        treatmentRates[name].count += 1;
                    }
                });
                Object.entries(row.ages || {}).forEach(([name, value]) => {
                    ageTotals[name] = (ageTotals[name] || 0) + Number(value || 0);
                });
                Object.entries(row.sourceAvgFee || {}).forEach(([name, value]) => {
                    const fee = Number(value || 0);
                    if (fee > 0) {
                        avgFeeTotals[name] = (avgFeeTotals[name] || 0) + fee;
                        avgFeeCounts[name] = (avgFeeCounts[name] || 0) + 1;
                    }
                });
            });
            const sourceList = Object.entries(sourceTotals).sort((a, b) => b[1] - a[1]);
            return `
                ${includeTab('path') ? `
                    ${reportCards([
                        { label: '신환 내원경로 합계', value: `${reportNumber(sourceList.reduce((acc, [, value]) => acc + value, 0))}명`, sub: reportPeriodLabel },
                        { label: '주요 내원경로', value: sourceList[0]?.[0] || '-', sub: sourceList[0] ? `${reportNumber(sourceList[0][1])}명` : '데이터 없음' },
                    ])}
                    <h2>신환 내원경로 현황</h2>
                    ${reportTable(['내원경로', '신환 수'], sourceList.map(([name, value]) => [name, `${reportNumber(value)}명`]))}
                ` : ''}
                ${includeTab('treatmentRate') ? `
                    <h2>내원 경로별 치료 이행율</h2>
                    ${reportTable(['내원경로', '보험 항목 비율'], Object.entries(treatmentRates).map(([name, value]) => [
                        name, reportPercent(value.count ? value.sum / value.count : 0),
                    ]))}
                ` : ''}
                ${includeTab('age') ? `
                    <h2>연령별 신환 현황</h2>
                    ${reportTable(['연령대', '신환 수'], Object.entries(ageTotals).map(([name, value]) => [
                        name, `${reportNumber(value)}명`,
                    ]))}
                ` : ''}
                ${includeTab('unitPrice') ? `
                    <h2>내원 경로별 객단가</h2>
                    ${reportTable(['내원경로', '평균 진료비'], Object.entries(avgFeeTotals).map(([name, value]) => [
                        name, reportWon(avgFeeCounts[name] ? value / avgFeeCounts[name] : 0),
                    ]))}
                ` : ''}
            `;
        }

        if (category === 'consultation') {
            const consultantList = consultantRows.flatMap(row => row.rows || []);
            const rejectedList = rejectedRows.flatMap(row => row.rows || []);
            return `
                ${reportCards([
                    ...(includeTab('overall') ? [
                        { label: '최종동의금액', value: reportWon(reportSum(consultationRows, 'agreedAmount')), sub: reportPeriodLabel },
                        { label: '상담금액 대비 동의율', value: reportPercent(reportSum(consultationRows, 'consultationAmount') ? (reportSum(consultationRows, 'agreedAmount') / reportSum(consultationRows, 'consultationAmount')) * 100 : 0), sub: reportPeriodLabel },
                    ] : []),
                    ...(includeTab('consultant') ? [{ label: '상담자 수', value: `${reportNumber(consultantList.length)}명`, sub: reportPeriodLabel }] : []),
                    ...(includeTab('rejected') ? [{ label: '미동의 환자', value: `${reportNumber(rejectedList.length)}명`, sub: reportPeriodLabel }] : []),
                ])}
                ${includeTab('overall') ? `
                    <h2>전체 동의율</h2>
                    ${reportTable(['월', '전체상담건수', '전체동의', '부분동의', '진단금액', '상담금액', '최종동의금액', '상담금액 대비 동의율'], consultationRows.map(row => [
                        row.month, `${reportNumber(row.totalConsultations)}건`, `${reportNumber(row.agreedCount)}명`, `${reportNumber(row.partialCount)}명`,
                        reportWon(row.diagnosisAmount), reportWon(row.consultationAmount), reportWon(row.agreedAmount), reportPercent(row.consultationAgreementRate),
                    ]))}
                    <h2>의사별 진단수 / 동의금액</h2>
                    ${reportTable(['의사', '진단수', '동의금액'], consultationRows.flatMap(row => (row.doctorDiagnoses || []).map(doctor => [
                        doctor.name, `${reportNumber(doctor.count)}건`, reportWon(doctor.agreedAmount),
                    ])))}
                ` : ''}
                ${includeTab('consultant') ? `
                    <h2>상담자별 동의율</h2>
                    ${reportTable(['상담자', '환자수', '총 동의수', '상담금액', '동의금액', '금액대비 동의율'], consultantList.map(row => [
                        row.name, `${reportNumber(row.patientCount)}명`, `${reportNumber(row.totalAgreed)}명`, reportWon(row.consultationAmount), reportWon(row.agreedAmount), reportPercent(row.amountAgreementRate),
                    ]))}
                ` : ''}
                ${includeTab('rejected') ? `
                    <h2>미동의 환자 현황</h2>
                    ${reportTable(['담당 Dr', '신환', '구환', '환자성함', '내원날짜', '상담자', '미동의사유', '진단금액', '상담금액', '최종동의금액', '비동의금액'], rejectedList.map(row => [
                        row.doctor || '-', row.newPatient || '', row.oldPatient || '', row.patientName || '-', row.visitDate || '-', row.consultant || '-',
                        row.reason || '-', reportWon(row.diagnosisAmount), reportWon(row.consultationAmount), reportWon(row.agreedAmount), reportWon(row.rejectedAmount),
                    ]))}
                ` : ''}
            `;
        }

        if (category === 'insurance') {
            const feeTotals = {};
            feeRows.forEach(row => {
                (row.fees || []).forEach(item => {
                    const key = `${item.code || ''} ${item.name || item.feeName || ''}`.trim();
                    if (!key) return;
                    feeTotals[key] = feeTotals[key] || { patients: 0, visits: 0, treatmentAmount: 0 };
                    feeTotals[key].patients += Number(item.patients || 0);
                    feeTotals[key].visits += Number(item.visits || 0);
                    feeTotals[key].treatmentAmount += Number(item.treatmentAmount || 0);
                });
            });
            const feeList = Object.entries(feeTotals)
                .map(([name, value]) => ({ name, ...value }))
                .sort((a, b) => b.treatmentAmount - a.treatmentAmount || b.patients - a.patients || b.visits - a.visits)
                .slice(0, 20);
            return `
                ${includeTab('claim') ? `
                    ${reportCards([
                        { label: '보험청구액', value: reportWon(reportSum(claimRows, 'amount')), sub: reportPeriodLabel },
                        { label: '건강보험', value: reportWon(reportSum(claimRows, 'health')), sub: reportPeriodLabel },
                        { label: '의료급여', value: reportWon(reportSum(claimRows, 'medicalAid')), sub: reportPeriodLabel },
                    ])}
                    <h2>보험청구액 통계</h2>
                    ${reportTable(['월', '건강보험', '의료급여', '보험청구액'], claimRows.map(row => [
                        row.month, reportWon(row.health), reportWon(row.medicalAid), reportWon(row.amount),
                    ]))}
                ` : ''}
                ${includeTab('fee') ? `
                    <h2>보험수가별 통계 TOP 20</h2>
                    ${reportTable(['코드 / 보험 수가명', '환자수', '진료횟수', '진료금액'], feeList.map(row => [
                        row.name, `${reportNumber(row.patients)}명`, `${reportNumber(row.visits)}회`, reportWon(row.treatmentAmount),
                    ]))}
                ` : ''}
            `;
        }

        return '<p>보고서 데이터를 만들 수 없습니다.</p>';
    };

    const buildIntegratedReportSections = (year) => {
        const selected = REPORT_CATEGORIES.filter(category => reportBundleCategories.includes(category.key));
        return selected.map(category => `
            <section class="report-section">
                <h2 class="category-title">${escapeReportHtml(category.label)}</h2>
                ${buildReportSections(category.key, year, 'all')}
            </section>
        `).join('');
    };

    const handleDownloadReportPdf = async () => {
        const category = REPORT_CATEGORIES.find(item => item.key === reportCategory) || REPORT_CATEGORIES[0];
        if (reportMode === 'bundle' && reportBundleCategories.length === 0) {
            addLog('error', '❌ [PDF 보고서] 통합 보고서에 포함할 카테고리를 1개 이상 선택해 주세요.');
            return;
        }
        const title = reportMode === 'bundle'
            ? `${reportYear}년 ${reportPeriodLabel} 통합 보고서`
            : `${reportYear}년 ${reportPeriodLabel} ${category.label}${reportSubTab !== 'all' ? ` - ${reportSubTabLabel}` : ''}`;
        let sections = '';
        try {
            reportStoreRef.current = await loadReportStoresFromSupabase(reportYear);
            sections = reportMode === 'bundle'
                ? buildIntegratedReportSections(reportYear)
                : buildReportSections(reportCategory, reportYear, reportSubTab);
        } catch (err) {
            reportStoreRef.current = null;
            addLog('error', `??[PDF 보고서] Supabase 데이터를 불러오지 못했습니다: ${err.message}`);
            return;
        } finally {
            reportStoreRef.current = null;
        }
        const popup = window.open('', '_blank', 'width=1100,height=900');
        if (!popup) {
            addLog('error', '❌ PDF 보고서 창을 열 수 없습니다. 팝업 차단을 해제해 주세요.');
            return;
        }
        popup.document.write(`
            <!doctype html>
            <html lang="ko">
            <head>
                <meta charset="utf-8" />
                <title>${escapeReportHtml(title)}</title>
                <style>
                    @page { size: A4; margin: 16mm; }
                    * { box-sizing: border-box; }
                    body { margin: 0; font-family: Arial, 'Malgun Gothic', sans-serif; color: #172033; background: #fff; }
                    header { border-bottom: 2px solid #2563eb; padding-bottom: 14px; margin-bottom: 18px; }
                    h1 { margin: 0; font-size: 24px; }
                    h2 { margin: 24px 0 10px; font-size: 16px; }
                    .category-title { margin-top: 0; padding: 10px 12px; border-left: 4px solid #2563eb; background: #eff6ff; font-size: 18px; }
                    .report-section + .report-section { page-break-before: always; margin-top: 22px; }
                    .meta { margin-top: 6px; color: #64748b; font-size: 12px; }
                    .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 14px 0 18px; }
                    .card { border: 1px solid #dbe4f0; border-radius: 8px; padding: 12px; background: #f8fafc; }
                    .card span { display: block; color: #64748b; font-size: 12px; font-weight: 700; }
                    .card strong { display: block; margin-top: 6px; color: #2563eb; font-size: 18px; }
                    .card small { display: block; margin-top: 5px; color: #64748b; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; table-layout: fixed; }
                    th, td { border: 1px solid #dbe4f0; padding: 8px 7px; text-align: center; font-size: 11px; word-break: keep-all; }
                    th { background: #f1f5f9; color: #475569; font-weight: 800; }
                    td { color: #172033; }
                    .actions { display: flex; justify-content: flex-end; gap: 8px; margin: 16px 0; }
                    .actions button { border: 0; border-radius: 8px; padding: 10px 16px; background: #2563eb; color: white; font-weight: 800; cursor: pointer; }
                    @media print { .actions { display: none; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
                </style>
            </head>
            <body>
                <div class="actions"><button onclick="window.print()">PDF로 저장</button></div>
                <header>
                    <h1>${escapeReportHtml(title)}</h1>
                    <div class="meta">생성일: ${new Date().toLocaleString('ko-KR')} / 기준: ${escapeReportHtml(reportPeriodLabel)}</div>
                </header>
                ${sections}
                <script>setTimeout(() => window.print(), 400);</script>
            </body>
            </html>
        `);
        popup.document.close();
        addLog('success', `✅ [PDF 보고서] ${title} 보고서 창을 열었습니다. 인쇄 화면에서 PDF로 저장해 주세요.`);
    };

    const showNewPatientPreview = (file, parsed) => {
        setPendingNewPatientUploads(prev => [...prev, {
            id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            fileName: file.name,
            year: parsed.year,
            month: parsed.month,
            rows: parsed.rows || [],
            summary: parsed.summary,
            insuranceRatios: parsed.insuranceRatios || {},
            nonInsuranceRatios: parsed.nonInsuranceRatios || {},
        }]);
    };

    const handleApproveNewPatientUpload = async () => {
        if (pendingNewPatientUploads.length === 0) return;
        let savedCount = 0;
        try {
            for (const upload of pendingNewPatientUploads) {
                await saveSelectedClinicAnalytics({
                    category: 'newPatient',
                    subCategory: 'path_distribution',
                    year: upload.year,
                    month: upload.month,
                    payload: {
                        rows: upload.rows || [],
                        summary: upload.summary,
                        insuranceRatios: upload.insuranceRatios || {},
                        nonInsuranceRatios: upload.nonInsuranceRatios || {},
                    },
                    mergeExisting: true,
                });
                notifyNewPatientAnalysisUpdated(upload);
                savedCount += 1;
                addLog('success', `✅ [신환분석] ${upload.year}년 ${upload.month} ${upload.fileName} 반영 완료 (${upload.rows.length}개 경로)`);
            }
            setPendingNewPatientUploads([]);
        } catch (err) {
            addLog('error', `❌ [신환분석 저장 오류] ${savedCount}개 반영 후 중단: ${err.message}`);
        }
    };

    const handleApproveConsultationBundle = async () => {
        if (!pendingConsultationBundle) return;
        try {
            const { fileName, overall, consultant, rejected } = pendingConsultationBundle;
            const cleanedDoctorDiagnoses = (overall.doctorDiagnoses || [])
                .map(item => ({
                    name: String(item.name || '').trim(),
                    count: Number(item.count || 0),
                    agreedAmount: Number(item.agreedAmount || 0),
                }))
                .filter(item => item.name && item.count > 0);
            const normalizedOverall = {
                ...normalizeConsultationOverallParsed({
                ...overall,
                rejectedCount: Math.max(Number(overall.totalConsultations || 0) - Number(overall.agreedCount || 0) - Number(overall.partialCount || 0), 0),
                doctorDiagnoses: cleanedDoctorDiagnoses,
                }),
                doctorDiagnoses: cleanedDoctorDiagnoses,
            };
            validateConsultationOverallParsed(normalizedOverall);
            const normalizedConsultant = {
                ...consultant,
                rows: (consultant.rows || [])
                    .map(row => ({
                        ...row,
                        name: String(row.name || '').trim(),
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
                    .filter(row => row.name && row.patientCount > 0),
            };
            const normalizedRejected = {
                ...rejected,
                rows: (rejected.rows || [])
                    .map(row => ({
                        ...row,
                        doctor: String(row.doctor || '').trim() || '-',
                        patientName: String(row.patientName || '').trim(),
                        visitDate: String(row.visitDate || '').trim(),
                        consultant: String(row.consultant || '').trim() || '-',
                        reason: String(row.reason || '').trim() || '-',
                        diagnosisAmount: Number(row.diagnosisAmount || 0),
                        consultationAmount: Number(row.consultationAmount || 0),
                        agreedAmount: Number(row.agreedAmount || 0),
                        rejectedAmount: Number(row.rejectedAmount || 0),
                    }))
                    .filter(row => row.patientName),
            };

            await saveSelectedClinicAnalytics({
                category: 'consultation',
                subCategory: 'overall',
                year: normalizedOverall.year,
                month: normalizedOverall.month,
                payload: normalizedOverall,
            });
            await saveSelectedClinicAnalytics({
                category: 'consultation',
                subCategory: 'consultant',
                year: normalizedConsultant.year,
                month: normalizedConsultant.month,
                payload: normalizedConsultant,
            });
            await saveSelectedClinicAnalytics({
                category: 'consultation',
                subCategory: 'rejected',
                year: normalizedRejected.year,
                month: normalizedRejected.month,
                payload: normalizedRejected,
            });
            saveConsultationOverallData(normalizedOverall);
            saveConsultationConsultantData(normalizedConsultant);
            saveConsultationRejectedData(normalizedRejected);
            addLog('success', `✅ [상담분석 MD 모음] ${normalizedOverall.year}년 ${normalizedOverall.month} ${fileName} 승인 반영 완료 (의사 ${normalizedOverall.doctorDiagnoses.length}명 / 상담자 ${normalizedConsultant.rows.length}명 / 미동의 ${normalizedRejected.rows.length}명)`);
            setPendingConsultationBundle(null);
        } catch (err) {
            addLog('error', `❌ [상담분석 MD 승인 저장 오류] ${err.message}`);
        }
    };

    const updatePendingConsultationOverall = (field, value) => {
        setPendingConsultationBundle(prev => {
            if (!prev) return prev;
            const overall = normalizeConsultationOverallParsed({
                ...prev.overall,
                [field]: value === '' ? '' : Number(value),
            });
            return { ...prev, overall };
        });
    };

    const updatePendingConsultationDoctor = (index, field, value) => {
        setPendingConsultationBundle(prev => {
            if (!prev) return prev;
            const doctorDiagnoses = [...(prev.overall.doctorDiagnoses || [])];
            doctorDiagnoses[index] = {
                ...(doctorDiagnoses[index] || { name: '', count: 0, agreedAmount: 0 }),
                [field]: field === 'name' ? value : Number(value || 0),
            };
            return { ...prev, overall: { ...prev.overall, doctorDiagnoses } };
        });
    };

    const updatePendingConsultantRow = (index, field, value) => {
        setPendingConsultationBundle(prev => {
            if (!prev) return prev;
            const rows = [...(prev.consultant.rows || [])];
            rows[index] = {
                ...rows[index],
                [field]: field === 'name' ? value : Number(value || 0),
            };
            return { ...prev, consultant: { ...prev.consultant, rows } };
        });
    };

    const updatePendingRejectedRow = (index, field, value) => {
        setPendingConsultationBundle(prev => {
            if (!prev) return prev;
            const rows = [...(prev.rejected.rows || [])];
            rows[index] = {
                ...rows[index],
                [field]: ['diagnosisAmount', 'consultationAmount', 'agreedAmount', 'rejectedAmount'].includes(field)
                    ? Number(value || 0)
                    : value,
            };
            return { ...prev, rejected: { ...prev.rejected, rows } };
        });
    };

    const formatUploadFileSize = (size) => {
        const bytes = Number(size || 0);
        if (!Number.isFinite(bytes) || bytes <= 0) return '-';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    };

    const requestClinicUploadConfirmation = (files) => {
        const uploadFiles = Array.from(files || []);
        if (uploadFiles.length === 0) return;
        setUploadLog([]);

        if (!selectedAdminClinicId) {
            addLog('error', '업로드할 치과를 먼저 선택해 주세요.');
            return;
        }

        setPendingClinicUpload({
            id: `${selectedAdminClinicId}-${Date.now()}`,
            clinicId: selectedAdminClinicId,
            clinicName: selectedAdminClinic?.name || '선택 치과',
            clinicCode: selectedAdminClinic?.code || '',
            files: uploadFiles,
        });
    };

    const cancelClinicUploadConfirmation = () => {
        setPendingClinicUpload(null);
    };

    const confirmClinicUpload = async () => {
        if (!pendingClinicUpload) return;

        if (pendingClinicUpload.clinicId !== selectedAdminClinicId) {
            addLog('error', '선택 치과가 변경되어 업로드를 취소했습니다. 파일을 다시 선택해 주세요.');
            setPendingClinicUpload(null);
            return;
        }

        const files = pendingClinicUpload.files || [];
        setPendingClinicUpload(null);
        await handleUnifiedUpload(files);
    };

    const handleUnifiedUpload = async (files) => {
        const uploadFiles = Array.from(files || []);
        if (uploadFiles.length === 0) return;
        if (!selectedAdminClinicId) {
            addLog('error', '업로드할 치과를 먼저 선택해 주세요.');
            return;
        }
        setUploadLog([]);

        const excelFiles = [];
        const imageFiles = [];

        for (const file of uploadFiles) {
            const isImage = file.type.startsWith('image/');
            const isMarkdown = /\.md$/i.test(file.name) || file.type === 'text/markdown';
            if (isMarkdown && isConsultationBundleMarkdownFile(file.name)) {
                try {
                    const text = await file.text();
                    const parsed = parseConsultationBundleMarkdown(text, file.name);
                    setPendingConsultationBundle({
                        id: `${file.name}-${Date.now()}`,
                        fileName: file.name,
                        overall: parsed.overall,
                        consultant: parsed.consultant,
                        rejected: parsed.rejected,
                    });
                    addLog('success', `✅ [상담분석 MD 미리보기] ${parsed.overall.year}년 ${parsed.overall.month} 파싱 완료 - 확인/수정 후 승인하면 반영됩니다.`);
                } catch (err) {
                    addLog('error', `❌ [상담분석 MD 모음 파싱 오류] ${file.name}: ${err.message}`);
                }
            } else if (isMarkdown && isConsultationRejectedMarkdownFile(file.name)) {
                try {
                    const text = await file.text();
                    const parsed = parseConsultationRejectedMarkdown(text, file.name);
                    await saveSelectedClinicAnalytics({
                        category: 'consultation',
                        subCategory: 'rejected',
                        year: parsed.year,
                        month: parsed.month,
                        payload: parsed,
                    });
                    saveConsultationRejectedData(parsed);
                    addLog('success', `✅ [상담분석/미동의 환자 현황] ${parsed.year}년 ${parsed.month} MD 반영 완료 (${parsed.rows.length}명)`);
                } catch (err) {
                    addLog('error', `❌ [상담분석/미동의 환자 현황 MD 파싱 오류] ${file.name}: ${err.message}`);
                }
            } else if (isMarkdown && isConsultationConsultantMarkdownFile(file.name)) {
                try {
                    const text = await file.text();
                    const parsed = parseConsultationConsultantMarkdown(text, file.name);
                    await saveSelectedClinicAnalytics({
                        category: 'consultation',
                        subCategory: 'consultant',
                        year: parsed.year,
                        month: parsed.month,
                        payload: parsed,
                    });
                    saveConsultationConsultantData(parsed);
                    addLog('success', `✅ [상담분석/상담자별 동의율] ${parsed.year}년 ${parsed.month} MD 반영 완료 (${parsed.rows.length}명)`);
                } catch (err) {
                    addLog('error', `❌ [상담분석/상담자별 동의율 MD 파싱 오류] ${file.name}: ${err.message}`);
                }
            } else if (isMarkdown && isConsultationOverallMarkdownFile(file.name)) {
                try {
                    const text = await file.text();
                    const parsed = parseConsultationOverallMarkdown(text, file.name);
                    await saveSelectedClinicAnalytics({
                        category: 'consultation',
                        subCategory: 'overall',
                        year: parsed.year,
                        month: parsed.month,
                        payload: parsed,
                    });
                    saveConsultationOverallData(parsed);
                    addLog('success', `✅ [상담분석/전체동의율] ${parsed.year}년 ${parsed.month} MD 반영 완료`);
                } catch (err) {
                    addLog('error', `❌ [상담분석/전체동의율 MD 파싱 오류] ${file.name}: ${err.message}`);
                }
            } else if (isNewPatientAgeDistributionFile(file.name) && !isImage) {
                try {
                    const parsed = await parseNewPatientAgeExcel(file);
                    await saveSelectedClinicAnalytics({
                        category: 'newPatient',
                        subCategory: 'age_distribution',
                        year: parsed.year,
                        month: parsed.month,
                        payload: parsed,
                    });
                    notifyNewPatientAnalysisUpdated(parsed);
                    const total = Object.values(parsed.ages || {}).reduce((sum, count) => sum + Number(count || 0), 0);
                    addLog('success', `✅ [신환분석/연령별] ${parsed.year}년 ${parsed.month} 연령별 신환수 반영 완료 (${total.toLocaleString()}명)`);
                } catch (err) {
                    addLog('error', `❌ [신환분석/연령별 파싱 오류] ${file.name}: ${err.message}`);
                }
            } else if (isNewPatientTreatmentRateFile(file.name) && !isImage) {
                try {
                    showNewPatientPreview(file, await parseNewPatientTreatmentRateExcel(file));
                    addLog('success', `✅ [신환분석/치료이행율 미리보기] ${file.name} 파싱 완료 - 승인 시 반영됩니다.`);
                } catch (err) {
                    addLog('error', `❌ [신환분석/치료이행율 파싱 오류] ${file.name}: ${err.message}`);
                }
            } else if (isNewPatientPathDistributionFile(file.name)) {
                try {
                    if (isImage) {
                        setOcrProcessingFile(file.name);
                        const result = await Tesseract.recognize(file, 'kor+eng');
                        showNewPatientPreview(file, parseNewPatientPathText(result.data.text, file.name, result.data.words || []));
                    } else {
                        showNewPatientPreview(file, await parseNewPatientPathExcel(file));
                    }
                    addLog('success', `✅ [신환분석 미리보기] ${file.name} 파싱 완료 - 승인 후 반영됩니다.`);
                } catch (err) {
                    addLog('error', `❌ [신환분석 파싱 오류] ${file.name}: ${err.message}`);
                } finally {
                    setOcrProcessingFile('');
                }
            } else if (isImage) {
                imageFiles.push(file);
            } else {
                excelFiles.push(file);
            }
        }

        if (excelFiles.length > 0) {
            await handleFileUpload({ target: { files: excelFiles, value: '' } });
        }
        if (imageFiles.length > 0) {
            await handleImageUpload(imageFiles);
        }
    };

    // ── 엑셀 업로드 처리 ──────────────────────────────────────────────────────
    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        if (e.target) e.target.value = '';
        if (e?.target?.files && !(files instanceof Array)) setUploadLog([]);

        const defaultData = [
            { month: '1월',  netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 },
            { month: '2월',  netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 },
            { month: '3월',  netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 },
            { month: '4월',  netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 },
            { month: '5월',  netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 },
            { month: '6월',  netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 },
            { month: '7월',  netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 },
            { month: '8월',  netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 },
            { month: '9월',  netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 },
            { month: '10월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 },
            { month: '11월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 },
            { month: '12월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 },
        ];

        let salesDataMap = { [getCurrentYearString()]: JSON.parse(JSON.stringify(defaultData)) };
        let updatedCount = 0;

        for (const file of files) {
            const processFile = () => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        const data = XLSX.read(event.target.result, { type: 'binary' });
                        const fileName = file.name;
                        let rawData = [], colIndices = {}, headerRowIdx = -1;

                        for (const sName of data.SheetNames) {
                            const ws   = data.Sheets[sName];
                            const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
                            if (rows.length === 0) continue;
                            let tempHeaderRowIdx = -1;
                            let tempColIndices = { doctor: -1, amount: -1, insurance: -1, name: -1, chartNo: -1, path: -1 };
                            for (let i = 0; i < Math.min(20, rows.length); i++) {
                                const row = rows[i] || [];
                                row.forEach((cell, idx) => {
                                    if (cell != null) {
                                        const strCell = String(cell).trim().replace(/\s+/g, '');
                                        if (strCell.includes('차트번호')) tempColIndices.chartNo = idx;
                                        else if (strCell === '성명' || strCell === '이름' || strCell === '환자명' || strCell === '환자이름') tempColIndices.name = idx;
                                        else if (strCell.includes('담당의') || strCell.includes('의사')) tempColIndices.doctor = idx;
                                        if (strCell === '공단부담금' || strCell === '공단부담' || strCell === '보험청구액') tempColIndices.insurance = idx;
                                        if (strCell === '총수납액' || strCell === '수납합계' || strCell === '실수납액') tempColIndices.amount = idx;
                                        if (strCell.includes('내원경로')) tempColIndices.path = idx;
                                    }
                                });
                                if (tempColIndices.doctor !== -1 && (tempColIndices.amount !== -1 || tempColIndices.insurance !== -1)) {
                                    tempHeaderRowIdx = i; break;
                                }
                            }
                            if (tempHeaderRowIdx !== -1) {
                                rawData = rows; colIndices = tempColIndices; headerRowIdx = tempHeaderRowIdx; break;
                            }
                        }

                        if (rawData.length === 0) {
                            const ws = data.Sheets[data.SheetNames[0]];
                            rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });
                        }

                        const parseNum = (val) => {
                            if (typeof val === 'number') return val;
                            if (typeof val === 'string') {
                                const cleaned = val.replace(/[^0-9.,-]/g, '');
                                const num = parseFloat(cleaned.replace(/,/g, ''));
                                return isNaN(num) ? 0 : num;
                            }
                            return 0;
                        };

                        const extractYearMonth = (str) => {
                            const text = String(str || '').replace(/\.[^.]+$/, '');
                            const compact = text.replace(/\s+/g, '');

                            const compactDate = compact.match(/(20\d{2})(0[1-9]|1[0-2])(?:[0-3]\d)?/);
                            if (compactDate) {
                                return {
                                    year: compactDate[1],
                                    month: `${Number(compactDate[2])}월`,
                                };
                            }

                            const koreanDate = text.match(/(20\d{2}|\d{2})\s*년\s*(\d{1,2})\s*월/);
                            if (koreanDate) {
                                const year = koreanDate[1].length === 2 ? `20${koreanDate[1]}` : koreanDate[1];
                                return { year, month: `${Number(koreanDate[2])}월` };
                            }

                            const separatedDate =
                                text.match(/(20\d{2})[.\-_/](\d{1,2})/) ||
                                text.match(/(\d{2})[.\-_/](\d{1,2})/);
                            if (separatedDate) {
                                const year = separatedDate[1].length === 2 ? `20${separatedDate[1]}` : separatedDate[1];
                                return { year, month: `${Number(separatedDate[2])}월` };
                            }

                            const monthOnly = text.match(/(\d{1,2})\s*월/);
                            const yearOnly = text.match(/(20\d{2}|\d{2})\s*년/);
                            return {
                                year: yearOnly ? (yearOnly[1].length === 2 ? `20${yearOnly[1]}` : yearOnly[1]) : getCurrentYearString(),
                                month: monthOnly ? `${Number(monthOnly[1])}월` : null,
                            };
                        };

                        const extractedYearMonth = extractYearMonth(fileName);
                        const extractMonth = () => extractedYearMonth.month;
                        const extractYear = () => extractedYearMonth.year;

                        const monthFromFile = extractMonth(fileName);
                        const yearFromFile  = extractYear(fileName);

                        if (!salesDataMap[yearFromFile]) {
                            salesDataMap[yearFromFile] = JSON.parse(JSON.stringify(defaultData));
                        }
                        const currentYearData = salesDataMap[yearFromFile];

                        if (isConsultationOverallFile(fileName)) {
                            addLog('warning', `⚠️ [상담분석/전체동의율] ${fileName}: 사진 파일로 업로드하면 OCR로 항목별 값을 반영합니다.`);
                            resolve();
                        }
                        // 동의환자/치료비용계획
                        else if (fileName.replace(/\s+/g, '').includes('치료비용계획')) {
                            const ci = { patientName: -1, chartNo: -1, createdAt: -1, status: -1, payStatus: -1, contractAmount: -1, paidAmount: -1, remainingAmount: -1 };
                            let headerIdx = -1;
                            const normalizeHeader = (cell) => String(cell || '').trim().replace(/\s+/g, '');
                            const isPatientHeader = (text) => (
                                ['환자', '환자정보', '환자명', '환자성명', '환자이름', '성명', '이름', '고객명', '고객정보'].includes(text) ||
                                text.includes('환자정보') ||
                                text.includes('환자명') ||
                                text.includes('환자성명')
                            );
                            const isChartHeader = (text) => (
                                text.includes('차트') ||
                                text.includes('챠트') ||
                                text === '환자번호' ||
                                text === '고객번호' ||
                                text === '번호' ||
                                text.toUpperCase() === 'ID'
                            );
                            const isContractHeader = (text) => (
                                ['계약액', '계약금액', '총계약액', '총계약금액', '계획액', '계획금액', '치료계획금액'].includes(text) ||
                                (text.includes('계약') && (text.includes('금액') || text.endsWith('액'))) ||
                                (text.includes('계획') && (text.includes('금액') || text.endsWith('액')))
                            );
                            const isPaidHeader = (text) => (
                                ['수납액', '수납금액', '현재수납', '현재수납액', '총수납액', '실수납액', '수납합계', '납입액', '납입금액', '입금액', '입금금액'].includes(text) ||
                                (text.includes('수납') && (text.includes('금액') || text.endsWith('액') || text.includes('합계'))) ||
                                (text.includes('납입') && (text.includes('금액') || text.endsWith('액'))) ||
                                (text.includes('입금') && (text.includes('금액') || text.endsWith('액')))
                            );
                            const isRemainingHeader = (text) => (
                                ['잔액', '남은금액', '남은금', '남은액', '잔여금액', '잔여액', '미수금액', '미수금', '미수액'].includes(text) ||
                                text.includes('잔액') ||
                                text.includes('남은') ||
                                text.includes('잔여') ||
                                text.includes('미수')
                            );
                            for (let i = 0; i < Math.min(20, rawData.length); i++) {
                                const row = rawData[i] || [];
                                row.forEach((cell, idx) => {
                                    if (cell == null) return;
                                    const s = normalizeHeader(cell);
                                    if (isPatientHeader(s)) ci.patientName = idx;
                                    else if (isChartHeader(s)) ci.chartNo = idx;
                                    else if (s.includes('작성일') || s.includes('상담일') || s.includes('계약일')) ci.createdAt = idx;
                                    else if (s.includes('진행상태') || s === '상태') ci.status = idx;
                                    else if (isContractHeader(s)) ci.contractAmount = idx;
                                    else if (isRemainingHeader(s)) ci.remainingAmount = idx;
                                    else if (isPaidHeader(s)) ci.paidAmount = idx;
                                });
                                if (ci.patientName !== -1 && ci.contractAmount !== -1 && (ci.paidAmount !== -1 || ci.remainingAmount !== -1)) {
                                    headerIdx = i;
                                    break;
                                }
                            }
                            if (headerIdx !== -1) {
                                const plans = [];
                                for (let i = headerIdx + 1; i < rawData.length; i++) {
                                    const row = rawData[i] || [];
                                    const name = ci.patientName !== -1 ? String(row[ci.patientName] || '').trim() : '';
                                    const compactName = name.replace(/\s+/g, '');
                                    if (!name || ['합계', '총계', '소계', '평균'].includes(compactName)) continue;
                                    const contractAmount = ci.contractAmount !== -1 ? parseNum(row[ci.contractAmount]) : 0;
                                    const sourceRemainingAmount = ci.remainingAmount !== -1 ? parseNum(row[ci.remainingAmount]) : null;
                                    const paidCell = ci.paidAmount !== -1 ? row[ci.paidAmount] : null;
                                    const hasPaidCell = paidCell !== null && paidCell !== undefined && String(paidCell).trim() !== '';
                                    const paidAmount = hasPaidCell
                                        ? parseNum(paidCell)
                                        : Math.max(contractAmount - (sourceRemainingAmount || 0), 0);
                                    const remainingAmount = sourceRemainingAmount !== null
                                        ? sourceRemainingAmount
                                        : Math.max(contractAmount - paidAmount, 0);
                                    if (contractAmount === 0 && paidAmount === 0 && remainingAmount === 0) continue;

                                    plans.push({
                                        chartNo: ci.chartNo !== -1 ? String(row[ci.chartNo] || '').trim() : '',
                                        patientName: name, year: yearFromFile, month: monthFromFile,
                                        contractAmount,
                                        paidAmount,
                                        remainingAmount,
                                        status: ci.status !== -1 ? String(row[ci.status] || '').trim() : '',
                                        createdAt: ci.createdAt !== -1 ? String(row[ci.createdAt] || '').trim() : `${yearFromFile}-${monthFromFile}`,
                                    });
                                }
                                if (plans.length === 0) {
                                    reject(`저장할 치료비용계획 데이터가 없습니다. (${fileName})`);
                                    return;
                                }

                                await saveSelectedClinicAnalytics({
                                    category: 'sales',
                                    subCategory: 'treatment_plan',
                                    year: yearFromFile,
                                    month: monthFromFile,
                                    payload: { rows: plans },
                                });
                                updatedCount++; resolve('treatmentPlan');
                            } else { reject(`치료비용계획 파일에서 환자/계약액/수납액 또는 잔액 컬럼을 찾을 수 없습니다. (${fileName})`); }
                        }
                        // 의사별 진료 환자수 + 매출분석(의사)
                        else if (/의사별.*진료비.*수납액/.test(fileName.replace(/\s+/g, ''))) {
                            if (!monthFromFile) {
                                reject(`파일명에서 월을 찾을 수 없습니다. (${fileName})`);
                                return;
                            }
                            const doctorColumns = { name: -1, patientCount: -1, amount: -1, insurance: -1 };
                            let headerIdx = -1;

                            for (let i = 0; i < Math.min(30, rawData.length); i++) {
                                const row = rawData[i] || [];
                                row.forEach((cell, idx) => {
                                    if (cell == null) return;
                                    const text = String(cell).trim().replace(/\s+/g, '');
                                    if (text === '의사이름' || text === '의사명' || text === '담당의') {
                                        doctorColumns.name = idx;
                                    }
                                    if (text === '진료환자수' || text === '환자수' || text === '진료환자') {
                                        doctorColumns.patientCount = idx;
                                    }
                                    if (
                                        text === '총수납액' ||
                                        text === '수납합계' ||
                                        text === '실수납액' ||
                                        text === '수납액' ||
                                        text.includes('총수납')
                                    ) {
                                        doctorColumns.amount = idx;
                                    }
                                    if (
                                        text === '공단부담금' ||
                                        text === '공단부담' ||
                                        text === '보험청구액' ||
                                        (text.includes('공단부담') && text.includes('청구'))
                                    ) {
                                        doctorColumns.insurance = idx;
                                    }
                                });
                                if (
                                    doctorColumns.name !== -1 &&
                                    (doctorColumns.patientCount !== -1 || doctorColumns.amount !== -1 || doctorColumns.insurance !== -1)
                                ) {
                                    headerIdx = i;
                                    break;
                                }
                            }

                            if (headerIdx === -1) {
                                reject(`의사이름/진료 환자수/총수납액/공단부담금 컬럼을 찾을 수 없습니다. (${fileName})`);
                                return;
                            }

                            const doctorPatients = {};
                            const doctorData = {};
                            for (let i = headerIdx + 1; i < rawData.length; i++) {
                                const row = rawData[i] || [];
                                const doctorName = String(row[doctorColumns.name] || '').trim();
                                if (!doctorName || doctorName === '합계' || doctorName === '총계') continue;

                                const patientCount = doctorColumns.patientCount !== -1 ? parseNum(row[doctorColumns.patientCount]) : 0;
                                const amount = doctorColumns.amount !== -1 ? parseNum(row[doctorColumns.amount]) : 0;
                                const insurance = doctorColumns.insurance !== -1 ? parseNum(row[doctorColumns.insurance]) : 0;

                                if (patientCount > 0) {
                                    doctorPatients[doctorName] = (doctorPatients[doctorName] || 0) + patientCount;
                                }
                                if (amount > 0 || insurance > 0) {
                                    if (!doctorData[doctorName]) doctorData[doctorName] = { pure: 0, insurance: 0 };
                                    doctorData[doctorName].pure += amount;
                                    doctorData[doctorName].insurance += insurance;
                                }
                            }

                            if (Object.keys(doctorPatients).length === 0 && Object.keys(doctorData).length === 0) {
                                reject(`저장할 의사별 환자수/매출 데이터가 없습니다. (${fileName})`);
                                return;
                            }

                            const month = monthFromFile;
                            if (Object.keys(doctorPatients).length > 0) {
                                await saveSelectedClinicAnalytics({
                                    category: 'patient',
                                    subCategory: 'total_patients_ledger',
                                    year: yearFromFile,
                                    month,
                                    payload: { doctorPatients },
                                    mergeExisting: true,
                                });
                                window.dispatchEvent(new CustomEvent('patientLedgerUpdated', {
                                    detail: { year: yearFromFile, month }
                                }));
                            }

                            if (Object.keys(doctorData).length > 0) {
                                const d = currentYearData.find(item => item.month === month);
                                if (!d) {
                                    reject(`${month} 데이터를 찾을 수 없습니다.`);
                                    return;
                                }
                                const netSales = Object.values(doctorData).reduce((sum, item) => sum + Number(item.pure || 0), 0);
                                const insuranceTotal = Object.values(doctorData).reduce((sum, item) => sum + Number(item.insurance || 0), 0);
                                d.doctorData = doctorData;
                                d.netSales = netSales;
                                d.insurance = insuranceTotal;
                                d.total = netSales + insuranceTotal;
                                await saveSelectedClinicAnalytics({
                                    category: 'sales',
                                    subCategory: 'doctor_revenue',
                                    year: yearFromFile,
                                    month,
                                    payload: {
                                        doctorData,
                                        netSales,
                                        insurance: insuranceTotal,
                                        total: d.total,
                                    },
                                });
                            }

                            addLog('success', `✅ [의사별 매출] ${yearFromFile}년 ${month} 업로드 완료 (의사 ${Object.keys(doctorData).length || Object.keys(doctorPatients).length}명)`);
                            updatedCount++;
                            resolve('doctorPatients');
                        }
                        // 환자별 수납내역 → 매출분석 / 진료비 상위
                        else if (/환자별.*수납내역/.test(fileName.replace(/\s+/g, ''))) {
                            if (!monthFromFile) {
                                reject(`파일명에서 월을 찾을 수 없습니다. (${fileName})`);
                                return;
                            }
                            const topColumns = { patientName: -1, chartNo: -1, doctor: -1, paid: -1 };
                            let headerIdx = -1;

                            for (let i = 0; i < Math.min(40, rawData.length); i++) {
                                const row = rawData[i] || [];
                                row.forEach((cell, idx) => {
                                    if (cell == null) return;
                                    const text = String(cell).trim().replace(/\s+/g, '');
                                    if (text === '성명' || text === '이름' || text === '환자명' || text === '환자이름') {
                                        topColumns.patientName = idx;
                                    }
                                    if (text.includes('차트번호') || text === '차트No' || text === '차트NO' || text === '챠트번호') {
                                        topColumns.chartNo = idx;
                                    }
                                    if (text.includes('담당의') || text === '의사' || text === '의사명' || text === '진료의') {
                                        topColumns.doctor = idx;
                                    }
                                    if (
                                        text === '총수납액' ||
                                        text === '수납합계' ||
                                        text === '실수납액' ||
                                        text === '수납액' ||
                                        text.includes('총수납')
                                    ) {
                                        topColumns.paid = idx;
                                    }
                                });
                                if (topColumns.patientName !== -1 && topColumns.paid !== -1) {
                                    headerIdx = i;
                                    break;
                                }
                            }

                            if (headerIdx === -1) {
                                reject(`환자명/총수납액 컬럼을 찾을 수 없습니다. (${fileName})`);
                                return;
                            }

                            const topPatients = [];
                            for (let i = headerIdx + 1; i < rawData.length; i++) {
                                const row = rawData[i] || [];
                                const patientName = String(row[topColumns.patientName] || '').trim();
                                const paid = parseNum(row[topColumns.paid]);
                                if (!patientName || patientName === '합계' || patientName === '총계' || paid <= 0) continue;
                                topPatients.push({
                                    patientName,
                                    chartNo: topColumns.chartNo !== -1 ? String(row[topColumns.chartNo] || '').trim() : '',
                                    doctor: topColumns.doctor !== -1 ? String(row[topColumns.doctor] || '').trim() : '',
                                    revenue: paid,
                                    paid,
                                    year: yearFromFile,
                                    month: monthFromFile,
                                });
                            }

                            if (topPatients.length === 0) {
                                reject(`저장할 환자별 수납내역 데이터가 없습니다. (${fileName})`);
                                return;
                            }

                            await saveSelectedClinicAnalytics({
                                category: 'sales',
                                subCategory: 'top_patients',
                                year: yearFromFile,
                                month: monthFromFile,
                                payload: { rows: topPatients },
                            });
                            window.dispatchEvent(new CustomEvent('salesAnalysisUpdated', {
                                detail: { year: yearFromFile, month: monthFromFile }
                            }));
                            addLog('success', `✅ [진료비 상위] ${yearFromFile}년 ${monthFromFile} 환자별 수납내역 업로드 완료 (${topPatients.length}명)`);
                            updatedCount++;
                            resolve('topPatients');
                        }
                        // 신규환자 내원경로 분포 → 매출분석 / 총 매출 현황, 신환수익 비교
                        else if (/신규환자.*내원경로분포/.test(fileName.replace(/\s+/g, ''))) {
                            if (!monthFromFile) {
                                reject(`파일명에서 월을 찾을 수 없습니다. (${fileName})`);
                                return;
                            }

                            const columns = { newPatient: -1, totalFee: -1 };
                            let headerIdx = -1;

                            for (let i = 0; i < Math.min(40, rawData.length); i++) {
                                const row = rawData[i] || [];
                                row.forEach((cell, idx) => {
                                    if (cell == null) return;
                                    const text = String(cell).trim().replace(/\s+/g, '');
                                    if (text === '신환수' || text === '신환' || text === '신규환자수' || text === '신규환자') {
                                        columns.newPatient = idx;
                                    }
                                    if (text === '총진료비' || text === '진료비합계' || text === '총진료금액' || text.includes('총진료비')) {
                                        columns.totalFee = idx;
                                    }
                                });
                                if (columns.newPatient !== -1 && columns.totalFee !== -1) {
                                    headerIdx = i;
                                    break;
                                }
                            }

                            if (headerIdx === -1) {
                                reject(`신환수/총 진료비 컬럼을 찾을 수 없습니다. (${fileName})`);
                                return;
                            }

                            let newPatientTotal = 0;
                            let newPatientSalesTotal = 0;
                            let foundTotalRow = false;

                            for (let i = headerIdx + 1; i < rawData.length; i++) {
                                const row = rawData[i] || [];
                                const rowLabel = row.map(cell => String(cell || '').replace(/\s+/g, '')).join('');
                                const newPatientValue = parseNum(row[columns.newPatient]);
                                const totalFeeValue = parseNum(row[columns.totalFee]);

                                if (rowLabel.includes('합계') || rowLabel.includes('총계')) {
                                    newPatientTotal = newPatientValue;
                                    newPatientSalesTotal = totalFeeValue;
                                    foundTotalRow = true;
                                    break;
                                }

                                if (newPatientValue > 0 || totalFeeValue > 0) {
                                    newPatientTotal += newPatientValue;
                                    newPatientSalesTotal += totalFeeValue;
                                }
                            }

                            if (!foundTotalRow && newPatientTotal === 0 && newPatientSalesTotal === 0) {
                                reject(`저장할 신규환자 내원경로 데이터가 없습니다. (${fileName})`);
                                return;
                            }

                            const d = currentYearData.find(item => item.month === monthFromFile);
                            if (!d) {
                                reject(`${monthFromFile} 데이터를 찾을 수 없습니다.`);
                                return;
                            }

                            d.newPatient = newPatientTotal;
                            d.newPatientSales = newPatientSalesTotal;
                            await saveSelectedClinicAnalytics({
                                category: 'sales',
                                subCategory: 'new_patient_revenue',
                                year: yearFromFile,
                                month: monthFromFile,
                                payload: {
                                    newPatient: newPatientTotal,
                                    newPatientSales: newPatientSalesTotal,
                                },
                            });
                            addLog('success', `✅ [신환수익] ${yearFromFile}년 ${monthFromFile} 업로드 완료 (신환 ${newPatientTotal.toLocaleString()}명 / 신환 매출 ${newPatientSalesTotal.toLocaleString()}원)`);
                            updatedCount++;
                            resolve('newPatientRevenue');
                        }
                        // 보험청구액 → 보험청구분석
                        else if (isInsuranceClaimFile(fileName)) {
                            try {
                                const parsed = await parseInsuranceClaimExcel(file);
                        for (const row of parsed.rows || []) {
                            await saveSelectedClinicAnalytics({
                                category: 'insurance',
                                subCategory: 'claim',
                                year: parsed.year,
                                        month: row.month,
                                        payload: row,
                                    });
                                }
                                notifyInsuranceClaimUpdated(parsed);
                                const total = parsed.rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
                                addLog('success', `✅ [보험청구분석] ${parsed.year}년 보험청구액 업로드 완료 (${total.toLocaleString()}원)`);
                                updatedCount++;
                                resolve('insuranceClaim');
                            } catch (err) {
                                reject(err.message || err);
                            }
                        }
                        // 기공물 의뢰 통계
                        else if (/기공의뢰통계/.test(fileName.replace(/\s+/g, ''))) {
                            if (!monthFromFile) {
                                reject(`파일명에서 월을 찾을 수 없습니다. (${fileName})`);
                                return;
                            }
                            const labColumns = { category: -1, type: -1, toothCount: -1 };
                            let headerIdx = -1;

                            for (let i = 0; i < Math.min(30, rawData.length); i++) {
                                const row = rawData[i] || [];
                                row.forEach((cell, idx) => {
                                    if (cell == null) return;
                                    const text = String(cell).trim().replace(/\s+/g, '');
                                    if (text === '구분') {
                                        labColumns.category = idx;
                                    }
                                    if (text === '기공물종류' || text === '기공물명' || text === '종류') {
                                        labColumns.type = idx;
                                    }
                                    if (text === '치아수' || text === '건수' || text === '수량') {
                                        labColumns.toothCount = idx;
                                    }
                                });
                                if (labColumns.category !== -1 && labColumns.type !== -1 && labColumns.toothCount !== -1) {
                                    headerIdx = i;
                                    break;
                                }
                            }

                            if (headerIdx === -1) {
                                reject(`구분/기공물 종류/치아 수 컬럼을 찾을 수 없습니다. (${fileName})`);
                                return;
                            }

                            const labRequests = {};
                            let currentCategory = '';
                            const isRepeatCategoryMark = (value) => {
                                const normalized = String(value || '').trim().replace(/\s+/g, '');
                                return ['"', '＂', '〃', '“', '”', "'", '＇'].includes(normalized);
                            };
                            for (let i = headerIdx + 1; i < rawData.length; i++) {
                                const row = rawData[i] || [];
                                const categoryCell = String(row[labColumns.category] || '').trim();
                                const labType = String(row[labColumns.type] || '').trim();
                                const toothCount = parseNum(row[labColumns.toothCount]);
                                if (categoryCell && !isRepeatCategoryMark(categoryCell)) {
                                    currentCategory = categoryCell;
                                }
                                const category = currentCategory;
                                if (!labType || labType === '합계' || toothCount <= 0) continue;
                                const key = `${category || '미분류'}|||${labType}`;
                                labRequests[key] = {
                                    category: category || '미분류',
                                    type: labType,
                                    count: (labRequests[key]?.count || 0) + toothCount,
                                };
                            }

                            if (Object.keys(labRequests).length === 0) {
                                reject(`저장할 기공물 의뢰 데이터가 없습니다. (${fileName})`);
                                return;
                            }

                            const month = monthFromFile;
                            await saveSelectedClinicAnalytics({
                                category: 'patient',
                                subCategory: 'total_patients_ledger',
                                year: yearFromFile,
                                month,
                                payload: { labRequests: Object.values(labRequests) },
                                mergeExisting: true,
                                auditSummary: {
                                    subCategoryLabel: AUDIT_SUBCATEGORY_LABELS.lab_requests,
                                    itemCount: Object.keys(labRequests).length,
                                },
                                auditMetadata: {
                                    feature: 'lab_requests',
                                    subCategoryLabel: AUDIT_SUBCATEGORY_LABELS.lab_requests,
                                },
                            });
                            window.dispatchEvent(new CustomEvent('patientLedgerUpdated', {
                                detail: { year: yearFromFile, month }
                            }));
                            addLog('success', `✅ [기공물 의뢰] ${yearFromFile}년 ${month} 업로드 완료 (${Object.keys(labRequests).length}종)`);
                            updatedCount++;
                            resolve('labRequests');
                        }
                        // 월간장부 (엑셀 버전)
                        else if (fileName.replace(/\s+/g, '').includes('월간장부')) {
                            const month = extractMonth(fileName);
                            let cashVal = 0, cardVal = 0, otherVal = 0, insuranceVal = 0;
                            let cashCol = -1, cardCol = -1, otherCol = -1, insuranceCol = -1, tonghapIdx = -1;
                            const compactCell = (value) => String(value ?? '').replace(/\s+/g, '');
                            const isTotalRow = (row = []) => row.some(cell => {
                                const text = compactCell(cell);
                                return (text.includes('합계') || text.includes('통합')) &&
                                    (!month || text.includes(month) || text.includes(month.replace('월', '')));
                            });
                            const findHeaderAndTotalRows = () => {
                                let headerRowIndex = -1;
                                let totalRowIndex = -1;
                                const columns = { cash: -1, card: -1, other: -1, insurance: -1 };

                                for (let r = 0; r < rawData.length; r++) {
                                    const row = rawData[r] || [];
                                    const rowColumns = { cash: -1, card: -1, other: -1, insurance: -1 };
                                    row.forEach((cell, idx) => {
                                        const text = compactCell(cell);
                                        if (!text) return;
                                        if (text.includes('현금수입')) rowColumns.cash = idx;
                                        if (text.includes('카드수입')) rowColumns.card = idx;
                                        if (
                                            text.includes('기타(온라인)수입') ||
                                            text.includes('기타온라인수입') ||
                                            (text.includes('기타') && text.includes('온라인') && text.includes('수입'))
                                        ) rowColumns.other = idx;
                                        if (
                                            text.includes('공단부담(청구액)') ||
                                            (text.includes('공단부담') && text.includes('청구액')) ||
                                            (text.includes('공단부담') && text.includes('청구')) ||
                                            text.includes('보험청구')
                                        ) rowColumns.insurance = idx;
                                    });

                                    if (rowColumns.cash !== -1 || rowColumns.card !== -1 || rowColumns.other !== -1 || rowColumns.insurance !== -1) {
                                        headerRowIndex = r;
                                        Object.assign(columns, rowColumns);
                                    }
                                    if (isTotalRow(row)) {
                                        totalRowIndex = r;
                                    }
                                }

                                return { headerRowIndex, totalRowIndex, columns };
                            };
                            const sumColumnBelowHeader = (columnIndex, headerRowIndex, totalRowIndex) => {
                                if (columnIndex === -1) return 0;
                                const start = headerRowIndex === -1 ? 0 : headerRowIndex + 1;
                                const end = totalRowIndex === -1 ? rawData.length : totalRowIndex;
                                let total = 0;
                                for (let r = start; r < end; r++) {
                                    const row = rawData[r] || [];
                                    if (isTotalRow(row)) continue;
                                    total += parseNum(row[columnIndex]);
                                }
                                return total;
                            };
                            const parseMaybeNum = (val) => {
                                if (typeof val === 'number') return val;
                                if (typeof val === 'string') {
                                    const cleaned = val.replace(/[^0-9.,-]/g, '');
                                    if (!cleaned) return null;
                                    const num = parseFloat(cleaned.replace(/,/g, ''));
                                    return isNaN(num) ? null : num;
                                }
                                return null;
                            };
                            const extractMetricValueFromCell = (value, labels) => {
                                const text = String(value ?? '');
                                const compactText = text.replace(/\s+/g, '');
                                for (const label of labels) {
                                    const compactLabel = String(label).replace(/\s+/g, '');
                                    const labelIndex = compactText.indexOf(compactLabel);
                                    if (labelIndex === -1) continue;

                                    const afterLabel = compactText.slice(labelIndex + compactLabel.length);
                                    const match = afterLabel.match(/[:：=\-]?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/);
                                    if (match) {
                                        return parseMaybeNum(match[1]);
                                    }
                                }
                                return null;
                            };
                            const findMetric = (labels) => {
                                for (let r = 0; r < rawData.length; r++) {
                                    const row = rawData[r] || [];
                                    for (let c = 0; c < row.length; c++) {
                                        const cellText = String(row[c] ?? '').replace(/\s+/g, '');
                                        if (!cellText || !labels.some(label => cellText.includes(label))) continue;

                                        const sameCellValue = extractMetricValueFromCell(row[c], labels);
                                        if (sameCellValue != null) return sameCellValue;

                                        for (let offset = 1; offset <= 4; offset++) {
                                            const rightValue = parseMaybeNum(row[c + offset]);
                                            if (rightValue != null) return rightValue;
                                        }

                                        for (let offset = 1; offset <= 3; offset++) {
                                            const belowValue = parseMaybeNum(rawData[r + offset]?.[c]);
                                            if (belowValue != null) return belowValue;
                                        }
                                    }
                                }
                                return null;
                            };
                            for (let r = 0; r < Math.min(100, rawData.length); r++) {
                                const row = rawData[r] || [];
                                row.forEach((cell, idx) => {
                                    if (!cell) return;
                                    const t = compactCell(cell);
                                    if (t.includes('현금수입')) cashCol = idx;
                                    else if (t.includes('카드수입')) cardCol = idx;
                                    else if (
                                        t.includes('기타(온라인)수입') ||
                                        t.includes('기타온라인수입') ||
                                        (t.includes('기타') && t.includes('온라인') && t.includes('수입'))
                                    ) otherCol = idx;
                                    else if (
                                        t.includes('공단부담(청구액)') ||
                                        (t.includes('공단부담') && t.includes('청구')) ||
                                        t.includes('보험청구')
                                    ) insuranceCol = idx;
                                });
                            }
                            for (let r = 0; r < rawData.length; r++) {
                                if (isTotalRow(rawData[r] || [])) {
                                    tonghapIdx = r; break;
                                }
                            }
                            const ledgerTable = findHeaderAndTotalRows();
                            if (ledgerTable.headerRowIndex !== -1) {
                                cashCol = ledgerTable.columns.cash !== -1 ? ledgerTable.columns.cash : cashCol;
                                cardCol = ledgerTable.columns.card !== -1 ? ledgerTable.columns.card : cardCol;
                                otherCol = ledgerTable.columns.other !== -1 ? ledgerTable.columns.other : otherCol;
                                insuranceCol = ledgerTable.columns.insurance !== -1 ? ledgerTable.columns.insurance : insuranceCol;
                            }
                            if (ledgerTable.totalRowIndex !== -1) {
                                tonghapIdx = ledgerTable.totalRowIndex;
                            }
                            if (tonghapIdx !== -1) {
                                if (cashCol !== -1) cashVal = parseNum(rawData[tonghapIdx][cashCol]);
                                if (cardCol !== -1) cardVal = parseNum(rawData[tonghapIdx][cardCol]);
                                if (otherCol !== -1) otherVal = parseNum(rawData[tonghapIdx][otherCol]);
                                if (insuranceCol !== -1) insuranceVal = parseNum(rawData[tonghapIdx][insuranceCol]);
                            }
                            if (!insuranceVal && insuranceCol !== -1) {
                                insuranceVal = sumColumnBelowHeader(insuranceCol, ledgerTable.headerRowIndex, ledgerTable.totalRowIndex);
                            }
                            if (!cashVal) {
                                cashVal = findMetric(['현금수입', '현금']) || 0;
                            }
                            if (!cardVal) {
                                cardVal = findMetric(['카드수입', '카드']) || 0;
                            }
                            if (!otherVal) {
                                otherVal = findMetric(['기타(온라인)수입', '기타온라인수입', '온라인수입']) || 0;
                            }
                            if (!insuranceVal) {
                                insuranceVal = findMetric(['공단부담(청구액)', '공단부담청구액', '공단부담', '보험청구']) || 0;
                            }
                            const d = currentYearData.find(item => item.month === month);
                            if (d) {
                                d.cash = cashVal; d.card = cardVal; d.other = otherVal; d.insurance = insuranceVal;
                                d.netSales = cashVal + cardVal + otherVal;
                                d.total = d.netSales + insuranceVal;
                                await saveSelectedClinicAnalytics({
                                    category: 'sales',
                                    subCategory: 'total_revenue',
                                    year: yearFromFile,
                                    month,
                                    payload: {
                                        month,
                                        cash: d.cash,
                                        card: d.card,
                                        other: d.other,
                                        insurance: d.insurance,
                                        netSales: d.netSales,
                                        total: d.total,
                                    },
                                });

                                const ledgerTextFromSheet = rawData
                                    .map(row => (row || []).map(cell => String(cell ?? '').trim()).filter(Boolean).join(' '))
                                    .filter(Boolean)
                                    .join('\n');
                                const parsedLedgerText = parseLedgerText(ledgerTextFromSheet);
                                const firstNumber = (...values) => {
                                    for (const value of values) {
                                        const num = Number(value);
                                        if (Number.isFinite(num) && num > 0) return num;
                                    }
                                    return null;
                                };
                                const patientLedger = {
                                    workDays: firstNumber(findMetric(['진료일수', '진료일', '영업일수']), parsedLedgerText.workDays),
                                    newPt: firstNumber(findMetric(['신환', '신규환자', '새환자']), parsedLedgerText.newPt),
                                    oldPt: firstNumber(findMetric(['구환', '재진환자', '기존환자']), parsedLedgerText.oldPt),
                                    totalVisits: firstNumber(findMetric(['총내원횟수', '총내원회수', '내원횟수', '내원회수']), parsedLedgerText.totalVisits),
                                    total: null,
                                    avgNewPt: null,
                                    avgOldPt: null,
                                };
                                const patientCountTotal = Number(patientLedger.newPt || 0) + Number(patientLedger.oldPt || 0);
                                if (patientLedger.totalVisits && patientCountTotal && patientLedger.totalVisits < patientCountTotal) {
                                    patientLedger.totalVisits = 0;
                                    patientLedger.total = 0;
                                }
                                if (patientLedger.totalVisits && patientLedger.workDays) {
                                    patientLedger.total = parseFloat((patientLedger.totalVisits / patientLedger.workDays).toFixed(1));
                                }
                                if (patientLedger.newPt && patientLedger.workDays) {
                                    patientLedger.avgNewPt = parseFloat((patientLedger.newPt / patientLedger.workDays).toFixed(1));
                                }
                                if (patientLedger.oldPt && patientLedger.workDays) {
                                    patientLedger.avgOldPt = parseFloat((patientLedger.oldPt / patientLedger.workDays).toFixed(1));
                                }
                                const detectedLedger = Object.fromEntries(
                                    Object.entries(patientLedger).filter(([, value]) => value != null)
                                );
                                if (Object.keys(detectedLedger).length > 0) {
                                    await saveSelectedClinicAnalytics({
                                        category: 'patient',
                                        subCategory: 'total_patients_ledger',
                                        year: yearFromFile,
                                        month,
                                        payload: detectedLedger,
                                        mergeExisting: true,
                                    });
                                    window.dispatchEvent(new CustomEvent('patientLedgerUpdated', {
                                        detail: { year: yearFromFile, month }
                                    }));
                                    addLog('success', `✅ [환자분석/총환자수] ${yearFromFile}년 ${month} 월간장부 환자 데이터 반영 완료`);
                                } else {
                                    addLog('warning', `⚠️ [환자분석/총환자수] ${fileName}: 월간장부에서 진료일수/신환/구환/총내원횟수 값을 찾지 못했습니다.`);
                                }
                                updatedCount++; resolve('monthlyLedger');
                            } else { reject(`${month} 데이터를 찾을 수 없습니다.`); }
                        }
                        // 임플란트 수술통계
                        else if (fileName.includes('임플란트수술통계') || fileName.includes('임플란트 수술통계') || /임플란트.*수술/.test(fileName)) {
                            resolve('implant');
                        }
                        // 보험수가별 통계
                        else if (fileName.includes('보험수가별통계') || fileName.includes('보험수가별 통계') || fileName.includes('보험수가') || /보험.*수가/.test(fileName)) {
                            resolve('insurance');
                        }
                        else { resolve(); }
                    } catch (err) { reject(`분석 오류: ${err.message}`); }
                };
                reader.readAsBinaryString(file);
            });

            try {
                const flag = await processFile();
                if (flag === 'implant') {
                    try {
                        const implantTypes = await loadClinicImplantTypes(selectedAdminClinicId);
                        const result = await parseImplantExcel(file, implantTypes);
                        await saveSelectedClinicAnalytics({
                            category: 'treatment',
                            subCategory: 'implant_surgery',
                            year: result.year,
                            month: result.month,
                            payload: result.data,
                        });
                        const typeSummary = Object.entries(result.data.implantTypes || {})
                            .filter(([, value]) => Number(value || 0) > 0)
                            .slice(0, 4)
                            .map(([name, value]) => `${name} ${value}개`)
                            .join(' / ');
                        addLog('success', `✅ [임플란트] ${result.year}년 ${result.month} 업로드 완료 (${typeSummary || '종류별 0개'} / 합계 ${result.data.implantTotal}개)`);
                        updatedCount++;
                    } catch (implantErr) { addLog('error', `❌ [임플란트] ${file.name}: ${implantErr.message}`); }
                } else if (flag === 'insurance') {
                    try {
                        const result = await parseInsuranceExcel(file);
                        await saveSelectedClinicAnalytics({
                            category: 'treatment',
                            subCategory: 'insurance_treatment',
                            year: result.year,
                            month: result.month,
                            payload: result.data,
                        });
                        addLog('success', `✅ [보험수가] ${result.year}년 ${result.month} 업로드 완료\n임플 1단계:${result.data.insImpStep1} / 2단계:${result.data.insImpStep2} / 3단계:${result.data.insImpStep3}\n틀니 1단계:${result.data.insDentStep1} / 5단계:${result.data.insDentStep5} / 6단계:${result.data.insDentStep6}`);
                        updatedCount++;
                    } catch (insErr) { addLog('error', `❌ [보험수가] ${file.name}: ${insErr.message}`); }
                    try {
                        const feeStats = await parseInsuranceFeeStatsExcel(file);
                        await saveSelectedClinicAnalytics({
                            category: 'insurance',
                            subCategory: 'fee_stats',
                            year: feeStats.year,
                            month: feeStats.month,
                            payload: { rows: feeStats.rows },
                        });
                        notifyInsuranceFeeStatsUpdated(feeStats);
                        addLog('success', `✅ [보험청구분석/보험수가별] ${feeStats.year}년 ${feeStats.month} 업로드 완료 (${feeStats.rows.length}개 수가)`);
                    } catch (feeErr) { addLog('error', `❌ [보험청구분석/보험수가별] ${file.name}: ${feeErr.message}`); }
                } else if (flag === 'doctorPatients') {
                    // handled inside processFile
                } else if (flag === 'labRequests') {
                    // handled inside processFile
                } else if (flag === 'topPatients') {
                    // handled inside processFile
                } else if (flag === 'newPatientRevenue') {
                    // handled inside processFile
                } else if (flag === 'insuranceClaim') {
                    // handled inside processFile
                } else if (flag === 'treatmentPlan') {
                    // handled inside processFile
                } else if (flag === 'monthlyLedger') {
                    // handled inside processFile
                } else {
                    addLog('error', `[미지원 파일] ${file.name}: 등록된 업로드 규칙과 일치하지 않습니다.`);
                    continue;
                }
            } catch (err) {
                addLog('error', `❌ ${file.name}: ${err}`);
                console.error(err);
            }
        }

    };

    // ── 이미지 업로드 처리 ────────────────────────────────────────────────────
    const triggerFileInput  = () => fileInputRef.current?.click();

    const isLedgerFile = (filename) => {
        const name = filename.replace(/\s/g, '');
        return name.includes('월간장부');
    };

    const isConsultationOverallFile = (filename) => {
        const name = filename.replace(/\s/g, '');
        return name.includes('전체동의율');
    };

    const isConsultationOverallMarkdownFile = (filename) => {
        const name = filename.replace(/\s/g, '');
        return /\.md$/i.test(filename) && (
            name.includes('전체상담현황') ||
            name.includes('전체_상담현황') ||
            name.includes('전체동의율')
        );
    };

    const isConsultationConsultantMarkdownFile = (filename) => {
        const name = filename.replace(/\s/g, '');
        return /\.md$/i.test(filename) &&
            name.includes('상담자별') &&
            (name.includes('동의율') || name.includes('상담건수') || name.includes('전체상담'));
    };

    const isConsultationRejectedMarkdownFile = (filename) => {
        const name = filename.replace(/\s/g, '');
        return /\.md$/i.test(filename) && name.includes('미동의환자');
    };

    const isConsultationBundleMarkdownFile = (filename) => {
        const name = filename.replace(/\s/g, '');
        const fixedName = name.replace(/_/g, '');
        return /\.md$/i.test(filename) && (
            /^\d{4}년\d{1,2}월상담현황통합정리\.md$/i.test(fixedName) ||
            ((name.includes('상담현황') || name.includes('통합상담현황')) && (
            name.includes('모음') ||
            name.includes('md파일') ||
            name.includes('md정리') ||
            name.includes('정리') ||
            name.includes('통합')
            ))
        );
    };

    const normalizeOcrKey = (value) => String(value || '')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[()[\]{}<>·ㆍ,.:;|/\\_-]/g, '')
        .replace(/보험제외/g, '')
        .replace(/환자/g, '')
        .replace(/금액/g, '금액')
        .replace(/진담/g, '진단')
        .replace(/임플란트/g, '임플')
        .replace(/틀리/g, '틀니');

    const extractConsultationYearMonth = (filename, text = '') => {
        const sourceFromName = String(filename || '');
        const source = `${sourceFromName} ${text || ''}`;
        const nameYearMatch = sourceFromName.match(/(\d{2,4})\s*년/);
        const nameMonthMatch = sourceFromName.match(/(\d{1,2})\s*월/);
        const yearMatch = nameYearMatch || source.match(/(\d{2,4})\s*년/);
        const monthMatch = nameMonthMatch || source.match(/(\d{1,2})\s*월/);
        const rawYear = yearMatch ? Number(yearMatch[1]) : Number(getCurrentYearString());
        const year = rawYear < 100 ? String(2000 + rawYear) : String(rawYear);
        const month = monthMatch ? `${Number(monthMatch[1])}월` : '1월';
        return { year, month };
    };

    const parseConsultationOverallText = (text, filename, words = [], imageSize = null) => {
        const yearMonth = extractConsultationYearMonth(filename, text);
        const source = String(text || '').replace(/\r/g, '\n');
        const compact = source
            .replace(/,/g, '')
            .replace(/\s+/g, '')
            .replace(/\d{2,4}년\d{1,2}월/g, '');

        const parseValue = (raw) => {
            const match = String(raw || '').match(/-?\d[\d,]*(?:\.\d+)?/);
            return match ? parseFloat(match[0].replace(/,/g, '')) : null;
        };

        const parseValueInRect = (rect) => {
            if (!Array.isArray(words) || words.length === 0 || !imageSize?.width || !imageSize?.height) return null;
            const x0 = rect.x0 * imageSize.width;
            const x1 = rect.x1 * imageSize.width;
            const y0 = rect.y0 * imageSize.height;
            const y1 = rect.y1 * imageSize.height;
            const texts = words
                .map(word => {
                    const bbox = word.bbox || word;
                    const wx0 = Number(bbox.x0 ?? bbox.left ?? 0);
                    const wx1 = Number(bbox.x1 ?? bbox.right ?? wx0);
                    const wy0 = Number(bbox.y0 ?? bbox.top ?? 0);
                    const wy1 = Number(bbox.y1 ?? bbox.bottom ?? wy0);
                    const cx = (wx0 + wx1) / 2;
                    const cy = (wy0 + wy1) / 2;
                    return { text: String(word.text || '').trim(), cx, cy, x: wx0, y: wy0 };
                })
                .filter(word => word.text && word.cx >= x0 && word.cx <= x1 && word.cy >= y0 && word.cy <= y1)
                .sort((a, b) => a.y - b.y || a.x - b.x)
                .map(word => word.text);
            if (texts.length === 0) return null;
            const joined = texts.join(' ');
            const matches = joined.match(/-?\d[\d,]*(?:\.\d+)?%?/g) || [];
            if (matches.length === 0) return null;
            return parseValue(matches[matches.length - 1]);
        };

        const parseTextInRect = (rect) => {
            if (!Array.isArray(words) || words.length === 0 || !imageSize?.width || !imageSize?.height) return '';
            const x0 = rect.x0 * imageSize.width;
            const x1 = rect.x1 * imageSize.width;
            const y0 = rect.y0 * imageSize.height;
            const y1 = rect.y1 * imageSize.height;
            return words
                .map(word => {
                    const bbox = word.bbox || word;
                    const wx0 = Number(bbox.x0 ?? bbox.left ?? 0);
                    const wx1 = Number(bbox.x1 ?? bbox.right ?? wx0);
                    const wy0 = Number(bbox.y0 ?? bbox.top ?? 0);
                    const wy1 = Number(bbox.y1 ?? bbox.bottom ?? wy0);
                    const cx = (wx0 + wx1) / 2;
                    const cy = (wy0 + wy1) / 2;
                    return { text: String(word.text || '').trim(), cx, cy, x: wx0, y: wy0 };
                })
                .filter(word => word.text && word.cx >= x0 && word.cx <= x1 && word.cy >= y0 && word.cy <= y1)
                .sort((a, b) => a.y - b.y || a.x - b.x)
                .map(word => word.text)
                .join(' ')
                .trim();
        };

        const cleanDoctorName = (value) => String(value || '')
            .replace(/[^\p{Script=Hangul}]/gu, '')
            .trim();

        const parseDoctorDiagnosesByPosition = () => {
            if (!Array.isArray(words) || words.length === 0 || !imageSize?.width || !imageSize?.height) return [];
            const pairs = [
                [{ x0: 0.16, x1: 0.24, y0: 0.84, y1: 0.94 }, { x0: 0.24, x1: 0.315, y0: 0.84, y1: 0.94 }],
                [{ x0: 0.325, x1: 0.405, y0: 0.84, y1: 0.94 }, { x0: 0.41, x1: 0.505, y0: 0.84, y1: 0.94 }],
                [{ x0: 0.515, x1: 0.60, y0: 0.84, y1: 0.94 }, { x0: 0.60, x1: 0.675, y0: 0.84, y1: 0.94 }],
                [{ x0: 0.675, x1: 0.745, y0: 0.84, y1: 0.94 }, { x0: 0.745, x1: 0.815, y0: 0.84, y1: 0.94 }],
            ];

            return pairs
                .map(([nameRect, countRect]) => ({
                    name: cleanDoctorName(parseTextInRect(nameRect)),
                    count: parseValueInRect(countRect) || 0,
                }))
                .filter(item => item.name && item.count > 0);
        };

        const parseDoctorDiagnosesFromText = () => {
            const lines = source.split(/\n+/).map(line => line.trim()).filter(Boolean);
            const startIndex = lines.findIndex(line => normalizeOcrKey(line).includes('의사별진단수'));
            const target = startIndex >= 0 ? lines.slice(startIndex, startIndex + 4).join(' ') : source;
            const tokens = target
                .replace(/의사별\s*진단수/g, ' ')
                .match(/[\p{L}.]+|-?\d[\d,]*/gu) || [];
            const doctors = [];
            for (let i = 0; i < tokens.length - 1; i++) {
                const name = tokens[i].trim();
                const count = parseValue(tokens[i + 1]);
                if (name && count !== null && !/^\d/.test(name) && !normalizeOcrKey(name).includes('의사별진단수')) {
                    doctors.push({ name, count });
                    i += 1;
                }
            }
            return doctors.filter(item => item.count > 0);
        };

        const parseByPosition = () => {
            const rects = {
                totalConsultations: { x0: 0.02, x1: 0.158, y0: 0.51, y1: 0.83 },
                agreedCount: { x0: 0.158, x1: 0.232, y0: 0.51, y1: 0.625 },
                partialCount: { x0: 0.232, x1: 0.315, y0: 0.51, y1: 0.625 },
                newPatients: { x0: 0.315, x1: 0.359, y0: 0.51, y1: 0.625 },
                oldPatients: { x0: 0.359, x1: 0.402, y0: 0.51, y1: 0.625 },
                diagnosisAmount: { x0: 0.402, x1: 0.51, y0: 0.51, y1: 0.625 },
                consultationAmount: { x0: 0.51, x1: 0.601, y0: 0.51, y1: 0.625 },
                rejectedAmount: { x0: 0.601, x1: 0.736, y0: 0.51, y1: 0.625 },
                insuranceDiagnosis: { x0: 0.736, x1: 0.813, y0: 0.51, y1: 0.625 },
                insuranceAgreement: { x0: 0.813, x1: 0.893, y0: 0.51, y1: 0.625 },
                planChange: { x0: 0.893, x1: 0.974, y0: 0.51, y1: 0.83 },
                patientAgreementRate: { x0: 0.158, x1: 0.232, y0: 0.73, y1: 0.835 },
                partialAgreementRate: { x0: 0.232, x1: 0.315, y0: 0.73, y1: 0.835 },
                totalPatients: { x0: 0.315, x1: 0.402, y0: 0.73, y1: 0.835 },
                agreedAmount: { x0: 0.402, x1: 0.51, y0: 0.73, y1: 0.835 },
                diagnosisAgreementRate: { x0: 0.51, x1: 0.601, y0: 0.73, y1: 0.835 },
                consultationAgreementRate: { x0: 0.601, x1: 0.736, y0: 0.73, y1: 0.835 },
                implantDecision: { x0: 0.736, x1: 0.813, y0: 0.73, y1: 0.835 },
                dentureDecision: { x0: 0.813, x1: 0.893, y0: 0.73, y1: 0.835 },
            };
            const parsed = {};
            Object.entries(rects).forEach(([key, rect]) => {
                const value = parseValueInRect(rect);
                if (value !== null) parsed[key] = value;
            });
            return Object.keys(parsed).length >= 8 ? parsed : {};
        };

        // This form is more reliable when parsed by item order than by OCR word coordinates.
        // Coordinates are still used only for the doctor-diagnosis row below.
        const positional = parseByPosition();

        const findValueByLabels = (labels, maxGap = 42) => {
            const normalizedLabels = labels.map(normalizeOcrKey);
            const normalizedCompact = normalizeOcrKey(compact).replace(/,/g, '');
            for (const label of normalizedLabels) {
                const match = normalizedCompact.match(new RegExp(`${label}[^0-9-]{0,${maxGap}}(-?\\d+(?:\\.\\d+)?)`));
                if (match) return parseFloat(match[1]);
            }

            const lines = source.split(/\n+/).map(line => line.trim()).filter(Boolean);
            for (let i = 0; i < lines.length; i++) {
                const lineKey = normalizeOcrKey(lines[i]);
                if (!normalizedLabels.some(label => lineKey.includes(label))) continue;

                const sameLineValue = parseValue(lines[i].replace(/[^\d,.-]+$/, ''));
                if (sameLineValue !== null && !/\d{2,4}\s*년|\d{1,2}\s*월/.test(lines[i])) return sameLineValue;

                for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
                    const nextValue = parseValue(lines[j]);
                    if (nextValue !== null) return nextValue;
                }
            }
            return null;
        };

        const orderedText = source.replace(/\d{2,4}\s*년\s*\d{1,2}\s*월/g, '');
        const orderedNumbers = (orderedText.match(/-?\d[\d,]*(?:\.\d+)?%?/g) || [])
            .map(v => parseFloat(v.replace(/,/g, '').replace('%', '')))
            .filter(v => Number.isFinite(v));
        const at = (index) => orderedNumbers[index] ?? 0;

        const totalConsultations = positional.totalConsultations ?? findValueByLabels(['전체상담건수보험제외', '전체상담건수', '전체 상담 건수']) ?? at(0);
        const agreedCount = positional.agreedCount ?? findValueByLabels(['전체동의환자수', '전체동의 환자수']) ?? at(1);
        const partialCount = positional.partialCount ?? findValueByLabels(['부분동의환자수', '부분동의 환자수']) ?? at(2);
        const newPatients = positional.newPatients ?? findValueByLabels(['신환수']) ?? at(3);
        const oldPatients = positional.oldPatients ?? findValueByLabels(['구환수']) ?? at(4);
        const diagnosisAmount = positional.diagnosisAmount ?? findValueByLabels(['진단금액', '진담금액']) ?? at(5);
        const consultationAmount = positional.consultationAmount ?? findValueByLabels(['상담금액']) ?? at(6);
        const rejectedAmount = positional.rejectedAmount ?? findValueByLabels(['비동의금액', '비동의 금액']) ?? at(7);
        const insuranceDiagnosis = positional.insuranceDiagnosis ?? findValueByLabels(['보험진단']) ?? at(8);
        const insuranceAgreement = positional.insuranceAgreement ?? findValueByLabels(['보험동의']) ?? at(9);
        const planChange = positional.planChange ?? findValueByLabels(['치료계획변동', '치료 계획 변동']) ?? at(10);
        const patientAgreementRate = positional.patientAgreementRate ?? findValueByLabels(['환자전체동의율', '환자 전체동의율']) ?? at(11);
        const partialAgreementRate = positional.partialAgreementRate ?? findValueByLabels(['환자부분동의율', '환자 부분동의율']) ?? at(12);
        const totalPatients = positional.totalPatients ?? findValueByLabels(['총환자수', '총 환자수']) ?? at(13);
        const agreedAmount = positional.agreedAmount ?? findValueByLabels(['최종동의금액', '최종 동의금액']) ?? at(14);
        const diagnosisAgreementRate = positional.diagnosisAgreementRate ?? findValueByLabels(['진단금액대비동의율', '진단금액 대비 동의율']) ?? at(15);
        const consultationAgreementRate = positional.consultationAgreementRate ?? findValueByLabels(['상담금액대비동의율', '상담금액 대비 동의율']) ?? at(16);
        const implantDecision = positional.implantDecision ?? findValueByLabels(['보험임플결정', '보험 임플결정', '보험임플란트결정']) ?? at(17);
        const dentureDecision = positional.dentureDecision ?? findValueByLabels(['보험틀니결정', '보험 틀니결정']) ?? at(18);
        const doctorDiagnoses = parseDoctorDiagnosesByPosition();
        const fallbackDoctorDiagnoses = doctorDiagnoses.length > 0 ? doctorDiagnoses : parseDoctorDiagnosesFromText();

        return {
            year: yearMonth.year,
            month: yearMonth.month,
            totalConsultations,
            agreedCount,
            partialCount,
            rejectedCount: Math.max(totalConsultations - agreedCount - partialCount, 0),
            newPatients,
            oldPatients,
            totalPatients: totalPatients || newPatients + oldPatients || totalConsultations,
            diagnosisAmount,
            consultationAmount,
            rejectedAmount,
            agreedAmount,
            insuranceDiagnosis,
            insuranceAgreement,
            planChange,
            implantDecision,
            dentureDecision,
            doctorDiagnoses: fallbackDoctorDiagnoses,
            patientAgreementRate: patientAgreementRate || (totalConsultations ? (agreedCount / totalConsultations) * 100 : 0),
            partialAgreementRate: partialAgreementRate || (totalConsultations ? (partialCount / totalConsultations) * 100 : 0),
            diagnosisAgreementRate: diagnosisAgreementRate || (diagnosisAmount ? (agreedAmount / diagnosisAmount) * 100 : 0),
            consultationAgreementRate: consultationAgreementRate || (consultationAmount ? (agreedAmount / consultationAmount) * 100 : 0),
        };
    };

    const saveConsultationOverallData = (parsed) => {
        window.dispatchEvent(new CustomEvent('consultationAnalysisUpdated', {
            detail: { year: parsed.year, month: parsed.month }
        }));
    };

    const normalizeConsultantColumn = (value) => String(value || '')
        .replace(/\s+/g, '')
        .replace(/[()[\]{}<>.,:;|/\\_\-]/g, '')
        .toLowerCase();

    const splitMarkdownTableLine = (line) => {
        const text = String(line || '').trim();
        if (!text) return [];
        if (text.includes('|')) {
            return text.split('|').map(item => item.trim()).filter(Boolean);
        }
        if (text.includes('\t')) {
            return text.split(/\t+/).map(item => item.trim()).filter(Boolean);
        }
        return text.split(/\s{2,}/).map(item => item.trim()).filter(Boolean);
    };

    const splitMarkdownTableLineKeepingEmpty = (line) => {
        const text = String(line || '').replace(/\r/g, '');
        if (!text.trim()) return [];
        if (text.includes('\t')) {
            return text.split('\t').map(item => item.trim());
        }
        if (text.includes('|')) {
            return text.replace(/^\|/, '').replace(/\|$/, '').split('|').map(item => item.trim());
        }
        return text.trim().split(/\s{2,}/).map(item => item.trim());
    };

    const parseConsultationConsultantMarkdown = (text, filename) => {
        const yearMonth = extractConsultationYearMonth(filename, text);
        const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const tableLines = lines
            .map(splitMarkdownTableLine)
            .filter(parts => parts.length >= 4)
            .filter(parts => !parts.every(part => /^:?-{2,}:?$/.test(part)));

        const headerIndex = tableLines.findIndex(parts => {
            const joined = parts.map(normalizeConsultantColumn).join('|');
            return joined.includes('상담자') && joined.includes('환자수') && joined.includes('동의');
        });
        if (headerIndex === -1) {
            throw new Error('상담자별 동의율 표 헤더를 찾을 수 없습니다.');
        }

        const headers = tableLines[headerIndex].map(normalizeConsultantColumn);
        const findIndex = (candidates, fallback) => {
            const normalized = candidates.map(normalizeConsultantColumn);
            const index = headers.findIndex(header => normalized.some(candidate => header === candidate || header.includes(candidate)));
            return index >= 0 ? index : fallback;
        };

        const indices = {
            name: findIndex(['상담자'], 1),
            patientCount: findIndex(['환자수'], 2),
            fullAgreed: findIndex(['전체동의수'], 3),
            partialAgreed: findIndex(['부분동의수'], 4),
            totalAgreed: findIndex(['총동의수'], 5),
            rejected: findIndex(['미동의환자수'], 6),
            patientAgreementRate: findIndex(['환자수동의율'], 7),
            consultationAmount: findIndex(['상담금액'], 8),
            agreedAmount: findIndex(['동의금액'], 9),
            amountAgreementRate: findIndex(['금액대비동의율'], 10),
        };

        const rows = [];
        tableLines.slice(headerIndex + 1).forEach(parts => {
            const name = String(parts[indices.name] || '').trim();
            if (!name || normalizeConsultantColumn(name).includes('상담자')) return;
            const patientCount = parseNumber(parts[indices.patientCount]);
            if (patientCount <= 0 && parseNumber(parts[indices.totalAgreed]) <= 0) return;
            const fullAgreed = parseNumber(parts[indices.fullAgreed]);
            const partialAgreed = parseNumber(parts[indices.partialAgreed]);
            const totalAgreed = parseNumber(parts[indices.totalAgreed]) || fullAgreed + partialAgreed;
            const rejected = parseNumber(parts[indices.rejected]) || Math.max(patientCount - totalAgreed, 0);
            const consultationAmount = parseNumber(parts[indices.consultationAmount]);
            const agreedAmount = parseNumber(parts[indices.agreedAmount]);
            const patientAgreementRate = parseNumber(parts[indices.patientAgreementRate]) ||
                (patientCount > 0 ? (totalAgreed / patientCount) * 100 : 0);
            const amountAgreementRate = parseNumber(parts[indices.amountAgreementRate]) ||
                (consultationAmount > 0 ? (agreedAmount / consultationAmount) * 100 : 0);

            rows.push({
                name,
                patientCount,
                fullAgreed,
                partialAgreed,
                totalAgreed,
                rejected,
                patientAgreementRate,
                consultationAmount,
                agreedAmount,
                amountAgreementRate,
            });
        });

        if (rows.length === 0) {
            throw new Error('상담자별 데이터 행을 찾을 수 없습니다.');
        }

        return {
            year: yearMonth.year,
            month: yearMonth.month,
            rows: rows.sort((a, b) => b.patientCount - a.patientCount || b.amountAgreementRate - a.amountAgreementRate),
        };
    };

    const saveConsultationConsultantData = (parsed) => {
        window.dispatchEvent(new CustomEvent('consultationAnalysisUpdated', {
            detail: { year: parsed.year, month: parsed.month }
        }));
    };

    const extractRejectedYearMonth = (filename, text = '') => {
        const source = `${filename || ''} ${text || ''}`;
        const dotted = source.match(/(\d{2,4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*\d{1,2}/);
        if (dotted) {
            const rawYear = Number(dotted[1]);
            return {
                year: rawYear < 100 ? String(2000 + rawYear) : String(rawYear),
                month: `${Number(dotted[2])}월`,
            };
        }

        const yearMonth = source.match(/(\d{2,4})\s*년\s*(\d{1,2})\s*월/);
        if (yearMonth) {
            const rawYear = Number(yearMonth[1]);
            return {
                year: rawYear < 100 ? String(2000 + rawYear) : String(rawYear),
                month: `${Number(yearMonth[2])}월`,
            };
        }

        const monthOnly = source.match(/(\d{1,2})\s*월/);
        const fallback = extractConsultationYearMonth(filename, text);
        return {
            year: fallback.year,
            month: monthOnly ? `${Number(monthOnly[1])}월` : fallback.month,
        };
    };

    const parseConsultationRejectedMarkdown = (text, filename) => {
        const yearMonth = extractRejectedYearMonth(filename, text);
        const lines = String(text || '').split(/\r?\n/).filter(line => line.trim());
        const tableLines = lines
            .map(splitMarkdownTableLineKeepingEmpty)
            .filter(parts => parts.length >= 8)
            .filter(parts => !parts.every(part => /^:?-{2,}:?$/.test(part)));

        let headerIndex = tableLines.findIndex(parts => {
            const joined = parts.map(normalizeConsultantColumn).join('|');
            return joined.includes('담당dr') &&
                (joined.includes('이름') || joined.includes('환자성함')) &&
                joined.includes('미동의사유');
        });
        let dataStartIndex = headerIndex + 1;
        if (headerIndex === -1) {
            const firstDataIndex = tableLines.findIndex(parts => parts.length >= 17 && parseNumber(parts[0]) > 0);
            if (firstDataIndex >= 0) {
                dataStartIndex = firstDataIndex;
            } else if (tableLines.length > 0) {
                headerIndex = 0;
                dataStartIndex = 1;
            }
        }
        if (headerIndex === -1 && dataStartIndex === 0) {
            throw new Error('미동의 환자 관리 표 헤더를 찾을 수 없습니다.');
        }

        const headers = headerIndex >= 0 ? tableLines[headerIndex].map(normalizeConsultantColumn) : [];
        const findIndex = (candidates, fallback) => {
            const normalized = candidates.map(normalizeConsultantColumn);
            const index = headers.findIndex(header => normalized.some(candidate => header === candidate || header.includes(candidate)));
            return index >= 0 ? index : fallback;
        };
        const indices = {
            doctor: findIndex(['담당dr진단', '담당dr'], 1),
            newPatient: findIndex(['신'], 2),
            oldPatient: findIndex(['구'], 3),
            patientName: findIndex(['이름', '환자성함'], 4),
            visitDate: findIndex(['내원날짜'], 5),
            consultant: findIndex(['상담자'], 6),
            reason: findIndex(['미동의사유'], 16),
            diagnosisAmount: findIndex(['금액진단금액', '진단금액'], 17),
            consultationAmount: findIndex(['금액상담금액', '상담금액'], 18),
            agreedAmount: findIndex(['금액최종동의금액', '최종동의금액'], 19),
            rejectedAmount: findIndex(['금액비동의금액', '비동의금액'], 20),
            note: findIndex(['비고'], 24),
        };

        const mark = (value) => /o|0|ㅇ|○|●|1/i.test(String(value || '').trim()) ? 'O' : '';
        const rows = tableLines.slice(dataStartIndex)
            .map((parts, index) => {
                const patientName = String(parts[indices.patientName] || '').trim();
                const doctor = String(parts[indices.doctor] || '').trim() || '-';
                if (!patientName) return null;
                const rejectedAmount = parseNumber(parts[indices.rejectedAmount]);
                const consultationAmount = parseNumber(parts[indices.consultationAmount]);
                const agreedAmount = parseNumber(parts[indices.agreedAmount]);
                return {
                    id: `${yearMonth.year}-${yearMonth.month}-${parts[0] || index}`,
                    doctor,
                    newPatient: mark(parts[indices.newPatient]),
                    oldPatient: mark(parts[indices.oldPatient]),
                    patientName,
                    visitDate: String(parts[indices.visitDate] || '').trim(),
                    consultant: String(parts[indices.consultant] || '').trim() || '-',
                    reason: String(parts[indices.reason] || '').trim() || '-',
                    diagnosisAmount: parseNumber(parts[indices.diagnosisAmount]),
                    consultationAmount,
                    agreedAmount,
                    rejectedAmount: rejectedAmount || Math.max(consultationAmount - agreedAmount, 0),
                    note: String(parts[indices.note] || '').trim(),
                };
            })
            .filter(Boolean);

        if (rows.length === 0) {
            throw new Error('미동의 환자 데이터 행을 찾을 수 없습니다.');
        }

        return {
            year: yearMonth.year,
            month: yearMonth.month,
            rows,
        };
    };

    const saveConsultationRejectedData = (parsed) => {
        window.dispatchEvent(new CustomEvent('consultationAnalysisUpdated', {
            detail: { year: parsed.year, month: parsed.month }
        }));
    };

    const extractConsultationBundleBlocks = (text) => {
        const source = String(text || '');
        const sections = {};
        const headingPattern = /^#\s+(.+)$/gm;
        const headings = [];
        let match;
        while ((match = headingPattern.exec(source)) !== null) {
            headings.push({ title: match[1].trim(), start: match.index, contentStart: headingPattern.lastIndex });
        }

        headings.forEach((heading, index) => {
            const end = headings[index + 1]?.start ?? source.length;
            const chunk = source.slice(heading.contentStart, end).trim();
            const codeMatch = chunk.match(/```(?:tsv|txt|md)?\s*([\s\S]*?)```/i);
            const body = (codeMatch ? codeMatch[1] : chunk).trim();
            const key = heading.title.replace(/\s/g, '');
            if (key.includes('전체_상담현황') || key.includes('전체상담현황') || key.includes('전체동의율')) {
                sections.overall = { filename: heading.title, body };
            } else if (key.includes('상담자별')) {
                sections.consultant = { filename: heading.title, body };
            } else if (key.includes('상담내역') || key.includes('미동의환자')) {
                sections.rejected = { filename: heading.title, body };
            }
        });

        if (!sections.overall || !sections.consultant || !sections.rejected) {
            const lines = source.split(/\r?\n/);
            const markers = [];
            lines.forEach((line, index) => {
                const key = line.replace(/^#+\s*/, '').replace(/\s/g, '');
                if (key.includes('전체상담현황') || key.includes('전체_상담현황') || key.includes('전체동의율')) {
                    markers.push({ type: 'overall', title: line.trim(), index });
                } else if (key.includes('상담자별')) {
                    markers.push({ type: 'consultant', title: line.trim(), index });
                } else if (key.includes('상담내역') || key.includes('미동의환자')) {
                    markers.push({ type: 'rejected', title: line.trim(), index });
                }
            });

            markers.forEach((marker, index) => {
                if (sections[marker.type]) return;
                const end = markers[index + 1]?.index ?? lines.length;
                const body = lines.slice(marker.index + 1, end).join('\n').trim();
                if (body) sections[marker.type] = { filename: marker.title, body };
            });

            if (!sections.consultant) {
                const consultantHeaderIndex = lines.findIndex(line => {
                    const key = line.replace(/\s/g, '');
                    return key.includes('No') && key.includes('상담자') && key.includes('환자수') && key.includes('금액대비동의율');
                });
                if (consultantHeaderIndex !== -1) {
                    const nextRejected = lines.findIndex((line, index) => {
                        if (index <= consultantHeaderIndex) return false;
                        const key = line.replace(/^#+\s*/, '').replace(/\s/g, '');
                        return key.includes('상담내역') || key.includes('미동의환자');
                    });
                    const titleIndex = Math.max(0, consultantHeaderIndex - 2);
                    const title = lines.slice(titleIndex, consultantHeaderIndex).find(line => line.trim()) || '상담자별 동의율';
                    const end = nextRejected === -1 ? lines.length : nextRejected;
                    sections.consultant = {
                        filename: title.trim(),
                        body: lines.slice(consultantHeaderIndex, end).join('\n').trim(),
                    };
                }
            }
        }

        return sections;
    };

    const parseConsultationBundleMarkdown = (text, filename) => {
        const sections = extractConsultationBundleBlocks(text);
        if (!sections.overall) throw new Error('전체동의율 섹션을 찾을 수 없습니다.');
        if (!sections.consultant) throw new Error('상담자별 동의율 섹션을 찾을 수 없습니다.');
        if (!sections.rejected) throw new Error('미동의 환자 현황 섹션을 찾을 수 없습니다.');

        const fallbackName = filename || '상담현황_md_파일_모음.md';
        const overallSourceName = `${fallbackName} ${sections.overall.filename || ''}`.trim();
        const consultantSourceName = `${fallbackName} ${sections.consultant.filename || ''}`.trim();
        const overall = parseConsultationOverallMarkdown(sections.overall.body, overallSourceName);
        const bundleDoctorDiagnoses = extractDoctorDiagnosesFromMarkdown(text);
        if ((!overall.doctorDiagnoses || overall.doctorDiagnoses.length === 0) && bundleDoctorDiagnoses.length > 0) {
            overall.doctorDiagnoses = bundleDoctorDiagnoses;
        }
        const consultant = parseConsultationConsultantMarkdown(sections.consultant.body, consultantSourceName);
        const rejectedTitle = sections.rejected.filename || fallbackName;
        const rejectedFilename = /\d{2,4}\s*년/.test(rejectedTitle)
            ? rejectedTitle
            : `${overall.year}년 ${rejectedTitle}`;
        const rejected = parseConsultationRejectedMarkdown(sections.rejected.body, rejectedFilename);
        return { overall, consultant, rejected };
    };

    const parseConsultationOverallExcel = (rows, fileName, parseNum) => {
        const yearMonth = extractConsultationYearMonth(fileName);
        const normalizeLabel = (value) => String(value || '')
            .replace(/\s+/g, '')
            .replace(/[()[\]{}<>·ㆍ,.:;|/\\_-]/g, '')
            .replace(/보험제외/g, '')
            .replace(/진담/g, '진단')
            .replace(/임플란트/g, '임플');

        const isDoctorName = (value) => {
            const text = String(value || '').trim();
            if (!/^[가-힣]{2,5}$/.test(text)) return false;
            const reservedLabels = new Set([
                '상담', '현황', '결정', '환자', '진단', '동의', '금액', '보험',
                '치료', '계획', '신환', '구환', '전체', '부분', '최종', '총',
            ]);
            return !reservedLabels.has(text);
        };

        const cells = [];
        rows.forEach((row, r) => {
            (row || []).forEach((cell, c) => {
                if (cell !== null && cell !== undefined && String(cell).trim() !== '') {
                    cells.push({ r, c, text: String(cell).trim(), raw: cell, key: normalizeLabel(cell) });
                }
            });
        });

        const valueNear = (labels, options = {}) => {
            const keys = labels.map(normalizeLabel);
            const labelCell = cells.find(cell => keys.some(key => cell.key.includes(key) || key.includes(cell.key)));
            if (!labelCell) return 0;
            const sameRow = cells
                .filter(cell => cell.r === labelCell.r && cell.c > labelCell.c)
                .sort((a, b) => a.c - b.c)
                .map(cell => parseNum(cell.raw))
                .find(value => value !== 0 || String(value) === '0');
            if (sameRow !== undefined) return sameRow;

            const belowLimit = options.belowLimit ?? 4;
            for (let offset = 1; offset <= belowLimit; offset++) {
                const row = rows[labelCell.r + offset] || [];
                const value = parseNum(row[labelCell.c]);
                if (value !== 0 || String(row[labelCell.c] ?? '').trim() === '0') return value;
            }
            return 0;
        };

        const cellValue = (row, col) => parseNum(rows[row]?.[col]);
        const textValue = (row, col) => String(rows[row]?.[col] || '').trim();

        const totalConsultations = valueNear(['전체상담건수보험제외', '전체상담건수']) || cellValue(4, 0);
        const agreedCount = valueNear(['전체동의환자수']) || cellValue(4, 1);
        const partialCount = valueNear(['부분동의환자수']) || cellValue(4, 2);
        const newPatients = valueNear(['신환수']) || cellValue(4, 3);
        const oldPatients = valueNear(['구환수']) || cellValue(4, 4);
        const diagnosisAmount = valueNear(['진단금액']) || cellValue(4, 5);
        const consultationAmount = valueNear(['상담금액']) || cellValue(4, 6);
        const rejectedAmount = valueNear(['비동의금액']) || cellValue(4, 7);
        const insuranceDiagnosis = valueNear(['보험진단']) || cellValue(4, 8);
        const insuranceAgreement = valueNear(['보험동의']) || cellValue(4, 9);
        const planChange = valueNear(['치료계획변동']) || cellValue(5, 10) || cellValue(6, 10);
        const patientAgreementRate = valueNear(['환자전체동의율']) || cellValue(6, 1);
        const partialAgreementRate = valueNear(['환자부분동의율']) || cellValue(6, 2);
        const totalPatients = valueNear(['총환자수']) || cellValue(6, 3);
        const agreedAmount = valueNear(['최종동의금액']) || cellValue(6, 5);
        const diagnosisAgreementRate = valueNear(['진단금액대비동의율']) || cellValue(6, 6);
        const consultationAgreementRate = valueNear(['상담금액대비동의율']) || cellValue(6, 7);
        const implantDecision = valueNear(['보험임플결정']) || cellValue(6, 8);
        const dentureDecision = valueNear(['보험틀니결정']) || cellValue(6, 9);

        const doctorRowIndex = rows.findIndex(row => (row || []).some(cell => normalizeLabel(cell).includes('의사별진단수')));
        const doctorDiagnoses = [];
        if (doctorRowIndex !== -1) {
            const row = rows[doctorRowIndex] || [];
            const nextRow = rows[doctorRowIndex + 1] || [];
            const hasAmountHeader = row.some(cell => normalizeLabel(cell).includes('동의금액')) ||
                nextRow.some(cell => normalizeLabel(cell).includes('동의금액'));
            for (let c = 0; c < row.length - 1; c++) {
                const name = String(row[c] || '').trim();
                const count = parseNum(row[c + 1]);
                const agreedAmount = hasAmountHeader ? parseNum(row[c + 2]) : 0;
                if (!isDoctorName(name) || count <= 0) continue;
                doctorDiagnoses.push({ name, count, agreedAmount });
                c += hasAmountHeader ? 2 : 1;
            }
        }

        return {
            year: yearMonth.year,
            month: yearMonth.month,
            totalConsultations,
            agreedCount,
            partialCount,
            rejectedCount: Math.max(totalConsultations - agreedCount - partialCount, 0),
            newPatients,
            oldPatients,
            totalPatients: totalPatients || newPatients + oldPatients || totalConsultations,
            diagnosisAmount,
            consultationAmount,
            rejectedAmount,
            agreedAmount,
            insuranceDiagnosis,
            insuranceAgreement,
            planChange,
            implantDecision,
            dentureDecision,
            doctorDiagnoses,
            patientAgreementRate: patientAgreementRate || (totalConsultations ? (agreedCount / totalConsultations) * 100 : 0),
            partialAgreementRate: partialAgreementRate || (totalConsultations ? (partialCount / totalConsultations) * 100 : 0),
            diagnosisAgreementRate: diagnosisAgreementRate || (diagnosisAmount ? (agreedAmount / diagnosisAmount) * 100 : 0),
            consultationAgreementRate: consultationAgreementRate || (consultationAmount ? (agreedAmount / consultationAmount) * 100 : 0),
        };
    };

    const getImageSizeFromDataUrl = (dataUrl) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
        img.onerror = () => resolve(null);
        img.src = dataUrl;
    });

    const loadImageFromDataUrl = (dataUrl) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'));
        img.src = dataUrl;
    });

    const parseOcrNumber = (text, { percent = false } = {}) => {
        const normalized = String(text || '')
            .replace(/[Oo]/g, '0')
            .replace(/[Il|]/g, '1')
            .replace(/[ＳS]/g, '5')
            .replace(/[ＢB]/g, '8');
        const matches = normalized.match(/\d[\d,.\s]*/g) || [];
        if (matches.length === 0) return 0;

        const best = matches
            .map(match => match.trim())
            .sort((a, b) => b.replace(/\D/g, '').length - a.replace(/\D/g, '').length)[0];

        if (percent) {
            const cleaned = best.replace(/\s/g, '').replace(',', '.');
            const parsed = parseFloat(cleaned);
            return Number.isFinite(parsed) ? parsed : 0;
        }

        const digits = best.replace(/\D/g, '');
        return digits ? Number(digits) : 0;
    };

    const detectTableBounds = (image) => {
        const canvas = document.createElement('canvas');
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const { data } = ctx.getImageData(0, 0, width, height);
        let minX = width;
        let minY = height;
        let maxX = 0;
        let maxY = 0;

        for (let y = 0; y < height; y += 2) {
            for (let x = 0; x < width; x += 2) {
                const index = (y * width + x) * 4;
                const r = data[index];
                const g = data[index + 1];
                const b = data[index + 2];
                const a = data[index + 3];
                if (a < 120) continue;
                if (r < 75 && g < 75 && b < 75) {
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                }
            }
        }

        if (minX >= maxX || minY >= maxY) {
            return { left: 0, top: 0, width, height };
        }

        const padding = 2;
        return {
            left: Math.max(0, minX - padding),
            top: Math.max(0, minY - padding),
            width: Math.min(width - minX, maxX - minX + padding * 2),
            height: Math.min(height - minY, maxY - minY + padding * 2),
        };
    };

    const cropConsultationCell = (image, table, rect, {
        scale = 5,
        threshold = true,
        insetXRatio = 0.08,
        insetYRatio = 0.16,
    } = {}) => {
        const imageWidth = image.naturalWidth || image.width;
        const imageHeight = image.naturalHeight || image.height;
        const sxRaw = table.left + rect.x0 * table.width;
        const syRaw = table.top + rect.y0 * table.height;
        const swRaw = (rect.x1 - rect.x0) * table.width;
        const shRaw = (rect.y1 - rect.y0) * table.height;
        const insetX = Math.max(0, swRaw * insetXRatio);
        const insetY = Math.max(0, shRaw * insetYRatio);
        const sx = Math.max(0, sxRaw + insetX);
        const sy = Math.max(0, syRaw + insetY);
        const sw = Math.min(imageWidth - sx, Math.max(1, swRaw - insetX * 2));
        const sh = Math.min(imageHeight - sy, Math.max(1, shRaw - insetY * 2));

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(sw * scale));
        canvas.height = Math.max(1, Math.round(sh * scale));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

        if (threshold) {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const pixels = imageData.data;
            for (let i = 0; i < pixels.length; i += 4) {
                const r = pixels[i];
                const g = pixels[i + 1];
                const b = pixels[i + 2];
                const luminance = r * 0.299 + g * 0.587 + b * 0.114;
                const isText = luminance < 178 || (r > 150 && g < 100 && b < 100);
                const value = isText ? 0 : 255;
                pixels[i] = value;
                pixels[i + 1] = value;
                pixels[i + 2] = value;
                pixels[i + 3] = 255;
            }
            ctx.putImageData(imageData, 0, 0);
        }

        return canvas.toDataURL('image/png');
    };

    const groupTableLines = (lineHits) => {
        const groups = [];
        let current = [];
        let previous = null;
        lineHits.forEach(hit => {
            if (previous === null || hit.position <= previous + 1) {
                current.push(hit);
            } else {
                groups.push(current);
                current = [hit];
            }
            previous = hit.position;
        });
        if (current.length > 0) groups.push(current);
        return groups.map(group => ({
            position: group.reduce((sum, item) => sum + item.position, 0) / group.length,
            count: Math.max(...group.map(item => item.count)),
        }));
    };

    const detectConsultationTableGrid = (image, table) => {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const { data } = ctx.getImageData(0, 0, width, height);
        const isBlack = (x, y) => {
            const index = (y * width + x) * 4;
            return data[index] < 75 && data[index + 1] < 75 && data[index + 2] < 75 && data[index + 3] > 120;
        };

        const xHits = [];
        const yStart = Math.max(0, Math.round(table.top));
        const yEnd = Math.min(height - 1, Math.round(table.top + table.height));
        for (let x = Math.max(0, Math.round(table.left)); x <= Math.min(width - 1, Math.round(table.left + table.width)); x++) {
            let count = 0;
            for (let y = yStart; y <= yEnd; y++) {
                if (isBlack(x, y)) count++;
            }
            if (count > table.height * 0.24) xHits.push({ position: x, count });
        }

        const yHits = [];
        const xStart = Math.max(0, Math.round(table.left));
        const xEnd = Math.min(width - 1, Math.round(table.left + table.width));
        for (let y = yStart; y <= yEnd; y++) {
            let count = 0;
            for (let x = xStart; x <= xEnd; x++) {
                if (isBlack(x, y)) count++;
            }
            if (count > table.width * 0.52) yHits.push({ position: y, count });
        }

        const normalize = (value, start, size) => Math.min(1, Math.max(0, (value - start) / size));
        const cols = groupTableLines(xHits)
            .map(line => normalize(line.position, table.left, table.width))
            .filter(value => value >= 0 && value <= 1)
            .sort((a, b) => a - b);
        const rows = groupTableLines(yHits)
            .map(line => normalize(line.position, table.top, table.height))
            .filter(value => value >= 0 && value <= 1)
            .sort((a, b) => a - b);

        const fallbackCols = [0, 0.145, 0.224, 0.31, 0.355, 0.401, 0.514, 0.608, 0.751, 0.83, 0.914, 1];
        const fallbackRows = [0, 0.353, 0.51, 0.637, 0.762, 0.881, 1];
        return {
            cols: cols.length >= 12 ? cols.slice(0, 12) : fallbackCols,
            rows: rows.length >= 7 ? rows.slice(0, 7) : fallbackRows,
        };
    };

    const normalizeConsultationLabel = (value) => String(value || '')
        .replace(/[\r\n\t]+/g, '')
        .replace(/\s+/g, '')
        .replace(/[()[\]{}<>·ㆍ,.:;|/\\_\-]/g, '')
        .replace(/진담/g, '진단')
        .replace(/진팀/g, '진단')
        .replace(/부문/g, '부분')
        .replace(/부분동익/g, '부분동의')
        .replace(/부분동의환자/g, '부분동의환자수')
        .replace(/전채/g, '전체')
        .replace(/전체동익/g, '전체동의')
        .replace(/전체동의환자/g, '전체동의환자수')
        .replace(/상담금액대버/g, '상담금액대비')
        .replace(/진단금액대버/g, '진단금액대비')
        .replace(/상담급액/g, '상담금액')
        .replace(/진단급액/g, '진단금액')
        .replace(/보험진댄/g, '보험진단')
        .replace(/보험동익/g, '보험동의')
        .replace(/치료계획번동/g, '치료계획변동')
        .replace(/임플란트/g, '임플')
        .replace(/임플결정/g, '임플결정')
        .replace(/틀리/g, '틀니')
        .replace(/툴니/g, '틀니');

    const matchConsultationOverallLabel = (label) => {
        const key = normalizeConsultationLabel(label);
        const checks = [
            ['totalConsultations', ['전체상담건수', '전체상담건수보험제외', '전체상담건']],
            ['agreedCount', ['전체동의환자수']],
            ['partialCount', ['부분동의환자수']],
            ['newPatients', ['신환수']],
            ['oldPatients', ['구환수']],
            ['diagnosisAgreementRate', ['진단금액대비동의율']],
            ['consultationAgreementRate', ['상담금액대비동의율']],
            ['diagnosisAmount', ['진단금액']],
            ['consultationAmount', ['상담금액']],
            ['rejectedAmount', ['비동의금액']],
            ['insuranceDiagnosis', ['보험진단', '교정진단']],
            ['insuranceAgreement', ['보험동의', '교정동의']],
            ['planChange', ['치료계획변동', '치료계획변동건수']],
            ['patientAgreementRate', ['환자전체동의율', '전체동의율']],
            ['partialAgreementRate', ['환자부분동의율', '부분동의율']],
            ['totalPatients', ['총환자수']],
            ['agreedAmount', ['최종동의금액']],
            ['implantDecision', ['보험임플결정']],
            ['dentureDecision', ['보험틀니결정']],
        ];
        return checks.find(([, labels]) => labels.some(item => key.includes(item)))?.[0] || null;
    };

    const extractDoctorDiagnosesFromMarkdown = (sourceText) => {
        const rows = [];
        let inDoctorSection = false;
        const pushDoctorRow = (line, parts = []) => {
            const compactMatch = String(line || '').match(/([가-힣]{2,5})\s+([\d,]+)(?:\s+([\d,]+))?/);
            const name = String(parts[0] || compactMatch?.[1] || '').replace(/[^\p{Script=Hangul}]/gu, '').trim();
            const count = parseNumber(parts[1] ?? compactMatch?.[2]);
            const agreedAmount = parseNumber(parts[2] ?? compactMatch?.[3]);
            if (/^[가-힣]{2,5}$/.test(name) && count > 0 && !rows.some(row => row.name === name)) {
                rows.push({ name, count, agreedAmount });
            }
        };

        String(sourceText || '').split(/\r?\n/).forEach(rawLine => {
            const line = rawLine.trim();
            if (!line) return;

            const key = normalizeConsultationLabel(line);
            if (
                key.includes('의사별진단') ||
                (key.includes('의사별') && key.includes('진단')) ||
                (key.includes('의사') && key.includes('진단수') && key.includes('동의금액'))
            ) {
                inDoctorSection = true;
                return;
            }
            if (!inDoctorSection) return;
            if (key.includes('상담자별') || key.includes('상담내역') || key.includes('미동의환자')) {
                inDoctorSection = false;
                return;
            }

            const parts = line
                .split(/\t+|\s{2,}|\|/)
                .map(item => item.trim())
                .filter(Boolean);
            const joinedKey = normalizeConsultationLabel(parts.join(''));
            if (!parts.length || joinedKey.includes('이름') || joinedKey.includes('건수')) return;

            pushDoctorRow(line, parts);
        });

        if (rows.length === 0) {
            String(sourceText || '').split(/\r?\n/).forEach(rawLine => {
                const line = rawLine.trim();
                if (!/^[가-힣]{2,5}\s+[\d,]+(?:\s+[\d,]+)?\s*$/.test(line)) return;
                pushDoctorRow(line);
            });
        }

        return rows;
    };

    const applyConsultationOverallMarkdownTables = (parsed, sourceText) => {
        String(sourceText || '').split(/\r?\n/).forEach(rawLine => {
            const line = rawLine.trim();
            if (!line.includes('|')) return;
            const parts = splitMarkdownTableLineKeepingEmpty(line)
                .map(item => item.replace(/\*\*/g, '').trim())
                .filter(Boolean);
            if (parts.length < 2) return;
            if (parts.every(part => /^:?-{2,}:?$/.test(part))) return;
            const key = matchConsultationOverallLabel(parts[0]);
            if (!key) return;
            parsed[key] = parseNumber(parts.slice(1).join(' '));
        });
        return parsed;
    };

    const parseConsultationOverallMarkdown = (text, filename) => {
        const yearMonth = extractConsultationYearMonth(filename, text);
        const parsed = {
            year: yearMonth.year,
            month: yearMonth.month,
            totalConsultations: 0,
            agreedCount: 0,
            partialCount: 0,
            rejectedCount: 0,
            newPatients: 0,
            oldPatients: 0,
            totalPatients: 0,
            diagnosisAmount: 0,
            consultationAmount: 0,
            rejectedAmount: 0,
            agreedAmount: 0,
            insuranceDiagnosis: 0,
            insuranceAgreement: 0,
            planChange: 0,
            implantDecision: 0,
            dentureDecision: 0,
            patientAgreementRate: 0,
            partialAgreementRate: 0,
            diagnosisAgreementRate: 0,
            consultationAgreementRate: 0,
            doctorDiagnoses: [],
        };

        let inDoctorSection = false;
        String(text || '').split(/\r?\n/).forEach(rawLine => {
            const line = rawLine.trim();
            if (!line) return;

            const parts = line
                .split(/\t+|\s{2,}|\|/)
                .map(item => item.trim())
                .filter(Boolean);
            if (parts.length === 0) return;

            const first = parts[0];
            const firstKey = normalizeConsultationLabel(first);
            if (firstKey.includes('의사별진단수')) {
                inDoctorSection = true;
                return;
            }
            if (firstKey === '항목' || firstKey === '값' || firstKey === '이름' || firstKey === '건수') return;

            if (inDoctorSection) {
                const rowKey = normalizeConsultationLabel(parts.join(''));
                if (rowKey.includes('이름') || rowKey.includes('의사') || rowKey.includes('건수')) return;
                const compactMatch = line.match(/([가-힣]{2,5})\s+([\d,]+)(?:\s+([\d,]+))?/);
                const name = String(parts[0] || compactMatch?.[1] || '').replace(/[^\p{Script=Hangul}]/gu, '').trim();
                const count = parseNumber(parts[1] ?? compactMatch?.[2]);
                const agreedAmount = parseNumber(parts[2] ?? compactMatch?.[3]);
                if (/^[가-힣]{2,5}$/.test(name) && count > 0) {
                    parsed.doctorDiagnoses.push({ name, count, agreedAmount });
                }
                return;
            }

            if (parts.length < 2) return;
            const key = matchConsultationOverallLabel(parts[0]);
            if (!key) return;
            parsed[key] = parseNumber(parts.slice(1).join(' '));
        });

        applyConsultationOverallMarkdownTables(parsed, text);

        if (parsed.doctorDiagnoses.length === 0) {
            parsed.doctorDiagnoses = extractDoctorDiagnosesFromMarkdown(text);
        }

        parsed.rejectedCount = Math.max(parsed.totalConsultations - parsed.agreedCount - parsed.partialCount, 0);
        const normalized = normalizeConsultationOverallParsed(parsed);
        validateConsultationOverallParsed(normalized);
        return normalized;
    };

    const validateConsultationOverallParsed = (parsed) => {
        const errors = [];
        const countFields = [
            ['전체상담건수', parsed.totalConsultations],
            ['전체동의 환자수', parsed.agreedCount],
            ['부분동의 환자수', parsed.partialCount],
            ['신환수', parsed.newPatients],
            ['구환수', parsed.oldPatients],
            ['총 환자수', parsed.totalPatients],
            ['보험진단', parsed.insuranceDiagnosis],
            ['보험동의', parsed.insuranceAgreement],
            ['치료계획변동', parsed.planChange],
            ['보험 임플결정', parsed.implantDecision],
            ['보험 틀니결정', parsed.dentureDecision],
        ];
        countFields.forEach(([label, value]) => {
            if (!Number.isFinite(value) || value < 0 || value > 10000) {
                errors.push(`${label} 값이 비정상입니다(${value || 0}).`);
            }
        });

        const rateFields = [
            ['환자 전체동의율', parsed.patientAgreementRate],
            ['환자 부분동의율', parsed.partialAgreementRate],
            ['진단금액 대비 동의율', parsed.diagnosisAgreementRate],
            ['상담금액 대비 동의율', parsed.consultationAgreementRate],
        ];
        rateFields.forEach(([label, value]) => {
            if (!Number.isFinite(value) || value < 0 || value > 100) {
                errors.push(`${label} 값이 비정상입니다(${value || 0}%).`);
            }
        });

        if (parsed.diagnosisAmount > 0 && parsed.diagnosisAmount < 1000000) {
            errors.push(`진단금액이 너무 작습니다(${parsed.diagnosisAmount.toLocaleString()}원).`);
        }
        if (parsed.consultationAmount > 0 && parsed.consultationAmount < 1000000) {
            errors.push(`상담금액이 너무 작습니다(${parsed.consultationAmount.toLocaleString()}원).`);
        }
        if (parsed.agreedAmount > 0 && parsed.agreedAmount < 1000000) {
            errors.push(`최종동의금액이 너무 작습니다(${parsed.agreedAmount.toLocaleString()}원).`);
        }
        if (errors.length > 0) {
            throw new Error(`OCR 값 검증 실패: ${errors.slice(0, 3).join(' ')}`);
        }
    };

    const normalizeConsultationOverallParsed = (parsed) => {
        const normalized = { ...parsed };
        const roundRate = (value) => Number.isFinite(value) ? Math.round(value) : 0;
        CONSULTATION_OCR_FIELDS.forEach(({ key }) => {
            if (normalized[key] === '' || normalized[key] == null) return;
            const value = Number(normalized[key]);
            normalized[key] = Number.isFinite(value) ? value : 0;
        });

        if (normalized.newPatients >= 0 && normalized.oldPatients >= 0) {
            const calculatedTotalPatients = normalized.newPatients + normalized.oldPatients;
            if (
                calculatedTotalPatients > 0 &&
                (!Number.isFinite(normalized.totalPatients) ||
                    normalized.totalPatients <= 0 ||
                    normalized.totalPatients > 10000)
            ) {
                normalized.totalPatients = calculatedTotalPatients;
            }
        }

        if (
            normalized.totalConsultations > 0 &&
            (!Number.isFinite(normalized.patientAgreementRate) || normalized.patientAgreementRate <= 0 || normalized.patientAgreementRate > 100)
        ) {
            normalized.patientAgreementRate = roundRate((normalized.agreedCount / normalized.totalConsultations) * 100);
        }
        if (
            normalized.totalConsultations > 0 &&
            (!Number.isFinite(normalized.partialAgreementRate) || normalized.partialAgreementRate <= 0 || normalized.partialAgreementRate > 100)
        ) {
            normalized.partialAgreementRate = roundRate((normalized.partialCount / normalized.totalConsultations) * 100);
        }

        if (
            normalized.diagnosisAmount > 0 &&
            normalized.agreedAmount > 0 &&
            (!Number.isFinite(normalized.diagnosisAgreementRate) || normalized.diagnosisAgreementRate <= 0 || normalized.diagnosisAgreementRate > 100)
        ) {
            normalized.diagnosisAgreementRate = roundRate((normalized.agreedAmount / normalized.diagnosisAmount) * 100);
        }

        if (
            normalized.consultationAmount > 0 &&
            normalized.agreedAmount > 0 &&
            (!Number.isFinite(normalized.consultationAgreementRate) || normalized.consultationAgreementRate <= 0 || normalized.consultationAgreementRate > 100)
        ) {
            normalized.consultationAgreementRate = roundRate((normalized.agreedAmount / normalized.consultationAmount) * 100);
        }

        return normalized;
    };

    const parseConsultationOverallImageByCells = async (dataUrl, filename, { validate = true } = {}) => {
        const image = await loadImageFromDataUrl(dataUrl);
        const table = detectTableBounds(image);
        const grid = detectConsultationTableGrid(image, table);
        const cols = grid.cols;
        const rows = grid.rows;
        const cell = (c0, c1, r0, r1) => ({ x0: cols[c0], x1: cols[c1], y0: rows[r0], y1: rows[r1] });
        const labeledCells = [
            { fallbackKey: 'totalConsultations', labelRect: cell(0, 1, 1, 2), valueRect: cell(0, 1, 2, 5) },
            { fallbackKey: 'agreedCount', labelRect: cell(1, 2, 1, 2), valueRect: cell(1, 2, 2, 3) },
            { fallbackKey: 'partialCount', labelRect: cell(2, 3, 1, 2), valueRect: cell(2, 3, 2, 3) },
            { fallbackKey: 'newPatients', labelRect: cell(3, 4, 1, 2), valueRect: cell(3, 4, 2, 3) },
            { fallbackKey: 'oldPatients', labelRect: cell(4, 5, 1, 2), valueRect: cell(4, 5, 2, 3) },
            { fallbackKey: 'diagnosisAmount', labelRect: cell(5, 6, 1, 2), valueRect: cell(5, 6, 2, 3) },
            { fallbackKey: 'consultationAmount', labelRect: cell(6, 7, 1, 2), valueRect: cell(6, 7, 2, 3) },
            { fallbackKey: 'rejectedAmount', labelRect: cell(7, 8, 1, 2), valueRect: cell(7, 8, 2, 3) },
            { fallbackKey: 'insuranceDiagnosis', labelRect: cell(8, 9, 1, 2), valueRect: cell(8, 9, 2, 3) },
            { fallbackKey: 'insuranceAgreement', labelRect: cell(9, 10, 1, 2), valueRect: cell(9, 10, 2, 3) },
            { fallbackKey: 'planChange', labelRect: cell(10, 11, 1, 2), valueRect: cell(10, 11, 2, 5) },
            { fallbackKey: 'patientAgreementRate', labelRect: cell(1, 2, 3, 4), valueRect: cell(1, 2, 4, 5) },
            { fallbackKey: 'partialAgreementRate', labelRect: cell(2, 3, 3, 4), valueRect: cell(2, 3, 4, 5) },
            { fallbackKey: 'totalPatients', labelRect: cell(3, 5, 3, 4), valueRect: cell(3, 5, 4, 5) },
            { fallbackKey: 'agreedAmount', labelRect: cell(5, 6, 3, 4), valueRect: cell(5, 6, 4, 5) },
            { fallbackKey: 'diagnosisAgreementRate', labelRect: cell(6, 7, 3, 4), valueRect: cell(6, 7, 4, 5) },
            { fallbackKey: 'consultationAgreementRate', labelRect: cell(7, 8, 3, 4), valueRect: cell(7, 8, 4, 5) },
            { fallbackKey: 'implantDecision', labelRect: cell(8, 9, 3, 4), valueRect: cell(8, 9, 4, 5) },
            { fallbackKey: 'dentureDecision', labelRect: cell(9, 10, 3, 4), valueRect: cell(9, 10, 4, 5) },
        ];
        const doctorCells = [
            [cell(1, 2, 5, 6), cell(2, 3, 5, 6)],
            [cell(3, 5, 5, 6), cell(5, 6, 5, 6)],
            [cell(6, 7, 5, 6), cell(7, 8, 5, 6)],
            [cell(8, 9, 5, 6), cell(9, 10, 5, 6)],
        ];

        const worker = await Tesseract.createWorker('kor+eng');
        const yearMonth = extractConsultationYearMonth(filename);
        const parsed = { year: yearMonth.year, month: yearMonth.month };
        const rawCells = {};
        const countKeys = new Set([
            'totalConsultations',
            'agreedCount',
            'partialCount',
            'newPatients',
            'oldPatients',
            'totalPatients',
            'insuranceDiagnosis',
            'insuranceAgreement',
            'planChange',
            'implantDecision',
            'dentureDecision',
            'doctorCount',
        ]);
        const rateKeys = new Set([
            'patientAgreementRate',
            'partialAgreementRate',
            'diagnosisAgreementRate',
            'consultationAgreementRate',
        ]);
        const amountKeys = new Set([
            'diagnosisAmount',
            'consultationAmount',
            'rejectedAmount',
            'agreedAmount',
        ]);
        let fullImageWords = [];

        const getFullOcrTextInRect = (rect) => {
            if (!Array.isArray(fullImageWords) || fullImageWords.length === 0) return '';
            const left = table.left + rect.x0 * table.width;
            const right = table.left + rect.x1 * table.width;
            const top = table.top + rect.y0 * table.height;
            const bottom = table.top + rect.y1 * table.height;
            return fullImageWords
                .map(word => {
                    const bbox = word.bbox || word;
                    const x0 = Number(bbox.x0 ?? bbox.left ?? 0);
                    const x1 = Number(bbox.x1 ?? bbox.right ?? x0);
                    const y0 = Number(bbox.y0 ?? bbox.top ?? 0);
                    const y1 = Number(bbox.y1 ?? bbox.bottom ?? y0);
                    const cx = (x0 + x1) / 2;
                    const cy = (y0 + y1) / 2;
                    const overlapX = Math.max(0, Math.min(x1, right) - Math.max(x0, left));
                    const overlapY = Math.max(0, Math.min(y1, bottom) - Math.max(y0, top));
                    const overlapArea = overlapX * overlapY;
                    const wordArea = Math.max(1, (x1 - x0) * (y1 - y0));
                    return {
                        text: String(word.text || '').trim(),
                        x: x0,
                        y: y0,
                        cx,
                        cy,
                        inside: cx >= left && cx <= right && cy >= top && cy <= bottom,
                        overlapRatio: overlapArea / wordArea,
                    };
                })
                .filter(word => word.text && (word.inside || word.overlapRatio > 0.45))
                .sort((a, b) => a.y - b.y || a.x - b.x)
                .map(word => word.text)
                .join(' ')
                .trim();
        };

        const recognizeNumberCell = async (key, rect) => {
            const variants = [
                { scale: 7, threshold: true, insetXRatio: 0.02, insetYRatio: 0.08 },
                { scale: 7, threshold: false, insetXRatio: 0.02, insetYRatio: 0.08 },
                { scale: 8, threshold: true, insetXRatio: 0, insetYRatio: 0.04 },
            ];
            const candidates = [];
            const fullText = getFullOcrTextInRect(rect);
            if (fullText) {
                const isPercent = rateKeys.has(key);
                candidates.push({ value: parseOcrNumber(fullText, { percent: isPercent }), text: `full:${fullText}` });
            }
            for (const variant of variants) {
                const crop = cropConsultationCell(image, table, rect, variant);
                const { data } = await worker.recognize(crop);
                const isPercent = rateKeys.has(key);
                const value = parseOcrNumber(data.text, { percent: isPercent });
                candidates.push({ value, text: data.text });
            }

            rawCells[key] = candidates.map(item => item.text).join(' | ');
            const values = candidates
                .map(item => item.value)
                .filter(value => Number.isFinite(value) && value >= 0);
            if (values.length === 0) return 0;

            if (amountKeys.has(key)) {
                return Math.max(...values);
            }
            if (countKeys.has(key)) {
                const plausible = values.filter(value => value <= 10000);
                return plausible.length ? Math.max(...plausible) : values[0];
            }
            if (rateKeys.has(key)) {
                const plausible = values.filter(value => value <= 100);
                return plausible.length ? Math.max(...plausible) : values[0];
            }
            return values[0];
        };

        const parseDoctorDiagnosesFromRowText = (text) => {
            const tokens = (String(text || '').match(/[\p{Script=Hangul}]+|\d+/gu) || [])
                .map(token => token.trim())
                .filter(Boolean)
                .filter(token => !['의사별', '진단수', '상담현황', '틀니결정'].includes(token));
            const rows = [];
            for (let i = 0; i < tokens.length - 1; i++) {
                const name = tokens[i].replace(/[^\p{Script=Hangul}]/gu, '');
                const count = parseOcrNumber(tokens[i + 1]);
                if (/^[가-힣]{2,5}$/.test(name) && count > 0 && count < 10000) {
                    rows.push({ name, count });
                    i += 1;
                }
            }
            return rows;
        };

        try {
            await worker.setParameters({
                tessedit_pageseg_mode: Tesseract.PSM.AUTO,
                tessedit_char_whitelist: '',
                preserve_interword_spaces: '1',
                user_defined_dpi: '300',
            });
            const { data: fullData } = await worker.recognize(dataUrl);
            fullImageWords = fullData.words || [];

            await worker.setParameters({
                tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
                tessedit_char_whitelist: '',
                preserve_interword_spaces: '1',
                user_defined_dpi: '300',
            });

            const matchedCells = [];
            for (const item of labeledCells) {
                const fullLabelText = getFullOcrTextInRect(item.labelRect);
                const labelCrop = cropConsultationCell(image, table, item.labelRect, {
                    scale: 5,
                    threshold: false,
                    insetXRatio: 0.01,
                    insetYRatio: 0.03,
                });
                const { data } = await worker.recognize(labelCrop);
                const matchedKey = matchConsultationOverallLabel(`${fullLabelText} ${data.text}`);
                rawCells[`${item.fallbackKey}Label`] = `${fullLabelText} | ${data.text}`;
                matchedCells.push({
                    key: matchedKey || item.fallbackKey,
                    valueRect: item.valueRect,
                });
            }

            await worker.setParameters({
                tessedit_pageseg_mode: Tesseract.PSM.SINGLE_WORD,
                tessedit_char_whitelist: '0123456789,%.',
                user_defined_dpi: '300',
            });

            for (const item of matchedCells) {
                parsed[item.key] = await recognizeNumberCell(item.key, item.valueRect);
            }

            await worker.setParameters({
                tessedit_pageseg_mode: Tesseract.PSM.SINGLE_WORD,
                tessedit_char_whitelist: '',
                user_defined_dpi: '300',
            });

            parsed.doctorDiagnoses = [];
            for (const [nameRect, countRect] of doctorCells) {
                const fullNameText = getFullOcrTextInRect(nameRect).replace(/[^\p{Script=Hangul}]/gu, '').trim();
                const nameVariants = [
                    { scale: 7, threshold: false, insetXRatio: 0.01, insetYRatio: 0.04 },
                    { scale: 7, threshold: true, insetXRatio: 0.01, insetYRatio: 0.04 },
                    { scale: 8, threshold: false, insetXRatio: 0, insetYRatio: 0 },
                ];
                let name = fullNameText;
                for (const variant of nameVariants) {
                    const nameCrop = cropConsultationCell(image, table, nameRect, variant);
                    const { data: nameData } = await worker.recognize(nameCrop);
                    const candidate = String(nameData.text || '').replace(/[^\p{Script=Hangul}]/gu, '').trim();
                    if (candidate.length > name.length) name = candidate;
                }
                if (!name) continue;

                await worker.setParameters({
                    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_WORD,
                    tessedit_char_whitelist: '0123456789',
                    user_defined_dpi: '300',
                });
                const count = await recognizeNumberCell('doctorCount', countRect);
                if (count > 0) parsed.doctorDiagnoses.push({ name, count });

                await worker.setParameters({
                    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_WORD,
                    tessedit_char_whitelist: '',
                    user_defined_dpi: '300',
                });
            }

            if (parsed.doctorDiagnoses.length < 2) {
                await worker.setParameters({
                    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
                    tessedit_char_whitelist: '',
                    preserve_interword_spaces: '1',
                    user_defined_dpi: '300',
                });
                const doctorRowRect = cell(0, 11, 5, 6);
                const fullDoctorRowText = getFullOcrTextInRect(doctorRowRect);
                const rowCrop = cropConsultationCell(image, table, doctorRowRect, {
                    scale: 7,
                    threshold: false,
                    insetXRatio: 0.01,
                    insetYRatio: 0.02,
                });
                const { data: rowData } = await worker.recognize(rowCrop);
                const rowDoctors = parseDoctorDiagnosesFromRowText(`${fullDoctorRowText} ${rowData.text}`);
                rawCells.doctorRow = `${fullDoctorRowText} | ${rowData.text}`;
                if (rowDoctors.length > parsed.doctorDiagnoses.length) {
                    parsed.doctorDiagnoses = rowDoctors;
                }
            }
        } finally {
            await worker.terminate();
        }

        parsed.rejectedCount = Math.max(parsed.totalConsultations - parsed.agreedCount - parsed.partialCount, 0);
        parsed.totalPatients = parsed.totalPatients || parsed.newPatients + parsed.oldPatients || parsed.totalConsultations;

        const normalized = normalizeConsultationOverallParsed(parsed);
        if (validate) validateConsultationOverallParsed(normalized);
        return { parsed: normalized, rawCells };
    };

    const handleImageUpload = async (files) => {
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;

        for (const file of imageFiles) {
            const reader = new FileReader();
            const dataUrl = await new Promise(resolve => {
                reader.onload = e => resolve(e.target.result);
                reader.readAsDataURL(file);
            });

            if (isConsultationOverallFile(file.name)) {
                setOcrProcessingFile(file.name);
                const yearMonth = extractConsultationYearMonth(file.name);
                setOcrModal({
                    type: 'consultationOverall',
                    file,
                    previewUrl: dataUrl,
                    ocrProgress: 0,
                    yearMonth,
                    yearMonthDetected: !!yearMonth,
                    parsedData: {},
                    doctorDiagnoses: [],
                    rawCells: {},
                    status: 'loading',
                });
                try {
                    const { parsed, rawCells } = await parseConsultationOverallImageByCells(dataUrl, file.name, { validate: false });
                    setOcrModal(prev => prev ? {
                        ...prev,
                        status: 'done',
                        ocrProgress: 100,
                        yearMonth: { year: parsed.year, month: parsed.month },
                        parsedData: parsed,
                        doctorDiagnoses: parsed.doctorDiagnoses || [],
                        rawCells,
                    } : prev);
                    addLog('success', `✅ [상담분석/전체동의율] ${parsed.year}년 ${parsed.month} OCR 분석 완료 — 확인 후 저장해 주세요.`);
                } catch (err) {
                    setOcrModal(prev => prev ? { ...prev, status: 'done', ocrProgress: 100 } : prev);
                    addLog('error', `❌ [상담분석/전체동의율 OCR 오류] ${file.name}: ${err.message}`);
                } finally {
                    setOcrProcessingFile('');
                }
            }
            // 월간장부이면 OCR 실행
            else if (isLedgerFile(file.name)) {
                const ym = extractYearMonthFromFileName(file.name);
                setOcrModal({
                    file, previewUrl: dataUrl, ocrProgress: 0,
                    yearMonth: ym || { year: getCurrentYearString(), month: '1월' },
                    yearMonthDetected: !!ym,
                    parsedData: { workDays: '', newPt: '', oldPt: '', totalVisits: '', total: '', avgNewPt: '', avgOldPt: '' },
                    rawText: '', status: 'loading',
                });
                setOcrProcessingFile(file.name);

                try {
                    const result = await parseLedgerImage(file, (progress) => {
                        setOcrModal(prev => prev ? { ...prev, ocrProgress: progress } : prev);
                    });

                    // 구환 일평균 자동 계산: 구환 / 진료일수
                    const pd = result.parsedData;
                    if (pd.oldPt && pd.workDays && !pd.avgOldPt) {
                        pd.avgOldPt = parseFloat((pd.oldPt / pd.workDays).toFixed(1));
                    }
                    const patientCountTotal = Number(pd.newPt || 0) + Number(pd.oldPt || 0);
                    if (pd.totalVisits && patientCountTotal && Number(pd.totalVisits) < patientCountTotal) {
                        pd.totalVisits = '';
                        pd.total = '';
                    }
                    if (pd.totalVisits && pd.workDays) {
                        pd.total = parseFloat((pd.totalVisits / pd.workDays).toFixed(1));
                    }

                    setOcrModal(prev => prev ? {
                        ...prev,
                        status: 'done', ocrProgress: 100,
                        yearMonth: result.yearMonth || prev.yearMonth,
                        yearMonthDetected: !!result.yearMonth,
                        parsedData: {
                            workDays: pd.workDays ?? '',
                            newPt:    pd.newPt    ?? '',
                            oldPt:    pd.oldPt    ?? '',
                            totalVisits: pd.totalVisits ?? '',
                            total:    pd.total    ?? '',
                            avgNewPt: pd.avgNewPt ?? '',
                            avgOldPt: pd.avgOldPt ?? '',
                        },
                        rawText: result.rawText,
                    } : prev);
                } catch (err) {
                    setOcrModal(prev => prev ? { ...prev, status: 'done', ocrProgress: 100 } : prev);
                    addLog('error', `❌ [OCR 오류] ${file.name}: ${err.message}`);
                } finally {
                    setOcrProcessingFile('');
                }
            }
        }
    };

    // OCR 모달 수치 변경
    const handleOcrFieldChange = (field, val) => {
        setOcrModal(prev => {
            if (!prev) return prev;
            if (prev.type === 'consultationOverall') {
                const parsedData = {
                    ...prev.parsedData,
                    [field]: val === '' ? '' : Number(val),
                };
                const normalized = normalizeConsultationOverallParsed({
                    ...parsedData,
                    year: prev.yearMonth?.year,
                    month: prev.yearMonth?.month,
                });
                return { ...prev, parsedData: normalized };
            }
            const updated = { ...prev, parsedData: { ...prev.parsedData, [field]: val } };
            const newPt   = parseFloat(updated.parsedData.newPt);
            const oldPt   = parseFloat(updated.parsedData.oldPt);
            const workDays = parseFloat(updated.parsedData.workDays);
            const totalVisits = parseFloat(updated.parsedData.totalVisits);
            const patientCountTotal = (isNaN(newPt) ? 0 : newPt) + (isNaN(oldPt) ? 0 : oldPt);
            if (!isNaN(totalVisits) && patientCountTotal > 0 && totalVisits < patientCountTotal) {
                updated.parsedData.total = '';
            } else if (!isNaN(totalVisits) && !isNaN(workDays) && workDays > 0) {
                updated.parsedData.total = parseFloat((totalVisits / workDays).toFixed(1));
            }
            if (!isNaN(oldPt) && !isNaN(workDays) && workDays > 0) {
                updated.parsedData.avgOldPt = parseFloat((oldPt / workDays).toFixed(1));
            }
            return updated;
        });
    };

    const handleConsultationDoctorChange = (index, field, value) => {
        setOcrModal(prev => {
            if (!prev || prev.type !== 'consultationOverall') return prev;
            const rows = [...(prev.doctorDiagnoses || [])];
            rows[index] = {
                ...(rows[index] || { name: '', count: 0, agreedAmount: 0 }),
                [field]: field === 'count' || field === 'agreedAmount' ? Number(value || 0) : value,
            };
            return { ...prev, doctorDiagnoses: rows };
        });
    };

    // OCR 저장
    const handleOcrSave = async () => {
        if (!ocrModal) return;
        const { yearMonth, parsedData } = ocrModal;

        if (ocrModal.type === 'consultationOverall') {
            try {
                const parsed = normalizeConsultationOverallParsed({
                    ...parsedData,
                    year: yearMonth.year,
                    month: yearMonth.month,
                    rejectedCount: Math.max(Number(parsedData.totalConsultations || 0) - Number(parsedData.agreedCount || 0) - Number(parsedData.partialCount || 0), 0),
                    doctorDiagnoses: (ocrModal.doctorDiagnoses || [])
                        .map(item => ({
                            name: String(item.name || '').trim(),
                            count: Number(item.count || 0),
                            agreedAmount: Number(item.agreedAmount || 0),
                        }))
                        .filter(item => item.name && item.count > 0),
                });
                validateConsultationOverallParsed(parsed);
                await saveSelectedClinicAnalytics({
                    category: 'consultation',
                    subCategory: 'overall',
                    year: yearMonth.year,
                    month: yearMonth.month,
                    payload: parsed,
                });
                saveConsultationOverallData(parsed);
                addLog('success', `✅ [상담분석/전체동의율] ${yearMonth.year}년 ${yearMonth.month} 저장 완료`);
                setOcrModal(null);
            } catch (err) {
                addLog('error', `❌ [상담분석/전체동의율 저장 오류] ${err.message}`);
            }
            return;
        }

        // OCR이 못 읽은 필드는 null, 읽은 필드만 저장
        const safeNum = (v) => {
            const n = parseFloat(v);
            return (!isNaN(n) && n > 0) ? n : null;
        };

        const data = {
            workDays: safeNum(parsedData.workDays),
            newPt:    safeNum(parsedData.newPt),
            oldPt:    safeNum(parsedData.oldPt),
            totalVisits: safeNum(parsedData.totalVisits),
            total:    safeNum(parsedData.total),
            avgNewPt: safeNum(parsedData.avgNewPt),
            avgOldPt: safeNum(parsedData.avgOldPt),
        };
        const patientCountTotal = Number(data.newPt || 0) + Number(data.oldPt || 0);
        if (data.totalVisits && patientCountTotal && data.totalVisits < patientCountTotal) {
            data.totalVisits = 0;
            data.total = 0;
        }

        await saveSelectedClinicAnalytics({
            category: 'patient',
            subCategory: 'total_patients_ledger',
            year: yearMonth.year,
            month: yearMonth.month,
            payload: data,
            mergeExisting: true,
        });
        addLog('success',
            `✅ [환자분석] ${yearMonth.year}년 ${yearMonth.month} 월간장부 저장 완료 ` +
            `(진료일수: ${data.workDays ?? '-'}일 / 신환: ${data.newPt ?? '-'}명 / 구환: ${data.oldPt ?? '-'}명 / 총내원횟수: ${data.totalVisits ?? '-'}회 / 총접수: ${data.total ?? '-'}명)`
        );
        setOcrModal(null);

        // ── PatientAnalysis에 데이터 변경 알림 (SPA 내 커스텀 이벤트) ──
        window.dispatchEvent(new CustomEvent('patientLedgerUpdated', {
            detail: { year: yearMonth.year, month: yearMonth.month }
        }));
    };


    const handleDragOver  = (e) => { e.preventDefault(); setIsDragOver(true); };
    const handleDragLeave = ()  => setIsDragOver(false);
    const handleDrop = (e) => { e.preventDefault(); setIsDragOver(false); requestClinicUploadConfirmation(e.dataTransfer.files); };

    // ── JSX ──────────────────────────────────────────────────────────────────
    const handleAuditFilterChange = (key, value) => {
        setAuditFilters(prev => ({
            ...prev,
            [key]: value,
        }));
    };

    const formatAuditDate = (value) => {
        if (!value) return '-';
        return new Date(value).toLocaleString('ko-KR', {
            year: '2-digit',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getAuditCategoryLabel = (key) => AUDIT_CATEGORY_LABELS[key] || key || '-';

    const getAuditClinicLabel = (clinicId) => {
        const clinic = adminClinics.find(item => item.id === clinicId);
        return clinic?.name || selectedAdminClinic?.name || clinicId || '-';
    };

    const getAuditSubCategoryLabel = (logOrKey) => {
        const log = typeof logOrKey === 'object' && logOrKey !== null ? logOrKey : null;
        const key = log ? log.sub_category : logOrKey;
        const summaryLabel = log?.summary?.subCategoryLabel || log?.summary?.label;
        const metadataLabel = log?.metadata?.subCategoryLabel;

        if (summaryLabel) return summaryLabel;
        if (metadataLabel) return metadataLabel;
        if (log?.metadata?.feature === 'lab_requests') return AUDIT_SUBCATEGORY_LABELS.lab_requests;

        return AUDIT_SUBCATEGORY_LABELS[key] || key || '-';
    };

    const getAuditSummaryText = (log) => {
        if (log.status === 'failed') return log.error_message || '저장 실패';
        const summary = log.summary || {};
        if (summary.mergeExisting) return '기존 데이터 병합 저장';
        return '데이터 저장 완료';
    };

    return (
        <div className="admin-container">
            <div className="page-header admin-page-header">
                <div>
                    <h1>관리자 패널</h1>
                    <p>시스템 설정 및 데이터 관리를 담당하는 공간입니다.</p>
                </div>
                <button className="admin-logout-btn" onClick={handleAdminLogout}>
                    <LogOut size={17} />
                    <span>관리자 로그아웃</span>
                </button>
            </div>

            <section className="admin-clinic-selector">
                <div>
                    <h2>업로드 대상 치과</h2>
                    <p>
                        관리자 모드에서 업로드할 데이터를 저장할 치과를 선택하세요.
                        {selectedAdminClinic ? ` 현재 선택: ${selectedAdminClinic.name}` : ''}
                    </p>
                </div>
                <label className="admin-clinic-select-field">
                    <span>치과 선택</span>
                    <select
                        value={selectedAdminClinicId}
                        onChange={handleAdminClinicChange}
                        disabled={clinicSelectLoading || adminClinics.length === 0}
                    >
                        {clinicSelectLoading && <option value="">치과 목록 불러오는 중...</option>}
                        {!clinicSelectLoading && adminClinics.length === 0 && <option value="">등록된 치과 없음</option>}
                        {!clinicSelectLoading && adminClinics.map(item => (
                            <option key={item.id} value={item.id}>
                                {item.name}{item.code ? ` (${item.code})` : ''}
                            </option>
                        ))}
                    </select>
                </label>
                {clinicSelectError && (
                    <div className="admin-clinic-error">
                        치과 목록을 불러오지 못했습니다: {clinicSelectError}
                    </div>
                )}
            </section>

            <div className="admin-panel-tabs">
                <button
                    type="button"
                    className={`admin-panel-tab ${adminPanelTab === 'upload' ? 'active' : ''}`}
                    onClick={() => setAdminPanelTab('upload')}
                >
                    파일 업로드 / PDF
                </button>
                <button
                    type="button"
                    className={`admin-panel-tab ${adminPanelTab === 'implantTypes' ? 'active' : ''}`}
                    onClick={() => setAdminPanelTab('implantTypes')}
                >
                    임플란트 종류
                </button>
                <button
                    type="button"
                    className={`admin-panel-tab ${adminPanelTab === 'history' ? 'active' : ''}`}
                    onClick={() => setAdminPanelTab('history')}
                >
                    업로드 / 수정 이력
                </button>
            </div>

            {ocrProcessingFile && (
                <div className="admin-loading-overlay">
                    <div className="admin-loading-dialog">
                        <div className="admin-loading-title">분석 중</div>
                        <div className="admin-loading-file">{ocrProcessingFile}</div>
                        <div className="admin-loading-bar">
                            <div className="admin-loading-bar-fill" />
                        </div>
                    </div>
                </div>
            )}

            {pendingClinicUpload && (
                <div className="admin-upload-confirm-backdrop" onClick={cancelClinicUploadConfirmation}>
                    <div className="admin-upload-confirm-modal" onClick={event => event.stopPropagation()}>
                        <div className="admin-upload-confirm-header">
                            <div>
                                <h3>업로드 대상 치과 확인</h3>
                                <p>아래 치과에 파일 데이터가 저장됩니다. 치과명이 맞는지 확인해 주세요.</p>
                            </div>
                            <button type="button" className="admin-upload-confirm-close" onClick={cancelClinicUploadConfirmation}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="admin-upload-confirm-clinic">
                            <span>선택 치과</span>
                            <strong>{pendingClinicUpload.clinicName}</strong>
                            {pendingClinicUpload.clinicCode && <small>{pendingClinicUpload.clinicCode}</small>}
                        </div>

                        <div className="admin-upload-confirm-files">
                            <div className="admin-upload-confirm-files-title">
                                <span>업로드 파일</span>
                                <strong>{pendingClinicUpload.files.length}개</strong>
                            </div>
                            <ul>
                                {pendingClinicUpload.files.map((file, index) => (
                                    <li key={`${file.name}-${index}`}>
                                        <FileSpreadsheet size={16} />
                                        <span>{file.name}</span>
                                        <small>{formatUploadFileSize(file.size)}</small>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="admin-upload-confirm-actions">
                            <button type="button" className="admin-upload-confirm-cancel" onClick={cancelClinicUploadConfirmation}>
                                취소
                            </button>
                            <button type="button" className="admin-upload-confirm-submit" onClick={confirmClinicUpload}>
                                이 치과에 업로드
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {pendingConsultationBundle && (
                <div style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, padding: '1rem',
                }}>
                    <div style={{
                        background: 'var(--card-bg)', borderRadius: '1.2rem',
                        boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
                        width: '100%', maxWidth: '1180px',
                        maxHeight: '90vh', overflowY: 'auto', padding: '2rem',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.2rem' }}>
                            <div>
                                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                                    상담현황 MD 파싱 결과
                                </h2>
                                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                    {pendingConsultationBundle.fileName} · 확인/수정 후 승인하면 상담분석에 반영됩니다.
                                </p>
                            </div>
                            <button onClick={() => setPendingConsultationBundle(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                <X size={22} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>대상 연월</span>
                            <select
                                value={pendingConsultationBundle.overall.year || '2026'}
                                onChange={e => setPendingConsultationBundle(prev => prev ? {
                                    ...prev,
                                    overall: { ...prev.overall, year: e.target.value },
                                    consultant: { ...prev.consultant, year: e.target.value },
                                    rejected: { ...prev.rejected, year: e.target.value },
                                } : prev)}
                                style={selectStyle}
                            >
                                {YEARS.map(y => <option key={y} value={y}>{y}년</option>)}
                            </select>
                            <select
                                value={pendingConsultationBundle.overall.month || '1월'}
                                onChange={e => setPendingConsultationBundle(prev => prev ? {
                                    ...prev,
                                    overall: { ...prev.overall, month: e.target.value },
                                    consultant: { ...prev.consultant, month: e.target.value },
                                    rejected: { ...prev.rejected, month: e.target.value },
                                } : prev)}
                                style={selectStyle}
                            >
                                {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                의사 {pendingConsultationBundle.overall.doctorDiagnoses?.length || 0}명 · 상담자 {pendingConsultationBundle.consultant.rows?.length || 0}명 · 미동의 {pendingConsultationBundle.rejected.rows?.length || 0}명
                            </span>
                        </div>

                        <div style={{ marginBottom: '1rem', padding: '0.8rem 1rem', borderRadius: '0.7rem', background: 'rgba(59,130,246,0.08)', color: 'var(--text-primary)', fontSize: '0.88rem', lineHeight: 1.6 }}>
                            아래 값은 아직 저장되지 않았습니다. 숫자나 이름을 수정한 뒤 <strong>승인 후 반영</strong>을 누르면 상담분석에 입력됩니다.
                        </div>

                        <section style={{ marginTop: '1rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>전체 동의율</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                                {CONSULTATION_OCR_FIELDS.map(({ key, label, unit }) => (
                                    <label key={key} style={{ display: 'grid', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                        {label}
                                        <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
                                            <input
                                                type="number"
                                                value={pendingConsultationBundle.overall[key] ?? ''}
                                                onChange={e => updatePendingConsultationOverall(key, e.target.value)}
                                                style={inputStyle}
                                            />
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{unit}</span>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </section>

                        <section style={{ marginTop: '1.4rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>의사별 진단수 / 동의금액</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
                                {[...(pendingConsultationBundle.overall.doctorDiagnoses || []), { name: '', count: '', agreedAmount: '' }]
                                    .slice(0, Math.max((pendingConsultationBundle.overall.doctorDiagnoses || []).length + 1, 4))
                                    .map((doctor, index) => (
                                        <div key={index} style={{ border: '1px solid var(--border-color)', borderRadius: '0.65rem', background: 'var(--bg-color)', padding: '0.75rem', display: 'grid', gap: '0.55rem', minWidth: 0, overflow: 'hidden' }}>
                                            <input
                                                type="text"
                                                value={doctor.name || ''}
                                                onChange={e => updatePendingConsultationDoctor(index, 'name', e.target.value)}
                                                style={{ ...inputStyle, width: '100%', minWidth: 0, boxSizing: 'border-box' }}
                                                placeholder="의사 이름"
                                            />
                                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.7fr) minmax(0, 1.3fr)', gap: '0.5rem', minWidth: 0 }}>
                                                <input
                                                    type="number"
                                                    value={doctor.count ?? ''}
                                                    onChange={e => updatePendingConsultationDoctor(index, 'count', e.target.value)}
                                                    style={{ ...inputStyle, width: '100%', minWidth: 0, boxSizing: 'border-box' }}
                                                    placeholder="진단수"
                                                />
                                                <input
                                                    type="number"
                                                    value={doctor.agreedAmount ?? ''}
                                                    onChange={e => updatePendingConsultationDoctor(index, 'agreedAmount', e.target.value)}
                                                    style={{ ...inputStyle, width: '100%', minWidth: 0, boxSizing: 'border-box' }}
                                                    placeholder="동의금액"
                                                />
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </section>

                        <section style={{ marginTop: '1.4rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>상담자별 동의율</h3>
                            <div className="table-responsive" style={{ maxHeight: 280, overflowY: 'auto' }}>
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>상담자</th>
                                            <th>환자수</th>
                                            <th>총 동의수</th>
                                            <th>미동의</th>
                                            <th>상담금액</th>
                                            <th>동의금액</th>
                                            <th>금액대비 동의율</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(pendingConsultationBundle.consultant.rows || []).map((row, index) => (
                                            <tr key={`${row.name}-${index}`}>
                                                <td><input value={row.name || ''} onChange={e => updatePendingConsultantRow(index, 'name', e.target.value)} style={inputStyle} /></td>
                                                <td><input type="number" value={row.patientCount ?? ''} onChange={e => updatePendingConsultantRow(index, 'patientCount', e.target.value)} style={inputStyle} /></td>
                                                <td><input type="number" value={row.totalAgreed ?? ''} onChange={e => updatePendingConsultantRow(index, 'totalAgreed', e.target.value)} style={inputStyle} /></td>
                                                <td><input type="number" value={row.rejected ?? ''} onChange={e => updatePendingConsultantRow(index, 'rejected', e.target.value)} style={inputStyle} /></td>
                                                <td><input type="number" value={row.consultationAmount ?? ''} onChange={e => updatePendingConsultantRow(index, 'consultationAmount', e.target.value)} style={inputStyle} /></td>
                                                <td><input type="number" value={row.agreedAmount ?? ''} onChange={e => updatePendingConsultantRow(index, 'agreedAmount', e.target.value)} style={inputStyle} /></td>
                                                <td><input type="number" value={row.amountAgreementRate ?? ''} onChange={e => updatePendingConsultantRow(index, 'amountAgreementRate', e.target.value)} style={inputStyle} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <section style={{ marginTop: '1.4rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>미동의 환자 현황</h3>
                            <div className="table-responsive" style={{ maxHeight: 320, overflowY: 'auto' }}>
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>담당 Dr</th>
                                            <th>신환</th>
                                            <th>구환</th>
                                            <th>환자성함</th>
                                            <th>내원날짜</th>
                                            <th>상담자</th>
                                            <th>미동의사유</th>
                                            <th>비동의금액</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(pendingConsultationBundle.rejected.rows || []).map((row, index) => (
                                            <tr key={`${row.patientName}-${index}`}>
                                                <td><input value={row.doctor || ''} onChange={e => updatePendingRejectedRow(index, 'doctor', e.target.value)} style={inputStyle} /></td>
                                                <td><input value={row.newPatient || ''} onChange={e => updatePendingRejectedRow(index, 'newPatient', e.target.value)} style={inputStyle} /></td>
                                                <td><input value={row.oldPatient || ''} onChange={e => updatePendingRejectedRow(index, 'oldPatient', e.target.value)} style={inputStyle} /></td>
                                                <td><input value={row.patientName || ''} onChange={e => updatePendingRejectedRow(index, 'patientName', e.target.value)} style={inputStyle} /></td>
                                                <td><input value={row.visitDate || ''} onChange={e => updatePendingRejectedRow(index, 'visitDate', e.target.value)} style={inputStyle} /></td>
                                                <td><input value={row.consultant || ''} onChange={e => updatePendingRejectedRow(index, 'consultant', e.target.value)} style={inputStyle} /></td>
                                                <td><input value={row.reason || ''} onChange={e => updatePendingRejectedRow(index, 'reason', e.target.value)} style={inputStyle} /></td>
                                                <td><input type="number" value={row.rejectedAmount ?? ''} onChange={e => updatePendingRejectedRow(index, 'rejectedAmount', e.target.value)} style={inputStyle} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                            <button onClick={() => setPendingConsultationBundle(null)} style={cancelBtnStyle}>취소</button>
                            <button onClick={handleApproveConsultationBundle} style={saveBtnStyle}>승인 후 반영</button>
                        </div>
                    </div>
                </div>
            )}

            {pendingNewPatientUploads.length > 0 && (
                <div style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, padding: '1rem',
                }}>
                    <div style={{
                        background: 'var(--card-bg)', borderRadius: '1.2rem',
                        boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
                        width: '100%', maxWidth: '960px',
                        maxHeight: '90vh', overflowY: 'auto', padding: '2rem',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div>
                                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    신환분석 업로드 파싱 결과
                                </h2>
                                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                    {pendingNewPatientUploads.length}개 파일 · 승인하면 모두 순서대로 반영됩니다.
                                </p>
                            </div>
                            <button onClick={() => setPendingNewPatientUploads([])}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                <X size={22} />
                            </button>
                        </div>

                        <div style={{ marginBottom: '1rem', padding: '0.8rem 1rem', borderRadius: '0.7rem', background: 'rgba(59,130,246,0.08)', color: 'var(--text-primary)', fontSize: '0.88rem', lineHeight: 1.6 }}>
                            승인하면 <strong>신환 내원경로 상세 데이터</strong>, <strong>내원 경로별 치료 이행율 상세 데이터</strong>,
                            <strong>내원경로별 1인당 평균 진료비 상세 데이터</strong>에 아래 값이 반영됩니다.
                        </div>

                        {pendingNewPatientUploads.map((upload, uploadIndex) => (
                            <div key={upload.id} style={{ marginTop: uploadIndex === 0 ? 0 : '1.25rem', paddingTop: uploadIndex === 0 ? 0 : '1.25rem', borderTop: uploadIndex === 0 ? 'none' : '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                                    <strong style={{ color: 'var(--text-primary)' }}>
                                        {uploadIndex + 1}. {upload.fileName}
                                    </strong>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                                        {upload.year}년 {upload.month}
                                    </span>
                                </div>

                                {upload.rows.length > 0 && (
                                    <div className="table-responsive">
                                        <table className="admin-table">
                                            <thead>
                                                <tr>
                                                    <th>내원경로</th>
                                                    <th>신환수</th>
                                                    <th>구환수</th>
                                                    <th>총 내원환자수</th>
                                                    <th>총 진료비</th>
                                                    <th>평균 진료비</th>
                                                    <th>보험환자</th>
                                                    <th>비보험환자</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {upload.rows.map(row => (
                                                    <tr key={`${upload.id}-${row.path}`}>
                                                        <td>{row.path}</td>
                                                        <td>{row.newPatient.toLocaleString()}명</td>
                                                        <td>{Number(row.oldPatient || 0).toLocaleString()}명</td>
                                                        <td>{Number(row.visitPatient || Number(row.oldPatient || 0) + Number(row.newPatient || 0)).toLocaleString()}명</td>
                                                        <td>{Math.round(row.totalFee || 0).toLocaleString()}원</td>
                                                        <td>{Math.round(row.avgFee || 0).toLocaleString()}원</td>
                                                        <td>{Math.round(row.insurancePatients || 0).toLocaleString()}명</td>
                                                        <td>{Math.round(row.nonInsurancePatients || 0).toLocaleString()}명</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {upload.insuranceRatios && Object.keys(upload.insuranceRatios).length > 0 && (
                                    <div className="table-responsive" style={{ marginTop: '1rem' }}>
                                        <table className="admin-table">
                                            <thead>
                                                <tr>
                                                    <th>내원경로</th>
                                                    <th>보험 항목 비율</th>
                                                    <th>비보험 항목 비율</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {Object.entries(upload.insuranceRatios).map(([path, ratio]) => (
                                                    <tr key={`${upload.id}-${path}`}>
                                                        <td>{path}</td>
                                                        <td>{Number(ratio || 0).toFixed(1)}%</td>
                                                        <td>{Number(
                                                            upload.nonInsuranceRatios?.[path] ?? Math.max(0, 100 - Number(ratio || 0))
                                                        ).toFixed(1)}%</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {upload.summary && (upload.summary.total || upload.summary.average) && (
                                    <div className="table-responsive" style={{ marginTop: '1rem' }}>
                                        <table className="admin-table">
                                            <thead>
                                                <tr>
                                                    <th>구분</th>
                                                    <th>내원환자수</th>
                                                    <th>구환수</th>
                                                    <th>신환수</th>
                                                    <th>총내원횟수</th>
                                                    <th>총 진료비</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {[
                                                    ['합계', upload.summary.total],
                                                    ['평균', upload.summary.average],
                                                ].map(([label, values]) => (
                                                    <tr key={`${upload.id}-${label}`}>
                                                        <td>{label}</td>
                                                        <td>{Math.round(values?.visitPatients || 0).toLocaleString()}명</td>
                                                        <td>{Math.round(values?.oldPatients || 0).toLocaleString()}명</td>
                                                        <td>{Math.round(values?.newPatients || 0).toLocaleString()}명</td>
                                                        <td>{Math.round(values?.totalVisits || 0).toLocaleString()}회</td>
                                                        <td>{Math.round(values?.totalFee || 0).toLocaleString()}원</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        ))}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                            <button onClick={() => setPendingNewPatientUploads([])} style={cancelBtnStyle}>취소</button>
                            <button onClick={handleApproveNewPatientUpload} style={saveBtnStyle}>전체 승인 후 반영</button>
                        </div>
                    </div>
                </div>
            )}

            {/* OCR 결과 모달 */}
            {ocrModal && (
                <div style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, padding: '1rem',
                }}>
                    <div style={{
                        background: 'var(--card-bg)', borderRadius: '1.2rem',
                        boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
                        width: '100%', maxWidth: '780px',
                        maxHeight: '90vh', overflowY: 'auto', padding: '2rem',
                    }}>
                        {/* 모달 헤더 */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <div>
                                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    📄 {ocrModal.type === 'consultationOverall' ? '전체동의율 OCR 분석 결과' : '월간장부 OCR 분석 결과'}
                                </h2>
                                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{ocrModal.file.name}</p>
                            </div>
                            <button onClick={() => setOcrModal(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                <X size={22} />
                            </button>
                        </div>

                        {/* 프로그레스바 */}
                        {ocrModal.status === 'loading' && (
                            <div style={{ marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>⏳ OCR 분석 중...</span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-primary)' }}>{ocrModal.ocrProgress}%</span>
                                </div>
                                <div style={{ background: 'var(--border-color)', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${ocrModal.ocrProgress}%`, height: '100%',
                                        background: 'var(--accent-primary)', borderRadius: '999px', transition: 'width 0.3s',
                                    }} />
                                </div>
                            </div>
                        )}

                        {/* 연/월 선택 */}
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>대상 연월:</span>
                            {!ocrModal.yearMonthDetected && (
                                <span style={{ fontSize: '0.78rem', color: '#f59e0b', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.4rem', padding: '0.2rem 0.5rem' }}>
                                    ⚠️ 파일명에서 연월 감지 실패 — 직접 선택해 주세요.
                                </span>
                            )}
                            <select value={ocrModal.yearMonth?.year || getCurrentYearString()}
                                onChange={e => setOcrModal(prev => prev ? { ...prev, yearMonth: { ...prev.yearMonth, year: e.target.value } } : prev)}
                                style={selectStyle}>
                                {YEARS.map(y => <option key={y} value={y}>{y}년</option>)}
                            </select>
                            <select value={ocrModal.yearMonth?.month || '1월'}
                                onChange={e => setOcrModal(prev => prev ? { ...prev, yearMonth: { ...prev.yearMonth, month: e.target.value } } : prev)}
                                style={selectStyle}>
                                {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>

                        {/* 미리보기 + 수치 편집 */}
                        <div style={{ display: 'flex', gap: '1.5rem' }}>
                            <div style={{ flexShrink: 0, width: '220px' }}>
                                <img src={ocrModal.previewUrl} alt={ocrModal.type === 'consultationOverall' ? '전체동의율' : '월간장부'}
                                    style={{ width: '100%', borderRadius: '0.6rem', border: '1px solid var(--border-color)', objectFit: 'contain', maxHeight: '300px' }} />
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {(ocrModal.type === 'consultationOverall' ? CONSULTATION_OCR_FIELDS : OCR_FIELDS).map(({ key, label, unit, readOnly }) => {
                                    const isEmpty = !readOnly && (ocrModal.parsedData[key] === '' || ocrModal.parsedData[key] == null);
                                    return (
                                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <label style={{ width: '140px', flexShrink: 0, fontSize: '0.85rem', fontWeight: 600, color: readOnly ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                                                {label}
                                                {readOnly && <span style={{ fontSize: '0.7rem', marginLeft: '4px', color: '#94a3b8' }}>(자동)</span>}
                                            </label>
                                            <input type="number" value={ocrModal.parsedData[key]}
                                                readOnly={readOnly}
                                                onChange={e => !readOnly && handleOcrFieldChange(key, e.target.value)}
                                                style={{
                                                    ...inputStyle,
                                                    background: readOnly ? 'var(--bg-color)' : undefined,
                                                    borderColor: isEmpty ? '#f59e0b' : undefined,
                                                    boxShadow: isEmpty ? '0 0 0 2px #fde68a55' : undefined,
                                                }}
                                                placeholder="미감지 — 직접 입력" />
                                            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', flexShrink: 0 }}>{unit}</span>
                                        </div>
                                    );
                                })}
                                {ocrModal.type === 'consultationOverall' && (
                                    <div style={{ marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.6rem' }}>
                                            의사별 진단수
                                        </div>
                                        {[0, 1, 2, 3].map(index => {
                                            const doctor = (ocrModal.doctorDiagnoses || [])[index] || { name: '', count: '', agreedAmount: '' };
                                            return (
                                                <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.55rem' }}>
                                                    <input
                                                        type="text"
                                                        value={doctor.name || ''}
                                                        onChange={e => handleConsultationDoctorChange(index, 'name', e.target.value)}
                                                        style={{ ...inputStyle, flex: '1 1 0' }}
                                                        placeholder="의사 이름"
                                                    />
                                                    <input
                                                        type="number"
                                                        value={doctor.count ?? ''}
                                                        onChange={e => handleConsultationDoctorChange(index, 'count', e.target.value)}
                                                        style={{ ...inputStyle, flex: '0 0 110px' }}
                                                        placeholder="진단수"
                                                    />
                                                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>건</span>
                                                    <input
                                                        type="number"
                                                        value={doctor.agreedAmount ?? ''}
                                                        onChange={e => handleConsultationDoctorChange(index, 'agreedAmount', e.target.value)}
                                                        style={{ ...inputStyle, flex: '0 0 150px' }}
                                                        placeholder="동의금액"
                                                    />
                                                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>원</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 빈 값 경고 */}
                        {(() => {
                            const keyFields = ocrModal.type === 'consultationOverall'
                                ? ['totalConsultations', 'agreedCount', 'partialCount', 'newPatients', 'oldPatients', 'totalPatients', 'diagnosisAmount', 'consultationAmount', 'agreedAmount']
                                : ['workDays', 'newPt', 'oldPt', 'totalVisits'];
                            const emptyCount = keyFields.filter(k => ocrModal.parsedData[k] === '' || ocrModal.parsedData[k] == null).length;
                            if (emptyCount === 0) return null;
                            return (
                                <div style={{
                                    marginTop: '1rem', padding: '0.75rem 1rem',
                                    background: '#fffbeb', border: '1px solid #fde68a',
                                    borderRadius: '0.6rem', fontSize: '0.82rem', color: '#92400e',
                                }}>
                                    ⚠️ <strong>OCR이 {emptyCount}개 항목을 읽지 못했습니다.</strong>{' '}
                                    노란 테두리 항목을 <strong>직접 숫자로 입력</strong>해 주세요.
                                    값이 없는 항목은 저장되지 않습니다.
                                </div>
                            );
                        })()}

                        {/* 버튼열 */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '2rem' }}>
                            <button onClick={() => setOcrModal(null)} style={cancelBtnStyle}>취소</button>
                            <button onClick={handleOcrSave}
                                disabled={ocrModal.status === 'loading'}
                                style={{ ...saveBtnStyle, opacity: ocrModal.status === 'loading' ? 0.5 : 1, cursor: ocrModal.status === 'loading' ? 'not-allowed' : 'pointer' }}>
                                {ocrModal.type === 'consultationOverall' ? '상담분석에 저장' : '환자분석에 저장'}
                            </button>
                        </div>

                    </div>
                </div>
            )}

            {adminPanelTab === 'upload' && (
            <div className="admin-grid">

                {/* PDF 보고서 다운로드 */}
                <div className="admin-card">
                    <div className="admin-card-header">
                        <FileDown size={24} className="admin-card-icon" />
                        <h2>PDF 보고서 다운로드</h2>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', marginBottom: '1rem' }}>
                        카테고리별 업로드 데이터를 PDF용 보고서로 정리합니다. 새 창의 인쇄 화면에서 PDF로 저장할 수 있습니다.
                    </p>
                    <div style={{ display: 'grid', gap: '0.85rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: reportMode === 'single' ? '160px minmax(180px, 1fr) minmax(180px, 1fr)' : '160px minmax(360px, 1fr)', gap: '0.75rem', alignItems: 'end' }}>
                        <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', alignSelf: 'end' }}>
                            보고서
                            <select value={reportMode} onChange={e => setReportMode(e.target.value)} style={selectStyle}>
                                <option value="single">단일</option>
                                <option value="bundle">통합</option>
                            </select>
                        </label>
                        {reportMode === 'single' ? (
                            <>
                                <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', alignSelf: 'end' }}>
                                    카테고리
                                    <select value={reportCategory} onChange={e => { setReportCategory(e.target.value); setReportSubTab('all'); }} style={selectStyle}>
                                        {REPORT_CATEGORIES.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
                                    </select>
                                </label>
                                <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', alignSelf: 'end' }}>
                                    세부 탭
                                    <select value={reportSubTab} onChange={e => setReportSubTab(e.target.value)} style={selectStyle}>
                                        {reportSubTabs.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
                                    </select>
                                </label>
                            </>
                        ) : (
                            <div style={{ minWidth: 360, display: 'grid', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                포함 카테고리
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                                    gap: '0.35rem',
                                    padding: '0.45rem 0.6rem',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '0.4rem',
                                    background: 'var(--card-bg)',
                                }}>
                                    {REPORT_CATEGORIES.map(item => (
                                        <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.76rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                            <input
                                                type="checkbox"
                                                checked={reportBundleCategories.includes(item.key)}
                                                onChange={e => {
                                                    setReportBundleCategories(prev => e.target.checked
                                                        ? Array.from(new Set([...prev, item.key]))
                                                        : prev.filter(key => key !== item.key)
                                                    );
                                                }}
                                            />
                                            {item.label.replace(' 종합 대시보드', '')}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '160px 160px 120px auto', gap: '0.75rem', alignItems: 'end' }}>
                        <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                            연도
                            <select value={reportYear} onChange={e => setReportYear(e.target.value)} style={selectStyle}>
                                {getReportYears().map(year => <option key={year} value={year}>{year}년</option>)}
                            </select>
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                            기간
                            <select value={reportPeriod} onChange={e => setReportPeriod(e.target.value)} style={selectStyle}>
                                {REPORT_PERIODS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
                            </select>
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', opacity: reportPeriod === 'month' ? 1 : 0.45 }}>
                            월
                            <select value={reportMonth} onChange={e => setReportMonth(e.target.value)} disabled={reportPeriod !== 'month'} style={selectStyle}>
                                {MONTHS.map(month => <option key={month} value={month}>{month}</option>)}
                            </select>
                        </label>
                        <button onClick={handleDownloadReportPdf} style={{ ...saveBtnStyle, minWidth: 142, height: 38, padding: '0 1rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', justifyContent: 'center', whiteSpace: 'nowrap', lineHeight: 1 }}>
                            <FileDown size={16} />
                            PDF 다운로드
                        </button>
                        </div>
                    </div>
                </div>

                {/* 파일 업로드 */}
                <div className="admin-card file-upload">
                    <div className="admin-card-header">
                        <Upload size={24} className="admin-card-icon" />
                        <h2>파일 업로드</h2>
                    </div>
                    <div
                        className={`upload-area${isDragOver ? ' drag-over' : ''}`}
                        onClick={triggerFileInput}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <FileSpreadsheet size={48} className="upload-icon" />
                        <h3>파일을 여기로 드래그하거나 클릭하여 업로드하세요</h3>
                        <p>.xlsx, .xls, .csv, .md, .jpg, .jpeg, .png, .gif, .webp 지원</p>
                        <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            💡 엑셀/MD/사진 업로드를 한 곳에서 처리합니다.
                        </p>
                        <input
                            type="file"
                            multiple
                            ref={fileInputRef}
                            onChange={(e) => { requestClinicUploadConfirmation(e.target.files); e.target.value = ''; }}
                            accept=".xlsx,.xls,.csv,.md,text/markdown,image/*"
                            style={{ display: 'none' }}
                        />
                    </div>
                    {uploadLog.length > 0 && (
                        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {uploadLog.map((log) => {
                                const tone = log.type === 'success'
                                    ? { bg: '#f0fdf4', border: '#86efac', color: '#15803d', icon: CheckCircle }
                                    : log.type === 'warning'
                                        ? { bg: '#fffbeb', border: '#fcd34d', color: '#b45309', icon: AlertTriangle }
                                        : { bg: '#fef2f2', border: '#fca5a5', color: '#dc2626', icon: XCircle };
                                const LogIcon = tone.icon;
                                return (
                                <div key={log.id} style={{
                                    display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                                    padding: '0.75rem 1rem', borderRadius: '10px',
                                    background: tone.bg,
                                    border: `1px solid ${tone.border}`,
                                    fontSize: '0.85rem',
                                    color: tone.color,
                                    lineHeight: 1.5,
                                }}>
                                    <LogIcon size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                                    <span>{log.msg}</span>
                                </div>
                                );
                            })}
                        </div>
                    )}
                </div>

            </div>
            )}

            {adminPanelTab === 'implantTypes' && (
                <div className="admin-card admin-implant-types-card">
                    <div className="admin-card-header">
                        <FileSpreadsheet size={24} className="admin-card-icon" />
                        <h2>임플란트 종류 설정</h2>
                    </div>
                    <p className="admin-helper-text">
                        선택한 치과에서 사용하는 임플란트 종류를 입력해 주세요. 엑셀 업로드 시 이 목록과 같은 이름을 찾아 임플란트 수술통계에 반영합니다.
                    </p>
                    <div className="admin-implant-clinic-note">
                        대상 치과: <strong>{selectedAdminClinic?.name || '치과 미선택'}</strong>
                    </div>
                    {implantTypeError && <div className="admin-history-error">{implantTypeError}</div>}
                    {implantTypeSuccess && <div className="admin-implant-success">{implantTypeSuccess}</div>}
                    <div className="admin-implant-type-list">
                        {implantTypeLoading ? (
                            <div className="empty-state">임플란트 종류를 불러오는 중입니다.</div>
                        ) : implantTypeRows.map((row, index) => (
                            <div className="admin-implant-type-row" key={`${row.id || row.name || 'new'}-${index}`}>
                                <span className="admin-implant-type-order">{index + 1}</span>
                                <input
                                    type="text"
                                    value={row.name || ''}
                                    onChange={event => updateImplantTypeRow(index, { name: event.target.value })}
                                    placeholder="예: 오스템, 덴티움, 네오"
                                />
                                <input
                                    type="color"
                                    value={row.color || IMPLANT_TYPE_COLORS[index % IMPLANT_TYPE_COLORS.length]}
                                    onChange={event => updateImplantTypeRow(index, { color: event.target.value })}
                                    aria-label={`${row.name || index + 1} 색상`}
                                />
                                <button
                                    type="button"
                                    className="admin-implant-type-remove"
                                    onClick={() => removeImplantTypeRow(index)}
                                    disabled={implantTypeRows.length <= 1}
                                >
                                    삭제
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="admin-implant-type-actions">
                        <button type="button" onClick={addImplantTypeRow} className="admin-implant-secondary-btn">
                            종류 추가
                        </button>
                        <button type="button" onClick={saveImplantTypeRows} className="admin-implant-primary-btn" disabled={implantTypeSaving || !selectedAdminClinicId}>
                            {implantTypeSaving ? '저장 중...' : '저장'}
                        </button>
                    </div>
                </div>
            )}

            {adminPanelTab === 'history' && (
                <div className="admin-card admin-history-card">
                    <div className="admin-card-header">
                        <FileSpreadsheet size={24} className="admin-card-icon" />
                        <h2>업로드 / 수정 이력</h2>
                    </div>
                    <div className="admin-history-filters">
                        <label>
                            <span>상태</span>
                            <select value={auditFilters.status} onChange={e => handleAuditFilterChange('status', e.target.value)}>
                                <option value="all">전체</option>
                                <option value="success">성공</option>
                                <option value="failed">실패</option>
                            </select>
                        </label>
                        <label>
                            <span>카테고리</span>
                            <select value={auditFilters.category} onChange={e => handleAuditFilterChange('category', e.target.value)}>
                                <option value="all">전체</option>
                                {Object.entries(AUDIT_CATEGORY_LABELS).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                        </label>
                        <label>
                            <span>연도</span>
                            <select value={auditFilters.year} onChange={e => handleAuditFilterChange('year', e.target.value)}>
                                <option value="all">전체</option>
                                {availableReportYears.map(year => <option key={year} value={year}>{year}년</option>)}
                            </select>
                        </label>
                        <label>
                            <span>월</span>
                            <select value={auditFilters.month} onChange={e => handleAuditFilterChange('month', e.target.value)}>
                                <option value="all">전체</option>
                                {MONTHS.map(month => <option key={month} value={month}>{month}</option>)}
                            </select>
                        </label>
                        <button type="button" onClick={() => loadAuditLogList()} disabled={auditLoading}>
                            새로고침
                        </button>
                    </div>
                    {auditError && <div className="admin-history-error">{auditError}</div>}
                    <div className="table-responsive">
                        <table className="admin-table admin-history-table">
                            <thead>
                                <tr>
                                    <th>일시</th>
                                    <th>치과</th>
                                    <th>상태</th>
                                    <th>작업</th>
                                    <th>카테고리</th>
                                    <th>세부 탭</th>
                                    <th>연월</th>
                                    <th>요약</th>
                                    <th>상세</th>
                                </tr>
                            </thead>
                            <tbody>
                                {auditLoading ? (
                                    <tr><td colSpan={9} className="empty-state">이력을 불러오는 중입니다.</td></tr>
                                ) : auditLogs.length === 0 ? (
                                    <tr><td colSpan={9} className="empty-state">등록된 이력이 없습니다.</td></tr>
                                ) : auditLogs.map(log => (
                                    <tr key={log.id}>
                                        <td>{formatAuditDate(log.created_at)}</td>
                                        <td>{getAuditClinicLabel(log.clinic_id)}</td>
                                        <td>
                                            <span className={`admin-history-status ${log.status}`}>
                                                {log.status === 'success' ? '성공' : '실패'}
                                            </span>
                                        </td>
                                        <td>{log.action_type === 'update' ? '수정' : log.action_type === 'upload' ? '업로드' : log.action_type}</td>
                                        <td>{getAuditCategoryLabel(log.category)}</td>
                                        <td>{getAuditSubCategoryLabel(log)}</td>
                                        <td>{log.year ? `${log.year}년 ${log.month ? `${log.month}월` : ''}` : '-'}</td>
                                        <td className="admin-history-summary">{getAuditSummaryText(log)}</td>
                                        <td>
                                            <button type="button" className="admin-history-detail-btn" onClick={() => setSelectedAuditLog(log)}>
                                                보기
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {selectedAuditLog && (
                <div className="admin-history-modal-backdrop" onClick={() => setSelectedAuditLog(null)}>
                    <div className="admin-history-modal" onClick={event => event.stopPropagation()}>
                        <div className="admin-history-modal-header">
                            <div>
                                <h3>이력 상세</h3>
                                <p>{formatAuditDate(selectedAuditLog.created_at)}</p>
                            </div>
                            <button type="button" onClick={() => setSelectedAuditLog(null)}>
                                <X size={20} />
                            </button>
                        </div>
                        <dl className="admin-history-detail-grid">
                            <dt>상태</dt>
                            <dd>{selectedAuditLog.status === 'success' ? '성공' : '실패'}</dd>
                            <dt>치과</dt>
                            <dd>{getAuditClinicLabel(selectedAuditLog.clinic_id)}</dd>
                            <dt>카테고리</dt>
                            <dd>{getAuditCategoryLabel(selectedAuditLog.category)} / {getAuditSubCategoryLabel(selectedAuditLog)}</dd>
                            <dt>연월</dt>
                            <dd>{selectedAuditLog.year || '-'}년 {selectedAuditLog.month || '-'}월</dd>
                            <dt>오류</dt>
                            <dd>{selectedAuditLog.error_message || '-'}</dd>
                        </dl>
                        <pre className="admin-history-json">{JSON.stringify({
                            summary: selectedAuditLog.summary,
                            metadata: selectedAuditLog.metadata,
                        }, null, 2)}</pre>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Admin;
