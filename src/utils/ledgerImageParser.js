/**
 * ledgerImageParser.js
 * 월간 장부 이미지를 OCR로 분석하여 환자분석 데이터를 추출합니다.
 * Tesseract.js (kor+eng) 사용
 */

import Tesseract from 'tesseract.js';

// ── localStorage 키 ─────────────────────────────────────────────────────────
export const LEDGER_STORAGE_KEY = 'patient_ledger_data';

// ── 파일명에서 연·월 추출 ────────────────────────────────────────────────────
export const extractYearMonthFromFileName = (filename) => {
    // 2025년03월, 2025_03, 2025-03, 25년3월 등 다양한 형식 대응
    const patterns = [
        // 2025년 3월  /  2025년03월
        /([12]\d{3})년\s*(\d{1,2})월/,
        // 25년 3월
        /(\d{2})년\s*(\d{1,2})월/,
        // 2025_03, 2025-03, 2025.03
        /([12]\d{3})[_\-.](\d{1,2})(?!\d)/,
        // 03_2025, 03-2025
        /(\d{1,2})[_\-.]([12]\d{3})/,
    ];

    for (const pattern of patterns) {
        const m = filename.match(pattern);
        if (m) {
            let year = m[1];
            let month = m[2];
            // 2자리 연도 처리
            if (year.length === 2) year = '20' + year;
            // 4자리가 뒤에 오는 경우 (03-2025 패턴)
            if (parseInt(year) < 100) {
                [year, month] = [month, year];
            }
            return { year, month: parseInt(month) + '월' };
        }
    }
    return null;
};

// ── OCR 텍스트에서 연·월 추출 (Fallback) ─────────────────────────────────────
const extractYearMonthFromText = (text) => {
    const m = text.match(/([12]\d{3})년\s*(\d{1,2})월/);
    if (m) return { year: m[1], month: parseInt(m[2]) + '월' };
    return null;
};

// ── 숫자 파싱 헬퍼 ───────────────────────────────────────────────────────────
const parseNum = (str) => {
    if (!str) return null;
    const cleaned = String(str).replace(/[^0-9.]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
};

// ── OCR 텍스트에서 핵심 수치 파싱 ────────────────────────────────────────────
export const parseLedgerText = (text) => {
    const result = {
        workDays: null,
        newPt: null,
        oldPt: null,
        total: null,
        avgNewPt: null,
        avgOldPt: null,
        avgTotalPt: null,
    };

    // 줄 단위 + 전체 텍스트 모두 탐색
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // 각 필드별 패턴 정의
    const fieldPatterns = [
        {
            field: 'workDays',
            patterns: [
                /진료\s*일\s*수[^\d]*([\d,]+)/,
                /진료일[^\d]*([\d,]+)/,
                /영업\s*일\s*수[^\d]*([\d,]+)/,
            ],
        },
        {
            field: 'newPt',
            patterns: [
                /신\s*환[^\d]*([\d,]+)/,
                /새\s*환\s*자[^\d]*([\d,]+)/,
                /신규\s*환\s*자[^\d]*([\d,]+)/,
            ],
        },
        {
            field: 'oldPt',
            patterns: [
                /구\s*환[^\d]*([\d,]+)/,
                /재\s*진\s*환\s*자[^\d]*([\d,]+)/,
                /기존\s*환\s*자[^\d]*([\d,]+)/,
            ],
        },
        {
            field: 'total',
            patterns: [
                /총\s*내\s*원(?!\s*횟\s*수)[^\d]*([\d,]+)/,
                /총\s*접\s*수[^\d]*([\d,]+)/,
                /내\s*원\s*합\s*계[^\d]*([\d,]+)/,
                /합\s*계[^\n\d]{0,5}([\d,]+)/,
            ],
        },
        {
            field: 'avgNewPt',
            patterns: [
                /일\s*평\s*균\s*신\s*환[^\d]*([\d,.]+)/,
                /신환\s*일\s*평\s*균[^\d]*([\d,.]+)/,
                /평\s*균\s*신\s*환[^\d]*([\d,.]+)/,
            ],
        },
        {
            field: 'avgTotalPt',
            patterns: [
                /일\s*평\s*균\s*내\s*원\s*수[^\d]*([\d,.]+)/,
                /일\s*평\s*균\s*내\s*원[^\d]*([\d,.]+)/,
                /평\s*균\s*내\s*원\s*수[^\d]*([\d,.]+)/,
            ],
        },
    ];

    // 전체 텍스트에서 각 패턴 탐색
    for (const { field, patterns } of fieldPatterns) {
        for (const pattern of patterns) {
            const m = text.match(pattern);
            if (m) {
                const val = parseNum(m[1]);
                if (val !== null) {
                    result[field] = val;
                    break;
                }
            }
        }
    }

    // 줄 단위로 추가 탐색 (키:값 형태)
    for (const line of lines) {
        // "진료일수 : 21" 형태
        if (result.workDays === null && /진료.?일/.test(line)) {
            const nm = line.match(/([\d,]+)\s*일?\s*$/);
            if (nm) result.workDays = parseNum(nm[1]);
        }
        if (result.newPt === null && /신환/.test(line)) {
            const nm = line.match(/([\d,]+)\s*명?\s*$/);
            if (nm) result.newPt = parseNum(nm[1]);
        }
        if (result.oldPt === null && /구환/.test(line)) {
            const nm = line.match(/([\d,]+)\s*명?\s*$/);
            if (nm) result.oldPt = parseNum(nm[1]);
        }
        if (result.total === null && /(총\s*내원(?!\s*횟수)|내원.{0,3}합계|총\s*접수)/.test(line)) {
            const nm = line.match(/([\d,.]+)\s*명?\s*$/);
            if (nm) result.total = parseNum(nm[1]);
        }
        if (result.avgNewPt === null && /일평균.{0,4}신환/.test(line)) {
            const nm = line.match(/([\d,.]+)\s*$/);
            if (nm) result.avgNewPt = parseNum(nm[1]);
        }
        if (result.avgTotalPt === null && /(일\s*평균\s*내원|평균\s*내원)/.test(line)) {
            const nm = line.match(/([\d,.]+)\s*명?\s*$/);
            if (nm) result.avgTotalPt = parseNum(nm[1]);
        }
    }

    // 구환 일평균 계산 ((newPt + oldPt) / workDays)
    if ((result.newPt !== null || result.oldPt !== null) && result.workDays) {
        result.avgOldPt = parseFloat((((result.newPt || 0) + (result.oldPt || 0)) / result.workDays).toFixed(1));
    }

    return result;
};

// ── localStorage 저장 ─────────────────────────────────────────────────────────
export const saveLedgerData = (year, month, data) => {
    const raw = localStorage.getItem(LEDGER_STORAGE_KEY);
    let store = {};
    try { store = raw ? JSON.parse(raw) : {}; } catch (e) { store = {}; }

    if (!store[year]) store[year] = {};
    store[year][month] = { ...data };

    localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(store));
};

// ── localStorage 전체 데이터 읽기 ────────────────────────────────────────────
export const loadLedgerData = () => {
    try {
        const raw = localStorage.getItem(LEDGER_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        return {};
    }
};

// ── 메인 API: 이미지 파일 → OCR → 파싱 → 반환 (저장은 caller 책임) ────────────
export const parseLedgerImage = async (file, onProgress) => {
    // 1) OCR 실행
    const result = await Tesseract.recognize(file, 'kor+eng', {
        logger: (m) => {
            if (m.status === 'recognizing text' && onProgress) {
                onProgress(Math.round(m.progress * 100));
            }
        },
    });

    const rawText = result.data.text;

    // 2) 연·월 파싱 (파일명 우선 → OCR 텍스트 fallback)
    let yearMonth = extractYearMonthFromFileName(file.name);
    if (!yearMonth) {
        yearMonth = extractYearMonthFromText(rawText);
    }

    // 3) 수치 파싱
    const parsedData = parseLedgerText(rawText);

    return {
        yearMonth,          // null 이면 사용자 수동 입력 필요
        parsedData,
        rawText,
    };
};
