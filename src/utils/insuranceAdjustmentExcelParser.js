import * as XLSX from 'xlsx';

const normalizeHeader = (value) => String(value ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[()\[\]{}<>·ㆍ,.:;|/\\_-]/g, '');

const parseNumber = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const normalized = String(value ?? '').replace(/[^0-9.,-]/g, '').replace(/,/g, '');
    const number = Number(normalized);
    return Number.isFinite(number) ? number : 0;
};

const parseMonth = (value) => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getMonth() + 1;
    if (typeof value === 'number' && value >= 1 && value <= 12) return Math.floor(value);

    // 엑셀에서 "01월"로 보이는 날짜 셀은 실제로는 날짜 일련번호(예: 46023)로 읽힐 수 있습니다.
    // 2026년 등 일반적인 업로드 연도 범위의 Excel 날짜값을 월로 변환합니다.
    if (typeof value === 'number' && value >= 20000 && value <= 60000) {
        // Excel의 1900 날짜 체계(윤년 버그 보정 포함)를 UTC 날짜로 변환합니다.
        const excelDate = new Date(Date.UTC(1899, 11, 30) + (value * 24 * 60 * 60 * 1000));
        const month = excelDate.getUTCMonth() + 1;
        if (month >= 1 && month <= 12) return month;
    }

    const text = String(value ?? '').trim();
    const match = text.match(/(\d{1,2})\s*월/) || text.match(/[./-](\d{1,2})(?!\d)/) || text.match(/^(\d{1,2})$/);
    const month = Number(match?.[1]);
    return month >= 1 && month <= 12 ? month : null;
};

const getYearFromFileName = (fileName) => String(fileName || '').match(/([12]\d{3})\s*년/)?.[1] || null;

const findColumns = (headers) => {
    const columns = {
        month: -1,
        adjustmentCount: -1,
        adjustmentAmount: -1,
        failureCount: -1,
        failureAmount: -1,
        claimAmount: -1,
        reviewDecisionAmount: -1,
    };

    headers.forEach((header, index) => {
        if (!header) return;

        if (['월', '월별', '청구월', '요양월', '진료월'].includes(header)) columns.month = index;
        if (header.includes('조정') && header.includes('건')) columns.adjustmentCount = index;
        if (header.includes('조정') && header.includes('금액')) columns.adjustmentAmount = index;
        if ((header.includes('심사불능') || header.includes('불능')) && header.includes('건')) columns.failureCount = index;
        if ((header.includes('심사불능') || header.includes('불능')) && header.includes('금액')) columns.failureAmount = index;
        if (header.includes('심사결정') && header.includes('금액')) columns.reviewDecisionAmount = index;
        if (!header.includes('심사결정') && header.includes('청구') && header.includes('금액')) columns.claimAmount = index;
    });

    return columns;
};

const REQUIRED_FIELDS = [
    ['month', '월별'],
    ['adjustmentCount', '조정건수'],
    ['adjustmentAmount', '조정금액'],
    ['failureCount', '불능건수'],
    ['failureAmount', '불능금액'],
    ['claimAmount', '청구금액'],
    ['reviewDecisionAmount', '심사결정금액'],
];

export const parseInsuranceAdjustmentRows = (rows, fileName) => {
    const year = getYearFromFileName(fileName);
    if (!year) {
        throw new Error('파일명에서 연도를 찾지 못했습니다. 예: 2026년월별조정심사불능내역.xlsx');
    }

    let headerIndex = -1;
    let columns = null;

    for (let index = 0; index < Math.min(rows.length, 60); index += 1) {
        const currentColumns = findColumns((rows[index] || []).map(normalizeHeader));
        const hasAllColumns = REQUIRED_FIELDS.every(([key]) => currentColumns[key] !== -1);
        if (hasAllColumns) {
            headerIndex = index;
            columns = currentColumns;
            break;
        }
    }

    if (headerIndex === -1 || !columns) {
        const headerCandidates = (rows.slice(0, 60).flatMap(row => row || []).map(normalizeHeader).filter(Boolean));
        const candidateColumns = findColumns(headerCandidates);
        const missing = REQUIRED_FIELDS
            .filter(([key]) => candidateColumns[key] === -1)
            .map(([, label]) => label)
            .join(', ');
        throw new Error(`월별 조정심사불능내역의 필수 열을 찾지 못했습니다: ${missing || '헤더 행'}`);
    }

    const monthly = {};
    for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex] || [];
        const month = parseMonth(row[columns.month]);
        if (!month) continue;

        const monthLabel = `${month}월`;
        if (!monthly[monthLabel]) {
            monthly[monthLabel] = {
                month: monthLabel,
                adjustmentCount: 0,
                adjustmentAmount: 0,
                failureCount: 0,
                failureAmount: 0,
                claimAmount: 0,
                reviewDecisionAmount: 0,
            };
        }

        monthly[monthLabel].adjustmentCount += parseNumber(row[columns.adjustmentCount]);
        monthly[monthLabel].adjustmentAmount += parseNumber(row[columns.adjustmentAmount]);
        monthly[monthLabel].failureCount += parseNumber(row[columns.failureCount]);
        monthly[monthLabel].failureAmount += parseNumber(row[columns.failureAmount]);
        monthly[monthLabel].claimAmount += parseNumber(row[columns.claimAmount]);
        monthly[monthLabel].reviewDecisionAmount += parseNumber(row[columns.reviewDecisionAmount]);
    }

    const data = Object.values(monthly);
    if (data.length === 0) throw new Error('월별 조정심사불능내역에서 1월~12월 데이터를 찾지 못했습니다.');

    return { year, rows: data };
};

export const parseInsuranceAdjustmentExcel = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const workbook = XLSX.read(event.target.result, { type: 'binary' });
            const rows = workbook.SheetNames.flatMap(sheetName => (
                XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' })
            ));
            resolve(parseInsuranceAdjustmentRows(rows, file.name));
        } catch (error) {
            reject(error);
        }
    };
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsBinaryString(file);
});
