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
    const normalized = String(filename || '')
        .replace(/\.[^.]+$/, '')
        .replace(/\s+/g, '');
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
        const m = normalized.match(pattern) || String(filename || '').match(pattern);
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
    const normalized = String(text || '').replace(/\s+/g, '');
    const m =
        normalized.match(/([12]\d{3})년(\d{1,2})월/) ||
        String(text || '').match(/([12]\d{3})\s*년\s*(\d{1,2})\s*월/) ||
        normalized.match(/(\d{2})년(\d{1,2})월/);
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

const getLedgerDataQuality = (data = {}) => {
    const fields = ['workDays', 'newPt', 'oldPt', 'totalVisits'];
    const detectedCount = fields.filter(field => Number(data[field]) > 0).length;
    const workDays = Number(data.workDays || 0);
    const newPt = Number(data.newPt || 0);
    const oldPt = Number(data.oldPt || 0);
    const totalVisits = Number(data.totalVisits || 0);
    const patientTotal = newPt + oldPt;
    const difference = Math.abs(totalVisits - patientTotal);
    const isConsistent = patientTotal > 0 && totalVisits > 0 && difference <= Math.max(3, patientTotal * 0.05);
    const hasValidWorkDays = workDays >= 1 && workDays <= 31;

    return (detectedCount * 3) + (isConsistent ? 3 : 0) + (hasValidWorkDays ? 1 : 0);
};

export const getLedgerValidationWarnings = (data = {}) => {
    const warnings = [];
    const workDays = Number(data.workDays || 0);
    const newPt = Number(data.newPt || 0);
    const oldPt = Number(data.oldPt || 0);
    const totalVisits = Number(data.totalVisits || 0);
    const patientTotal = newPt + oldPt;

    if (workDays > 31) warnings.push('진료일수가 31일을 초과합니다. 원본 이미지를 확인해 주세요.');
    if (patientTotal > 0 && totalVisits > 0 && Math.abs(totalVisits - patientTotal) > Math.max(3, patientTotal * 0.05)) {
        warnings.push('신환·구환 합계와 총 내원횟수가 크게 다릅니다. OCR 숫자를 확인해 주세요.');
    }
    if (totalVisits > 0 && workDays > 0 && totalVisits / workDays > 200) {
        warnings.push('일평균 총 내원이 비정상적으로 큽니다. 숫자 인식 오류일 수 있습니다.');
    }

    return warnings;
};

const createEnhancedLedgerImage = async (file) => {
    if (!file?.type?.startsWith('image/')) return file;

    const objectUrl = URL.createObjectURL(file);
    try {
        const image = await new Promise((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error('이미지 전처리를 위한 원본을 읽지 못했습니다.'));
            element.src = objectUrl;
        });
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        const longestSide = Math.max(sourceWidth, sourceHeight);
        const scale = Math.min(2.5, Math.max(1, 2800 / Math.max(longestSide, 1)));
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return file;

        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.filter = 'grayscale(1) contrast(1.65) brightness(1.08)';
        context.drawImage(image, 0, 0, width, height);
        context.filter = 'none';

        const imageData = context.getImageData(0, 0, width, height);
        const pixels = imageData.data;
        for (let index = 0; index < pixels.length; index += 4) {
            const luminance = (pixels[index] * 0.299) + (pixels[index + 1] * 0.587) + (pixels[index + 2] * 0.114);
            const enhanced = Math.max(0, Math.min(255, ((luminance - 128) * 1.25) + 128));
            pixels[index] = enhanced;
            pixels[index + 1] = enhanced;
            pixels[index + 2] = enhanced;
        }
        context.putImageData(imageData, 0, 0);

        return await new Promise((resolve, reject) => {
            canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('OCR용 이미지 변환에 실패했습니다.'))), 'image/png');
        });
    } catch (error) {
        return file;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
};

// ── OCR 텍스트에서 핵심 수치 파싱 ────────────────────────────────────────────
export const parseLedgerText = (text) => {
    const result = {
        workDays: null,
        newPt: null,
        oldPt: null,
        total: null,
        totalVisits: null,
        avgNewPt: null,
        avgOldPt: null,
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
            field: 'totalVisits',
            patterns: [
                /총\s*내\s*원\s*횟\s*수[^\d]*([\d,]+)/,
                /총\s*내\s*원\s*회\s*수[^\d]*([\d,]+)/,
                /내\s*원\s*횟\s*수[^\d]*([\d,]+)/,
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
    ];

    // 전체 텍스트에서 각 패턴 탐색
    for (const { field, patterns } of fieldPatterns) {
        for (const pattern of patterns) {
            for (const source of [...lines, text]) {
                const m = source.match(pattern);
                if (m) {
                    const val = parseNum(m[1]);
                    if (val !== null) {
                        result[field] = val;
                        break;
                    }
                }
            }
            if (result[field] !== null) break;
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
        if (result.totalVisits === null && /(총\s*내원\s*횟수|총\s*내원\s*회수|내원\s*횟수)/.test(line)) {
            const nm = line.match(/([\d,.]+)\s*회?\s*$/);
            if (nm) result.totalVisits = parseNum(nm[1]);
        }
        if (result.avgNewPt === null && /일평균.{0,4}신환/.test(line)) {
            const nm = line.match(/([\d,.]+)\s*$/);
            if (nm) result.avgNewPt = parseNum(nm[1]);
        }
    }

    if (result.totalVisits !== null && result.workDays) {
        result.total = parseFloat((result.totalVisits / result.workDays).toFixed(1));
    }

    // 평균은 OCR이 읽은 보조 값 대신 핵심 수치로 다시 계산해 일관성을 유지합니다.
    if (result.newPt !== null && result.workDays) {
        result.avgNewPt = parseFloat((result.newPt / result.workDays).toFixed(1));
    }
    if (result.oldPt !== null && result.workDays) {
        result.avgOldPt = parseFloat((result.oldPt / result.workDays).toFixed(1));
    }

    return result;
};

// ── localStorage 저장 ─────────────────────────────────────────────────────────
export const saveLedgerData = (year, month, data) => {
    return { year, month, data };
};

// ── localStorage 전체 데이터 읽기 ────────────────────────────────────────────
export const loadLedgerData = () => {
    return {};
};

// ── 메인 API: 이미지 파일 → OCR → 파싱 → 반환 (저장은 caller 책임) ────────────
export const parseLedgerImage = async (file, onProgress) => {
    const recognize = async (source, reportProgress) => Tesseract.recognize(source, 'kor+eng', {
        logger: (m) => {
            if (reportProgress && m.status === 'recognizing text' && onProgress) {
                onProgress(Math.round(m.progress * 100));
            }
        },
    });

    // 월간장부처럼 작은 글자와 표 선이 많은 이미지는 고해상도·명암 보정본으로 먼저 읽고,
    // 핵심 값이 부족하면 원본 결과와 비교해 더 신뢰도 높은 값을 사용합니다.
    const enhancedFile = await createEnhancedLedgerImage(file);
    const enhancedResult = await recognize(enhancedFile, true);
    let rawText = enhancedResult.data.text;
    let parsedData = parseLedgerText(rawText);
    let ocrMode = 'enhanced';

    if (getLedgerDataQuality(parsedData) < 16) {
        const originalResult = await recognize(file, false);
        const originalText = originalResult.data.text;
        const originalData = parseLedgerText(originalText);
        if (getLedgerDataQuality(originalData) > getLedgerDataQuality(parsedData)) {
            rawText = originalText;
            parsedData = originalData;
            ocrMode = 'original-fallback';
        }
    }

    // 2) 연·월 파싱 (파일명 우선 → OCR 텍스트 fallback)
    let yearMonth = extractYearMonthFromFileName(file.name);
    if (!yearMonth) {
        yearMonth = extractYearMonthFromText(rawText);
    }

    return {
        yearMonth,          // null 이면 사용자 수동 입력 필요
        parsedData,
        rawText,
        ocrMode,
        validationWarnings: getLedgerValidationWarnings(parsedData),
    };
};
