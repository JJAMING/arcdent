/**
 * 임플란트 수술통계 엑셀 파서 (v3)
 *
 * ── 임플란트 사용개수 시트 구조 ──
 *   헤더: ['픽스처', '수술횟수', '사용개수']
 *   데이터: ['Dentium - SuperLine 4510', 24, 30]  → 사용개수 = 30
 *   합계: ['합계', 130, 182]  → implantTotal = 182
 *
 *   ✅ 브랜드별 합산: 첫 번째 셀의 브랜드명 감지 후 사용개수 컬럼 값 합산
 *   ✅ 합계 행에서 implantTotal 추출
 *
 * ── 수술 기타건수 시트 구조 ──
 *   Crestal / Lateral / GBR 포함 행의 수량 컬럼 합산
 */

import * as XLSX from 'xlsx';
import {
  getImplantTypeAliases,
  normalizeImplantText,
  normalizeImplantTypes,
} from './implantTypes';

// ─── 합계 키워드 ─────────────────────────────────────────────────
const TOTAL_KEYWORDS = ['합계', '총계', '소계', '총합', 'total'];

// ─── 셀을 숫자로 변환 ─────────────────────────────────────────────
const toNum = (val) => {
  if (val == null || val === '') return 0;
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? 0 : Math.floor(n); // 정수로
};

// ─── 행이 합계 행인지 확인 ────────────────────────────────────────
const isTotalRow = (row) => {
  const str = (row || []).slice(0, 3).map(c => String(c || '').trim().toLowerCase()).join(' ');
  return TOTAL_KEYWORDS.some(k => str.includes(k));
};

// ─── 행이 헤더 행인지 확인 ───────────────────────────────────────
const isHeaderRow = (row) => {
  const str = (row || []).map(c => String(c || '').trim()).join(' ').toLowerCase();
  return str.includes('픽스처') || str.includes('품목') || str.includes('fixture');
};

// ─── 첫 번째 셀에서 기존 브랜드 감지 ──────────────────────────────
const detectLegacyBrand = (firstCell) => {
  const s = String(firstCell || '').trim().toLowerCase();
  if (!s) return null;
  if (s.includes('straumann') || s.includes('스트라우만')) return 'straumann';
  if (s.includes('dentium')   || s.includes('덴티움'))    return 'dentium';
  if (s.includes('osstem')    || s.includes('오스템'))    return 'osstem';
  // 디오: 단독 단어로만 매칭 (다른 브랜드 안에 포함 방지)
  if (/(?<![a-z])dio(?![a-z])/.test(s) || s.startsWith('디오')) return 'dio';
  return null;
};

const detectConfiguredImplantType = (firstCell, implantTypes = []) => {
  const source = normalizeImplantText(firstCell);
  if (!source) return null;

  return normalizeImplantTypes(implantTypes).find(type => (
    getImplantTypeAliases(type).some(alias => alias && source.includes(alias))
  )) || null;
};

// ─── 첫 번째 셀에서 수술법 감지 ──────────────────────────────────
const detectSurgery = (firstCell) => {
  const s = String(firstCell || '').trim().toLowerCase();
  if (!s) return null;
  if (s.includes('crestal')) return 'crestal';
  if (s.includes('lateral')) return 'lateral';
  if (s.includes('gbr'))     return 'gbr';
  return null;
};

// ─── 숫자 컬럼 인덱스 탐색 ───────────────────────────────────────
// 헤더 행에서 '사용개수' 컬럼 위치 찾기, 없으면 마지막 숫자 컬럼 사용
const findUsageColIdx = (headerRow, dataRows) => {
  if (headerRow) {
    for (let i = 0; i < headerRow.length; i++) {
      const h = String(headerRow[i] || '').trim();
      if (h === '사용개수' || h.includes('사용개수')) return i;
    }
  }
  // 헤더에서 못 찾으면: 데이터 행 기준으로 마지막 숫자 컬럼 추론
  for (const row of dataRows.slice(0, 5)) {
    if (!row || isTotalRow(row) || isHeaderRow(row)) continue;
    for (let i = row.length - 1; i >= 1; i--) {
      if (typeof row[i] === 'number' && row[i] > 0) return i;
    }
  }
  return -1; // 못 찾음
};

// ─── "임플란트 사용개수" 시트 파싱 ───────────────────────────────
const parseImplantSheet = (sheet, implantTypes = []) => {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const counts = { osstem: 0, dentium: 0, dio: 0, straumann: 0, implantTotal: 0 };
  const configuredTypes = normalizeImplantTypes(implantTypes);
  const dynamicCounts = configuredTypes.reduce((acc, type) => {
    acc[type.name] = 0;
    return acc;
  }, {});
  let rowUsageTotal = 0;
  let sourceImplantTotal = 0;

  // 헤더 행 찾기
  let headerRow = null;
  for (const row of rows) {
    if (isHeaderRow(row)) { headerRow = row; break; }
  }

  // '사용개수' 컬럼 인덱스 결정
  const usageIdx = findUsageColIdx(headerRow, rows);

  for (const row of rows) {
    if (!row || row.length === 0) continue;
    if (isHeaderRow(row)) continue; // 헤더 스킵

    // 합계 행 → implantTotal 추출
    if (isTotalRow(row)) {
      const val = usageIdx >= 0 ? toNum(row[usageIdx]) : 0;
      if (val > 0) sourceImplantTotal = val;
      continue;
    }

    // 빈 행 스킵
    const firstCell = row[0];
    if (!firstCell && !row[1] && !row[2]) continue;

    // 사용개수 값
    const usage = usageIdx >= 0 ? toNum(row[usageIdx]) : 1;
    if (usage <= 0) continue;

    rowUsageTotal += usage;

    // 관리자 설정 종류 감지 후 합산
    const configuredType = detectConfiguredImplantType(firstCell, configuredTypes);
    if (configuredType) {
      dynamicCounts[configuredType.name] += usage;
    }

    // 기존 브랜드 필드도 호환용으로 유지
    const brand = detectLegacyBrand(firstCell);
    if (brand) {
      counts[brand] += usage;
    }
  }

  // implantTotal이 합계 셀에서 못 왔으면 브랜드 합산으로 대체
  const dynamicTotal = Object.values(dynamicCounts).reduce((sum, value) => sum + Number(value || 0), 0);
  const legacyTotal = counts.osstem + counts.dentium + counts.dio + counts.straumann;
  counts.implantTotal = rowUsageTotal || sourceImplantTotal || dynamicTotal || legacyTotal;

  return {
    ...counts,
    implantTypes: dynamicCounts,
    rowUsageTotal,
    sourceImplantTotal,
    unclassifiedImplantCount: Math.max(0, rowUsageTotal - dynamicTotal),
  };
};

// ─── "수술 기타건수" 시트 파싱 ───────────────────────────────────
const parseSurgerySheet = (sheet) => {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const counts = { gbr: 0, lateral: 0, crestal: 0 };

  // 헤더 행 찾기
  let headerRow = null;
  for (const row of rows) {
    const str = (row || []).map(c => String(c || '').toLowerCase()).join(' ');
    if (str.includes('수술') || str.includes('구분') || str.includes('기타') || str.includes('건수')) {
      headerRow = row;
      break;
    }
  }

  // 수량 컬럼 인덱스 (사용개수 or 건수 or 마지막 숫자 컬럼)
  let qtyIdx = -1;
  if (headerRow) {
    for (let i = 0; i < headerRow.length; i++) {
      const h = String(headerRow[i] || '').trim();
      if (h.includes('사용개수') || h.includes('건수') || h.includes('횟수') || h.includes('개수')) {
        qtyIdx = i;
        break;
      }
    }
  }
  // 못 찾으면 데이터 행 기준 마지막 숫자 컬럼
  if (qtyIdx < 0) {
    for (const row of rows.slice(0, 10)) {
      if (!row || isTotalRow(row)) continue;
      const surg = detectSurgery(row[0]);
      if (!surg) continue;
      for (let i = row.length - 1; i >= 1; i--) {
        if (typeof row[i] === 'number' && row[i] > 0) { qtyIdx = i; break; }
      }
      if (qtyIdx >= 0) break;
    }
  }

  for (const row of rows) {
    if (!row || row.length === 0) continue;
    if (isTotalRow(row)) continue; // 합계 스킵
    const surg = detectSurgery(row[0]);
    if (!surg) continue;

    const qty = qtyIdx >= 0 ? toNum(row[qtyIdx]) : 1;
    if (qty > 0) counts[surg] += qty;
  }

  return counts;
};

// ─── 시트 이름 유연 탐색 ─────────────────────────────────────────
const findSheet = (workbook, candidates) => {
  for (const name of candidates) {
    const exact = workbook.SheetNames.find(s => s.trim().toLowerCase() === name.toLowerCase());
    if (exact) return { name: exact, sheet: workbook.Sheets[exact] };
  }
  for (const name of candidates) {
    const partial = workbook.SheetNames.find(s => s.toLowerCase().includes(name.toLowerCase()));
    if (partial) return { name: partial, sheet: workbook.Sheets[partial] };
  }
  return null;
};

// ─── 파일명에서 연/월 추출 ────────────────────────────────────────
export const extractYearMonth = (filename) => {
  const name = filename.replace(/\.[^.]+$/, '');
  const m = name.match(/(\d{4})년(\d{1,2})월/);
  if (!m) return null;
  return { year: m[1], month: parseInt(m[2], 10) + '월' };
};

// ─── localStorage upsert ─────────────────────────────────────────
const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

const upsertToStorage = () => [];

// ─── 메인 파서 ───────────────────────────────────────────────────
export const parseImplantExcel = (file, implantTypes = []) => {
  return new Promise((resolve, reject) => {
    const ym = extractYearMonth(file.name);
    if (!ym) {
      reject(new Error(
        `파일명에서 연월을 찾을 수 없습니다.\n파일명 형식: 2025년01월임플란트수술통계.xlsx\n현재: ${file.name}`
      ));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });

        // 임플란트 사용개수 시트
        const implantFound = findSheet(workbook, [
          '임플란트 사용개수', '임플란트사용개수', '사용개수', 'implant', '픽스처', 'fixture',
        ]);
        if (!implantFound) {
          reject(new Error(`"임플란트 사용개수" 시트를 찾을 수 없습니다.\n발견된 시트: ${workbook.SheetNames.join(', ')}`));
          return;
        }

        // 수술 기타건수 시트
        const surgeryFound = findSheet(workbook, [
          '수술 기타건수', '수술기타건수', '기타건수', 'surgery', '수술법',
        ]);
        if (!surgeryFound) {
          reject(new Error(`"수술 기타건수" 시트를 찾을 수 없습니다.\n발견된 시트: ${workbook.SheetNames.join(', ')}`));
          return;
        }

        const implantData = parseImplantSheet(implantFound.sheet, implantTypes);
        const surgeryData = parseSurgerySheet(surgeryFound.sheet);
        const combined = { ...implantData, ...surgeryData, surg1: implantData.implantTotal };

        const updatedArr = [];
        resolve({ year: ym.year, month: ym.month, data: combined, updatedArr });
      } catch (err) {
        console.error('[임플란트파서] 오류:', err);
        reject(new Error(`파싱 오류: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    reader.readAsArrayBuffer(file);
  });
};
