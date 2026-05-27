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

    const handleUnifiedUpload = async (files) => {
        const uploadFiles = Array.from(files || []);
        if (uploadFiles.length === 0) return;
        setUploadLog([]);

        const excelFiles = [];
        const imageFiles = [];

        for (const file of uploadFiles) {
            const isImage = file.type.startsWith('image/');
            if (isNewPatientAgeDistributionFile(file.name) && !isImage) {
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

                        // 동의환자/치료비용계획
                        if (fileName.includes('치료비용') || fileName.includes('동의') || fileName.includes('치료비')) {
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

    const handleImageUpload = async (files) => {
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;

        for (const file of imageFiles) {
            const reader = new FileReader();
            const dataUrl = await new Promise(resolve => {
                reader.onload = e => resolve(e.target.result);
                reader.readAsDataURL(file);
            });

            // 월간장부이면 OCR 실행
            if (isLedgerFile(file.name)) {
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

    // OCR 저장
    const handleOcrSave = () => {
        if (!ocrModal) return;
        const { yearMonth, parsedData } = ocrModal;

        // OCR이 못 읽은 필드는 null, 읽은 필드만 저장
        const safeNum = (v) => {
            const n = parseFloat(v);
            return (!isNaN(n) && n > 0) ? n : null;
        };

        const data = {
            workDays: safeNum(parsedData.workDays),
            newPt:    safeNum(parsedData.newPt),
            oldPt:    safeNum(parsedData.oldPt),
            total:    safeNum(parsedData.total),
            avgNewPt: safeNum(parsedData.avgNewPt),
            avgOldPt: safeNum(parsedData.avgOldPt),
        };

        saveLedgerData(yearMonth.year, yearMonth.month, data);
        addLog('success',
            `✅ [환자분석] ${yearMonth.year}년 ${yearMonth.month} 월간장부 저장 완료 ` +
            `(진료일수: ${data.workDays ?? '-'}일 / 신환: ${data.newPt ?? '-'}명 / 구환: ${data.oldPt ?? '-'}명 / 총접수: ${data.total ?? '-'}명)`
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
                                    📄 월간장부 OCR 분석 결과
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
                                <img src={ocrModal.previewUrl} alt="월간장부"
                                    style={{ width: '100%', borderRadius: '0.6rem', border: '1px solid var(--border-color)', objectFit: 'contain', maxHeight: '300px' }} />
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {OCR_FIELDS.map(({ key, label, unit, readOnly }) => {
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
                            </div>
                        </div>

                        {/* 빈 값 경고 */}
                        {(() => {
                            const keyFields = ['workDays', 'newPt', 'oldPt', 'totalVisits'];
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
                                환자분석에 저장
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
                        <p>.xlsx, .xls, .csv, .jpg, .jpeg, .png, .gif, .webp 지원</p>
                        <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            💡 엑셀/사진 업로드를 한 곳에서 처리합니다.
                        </p>
                        <input
                            type="file"
                            multiple
                            ref={fileInputRef}
                            onChange={(e) => { handleUnifiedUpload(e.target.files); e.target.value = ''; }}
                            accept=".xlsx,.xls,.csv,image/*"
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
