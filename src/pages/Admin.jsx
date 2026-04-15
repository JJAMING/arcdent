import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Users, Upload, FileSpreadsheet, CheckCircle, XCircle, Image, Trash2, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseImplantExcel } from '../utils/implantExcelParser';
import { parseInsuranceExcel } from '../utils/insuranceExcelParser';
import { parseLedgerImage, saveLedgerData, extractYearMonthFromFileName } from '../utils/ledgerImageParser';
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
const OCR_FIELDS = [
    { key: 'workDays', label: '진료일수',        unit: '일' },
    { key: 'newPt',    label: '신환',            unit: '명' },
    { key: 'oldPt',    label: '구환',            unit: '명' },
    { key: 'total',    label: '총 접수환자수',   unit: '명' },
    { key: 'avgNewPt', label: '신환 일평균',      unit: '명' },
    { key: 'avgOldPt', label: '구환 일평균 (자동)', unit: '명', readOnly: true },
];

const Admin = () => {
    const { getAllUsers } = useAuth();
    const [users, setUsers] = useState([]);
    const fileInputRef  = useRef(null);
    const imageInputRef = useRef(null);
    const [uploadLog, setUploadLog]       = useState([]);
    const [uploadedImages, setUploadedImages] = useState([]);
    const [isDragOver, setIsDragOver]     = useState(false);

    // OCR 모달
    const [ocrModal, setOcrModal]   = useState(null);
    const [ocrLoading, setOcrLoading] = useState(false);

    useEffect(() => {
        setUsers(getAllUsers());
        const savedImages = localStorage.getItem('admin_uploaded_images');
        if (savedImages) {
            try { setUploadedImages(JSON.parse(savedImages)); } catch (e) { /* ignore */ }
        }
    }, []);

    const addLog = (type, msg) => {
        setUploadLog(prev => [...prev, { type, msg, id: Date.now() }]);
    };

    // ── 엑셀 업로드 처리 ──────────────────────────────────────────────────────
    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        e.target.value = '';
        setUploadLog([]);

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
                        // 월간장부 (엑셀 버전)
                        else if (fileName.includes('월간장부')) {
                            const month = extractMonth(fileName);
                            let cashVal = 0, cardVal = 0, otherVal = 0;
                            let cashCol = -1, cardCol = -1, otherCol = -1, tonghapIdx = -1;
                            for (let r = 0; r < Math.min(100, rawData.length); r++) {
                                const row = rawData[r] || [];
                                row.forEach((cell, idx) => {
                                    if (!cell) return;
                                    const t = String(cell).replace(/\s+/g, '');
                                    if (t.includes('현금수입')) cashCol = idx;
                                    else if (t.includes('카드수입')) cardCol = idx;
                                    else if (t.includes('기타(온라인)')) otherCol = idx;
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
                            }
                            const d = currentYearData.find(item => item.month === month);
                            if (d) {
                                d.cash = cashVal; d.card = cardVal; d.other = otherVal;
                                d.netSales = cashVal + cardVal + otherVal;
                                d.total = d.netSales + (Number(d.insurance) || 0);
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
    const triggerImageInput = () => imageInputRef.current?.click();

    const isLedgerFile = (filename) => {
        const name = filename.replace(/\s/g, '');
        return name.includes('월간장부');
    };

    const saveToGallery = (file, dataUrl) => {
        const newImage = { id: Date.now() + Math.random(), name: file.name, dataUrl, size: file.size, uploadedAt: new Date().toLocaleString('ko-KR') };
        setUploadedImages(prev => {
            const updated = [...prev, newImage];
            localStorage.setItem('admin_uploaded_images', JSON.stringify(updated));
            return updated;
        });
    };

    const handleImageUpload = async (files) => {
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;

        for (const file of imageFiles) {
            // 모든 이미지 → 갤러리 저장
            const reader = new FileReader();
            const dataUrl = await new Promise(resolve => {
                reader.onload = e => resolve(e.target.result);
                reader.readAsDataURL(file);
            });
            saveToGallery(file, dataUrl);

            // 월간장부이면 OCR 실행
            if (isLedgerFile(file.name)) {
                const ym = extractYearMonthFromFileName(file.name);
                setOcrModal({
                    file, previewUrl: dataUrl, ocrProgress: 0,
                    yearMonth: ym || { year: '2025', month: '1월' },
                    yearMonthDetected: !!ym,
                    parsedData: { workDays: '', newPt: '', oldPt: '', total: '', avgNewPt: '', avgOldPt: '' },
                    rawText: '', status: 'loading',
                });
                setOcrLoading(true);

                try {
                    const result = await parseLedgerImage(file, (progress) => {
                        setOcrModal(prev => prev ? { ...prev, ocrProgress: progress } : prev);
                    });

                    // 구환 일평균 자동 계산
                    const pd = result.parsedData;
                    if (pd.oldPt && pd.workDays && !pd.avgOldPt) {
                        pd.avgOldPt = parseFloat((pd.oldPt / pd.workDays).toFixed(1));
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
                    setOcrLoading(false);
                }
            }
        }
    };

    const handleImageInputChange = (e) => { handleImageUpload(e.target.files); e.target.value = ''; };

    // OCR 모달 수치 변경
    const handleOcrFieldChange = (field, val) => {
        setOcrModal(prev => {
            if (!prev) return prev;
            const updated = { ...prev, parsedData: { ...prev.parsedData, [field]: val } };
            const oldPt   = parseFloat(updated.parsedData.oldPt);
            const workDays = parseFloat(updated.parsedData.workDays);
            if (!isNaN(oldPt) && !isNaN(workDays) && workDays > 0) {
                updated.parsedData.avgOldPt = parseFloat((oldPt / workDays).toFixed(1));
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
    const handleDrop = (e) => { e.preventDefault(); setIsDragOver(false); handleImageUpload(e.dataTransfer.files); };

    const handleDeleteImage = (id) => {
        setUploadedImages(prev => {
            const updated = prev.filter(img => img.id !== id);
            localStorage.setItem('admin_uploaded_images', JSON.stringify(updated));
            return updated;
        });
    };

    const formatFileSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    // ── JSX ──────────────────────────────────────────────────────────────────
    return (
        <div className="admin-container">
            <div className="page-header">
                <h1>관리자 패널</h1>
                <p>시스템 설정 및 데이터 관리를 담당하는 공간입니다.</p>
            </div>

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
                            const keyFields = ['workDays', 'newPt', 'oldPt', 'total'];
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

                {/* 엑셀 파일 업로드 */}
                <div className="admin-card file-upload">
                    <div className="admin-card-header">
                        <Upload size={24} className="admin-card-icon" />
                        <h2>엑셀 파일 업로드</h2>
                    </div>
                    <div className="upload-area" onClick={triggerFileInput}>
                        <FileSpreadsheet size={48} className="upload-icon" />
                        <h3>파일을 여기로 드래그하거나 클릭하여 업로드하세요</h3>
                        <p>.xlsx, .xls, .csv 지원</p>
                        <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            💡 임플란트 수술통계 및 보험수가별 통계 엑셀 지원
                        </p>
                        <input type="file" multiple ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls, .csv" style={{ display: 'none' }} />
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

                {/* 사진 업로드 */}
                <div className="admin-card image-upload">
                    <div className="admin-card-header">
                        <Image size={24} className="admin-card-icon" />
                        <h2>사진 업로드</h2>
                    </div>

                    <div style={{ marginBottom: '0.75rem', padding: '0.65rem 0.9rem', background: 'rgba(124,58,237,0.07)', borderRadius: '0.5rem', fontSize: '0.82rem', color: '#7c3aed', lineHeight: 1.6 }}>
                        💡 파일명에 <strong>월간장부</strong>가 포함된 이미지를 업로드하면<br />
                        OCR 분석 후 <strong>환자분석 데이터로 자동 입력</strong>됩니다.<br />
                        <span style={{ color: '#94a3b8' }}>예: 2025년3월_월간장부.jpg</span>
                    </div>

                    <div
                        className={`upload-area image-upload-area${isDragOver ? ' drag-over' : ''}`}
                        onClick={triggerImageInput}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <Image size={48} className="upload-icon" />
                        <h3>사진을 여기로 드래그하거나 클릭하여 업로드하세요</h3>
                        <p>.jpg, .jpeg, .png, .gif, .webp 지원</p>
                        <input type="file" multiple ref={imageInputRef} onChange={handleImageInputChange} accept="image/*" style={{ display: 'none' }} />
                    </div>

                    {uploadedImages.length > 0 && (
                        <div className="image-gallery-section">
                            <h4 className="gallery-title">업로드된 사진 ({uploadedImages.length}장)</h4>
                            <div className="image-gallery">
                                {uploadedImages.map(img => (
                                    <div key={img.id} className="gallery-item">
                                        <div className="gallery-img-wrap">
                                            <img src={img.dataUrl} alt={img.name} className="gallery-img" />
                                            {isLedgerFile(img.name) && (
                                                <div style={{
                                                    position: 'absolute', bottom: 0, left: 0, right: 0,
                                                    background: 'rgba(124,58,237,0.85)',
                                                    color: '#fff', fontSize: '0.68rem', textAlign: 'center', padding: '2px 0',
                                                }}>
                                                    📄 월간장부
                                                </div>
                                            )}
                                            <button className="gallery-delete-btn"
                                                onClick={(e) => { e.stopPropagation(); handleDeleteImage(img.id); }}
                                                title="삭제">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                        <div className="gallery-info">
                                            <span className="gallery-name" title={img.name}>{img.name}</span>
                                            <span className="gallery-meta">{formatFileSize(img.size)} · {img.uploadedAt}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default Admin;
