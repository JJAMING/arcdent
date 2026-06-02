import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Users, Upload, FileSpreadsheet, CheckCircle, XCircle, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import Tesseract from 'tesseract.js';
import { parseImplantExcel } from '../utils/implantExcelParser';
import { parseInsuranceExcel } from '../utils/insuranceExcelParser';
import { parseLedgerImage, saveLedgerData, loadLedgerData, extractYearMonthFromFileName } from '../utils/ledgerImageParser';
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

const YEARS  = ['2023', '2024', '2025', '2026'];
const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const NEW_PATIENT_STORAGE_KEY = 'new_patient_analysis_data';
const CONSULTATION_CONSULTANT_STORAGE_KEY = 'consultation_consultant_data';
const CONSULTATION_REJECTED_STORAGE_KEY = 'consultation_rejected_data';
const AGE_RANGES = ['0대', '10대', '20대', '30대', '40대', '50대', '60대', '70대+'];
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

const isNewPatientAgeDistributionFile = (filename) => (
    /^[12]\d{3}년\d{1,2}월내원환자연령분포/.test(normalizeHeader(filename))
);

const isInsuranceClaimFile = (filename) => (
    /^[12]\d{3}년.*보험청구액/.test(normalizeHeader(filename))
);

const saveInsuranceClaimData = ({ year, rows }) => {
    let store = {};
    try {
        store = JSON.parse(localStorage.getItem('insurance_claim_data') || '{}');
    } catch (e) {
        store = {};
    }

    store[year] = MONTHS.map(month => {
        const found = rows.find(row => row.month === month) || {};
        return {
            month,
            health: Number(found.health || 0),
            medicalAid: Number(found.medicalAid || 0),
            amount: Number(found.amount || 0),
        };
    });

    localStorage.setItem('insurance_claim_data', JSON.stringify(store));
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

const saveInsuranceFeeStatsData = ({ year, month, rows }) => {
    let store = {};
    try {
        store = JSON.parse(localStorage.getItem('insurance_fee_stats_data') || '{}');
    } catch (e) {
        store = {};
    }

    const yearData = Array.isArray(store[year])
        ? store[year]
        : MONTHS.map(item => ({ month: item, fees: [] }));
    const target = yearData.find(item => item.month === month);
    if (!target) throw new Error(`${year}년 ${month} 데이터를 만들 수 없습니다.`);

    target.fees = rows;
    store[year] = yearData;
    localStorage.setItem('insurance_fee_stats_data', JSON.stringify(store));
    window.dispatchEvent(new CustomEvent('insuranceFeeStatsUpdated', { detail: { year, month } }));
};

const parseInsuranceFeeStatsRows = (rows, fileName) => {
    const yearMonth = extractYearMonthFromFileName(fileName);
    if (!yearMonth) {
        throw new Error('파일명에서 연월을 찾을 수 없습니다. 예: 2025년01월보험수가별통계.xlsx');
    }

    let headerIdx = -1;
    let columns = { code: -1, name: -1, patients: -1, visits: -1 };
    for (let i = 0; i < Math.min(rows.length, 60); i++) {
        const row = rows[i] || [];
        const currentColumns = { code: -1, name: -1, patients: -1, visits: -1 };
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
        if (patients <= 0 && visits <= 0) continue;

        const key = `${code}|||${name}`;
        if (!grouped[key]) grouped[key] = { code, name, patients: 0, visits: 0 };
        grouped[key].patients += patients;
        grouped[key].visits += visits;
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

    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const path = String(row[columns.path] || '').trim();
        const normalizedPath = normalizeHeader(path);
        if (['합계', '총합계'].includes(normalizedPath)) {
            summary.total = readSummaryValues(row);
            continue;
        }
        if (['평균', '월평균', '일평균'].includes(normalizedPath)) {
            summary.average = readSummaryValues(row);
            continue;
        }
        if (shouldSkipPath(path)) continue;

        const newPatient = columns.newPatient !== -1 ? parseNumber(row[columns.newPatient]) : 0;
        const totalFee = columns.totalFee !== -1 ? parseNumber(row[columns.totalFee]) : 0;
        const avgFee = columns.avgFee !== -1 ? parseNumber(row[columns.avgFee]) : 0;
        const unitCount = newPatient || 1;

        if (!grouped[path]) {
            grouped[path] = { path, newPatient: 0, totalFee: 0, avgFee: 0, avgFeeCount: 0, insurancePatients: 0, nonInsurancePatients: 0 };
        }

        grouped[path].newPatient += newPatient;
        grouped[path].totalFee += totalFee || (avgFee * newPatient);
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
            if (!targetSheetName) {
                throw new Error('엑셀 파일에서 "내원경로 분포" 시트를 찾을 수 없습니다.');
            }
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[targetSheetName], { header: 1 });
            resolve(parseNewPatientPathRows(rows, file.name));
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
        };
    }
};

const saveNewPatientPathDistribution = ({ year, month, rows = [], summary, insuranceRatios }) => {
    let store = {};
    try {
        store = JSON.parse(localStorage.getItem(NEW_PATIENT_STORAGE_KEY) || '{}');
    } catch (e) {
        store = {};
    }

    const yearData = Array.isArray(store[year]) ? store[year] : createEmptyNewPatientYearData();
    const target = yearData.find(item => item.month === month);
    if (!target) throw new Error(`${year}년 ${month} 데이터를 만들 수 없습니다.`);

    const sources = {};
    const sourceRevenue = {};
    const sourceAvgFee = {};
    const sourceInsurancePatients = {};
    const sourceNonInsurancePatients = {};

    rows.forEach(row => {
        sources[row.path] = row.newPatient;
        sourceRevenue[row.path] = row.totalFee;
        sourceAvgFee[row.path] = row.avgFee;
        sourceInsurancePatients[row.path] = row.insurancePatients;
        sourceNonInsurancePatients[row.path] = row.nonInsurancePatients;
    });

    if (rows.length > 0) {
        Object.assign(target, {
            sources,
            sourceRevenue,
            sourceAvgFee,
            sourceInsurancePatients,
            sourceNonInsurancePatients,
            pathDistributionSummary: summary || {},
        });
    }

    if (insuranceRatios && Object.keys(insuranceRatios).length > 0) {
        target.sourceInsuranceRatios = {
            ...(target.sourceInsuranceRatios || {}),
            ...insuranceRatios,
        };
    }

    store[year] = yearData;
    localStorage.setItem(NEW_PATIENT_STORAGE_KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent('newPatientAnalysisUpdated', { detail: { year, month } }));
};

const saveNewPatientAgeDistribution = ({ year, month, ages }) => {
    let store = {};
    try {
        store = JSON.parse(localStorage.getItem(NEW_PATIENT_STORAGE_KEY) || '{}');
    } catch (e) {
        store = {};
    }

    const yearData = Array.isArray(store[year]) ? store[year] : createEmptyNewPatientYearData();
    const target = yearData.find(item => item.month === month);
    if (!target) throw new Error(`${year}년 ${month} 데이터를 만들 수 없습니다.`);

    target.ages = Object.fromEntries(AGE_RANGES.map(range => [range, Number(ages?.[range] || 0)]));
    store[year] = yearData;
    localStorage.setItem(NEW_PATIENT_STORAGE_KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent('newPatientAnalysisUpdated', { detail: { year, month } }));
};

const Admin = () => {
    const { getAllUsers } = useAuth();
    const [users, setUsers] = useState([]);
    const fileInputRef  = useRef(null);
    const [uploadLog, setUploadLog]       = useState([]);
    const [isDragOver, setIsDragOver]     = useState(false);
    const [pendingNewPatientUploads, setPendingNewPatientUploads] = useState([]);
    const [pendingConsultationBundle, setPendingConsultationBundle] = useState(null);

    // OCR 모달
    const [ocrModal, setOcrModal]   = useState(null);
    const [ocrProcessingFile, setOcrProcessingFile] = useState('');

    useEffect(() => {
        setUsers(getAllUsers());
        localStorage.removeItem('admin_uploaded_images');
    }, []);

    const addLog = (type, msg) => {
        setUploadLog(prev => [...prev, { type, msg, id: Date.now() }]);
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
        }]);
    };

    const handleApproveNewPatientUpload = () => {
        if (pendingNewPatientUploads.length === 0) return;
        let savedCount = 0;
        try {
            pendingNewPatientUploads.forEach(upload => {
                saveNewPatientPathDistribution(upload);
                savedCount += 1;
                addLog('success', `✅ [신환분석] ${upload.year}년 ${upload.month} ${upload.fileName} 반영 완료 (${upload.rows.length}개 경로)`);
            });
            setPendingNewPatientUploads([]);
        } catch (err) {
            addLog('error', `❌ [신환분석 저장 오류] ${savedCount}개 반영 후 중단: ${err.message}`);
        }
    };

    const handleApproveConsultationBundle = () => {
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

    const handleUnifiedUpload = async (files) => {
        const uploadFiles = Array.from(files || []);
        if (uploadFiles.length === 0) return;
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
                    saveConsultationRejectedData(parsed);
                    addLog('success', `✅ [상담분석/미동의 환자 현황] ${parsed.year}년 ${parsed.month} MD 반영 완료 (${parsed.rows.length}명)`);
                } catch (err) {
                    addLog('error', `❌ [상담분석/미동의 환자 현황 MD 파싱 오류] ${file.name}: ${err.message}`);
                }
            } else if (isMarkdown && isConsultationConsultantMarkdownFile(file.name)) {
                try {
                    const text = await file.text();
                    const parsed = parseConsultationConsultantMarkdown(text, file.name);
                    saveConsultationConsultantData(parsed);
                    addLog('success', `✅ [상담분석/상담자별 동의율] ${parsed.year}년 ${parsed.month} MD 반영 완료 (${parsed.rows.length}명)`);
                } catch (err) {
                    addLog('error', `❌ [상담분석/상담자별 동의율 MD 파싱 오류] ${file.name}: ${err.message}`);
                }
            } else if (isMarkdown && isConsultationOverallMarkdownFile(file.name)) {
                try {
                    const text = await file.text();
                    const parsed = parseConsultationOverallMarkdown(text, file.name);
                    saveConsultationOverallData(parsed);
                    addLog('success', `✅ [상담분석/전체동의율] ${parsed.year}년 ${parsed.month} MD 반영 완료`);
                } catch (err) {
                    addLog('error', `❌ [상담분석/전체동의율 MD 파싱 오류] ${file.name}: ${err.message}`);
                }
            } else if (isNewPatientAgeDistributionFile(file.name) && !isImage) {
                try {
                    const parsed = await parseNewPatientAgeExcel(file);
                    saveNewPatientAgeDistribution(parsed);
                    const total = Object.values(parsed.ages || {}).reduce((sum, count) => sum + Number(count || 0), 0);
                    addLog('success', `✅ [신환분석/연령별] ${parsed.year}년 ${parsed.month} 연령별 신환수 반영 완료 (${total.toLocaleString()}명)`);
                } catch (err) {
                    addLog('error', `❌ [신환분석/연령별 파싱 오류] ${file.name}: ${err.message}`);
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

        const savedDataStr = localStorage.getItem('parsed_sales_data');
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

        let salesDataMap = savedDataStr ? JSON.parse(savedDataStr) : { '2025': JSON.parse(JSON.stringify(defaultData)) };
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

                        const extractMonth = (str) => {
                            let m = str.match(/(\d{1,2})월/);
                            if (!m) m = str.match(/[\.\-\/](\d{1,2})(?!\d)/);
                            if (!m) m = str.match(/^(\d{1,2})[\.\-\/]/);
                            return m ? parseInt(m[1]) + '월' : null;
                        };

                        const extractYear = (str) => {
                            let m = str.match(/(20\d{2})년/) || str.match(/(\d{2})년/);
                            if (!m) {
                                const ym = str.match(/(20\d{2})[\.\-\/]/) || str.match(/(\d{2})[\.\-\/]/) || str.match(/^(\d{2})[\.\-\/]/);
                                if (ym) m = ym;
                            }
                            if (m) { const y = m[1]; return y.length === 2 ? '20' + y : y; }
                            return '2025';
                        };

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
                        else if (fileName.includes('치료비용') || fileName.includes('동의') || fileName.includes('치료비')) {
                            const ci = { patientName: -1, chartNo: -1, createdAt: -1, status: -1, payStatus: -1, contractAmount: -1, paidAmount: -1 };
                            let headerIdx = -1;
                            for (let i = 0; i < Math.min(20, rawData.length); i++) {
                                const row = rawData[i] || [];
                                let found = 0;
                                row.forEach((cell, idx) => {
                                    if (cell == null) return;
                                    const s = String(cell).trim().replace(/\s+/g, '');
                                    if (s.includes('환자') || s === '성명' || s === '이름' || s === '환자명') { ci.patientName = idx; found++; }
                                    else if (s.includes('차트') || s.includes('번호') || s.includes('ID')) { ci.chartNo = idx; found++; }
                                    else if (s.includes('작성일') || s.includes('상담일')) { ci.createdAt = idx; found++; }
                                    else if (s.includes('진행상태')) { ci.status = idx; found++; }
                                    else if (s.includes('계약금액') || s.includes('계획금액')) { ci.contractAmount = idx; found++; }
                                    else if (s.includes('현재수납') || s.includes('수납금액')) { ci.paidAmount = idx; found++; }
                                });
                                if (found >= 2) { headerIdx = i; break; }
                            }
                            if (headerIdx !== -1) {
                                const plans = [];
                                for (let i = headerIdx + 1; i < rawData.length; i++) {
                                    const row = rawData[i] || [];
                                    const name = ci.patientName !== -1 ? String(row[ci.patientName] || '').trim() : '';
                                    if (!name || name === '합계') continue;
                                    plans.push({
                                        chartNo: ci.chartNo !== -1 ? String(row[ci.chartNo] || '').trim() : '',
                                        patientName: name, year: yearFromFile, month: monthFromFile,
                                        contractAmount: ci.contractAmount !== -1 ? parseNum(row[ci.contractAmount]) : 0,
                                        paidAmount: ci.paidAmount !== -1 ? parseNum(row[ci.paidAmount]) : 0,
                                        status: ci.status !== -1 ? String(row[ci.status] || '').trim() : '',
                                        createdAt: ci.createdAt !== -1 ? String(row[ci.createdAt] || '').trim() : `${yearFromFile}-${monthFromFile}`,
                                    });
                                }
                                let allPlans = JSON.parse(localStorage.getItem('treatment_plan_data') || '[]');
                                allPlans = allPlans.filter(p => !(String(p.year) === String(yearFromFile) && String(p.month) === String(monthFromFile)));
                                allPlans = [...allPlans, ...plans];
                                localStorage.setItem('treatment_plan_data', JSON.stringify(allPlans));
                                updatedCount++; resolve();
                            } else { reject(`파일 내 헤더를 찾을 수 없습니다. (${fileName})`); }
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
                                const existingLedger = loadLedgerData()?.[yearFromFile]?.[month] || {};
                                saveLedgerData(yearFromFile, month, { ...existingLedger, doctorPatients });
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

                            let existingTop = [];
                            try {
                                existingTop = JSON.parse(localStorage.getItem('top_patients_raw_data') || '[]');
                                if (!Array.isArray(existingTop)) existingTop = [];
                            } catch {
                                existingTop = [];
                            }
                            const filteredTop = existingTop.filter(p => !(String(p.year) === String(yearFromFile) && String(p.month) === String(monthFromFile)));
                            localStorage.setItem('top_patients_raw_data', JSON.stringify([...filteredTop, ...topPatients]));
                            window.dispatchEvent(new StorageEvent('storage', { key: 'top_patients_raw_data' }));
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
                            addLog('success', `✅ [신환수익] ${yearFromFile}년 ${monthFromFile} 업로드 완료 (신환 ${newPatientTotal.toLocaleString()}명 / 신환 매출 ${newPatientSalesTotal.toLocaleString()}원)`);
                            updatedCount++;
                            resolve('newPatientRevenue');
                        }
                        // 보험청구액 → 보험청구분석
                        else if (isInsuranceClaimFile(fileName)) {
                            try {
                                const parsed = await parseInsuranceClaimExcel(file);
                                saveInsuranceClaimData(parsed);
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
                            const existingLedger = loadLedgerData()?.[yearFromFile]?.[month] || {};
                            saveLedgerData(yearFromFile, month, { ...existingLedger, labRequests: Object.values(labRequests) });
                            window.dispatchEvent(new CustomEvent('patientLedgerUpdated', {
                                detail: { year: yearFromFile, month }
                            }));
                            addLog('success', `✅ [기공물 의뢰] ${yearFromFile}년 ${month} 업로드 완료 (${Object.keys(labRequests).length}종)`);
                            updatedCount++;
                            resolve('labRequests');
                        }
                        // 월간장부 (엑셀 버전)
                        else if (fileName.includes('월간장부')) {
                            const month = extractMonth(fileName);
                            let cashVal = 0, cardVal = 0, otherVal = 0, insuranceVal = 0;
                            let cashCol = -1, cardCol = -1, otherCol = -1, insuranceCol = -1, tonghapIdx = -1;
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
                            const findMetric = (labels) => {
                                for (let r = 0; r < rawData.length; r++) {
                                    const row = rawData[r] || [];
                                    for (let c = 0; c < row.length; c++) {
                                        const cellText = String(row[c] ?? '').replace(/\s+/g, '');
                                        if (!cellText || !labels.some(label => cellText.includes(label))) continue;
                                        if (labels.includes('총내원') && cellText.includes('총내원횟수')) continue;

                                        const sameCellValue = parseMaybeNum(String(row[c]).replace(/[^\d.,-]/g, ''));
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
                                    const t = String(cell).replace(/\s+/g, '');
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
                                if ((rawData[r] || []).some(c => String(c).includes(month) && (String(c).includes('합계') || String(c).includes('통합')))) {
                                    tonghapIdx = r; break;
                                }
                            }
                            if (tonghapIdx !== -1) {
                                if (cashCol !== -1) cashVal = parseNum(rawData[tonghapIdx][cashCol]);
                                if (cardCol !== -1) cardVal = parseNum(rawData[tonghapIdx][cardCol]);
                                if (otherCol !== -1) otherVal = parseNum(rawData[tonghapIdx][otherCol]);
                                if (insuranceCol !== -1) insuranceVal = parseNum(rawData[tonghapIdx][insuranceCol]);
                            }
                            if (!cashVal) {
                                cashVal = findMetric(['현금수입', '현금']) || 0;
                            }
                            if (!cardVal) {
                                cardVal = findMetric(['카드수입', '카드']) || 0;
                            }
                            if (!insuranceVal) {
                                insuranceVal = findMetric(['공단부담(청구액)', '공단부담청구액', '공단부담', '보험청구']) || 0;
                            }
                            const d = currentYearData.find(item => item.month === month);
                            if (d) {
                                d.cash = cashVal; d.card = cardVal; d.other = otherVal; d.insurance = insuranceVal;
                                d.netSales = cashVal + cardVal + otherVal;
                                d.total = d.netSales + insuranceVal;

                                const patientLedger = {
                                    workDays: findMetric(['진료일수', '진료일', '영업일수']),
                                    newPt: findMetric(['신환', '신규환자', '새환자']),
                                    oldPt: findMetric(['구환', '재진환자', '기존환자']),
                                    total: findMetric(['총내원', '총접수', '내원합계']),
                                    avgNewPt: findMetric(['일평균신환', '신환일평균', '평균신환']),
                                    avgOldPt: null,
                                };
                                if ((patientLedger.newPt || patientLedger.oldPt) && patientLedger.workDays) {
                                    patientLedger.avgOldPt = parseFloat((((patientLedger.newPt || 0) + (patientLedger.oldPt || 0)) / patientLedger.workDays).toFixed(1));
                                }
                                const detectedLedger = Object.fromEntries(
                                    Object.entries(patientLedger).filter(([, value]) => value != null)
                                );
                                if (Object.keys(detectedLedger).length > 0) {
                                    const existingLedger = loadLedgerData()?.[yearFromFile]?.[month] || {};
                                    saveLedgerData(yearFromFile, month, { ...existingLedger, ...detectedLedger });
                                    window.dispatchEvent(new CustomEvent('patientLedgerUpdated', {
                                        detail: { year: yearFromFile, month }
                                    }));
                                }
                                updatedCount++; resolve();
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
                        const result = await parseImplantExcel(file);
                        addLog('success', `✅ [임플란트] ${result.year}년 ${result.month} 업로드 완료 (오스템 ${result.data.osstem}개 / 덴티움 ${result.data.dentium}개 / 합계 ${result.data.implantTotal}개)`);
                        updatedCount++;
                    } catch (implantErr) { addLog('error', `❌ [임플란트] ${file.name}: ${implantErr.message}`); }
                } else if (flag === 'insurance') {
                    try {
                        const result = await parseInsuranceExcel(file);
                        addLog('success', `✅ [보험수가] ${result.year}년 ${result.month} 업로드 완료\n임플 1단계:${result.data.insImpStep1} / 2단계:${result.data.insImpStep2} / 3단계:${result.data.insImpStep3}\n틀니 1단계:${result.data.insDentStep1} / 5단계:${result.data.insDentStep5} / 6단계:${result.data.insDentStep6}`);
                        updatedCount++;
                    } catch (insErr) { addLog('error', `❌ [보험수가] ${file.name}: ${insErr.message}`); }
                    try {
                        const feeStats = await parseInsuranceFeeStatsExcel(file);
                        saveInsuranceFeeStatsData(feeStats);
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
                } else {
                    updatedCount++;
                    addLog('success', `✅ ${file.name} 처리 완료`);
                }
            } catch (err) {
                addLog('error', `❌ ${file.name}: ${err}`);
                console.error(err);
            }
        }

        if (updatedCount > 0) {
            localStorage.setItem('parsed_sales_data', JSON.stringify(salesDataMap));
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
        const rawYear = yearMatch ? Number(yearMatch[1]) : 2025;
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
        const saved = JSON.parse(localStorage.getItem('consultation_overall_data') || '{}');
        if (!saved[parsed.year]) saved[parsed.year] = {};
        saved[parsed.year][parsed.month] = parsed;
        localStorage.setItem('consultation_overall_data', JSON.stringify(saved));
        window.dispatchEvent(new StorageEvent('storage', { key: 'consultation_overall_data' }));
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
        const saved = JSON.parse(localStorage.getItem(CONSULTATION_CONSULTANT_STORAGE_KEY) || '{}');
        if (!saved[parsed.year]) saved[parsed.year] = {};
        saved[parsed.year][parsed.month] = parsed;
        localStorage.setItem(CONSULTATION_CONSULTANT_STORAGE_KEY, JSON.stringify(saved));
        window.dispatchEvent(new StorageEvent('storage', { key: CONSULTATION_CONSULTANT_STORAGE_KEY }));
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
        const saved = JSON.parse(localStorage.getItem(CONSULTATION_REJECTED_STORAGE_KEY) || '{}');
        if (!saved[parsed.year]) saved[parsed.year] = {};
        saved[parsed.year][parsed.month] = parsed;
        localStorage.setItem(CONSULTATION_REJECTED_STORAGE_KEY, JSON.stringify(saved));
        window.dispatchEvent(new StorageEvent('storage', { key: CONSULTATION_REJECTED_STORAGE_KEY }));
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
            return !/(상담|현황|결정|환자|진단|동의|금액|보험|치료|계획|신환|구환|전체|부분|최종|총)/.test(text);
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
                    yearMonth: ym || { year: '2025', month: '1월' },
                    yearMonthDetected: !!ym,
                    parsedData: { workDays: '', newPt: '', oldPt: '', totalVisits: '', total: '', avgNewPt: '', avgOldPt: '' },
                    rawText: '', status: 'loading',
                });
                setOcrProcessingFile(file.name);

                try {
                    const result = await parseLedgerImage(file, (progress) => {
                        setOcrModal(prev => prev ? { ...prev, ocrProgress: progress } : prev);
                    });

                    // 구환 일평균 자동 계산: (신환 + 구환) / 진료일수
                    const pd = result.parsedData;
                    if ((pd.newPt || pd.oldPt) && pd.workDays && !pd.avgOldPt) {
                        pd.avgOldPt = parseFloat((((pd.newPt || 0) + (pd.oldPt || 0)) / pd.workDays).toFixed(1));
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
            if (!isNaN(totalVisits) && !isNaN(workDays) && workDays > 0) {
                updated.parsedData.total = parseFloat((totalVisits / workDays).toFixed(1));
            }
            if (!isNaN(oldPt) && !isNaN(workDays) && workDays > 0) {
                updated.parsedData.avgOldPt = parseFloat((((isNaN(newPt) ? 0 : newPt) + oldPt) / workDays).toFixed(1));
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
    const handleOcrSave = () => {
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

        saveLedgerData(yearMonth.year, yearMonth.month, data);
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
    const handleDrop = (e) => { e.preventDefault(); setIsDragOver(false); handleUnifiedUpload(e.dataTransfer.files); };

    // ── JSX ──────────────────────────────────────────────────────────────────
    return (
        <div className="admin-container">
            <div className="page-header">
                <h1>관리자 패널</h1>
                <p>시스템 설정 및 데이터 관리를 담당하는 공간입니다.</p>
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
                                                    <th>보험환자 비율</th>
                                                    <th>비보험환자 비율</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {Object.entries(upload.insuranceRatios).map(([path, ratio]) => (
                                                    <tr key={`${upload.id}-${path}`}>
                                                        <td>{path}</td>
                                                        <td>{Number(ratio || 0).toFixed(1)}%</td>
                                                        <td>{Math.max(0, 100 - Number(ratio || 0)).toFixed(1)}%</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {upload.summary && (
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
                            <select value={ocrModal.yearMonth?.year || '2025'}
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

            <div className="admin-grid">

                {/* 로그인 아이디 관리 */}
                <div className="admin-card user-management">
                    <div className="admin-card-header">
                        <Users size={24} className="admin-card-icon" />
                        <h2>로그인 아이디 관리</h2>
                    </div>
                    <div className="table-responsive">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>이름</th><th>치과명</th><th>직책</th><th>이메일(ID)</th><th>가입일</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.length > 0 ? users.map(user => (
                                    <tr key={user.id}>
                                        <td>{user.name}</td>
                                        <td>{user.clinicName}</td>
                                        <td>{user.position}</td>
                                        <td>{user.email}</td>
                                        <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                                    </tr>
                                )) : <tr><td colSpan="5">사용자가 없습니다.</td></tr>}
                            </tbody>
                        </table>
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
                            onChange={(e) => { handleUnifiedUpload(e.target.files); e.target.value = ''; }}
                            accept=".xlsx,.xls,.csv,.md,text/markdown,image/*"
                            style={{ display: 'none' }}
                        />
                    </div>
                    {uploadLog.length > 0 && (
                        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {uploadLog.map((log) => (
                                <div key={log.id} style={{
                                    display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                                    padding: '0.75rem 1rem', borderRadius: '10px',
                                    background: log.type === 'success' ? '#f0fdf4' : '#fef2f2',
                                    border: `1px solid ${log.type === 'success' ? '#86efac' : '#fca5a5'}`,
                                    fontSize: '0.85rem',
                                    color: log.type === 'success' ? '#15803d' : '#dc2626',
                                    lineHeight: 1.5,
                                }}>
                                    {log.type === 'success'
                                        ? <CheckCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                                        : <XCircle    size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                                    }
                                    <span>{log.msg}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default Admin;
