import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Users, Upload, FileSpreadsheet, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import './Admin.css';

const Admin = () => {
    const { getAllUsers } = useAuth();
    const [users, setUsers] = useState([]);
    const fileInputRef = useRef(null);


    useEffect(() => {
        setUsers(getAllUsers());

        // [중복 데이터 클리닝 로직 추가] - 기존 중복 데이터 정리
        const savedPlans = localStorage.getItem('treatment_plan_data');
        if (savedPlans) {
            try {
                const plans = JSON.parse(savedPlans);
                if (Array.isArray(plans)) {
                    const uniqueMap = new Map();
                    let hasDuplicates = false;
                    plans.forEach(p => {
                        // 고유 키: 연도 + 월 + 차트번호 + 성함
                        const key = `${p.year || '2025'}_${p.month || ''}_${p.chartNo || ''}_${p.patientName || ''}`;
                        if (!uniqueMap.has(key)) {
                            uniqueMap.set(key, p);
                        } else {
                            hasDuplicates = true;
                            // 더 최신 데이터나 정보가 많은 쪽을 선택 (계약금액이 있는 쪽 등)
                            const existing = uniqueMap.get(key);
                            if ((Number(p.contractAmount) || 0) >= (Number(existing.contractAmount) || 0)) {
                                uniqueMap.set(key, p);
                            }
                        }
                    });
                    if (hasDuplicates) {
                        const deduplicated = Array.from(uniqueMap.values());
                        localStorage.setItem('treatment_plan_data', JSON.stringify(deduplicated));
                        console.log(`[Data Cleanup] Removed duplicates from agreed patient records.`);
                    }
                }
            } catch (e) {
                console.error("Cleanup error:", e);
            }
        }
    }, []);

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const savedDataStr = localStorage.getItem('parsed_sales_data');
        const defaultData = [
            { month: '1월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 },
            { month: '2월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 },
            { month: '3월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 },
            { month: '4월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 },
            { month: '5월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 },
            { month: '6월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 },
            { month: '7월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 },
            { month: '8월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 },
            { month: '9월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 },
            { month: '10월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 },
            { month: '11월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 },
            { month: '12월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0, newPatientSales: 0 }
        ];

        // [연도별 지원] 데이터 맵 로드 및 마이그레이션
        let salesDataMap = {};
        if (savedDataStr) {
            try {
                const parsed = JSON.parse(savedDataStr);
                if (Array.isArray(parsed)) salesDataMap["2025"] = parsed;
                else salesDataMap = parsed;
            } catch (e) { salesDataMap = {}; }
        }

        // [진료분석] 데이터 맵 로드
        const savedPerfStr = localStorage.getItem('treatment_performance_data');
        let treatmentPerfMap = {};
        if (savedPerfStr) {
            try {
                const parsed = JSON.parse(savedPerfStr);
                if (Array.isArray(parsed)) treatmentPerfMap["2025"] = parsed;
                else treatmentPerfMap = parsed;
            } catch (e) { treatmentPerfMap = {}; }
        }

        let updatedCount = 0;
        let newUploadedFiles = [];

        for (const file of files) {
            const fileName = file.name;
            const reader = new FileReader();

            const processFile = () => new Promise((resolve, reject) => {
                reader.onload = (evt) => {
                    try {
                        const bstr = evt.target.result;
                        const wb = XLSX.read(bstr, { type: 'binary' });
                        let rawData = [];
                        let colIndices = { chartNo: -1, name: -1, doctor: -1, amount: -1, insurance: -1, path: -1 };
                        let headerRowIdx = -1;
                        let targetSheetName = wb.SheetNames[0];

                        // 모든 시트를 순회하며 헤더를 찾음 (임상 데이터 우선)
                        for (const sName of wb.SheetNames) {
                            const ws = wb.Sheets[sName];
                            const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
                            const tempColIndices = { chartNo: -1, name: -1, doctor: -1, amount: -1, insurance: -1, path: -1 };
                            let tempHeaderRowIdx = -1;

                            for (let i = 0; i < Math.min(40, data.length); i++) {
                                const row = data[i] || [];
                                row.forEach((cell, idx) => {
                                    if (cell != null) {
                                        const strCell = String(cell).trim().replace(/\s+/g, '');
                                        if (strCell.includes('차트번호')) tempColIndices.chartNo = idx;
                                        else if (strCell === '성명' || strCell === '이름' || strCell === '환자명' || strCell === '환자이름' || strCell === '의사이름' || strCell === '의사명') {
                                            if (strCell.includes('의사')) tempColIndices.doctor = idx;
                                            else tempColIndices.name = idx;
                                        }
                                        else if (strCell.includes('담당의') || strCell.includes('의사') || strCell === '의사명' || strCell === '의사이름') tempColIndices.doctor = idx;
                                        
                                        if (strCell === '공단부담금' || strCell === '공단부담' || strCell === '보험청구액' || strCell === '보험청구') tempColIndices.insurance = idx;
                                        else if (strCell.includes('공단부담') || strCell.includes('보험청구') || strCell.includes('의료보험') || (strCell.includes('공단') && strCell.includes('금'))) {
                                            if (tempColIndices.insurance === -1) tempColIndices.insurance = idx;
                                        }

                                        if (strCell === '총수납액' || strCell === '수납합계' || strCell === '실수납액' || strCell === '수납금액') tempColIndices.amount = idx;
                                        else if (strCell.includes('총수납') || strCell.includes('수납액') || strCell === '수납' || strCell === '납부액' || strCell.includes('본인부담')) {
                                            if (tempColIndices.amount === -1 && tempColIndices.insurance !== idx) tempColIndices.amount = idx;
                                        }

                                        if (strCell.includes('내원경로') || strCell.includes('유입')) tempColIndices.path = idx;
                                    }
                                });
                                if (tempColIndices.doctor !== -1 && (tempColIndices.amount !== -1 || tempColIndices.insurance !== -1)) {
                                    tempHeaderRowIdx = i;
                                    break;
                                }
                            }

                            if (tempHeaderRowIdx !== -1) {
                                rawData = data;
                                colIndices = tempColIndices;
                                headerRowIdx = tempHeaderRowIdx;
                                targetSheetName = sName;
                                break;
                            }
                        }

                        // [Fallback] 임상 헤더를 못 찾은 경우 (월간장부 등 집계표 대응)
                        if (rawData.length === 0) {
                            targetSheetName = wb.SheetNames[0];
                            const ws = wb.Sheets[targetSheetName];
                            rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });
                            console.log(`[Excel Debug] No clinical headers found. Using first sheet: ${targetSheetName}`);
                        }

                        console.log(`[Excel Debug] FileName: ${fileName}, Sheet: ${targetSheetName}`, {headerRowIdx, colIndices});

                        const parseNum = (val) => {
                            if (typeof val === 'number') return val;
                            if (typeof val === 'string') {
                                const cleaned = val.replace(/[^0-9.,-]/g, ''); // 쉼표 포함 제거
                                const num = parseFloat(cleaned.replace(/,/g, ''));
                                return isNaN(num) ? 0 : num;
                            }
                            return 0;
                        };

                        const extractMonth = (str) => {
                            let match = str.match(/(\d{1,2})월/);
                            if (!match) match = str.match(/[\.\-\/](\d{1,2})(?!\d)/); // (e.g. .02, -2)
                            if (!match) match = str.match(/^(\d{1,2})[\.\-\/]/); // (e.g. 02.)
                            return match ? parseInt(match[1]) + '월' : null;
                        };

                        const extractYear = (str) => {
                            let match = str.match(/(20\d{2})년/) || str.match(/(\d{2})년/);
                            if (!match) {
                                // .25, -2025 등 패턴 대응
                                const yMatch = str.match(/(20\d{2})[\.\-\/]/) || str.match(/(\d{2})[\.\-\/]/) || str.match(/^(\d{2})[\.\-\/]/);
                                if (yMatch) match = yMatch;
                            }
                            if (match) {
                                const y = match[1];
                                return y.length === 2 ? "20" + y : y;
                            }
                            return "2025"; // 기본값
                        };

                        const monthFromFile = extractMonth(fileName);
                        const yearFromFile = extractYear(fileName);
                        console.log(`[Excel Parse Debug] File: ${fileName} -> Extracted: ${yearFromFile} ${monthFromFile}`);

                        // 해당 연도 데이터 준비
                        if (!salesDataMap[yearFromFile]) {
                            salesDataMap[yearFromFile] = JSON.parse(JSON.stringify(defaultData));
                        }
                        const currentYearData = salesDataMap[yearFromFile];

                        // --- CASE 4 (우선): 치료비용계획 (동의환자 수납 상세) ---
                        if (fileName.includes("치료비용계획") || fileName.includes("치료비용") || fileName.includes("동의") || fileName.includes("치료비")) {
                            const ci = {
                                patientName: -1, chartNo: -1, createdAt: -1, status: -1, payStatus: -1,
                                contractAmount: -1, paidAmount: -1, lastVisit: -1, nextAppt: -1
                            };
                            let headerRowIdx = -1;

                            for (let i = 0; i < Math.min(20, rawData.length); i++) {
                                const row = rawData[i] || [];
                                let found = 0;
                                row.forEach((cell, idx) => {
                                    if (cell == null) return;
                                    const s = String(cell).trim().replace(/\s+/g, '');
                                    if (s.includes('환자') || s === '성명' || s === '이름' || s === '환자명') { ci.patientName = idx; found++; }
                                    else if (s.includes('차트') || s.includes('번호') || s.includes('ID') || s === '차트번호') { ci.chartNo = idx; found++; }
                                    else if (s.includes('작성일') || s.includes('상담일') || s.includes('날짜')) { ci.createdAt = idx; found++; }
                                    else if (s.includes('진행상태') || (s.includes('진행') && s.includes('상태'))) { ci.status = idx; found++; }
                                    else if (s.includes('수납상태') || (s.includes('수납') && s.includes('상태')) || s.includes('결제상태')) { ci.payStatus = idx; found++; }
                                    else if (s.includes('계약금액') || s.includes('계획금액') || s.includes('총금액') || s.includes('치료금액')) { ci.contractAmount = idx; found++; }
                                    else if (s.includes('현재수납') || s.includes('수납금액') || s.includes('납부금액') || s.includes('받은금액') || s.includes('수납액') || s.includes('결제금액') || s.includes('실제로받은') || s.includes('실수납') || s === '수납' || s === '결제') { ci.paidAmount = idx; found++; }
                                    else if (s.includes('최종내원') || s.includes('마지막내원') || s.includes('최근내원')) { ci.lastVisit = idx; found++; }
                                    else if (s.includes('다음예약') || s.includes('예약일') || s.includes('다음방문')) { ci.nextAppt = idx; found++; }
                                });
                                if (found >= 1) { headerRowIdx = i; break; }
                            }

                            if (headerRowIdx !== -1) {
                                const plans = [];
                                for (let i = headerRowIdx + 1; i < rawData.length; i++) {
                                    const row = rawData[i] || [];
                                    const name = ci.patientName !== -1 ? String(row[ci.patientName] || '').trim() : (row[0] ? String(row[0]).trim() : '');
                                    if (!name || name === '합계' || name === '총합계' || name === '환자명' || name === '성명') continue;
                                    const contract = ci.contractAmount !== -1 ? parseNum(row[ci.contractAmount]) : 0;
                                    const paid = ci.paidAmount !== -1 ? parseNum(row[ci.paidAmount]) : 0;
                                    
                                    plans.push({
                                        chartNo: ci.chartNo !== -1 ? String(row[ci.chartNo] || '').trim() : '',
                                        patientName: name,
                                        createdAt: ci.createdAt !== -1 ? String(row[ci.createdAt] || '').trim() : `${yearFromFile}-${monthFromFile}`,
                                        status: ci.status !== -1 ? String(row[ci.status] || '').trim() : '',
                                        payStatus: ci.payStatus !== -1 ? String(row[ci.payStatus] || '').trim() : '',
                                        contractAmount: contract,
                                        paidAmount: paid,
                                        lastVisit: ci.lastVisit !== -1 ? String(row[ci.lastVisit] || '').trim() : '',
                                        nextAppt: ci.nextAppt !== -1 ? String(row[ci.nextAppt] || '').trim() : '',
                                        year: yearFromFile,
                                        month: monthFromFile
                                    });
                                }
                                
                                // [Upsert 로직 적용] 개별 환자 단위로 중복 체크 및 업데이트
                                const savedPlans = localStorage.getItem('treatment_plan_data');
                                let allPlans = savedPlans ? JSON.parse(savedPlans) : [];
                                
                                plans.forEach(newP => {
                                    const index = allPlans.findIndex(oldP => {
                                        const oldName = String(oldP.patientName || '').replace(/\s+/g, '');
                                        const newName = String(newP.patientName || '').replace(/\s+/g, '');
                                        const oldChart = String(oldP.chartNo || '').trim();
                                        const newChart = String(newP.chartNo || '').trim();
                                        
                                        return oldP.year === newP.year && 
                                               oldP.month === newP.month && 
                                               oldChart === newChart && 
                                               oldName === newName;
                                    });
                                    if (index !== -1) {
                                        allPlans[index] = newP; // 기존 항목 업데이트
                                    } else {
                                        allPlans.push(newP); // 새 항목 추가
                                    }
                                });
                                
                                localStorage.setItem('treatment_plan_data', JSON.stringify(allPlans));
                                updatedCount++;
                                resolve();
                            } else {
                                reject(`파일 내 헤더를 찾을 수 없습니다. (${fileName})`);
                            }
                        }
                        else if (fileName.includes("연간장부") || fileName.includes("매출통합")) {
                            const colIndices = { month: -1, cash: -1, card: -1, other: -1, insurance: -1 };
                            let headerRowIdx = -1;
                            for (let i = 0; i < Math.min(30, rawData.length); i++) {
                                const row = rawData[i] || [];
                                let foundMetrics = 0;
                                row.forEach((cell, idx) => {
                                    if (cell != null) {
                                        const strCell = String(cell).trim().replace(/\s+/g, '');
                                        // 월/구분 헤더
                                        if (strCell === '월' || (strCell.includes('구분') && strCell.length <= 5)) colIndices.month = idx;
                                        
                                        // 수입 항목 (지출 항목은 명시적 제외)
                                        if (strCell.includes('현금') && (strCell.includes('수입') || strCell === '현금') && !strCell.includes('지출')) { 
                                            colIndices.cash = idx; foundMetrics++; 
                                        }
                                        else if (strCell.includes('카드') && (strCell.includes('수입') || strCell === '카드') && !strCell.includes('지출')) { 
                                            colIndices.card = idx; foundMetrics++; 
                                        }
                                        else if (strCell.includes('기타') && (strCell.includes('수입') || strCell.includes('온라인')) && !strCell.includes('지출')) { 
                                            colIndices.other = idx; foundMetrics++; 
                                        }
                                        // 보험청구 (공단부담 청구액만 타겟팅)
                                        else if (strCell.includes('공단부담') && (strCell.includes('청구액') || strCell.includes('청구'))) { 
                                            colIndices.insurance = idx; foundMetrics++; 
                                        }
                                    }
                                });
                                if (foundMetrics >= 3) { headerRowIdx = i; break; }
                            }

                            if (headerRowIdx !== -1) {
                                for (let i = headerRowIdx + 1; i < rawData.length; i++) {
                                    const row = rawData[i] || [];
                                    const monthValRaw = String(row[colIndices.month || 0] || '');
                                    const monthVal = extractMonth(monthValRaw);
                                    if (monthVal) {
                                        const d = currentData.find(item => item.month === monthVal);
                                        if (d) {
                                            d.cash = parseNum(row[colIndices.cash]);
                                            d.card = parseNum(row[colIndices.card]);
                                            d.other = parseNum(row[colIndices.other]);
                                            d.insurance = parseNum(row[colIndices.insurance]);
                                            d.netSales = d.cash + d.card + d.other;
                                            d.total = d.netSales + d.insurance;
                                        }
                                    }
                                }
                                updatedCount++;
                                resolve();
                            } else {
                                reject(`연간장부 파일 구조 분석 실패: '카드', '현금', '기타(온라인)', '공단부담(청구액)' 헤더를 확인해주세요. (${fileName})`);
                            }
                        }
                        else if (fileName.includes("내원경로") || fileName.includes("신환") || fileName.includes("신규환자")) {
                            if (!monthFromFile) {
                                reject(`파일명에 월 정보가 없습니다 (${fileName})`);
                                return;
                            }

                            let extractedNewPatients = 0;
                            let extractedNewPatientSales = 0;

                            // [매트릭스 파싱] 헤더 열과 합계 행의 교차점 찾기
                            let newPatientCol = -1;
                            let salesCol = -1;
                            let totalRowIdx = -1;

                            // 1. 헤더 탐색 (가로 항목명 식별)
                            for (let r = 0; r < Math.min(50, rawData.length); r++) {
                                const row = rawData[r] || [];
                                for (let c = 0; c < row.length; c++) {
                                    const txt = String(row[c] || '').trim().replace(/\s+/g, '');
                                    
                                    // '신환수' 열 찾기
                                    if (txt === '신환수' || ((txt.includes('신환') || txt.includes('신규')) && (txt.includes('수') || txt.includes('인원')) && !txt.includes('내원'))) {
                                        if (!txt.includes('비') && !txt.includes('매출') && !txt.includes('액')) {
                                            newPatientCol = c;
                                        }
                                    }
                                    
                                    // '총 진료비' 열 찾기
                                    if (txt === '총진료비' || ((txt.includes('진료비') || txt.includes('매출') || txt.includes('금액')) && (txt.includes('총') || txt.includes('합계') || txt.includes('계')))) {
                                        salesCol = c;
                                    }
                                }
                                if (newPatientCol !== -1 && salesCol !== -1) break;
                            }

                            // 2. 합계 행 탐색 (세로 합계 라벨 식별)
                            for (let r = rawData.length - 1; r >= 0; r--) {
                                const row = rawData[r] || [];
                                const hasTotal = row.some(cell => {
                                    const s = String(cell || '').trim().replace(/\s+/g, '');
                                    return s === '합계' || s === '총계' || s === '전체합계' || s.includes('전체합계') || s.includes('총합계');
                                });
                                if (hasTotal) {
                                    totalRowIdx = r;
                                    break;
                                }
                            }

                            // 3. 데이터 추출 (교차 부분)
                            if (totalRowIdx !== -1) {
                                if (newPatientCol !== -1) extractedNewPatients = parseNum(rawData[totalRowIdx][newPatientCol]);
                                if (salesCol !== -1) extractedNewPatientSales = parseNum(rawData[totalRowIdx][salesCol]);
                            }

                            // [Fallback] 매트릭스 탐색 실패 시 주변 서치
                            if (extractedNewPatients === 0 || extractedNewPatientSales === 0) {
                                for (let r = 0; r < Math.min(200, rawData.length); r++) {
                                    const row = rawData[r] || [];
                                    for (let c = 0; c < row.length; c++) {
                                        const cellText = String(row[c] || '').trim().replace(/\s+/g, '');
                                        if (extractedNewPatients === 0 && (cellText === '신환수' || (cellText.includes('신환') && cellText.includes('합계')))) {
                                            extractedNewPatients = parseNum(row[c+1]);
                                        }
                                        if (extractedNewPatientSales === 0 && (cellText === '총진료비' || (cellText.includes('진료비') && cellText.includes('합계')))) {
                                            extractedNewPatientSales = parseNum(row[c+1]);
                                        }
                                    }
                                }
                            }

                            const d = currentYearData.find(item => item.month === monthFromFile);
                            if (d) {
                                if (extractedNewPatients > 0) d.newPatient = extractedNewPatients;
                                if (extractedNewPatientSales > 0) d.newPatientSales = extractedNewPatientSales;
                                
                                alert(`[신환수익비교 연동 완료] ${yearFromFile} ${monthFromFile}\n신환 수: ${extractedNewPatients.toLocaleString()}명\n신환 매출(총 진료비): ${extractedNewPatientSales.toLocaleString()}원`);
                                updatedCount++;
                                resolve();
                            } else {
                                reject(`대시보드에서 ${yearFromFile} ${monthFromFile} 데이터를 찾을 수 없습니다.`);
                            }
                        }
                        else if (fileName.includes("임플란트수술통계")) {
                            if (!monthFromFile) {
                                reject(`파일명에 월 정보가 없습니다 (${fileName})`);
                                return;
                            }

                            let stats = {
                                month: monthFromFile,
                                implantTotal: 0,
                                osstem: 0, dentium: 0, dio: 0, straumann: 0,
                                crestal: 0, lateral: 0, gbr: 0
                            };

                            let foundValidSheet = false;

                            for (const sName of wb.SheetNames) {
                                const ws = wb.Sheets[sName];
                                const sheetData = XLSX.utils.sheet_to_json(ws, { header: 1 });
                                
                                let headers = { count: -1, crestal: -1, lateral: -1, gbr: -1, brand: -1 };
                                let imHeaderRowIdx = -1;

                                for (let r = 0; r < Math.min(30, sheetData.length); r++) {
                                    const row = sheetData[r] || [];
                                    let foundCount = 0;
                                    row.forEach((cell, c) => {
                                        if (!cell) return;
                                        const txt = String(cell).trim().replace(/\s+/g, '');
                                        const lowTxt = txt.toLowerCase();
                                        
                                        if (txt.includes('사용개수') || txt.includes('사용갯수') || txt.includes('수량')) {
                                            headers.count = c; foundCount++;
                                        } else if (lowTxt.includes('crestal')) {
                                            headers.crestal = c; foundCount++;
                                        } else if (lowTxt.includes('lateral')) {
                                            headers.lateral = c; foundCount++;
                                        } else if (lowTxt.includes('gbr')) {
                                            headers.gbr = c; foundCount++;
                                        } else if (txt.includes('재료') || txt.includes('품명') || txt.includes('제조') || txt.includes('구분') || txt.includes('모델') || txt.includes('종류')) {
                                            if (headers.brand === -1) { headers.brand = c; foundCount++; }
                                        }
                                    });
                                    if (foundCount >= 1) { imHeaderRowIdx = r; break; }
                                }

                                if (imHeaderRowIdx !== -1 && (headers.count !== -1 || headers.brand !== -1)) {
                                    for (let r = imHeaderRowIdx + 1; r < sheetData.length; r++) {
                                        const row = sheetData[r];
                                        if (!row) continue;
                                        const count = headers.count !== -1 ? parseNum(row[headers.count]) : 0;
                                        const rowCount = count > 0 ? count : (headers.brand !== -1 && row[headers.brand] ? 1 : 0);
                                        if (rowCount > 0) stats.implantTotal += rowCount;
                                        if (headers.crestal !== -1) stats.crestal += parseNum(row[headers.crestal]);
                                        if (headers.lateral !== -1) stats.lateral += parseNum(row[headers.lateral]);
                                        if (headers.gbr !== -1) stats.gbr += parseNum(row[headers.gbr]);
                                        if (headers.brand !== -1 && row[headers.brand]) {
                                            const brandTxt = String(row[headers.brand] || '').toUpperCase();
                                            if (brandTxt.includes('OSSTEM') || brandTxt.includes('오스템')) stats.osstem += rowCount;
                                            else if (brandTxt.includes('DENTIUM') || brandTxt.includes('덴티움')) stats.dentium += rowCount;
                                            else if (brandTxt.includes('디오') || brandTxt.includes('DIO')) stats.dio += rowCount;
                                            else if (brandTxt.includes('STRAUMANN') || brandTxt.includes('스트라우만')) stats.straumann += rowCount;
                                        }
                                    }
                                    foundValidSheet = true;
                                    break; 
                                }
                            }

                            if (!treatmentPerfMap[yearFromFile]) {
                                treatmentPerfMap[yearFromFile] = [
                                    { month: '1월', surg1: 0, implantTotal: 0, osstem: 0, dentium: 0, dio: 0, straumann: 0, crestal: 0, lateral: 0, gbr: 0, insImp: 0, insDent: 0 },
                                    { month: '2월', surg1: 0, implantTotal: 0, osstem: 0, dentium: 0, dio: 0, straumann: 0, crestal: 0, lateral: 0, gbr: 0, insImp: 0, insDent: 0 },
                                    { month: '3월', surg1: 0, implantTotal: 0, osstem: 0, dentium: 0, dio: 0, straumann: 0, crestal: 0, lateral: 0, gbr: 0, insImp: 0, insDent: 0 },
                                    { month: '4월', surg1: 0, implantTotal: 0, osstem: 0, dentium: 0, dio: 0, straumann: 0, crestal: 0, lateral: 0, gbr: 0, insImp: 0, insDent: 0 },
                                    { month: '5월', surg1: 0, implantTotal: 0, osstem: 0, dentium: 0, dio: 0, straumann: 0, crestal: 0, lateral: 0, gbr: 0, insImp: 0, insDent: 0 },
                                    { month: '6월', surg1: 0, implantTotal: 0, osstem: 0, dentium: 0, dio: 0, straumann: 0, crestal: 0, lateral: 0, gbr: 0, insImp: 0, insDent: 0 },
                                    { month: '7월', surg1: 0, implantTotal: 0, osstem: 0, dentium: 0, dio: 0, straumann: 0, crestal: 0, lateral: 0, gbr: 0, insImp: 0, insDent: 0 },
                                    { month: '8월', surg1: 0, implantTotal: 0, osstem: 0, dentium: 0, dio: 0, straumann: 0, crestal: 0, lateral: 0, gbr: 0, insImp: 0, insDent: 0 },
                                    { month: '9월', surg1: 0, implantTotal: 0, osstem: 0, dentium: 0, dio: 0, straumann: 0, crestal: 0, lateral: 0, gbr: 0, insImp: 0, insDent: 0 },
                                    { month: '10월', surg1: 0, implantTotal: 0, osstem: 0, dentium: 0, dio: 0, straumann: 0, crestal: 0, lateral: 0, gbr: 0, insImp: 0, insDent: 0 },
                                    { month: '11월', surg1: 0, implantTotal: 0, osstem: 0, dentium: 0, dio: 0, straumann: 0, crestal: 0, lateral: 0, gbr: 0, insImp: 0, insDent: 0 },
                                    { month: '12월', surg1: 0, implantTotal: 0, osstem: 0, dentium: 0, dio: 0, straumann: 0, crestal: 0, lateral: 0, gbr: 0, insImp: 0, insDent: 0 }
                                ];
                            }
                            const currentYearPerfData = treatmentPerfMap[yearFromFile];
                            
                            const monthIdx = currentYearPerfData.findIndex(d => d.month === monthFromFile);
                            if (monthIdx !== -1) {
                                currentYearPerfData[monthIdx] = { ...currentYearPerfData[monthIdx], ...stats };
                                alert(`[임플란트 수술통계 연동 완료] ${yearFromFile} ${monthFromFile} 데이터가 진료분석에 적용되었습니다.`);
                                updatedCount++;
                                resolve();
                            } else {
                                reject(`대시보드에서 ${yearFromFile} ${monthFromFile} 데이터를 찾을 수 없습니다.`);
                            }
                        }
                        else if (fileName.includes("환자별 수납내역") || fileName.includes("환자별수납내역")) {
                            const ExtractedTopPatients = [];
                            const colMap = {
                                chartNo: -1,
                                patientName: -1,
                                doctor: -1,
                                revenue: -1,
                                paid: -1,
                                path: -1,
                                rowMonth: -1
                            };

                            // 1. 헤더 행 찾기
                            let headerRowIdx = -1;
                            for (let r = 0; r < Math.min(30, rawData.length); r++) {
                                const row = rawData[r] || [];
                                row.forEach((cell, c) => {
                                    if (!cell) return;
                                    const txt = String(cell).trim().replace(/\s+/g, '');
                                    if (txt.includes('차트') || txt.includes('번호')) colMap.chartNo = c;
                                    else if (txt.includes('성명') || txt.includes('이름') || txt.includes('환자명')) colMap.patientName = c;
                                    else if (txt.includes('담당의') || txt.includes('의사')) colMap.doctor = c;
                                    else if (txt.includes('진료비') || txt.includes('발생액') || txt.includes('총금액')) colMap.revenue = c;
                                    else if (txt.includes('수납액') || txt.includes('실수납') || txt.includes('입금액')) colMap.paid = c;
                                    else if (txt.includes('내원경로') || txt.includes('유입')) colMap.path = c;
                                    else if (txt === '월' || txt === '해당월' || txt.includes('진료월') || txt.includes('날짜') || txt.includes('일자')) colMap.rowMonth = c;
                                });
                                if (colMap.patientName !== -1 && (colMap.revenue !== -1 || colMap.paid !== -1)) {
                                    headerRowIdx = r;
                                    break;
                                }
                            }

                            if (headerRowIdx !== -1) {
                                for (let r = headerRowIdx + 1; r < rawData.length; r++) {
                                    const row = rawData[r];
                                    if (!row || !row[colMap.patientName]) continue;
                                    
                                    // 행별 월 정보 추출 시도
                                    let rowMonth = monthFromFile || '';
                                    if (!rowMonth && colMap.rowMonth !== -1) {
                                        const rawMonthVal = String(row[colMap.rowMonth] || '');
                                        const mMatch = rawMonthVal.match(/(\d{1,2})월/) || rawMonthVal.match(/-(\d{2})-/);
                                        if (mMatch) rowMonth = parseInt(mMatch[1]) + '월';
                                    }

                                    const p = {
                                        chartNo: String(row[colMap.chartNo] || '').trim(),
                                        patientName: String(row[colMap.patientName] || '').trim(),
                                        doctor: String(row[colMap.doctor] || '').trim(),
                                        revenue: parseNum(row[colMap.revenue]),
                                        paid: parseNum(row[colMap.paid]),
                                        path: String(row[colMap.path] || '').trim(),
                                        month: rowMonth,
                                        year: yearFromFile
                                    };
                                    
                                    if (p.patientName && (p.revenue > 0 || p.paid > 0)) {
                                        ExtractedTopPatients.push(p);
                                    }
                                }
                                
                                let currentTopData = [];
                                try {
                                    const saved = localStorage.getItem('top_patients_raw_data');
                                    if (saved) currentTopData = JSON.parse(saved);
                                } catch (e) {}
                                
                                // 데이터 병합 및 중복 제거 (연도/월/이름/차트번호 기준)
                                ExtractedTopPatients.forEach(newP => {
                                    const idx = currentTopData.findIndex(oldP => 
                                        oldP.year === newP.year && 
                                        oldP.month === newP.month && 
                                        oldP.patientName === newP.patientName && 
                                        oldP.chartNo === newP.chartNo
                                    );
                                    if (idx !== -1) currentTopData[idx] = newP;
                                    else currentTopData.push(newP);
                                });
                                
                                localStorage.setItem('top_patients_raw_data', JSON.stringify(currentTopData));
                                alert(`[환자별 수납내역 연동 완료] 총 ${ExtractedTopPatients.length}건의 데이터를 가져왔습니다.`);
                                updatedCount++;
                                resolve();
                            } else {
                                reject(`'환자별 수납내역' 파일 구조 분석 실패: '성명', '수납액' 등의 헤더를 찾을 수 없습니다.`);
                            }
                        }
                        else if (fileName.includes("수납내역") || fileName.includes("환자별") || fileName.includes("의사별진료비수납액")) {
                            const drColMap = { doctor: -1, amount: -1, insurance: -1, name: -1, chartNo: -1, path: -1 };
                            let drHeaderRowIdx = -1;

                            // 1. 헤더 탐색 로직 (의사별 매출/수납내역 전용)
                            for (let r = 0; r < Math.min(30, rawData.length); r++) {
                                const row = rawData[r] || [];
                                row.forEach((cell, c) => {
                                    if (!cell) return;
                                    const txt = String(cell).trim().replace(/\s+/g, '');
                                    if (txt.includes('의사') || txt.includes('담당의') || txt === '의사명') drColMap.doctor = c;
                                    else if (txt.includes('총수납') || txt === '수납액' || txt === '합계' || txt === '실수납액') drColMap.amount = c;
                                    else if (txt.includes('공단부담') || txt.includes('보험') || txt.includes('보험금')) drColMap.insurance = c;
                                    else if (txt.includes('차트') || txt.includes('번호')) drColMap.chartNo = c;
                                    else if (txt === '성명' || txt === '이름' || txt === '환자명') drColMap.name = c;
                                    else if (txt.includes('내원경로')) drColMap.path = c;
                                });
                                if (drColMap.doctor !== -1 && (drColMap.amount !== -1 || drColMap.insurance !== -1)) {
                                    drHeaderRowIdx = r;
                                    break;
                                }
                            }

                            if (drHeaderRowIdx !== -1) {
                                const patients = [];
                                const doctorAgg = {};
                                for (let i = drHeaderRowIdx + 1; i < rawData.length; i++) {
                                    const row = rawData[i] || [];
                                    const amount = drColMap.amount !== -1 ? parseNum(row[drColMap.amount]) : 0;
                                    const insurance = drColMap.insurance !== -1 ? parseNum(row[drColMap.insurance]) : 0;
                                    const docName = String(row[drColMap.doctor] || '공동').trim() || '공동';
                                    const chartNo = drColMap.chartNo !== -1 ? String(row[drColMap.chartNo] || '').trim() : null;
                                    
                                    if (docName && (amount !== 0 || insurance !== 0) && docName !== '합계' && docName !== '총합계' && docName !== '의사명' && docName !== '담당의') {
                                        if (chartNo && chartNo !== '합계' && chartNo !== '번호') {
                                            patients.push({
                                                chartNo: chartNo,
                                                name: drColMap.name !== -1 ? String(row[drColMap.name] || '미기재') : '미기재',
                                                doctor: docName,
                                                pure: amount,
                                                insurance: insurance,
                                                path: drColMap.path !== -1 ? String(row[drColMap.path] || '직접내원') : '직접내원'
                                            });
                                        }
                                        if (!doctorAgg[docName]) doctorAgg[docName] = { pure: 0, insurance: 0 };
                                        doctorAgg[docName].pure += amount;
                                        doctorAgg[docName].insurance += insurance;
                                    }
                                }

                                const d = currentYearData.find(item => item.month === monthFromFile);
                                if (d) {
                                    if (patients.length > 0) {
                                        patients.sort((a, b) => (b.pure + b.insurance) - (a.pure + a.insurance));
                                        d.topPatients = patients.slice(0, 20);
                                    }
                                    d.doctorData = doctorAgg;
                                    updatedCount++;
                                    const drList = Object.keys(doctorAgg).join(', ');
                                    const colInfo = `[컬럼 매칭 정보]\n진료의사: ${drColMap.doctor+1}번\n총 수납액(순수): ${drColMap.amount===-1 ? '없음' : (drColMap.amount+1)+'번'}\n공단부담금(보험): ${drColMap.insurance===-1 ? '없음' : (drColMap.insurance+1)+'번'}`;
                                    alert(`[의사별 매출 연동 성공] ${yearFromFile} ${monthFromFile} 데이터를 업데이트했습니다.\n${colInfo}\n(매칭된 의사: ${drList})`);
                                    resolve();
                                } else {
                                    reject(`월 데이터를 찾을 수 없습니다 (${monthFromFile})`);
                                }
                            } else {
                                reject(`파일 구조 분석 실패 (${fileName}): 의사명 및 금액(수납액/보험) 컬럼을 찾을 수 없습니다.`);
                            }
                        }
                        else if (fileName.includes("월간장부")) {
                            const month = extractMonth(fileName);
                            if (!month) {
                                reject(`파일명에 월 정보가 없습니다 (${fileName})`);
                                return;
                            }
                            
                            let cashVal = 0;
                            let cardVal = 0;
                            let otherVal = 0;

                            // 가로 항목(컬럼) 및 세로 통합행(로우) 인덱스 찾기
                            let cashCol = -1;
                            let cardCol = -1;
                            let otherCol = -1;
                            let tonghapRowIdx = -1;

                            // 1. 항목명(가로) 인덱스 식별
                            for (let r = 0; r < Math.min(100, rawData.length); r++) {
                                const row = rawData[r] || [];
                                for (let c = 0; c < row.length; c++) {
                                    if (row[c] == null) continue;
                                    const txt = String(row[c]).trim().replace(/\s+/g, '');
                                    if (txt.includes('현금수입')) cashCol = c;
                                    else if (txt.includes('카드수입')) cardCol = c;
                                    else if (txt.includes('기타(온라인)수입')) otherCol = c;
                                }
                                if (cashCol !== -1 && cardCol !== -1 && otherCol !== -1) break;
                            }

                            // 2. 통합행(세로) 인덱스 식별 (예: "1월 통합")
                            for (let r = 0; r < rawData.length; r++) {
                                const row = rawData[r] || [];
                                const found = row.some(cell => {
                                    if (cell == null) return false;
                                    const s = String(cell).trim().replace(/\s+/g, '');
                                    // 해당 월과 '통합' 또는 '합계' 키워드 매칭
                                    return s.includes(month) && (s.includes('통합') || s.includes('합계') || s.includes('계'));
                                });
                                if (found) {
                                    tonghapRowIdx = r;
                                    break;
                                }
                            }

                            // 3. 교차점 데이터 추출
                            if (tonghapRowIdx !== -1) {
                                if (cashCol !== -1) cashVal = parseNum(rawData[tonghapRowIdx][cashCol]);
                                if (cardCol !== -1) cardVal = parseNum(rawData[tonghapRowIdx][cardCol]);
                                if (otherCol !== -1) otherVal = parseNum(rawData[tonghapRowIdx][otherCol]);
                            }

                            // [Fallback] 매트릭스 탐색 실패 시 주변 서치
                            if (tonghapRowIdx === -1 || (cashVal === 0 && cardVal === 0 && otherVal === 0)) {
                                for (let r = 0; r < Math.min(100, rawData.length); r++) {
                                    const row = rawData[r] || [];
                                    for (let c = 0; c < row.length; c++) {
                                        if (row[c] == null) continue;
                                        const txt = String(row[c]).trim().replace(/\s+/g, '');
                                        if (txt.includes('현금수입') && cashVal === 0) cashVal = parseNum(row[c+1]);
                                        else if (txt.includes('카드수입') && cardVal === 0) cardVal = parseNum(row[c+1]);
                                        else if (txt.includes('기타(온라인)수입') && otherVal === 0) otherVal = parseNum(row[c+1]);
                                    }
                                }
                            }

                            const d = currentYearData.find(item => item.month === month);
                            if (d) {
                                d.cash = cashVal;
                                d.card = cardVal;
                                d.other = otherVal;
                                d.netSales = cashVal + cardVal + otherVal;
                                d.total = d.netSales + (Number(d.insurance) || 0);
                                
                                alert(`[월간장부 자동 연동] ${yearFromFile} ${month} 결과\n행: "${month} 통합/합계"\n현금: ${cashVal.toLocaleString()}\n카드: ${cardVal.toLocaleString()}\n기타: ${otherVal.toLocaleString()}`);
                                updatedCount++;
                                resolve();
                            } else {
                                reject(`대시보드에서 ${yearFromFile} ${month} 데이터를 찾을 수 없습니다.`);
                            }
                        }
                        else {
                            reject(`알 수 없는 파일 형식입니다 (${fileName}). 파일명에 '월간장부', '치료비용계획', '연간장부', '내원경로', '수납내역' 등의 키워드를 포함해주세요.`);
                        }
                    } catch (error) {
                        reject(`분석 중 오류 발생 (${fileName})`);
                    }
                };
                reader.readAsBinaryString(file);
            });

            try {
                await processFile();
            } catch (err) {
                alert(err);
            }
        }

        if (updatedCount > 0) {
            localStorage.setItem('parsed_sales_data', JSON.stringify(salesDataMap));
            localStorage.setItem('treatment_performance_data', JSON.stringify(treatmentPerfMap));
            alert(`${updatedCount}개의 파일 데이터가 파싱되어 연도별 분석에 적용되었습니다.`);
            window.location.reload();
        }
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    return (
        <div className="admin-container">
            <div className="page-header">
                <h1>관리자 패널</h1>
                <p>시스템 설정 및 데이터 관리를 담당하는 공간입니다.</p>
            </div>

            <div className="admin-grid">
                {/* User Management Section */}
                <div className="admin-card user-management">
                    <div className="admin-card-header">
                        <Users size={24} className="admin-card-icon" />
                        <h2>로그인 아이디 관리</h2>
                    </div>
                    <div className="table-responsive">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>이름</th>
                                    <th>치과명</th>
                                    <th>직책</th>
                                    <th>이메일(ID)</th>
                                    <th>가입일</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.length > 0 ? (
                                    users.map(user => (
                                        <tr key={user.id}>
                                            <td>{user.name}</td>
                                            <td>{user.clinicName}</td>
                                            <td>{user.position}</td>
                                            <td>{user.email}</td>
                                            <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="5" className="empty-state">가입된 사용자가 없습니다.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* File Upload Section */}
                <div className="admin-card file-upload">
                    <div className="admin-card-header">
                        <Upload size={24} className="admin-card-icon" />
                        <h2>엑셀 파일 업로드</h2>
                    </div>
                    
                    <div className="upload-area" onClick={triggerFileInput}>
                        <FileSpreadsheet size={48} className="upload-icon" />
                        <h3>파일을 여기로 드래그하거나 클릭하여 업로드하세요</h3>
                        <p>.xlsx, .xls, .csv 파일 지원</p>
                        <input 
                            type="file" 
                            multiple
                            ref={fileInputRef} 
                            onChange={handleFileUpload}
                            accept=".xlsx, .xls, .csv"
                            style={{ display: 'none' }}
                        />
                    </div>


                </div>
            </div>
        </div>
    );
};

export default Admin;
