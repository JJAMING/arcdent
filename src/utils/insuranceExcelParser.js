/**
 * 보험수가별 통계 엑셀 파서
 *
 * 파일명 형식: 2025년01월보험수가별통계.xlsx
 *
 * ── 추출 항목 ──
 * [보험 임플란트]
 *   치과임플란트 1단계 → insImpStep1 (입력횟수)
 *   치과임플란트 2단계 → insImpStep2
 *   치과임플란트 3단계 → insImpStep3
 *   합계              → insImp
 *
 * [보험 틀니]
 *   틀니 1단계 → insDentStep1
 *   틀니 5단계 → insDentStep5
 *   틀니 6단계 → insDentStep6
 *   합계       → insDent
 */

import * as XLSX from 'xlsx';

// ─── 유틸 ─────────────────────────────────────────────────────────
const toNum = (val) => {
  if (val == null || val === '') return 0;
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? 0 : Math.round(n);
};

const rowStr = (row) =>
  (row || []).map(c => String(c == null ? '' : c).trim()).join(' ');

const isTotalRow = (row) => {
  const s = rowStr(row).toLowerCase();
  return ['합계', '총계', '소계', 'total'].some(k => s.includes(k));
};

// ─── 파일명에서 연/월 추출 ────────────────────────────────────────
export const extractYearMonth = (filename) => {
  const name = filename.replace(/\.[^.]+$/, '');
  const m = name.match(/(\d{4})년(\d{1,2})월/);
  if (!m) return null;
  return { year: m[1], month: parseInt(m[2], 10) + '월' };
};

// ─── 시트 유연 탐색 ───────────────────────────────────────────────
const findSheet = (workbook, candidates) => {
  for (const c of candidates) {
    const exact = workbook.SheetNames.find(s => s.trim().toLowerCase() === c.toLowerCase());
    if (exact) return { name: exact, sheet: workbook.Sheets[exact] };
  }
  for (const c of candidates) {
    const partial = workbook.SheetNames.find(s => s.toLowerCase().includes(c.toLowerCase()));
    if (partial) return { name: partial, sheet: workbook.Sheets[partial] };
  }
  return null;
};

// ─── '입력횟수' 컬럼 인덱스 탐색 ─────────────────────────────────
const findCountColIdx = (headerRow) => {
  if (!headerRow) return -1;
  for (let i = 0; i < headerRow.length; i++) {
    const h = String(headerRow[i] || '').trim();
    if (h.includes('입력횟수') || h.includes('횟수') || h.includes('건수') || h.includes('입력')) return i;
  }
  // 못 찾으면 마지막 숫자 컬럼 후보
  return -1;
};

// ─── 행에서 최초로 등장하는 양수 정수 ────────────────────────────
const firstPosInt = (row) => {
  for (const cell of (row || [])) {
    const n = toNum(cell);
    if (n > 0) return n;
  }
  return 0;
};

// ─── 메인 파싱 로직 ───────────────────────────────────────────────
const parseInsuranceSheet = (sheet, sheetName) => {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const result = {
    // 보험 임플란트 단계별
    insImpStep1: 0, insImpStep2: 0, insImpStep3: 0, insImp: 0,
    // 보험 틀니 단계별
    insDentStep1: 0, insDentStep5: 0, insDentStep6: 0, insDent: 0,
  };

  // 헤더 행 탐색 (항목명 / 입력횟수 구조)
  let headerRow = null;
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rowStr(rows[i]).toLowerCase();
    if (r.includes('입력횟수') || r.includes('항목') || r.includes('수가') || r.includes('코드')) {
      headerRow = rows[i];
      headerIdx = i;
      break;
    }
  }

  const countColIdx = findCountColIdx(headerRow);

  for (let i = (headerIdx >= 0 ? headerIdx + 1 : 0); i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    if (isTotalRow(row)) continue;

    const labelLow = rowStr(row).toLowerCase();
    if (!labelLow) continue;

    // 입력횟수 값 추출
    const cnt = countColIdx >= 0 ? toNum(row[countColIdx]) : firstPosInt(row.slice(1));
    if (cnt === 0) continue;

    // ── 보험 임플란트 매핑 ──
    // "치과임플란트 1단계" / "임플란트 1단계" / "임플 1단계" 등
    if ((labelLow.includes('임플란트') || labelLow.includes('임플')) && labelLow.includes('1단계')) {
      result.insImpStep1 += cnt;
    } else if ((labelLow.includes('임플란트') || labelLow.includes('임플')) && labelLow.includes('2단계')) {
      result.insImpStep2 += cnt;
    } else if ((labelLow.includes('임플란트') || labelLow.includes('임플')) && labelLow.includes('3단계')) {
      result.insImpStep3 += cnt;
    }
    // ── 보험 틀니 매핑 ──
    else if (labelLow.includes('틀니') && labelLow.includes('1단계')) {
      result.insDentStep1 += cnt;
    } else if (labelLow.includes('틀니') && labelLow.includes('5단계')) {
      result.insDentStep5 += cnt;
    } else if (labelLow.includes('틀니') && labelLow.includes('6단계')) {
      result.insDentStep6 += cnt;
    }
  }

  // 합계 계산
  result.insImp  = result.insImpStep1 + result.insImpStep2 + result.insImpStep3;
  result.insDent = result.insDentStep1 + result.insDentStep5 + result.insDentStep6;

  return result;
};

// ─── localStorage upsert ─────────────────────────────────────────
const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

const upsertToStorage = () => [];

// ─── 메인 파서 ───────────────────────────────────────────────────
export const parseInsuranceExcel = (file) => {
  return new Promise((resolve, reject) => {
    const ym = extractYearMonth(file.name);
    if (!ym) {
      reject(new Error(
        `파일명에서 연월을 찾을 수 없습니다.\n` +
        `파일명 형식: 2025년01월보험수가별통계.xlsx\n현재: ${file.name}`
      ));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });

        // 시트를 순서대로 탐색 (하나만 있을 수도 있음)
        const found = findSheet(workbook, [
          '보험수가별', '보험수가', '수가별통계', '수가통계', '통계',
          workbook.SheetNames[0], // fallback: 첫 번째 시트
        ]);

        if (!found) {
          reject(new Error(`파싱 가능한 시트를 찾을 수 없습니다.\n발견된 시트: ${workbook.SheetNames.join(', ')}`));
          return;
        }

        const data = parseInsuranceSheet(found.sheet, found.name);
        const updatedArr = [];
        resolve({ year: ym.year, month: ym.month, data, updatedArr });
      } catch (err) {
        console.error('[보험파서] 오류:', err);
        reject(new Error(`파싱 오류: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    reader.readAsArrayBuffer(file);
  });
};
