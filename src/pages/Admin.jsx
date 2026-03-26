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
    }, []);

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const savedDataStr = localStorage.getItem('parsed_sales_data');
        const defaultData = [
            { month: '1월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0 },
            { month: '2월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0 },
            { month: '3월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0 },
            { month: '4월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0 },
            { month: '5월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0 },
            { month: '6월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0 },
            { month: '7월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0 },
            { month: '8월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0 },
            { month: '9월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0 },
            { month: '10월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0 },
            { month: '11월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0 },
            { month: '12월', netSales: 0, insurance: 0, total: 0, cash: 0, card: 0, other: 0, newPatient: 0, agreed: 0 }
        ];
        let currentData = savedDataStr ? JSON.parse(savedDataStr) : defaultData;
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
                        const wsname = wb.SheetNames[0];
                        const ws = wb.Sheets[wsname];
                        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });

                        const parseNum = (val) => {
                            if (typeof val === 'number') return val;
                            if (typeof val === 'string') {
                                const cleaned = val.replace(/[^0-9.-]/g, '');
                                const num = parseFloat(cleaned);
                                return isNaN(num) ? 0 : num;
                            }
                            return 0;
                        };

                        const extractMonth = (str) => {
                            const match = str.match(/(\d{1,2})월/);
                            return match ? parseInt(match[1]) + '월' : null;
                        };

                        const monthFromFile = extractMonth(fileName);

                        // --- CASE 4 (우선): 치료비용계획 (동의환자 수납 상세) ---
                        if (fileName.includes("치료비용계획") || fileName.includes("치료비용")) {
                            const ci = {
                                patientName: -1, createdAt: -1, status: -1, payStatus: -1,
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
                                    if (!name) continue;
                                    plans.push({
                                        patientName: name,
                                        createdAt: ci.createdAt !== -1 ? String(row[ci.createdAt] || '').trim() : '',
                                        status: ci.status !== -1 ? String(row[ci.status] || '').trim() : '',
                                        payStatus: ci.payStatus !== -1 ? String(row[ci.payStatus] || '').trim() : '',
                                        contractAmount: contract,
                                        paidAmount: paid,
                                        lastVisit: ci.lastVisit !== -1 ? String(row[ci.lastVisit] || '').trim() : '',
                                        nextAppt: ci.nextAppt !== -1 ? String(row[ci.nextAppt] || '').trim() : '',
                                    });
                                }
                                if (plans.length > 0) {
                                    localStorage.setItem('treatment_plan_data', JSON.stringify(plans));
                                    updatedCount++;
                                    resolve();
                                } else {
                                    localStorage.setItem('treatment_plan_data', JSON.stringify([]));
                                    updatedCount++;
                                    resolve();
                                }
                            } else {
                                const plans = rawData.slice(1).map(row => ({
                                    patientName: String(row[0] || '').trim(),
                                    createdAt: String(row[1] || '').trim(),
                                    status: String(row[2] || '').trim(),
                                    payStatus: String(row[3] || '').trim(),
                                    contractAmount: parseNum(row[4]),
                                    paidAmount: parseNum(row[5]),
                                    lastVisit: String(row[6] || '').trim(),
                                    nextAppt: String(row[7] || '').trim(),
                                })).filter(r => r.patientName && r.patientName !== '합계');
                                localStorage.setItem('treatment_plan_data', JSON.stringify(plans));
                                updatedCount++;
                                resolve();
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
                        else if (fileName.includes("내원경로") || fileName.includes("신환")) {
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

                            // 1. 헤더 탐색 (최상단 20행 내에서 '신환수'와 '총진료비' 열 인덱스 확인)
                            for (let r = 0; r < Math.min(20, rawData.length); r++) {
                                const row = rawData[r] || [];
                                for (let c = 0; c < row.length; c++) {
                                    const txt = String(row[c] || '').trim().replace(/\s+/g, '');
                                    // '신환수'만 정확히 타겟 (내원객수와 엄격히 구분)
                                    if ((txt.includes('신환') || txt.includes('신규')) && (txt.includes('수') || txt.includes('인원')) && !txt.includes('내원')) {
                                        if (!txt.includes('비') && !txt.includes('매출')) newPatientCol = c;
                                    }
                                    if ((txt.includes('진료비') || txt.includes('매출')) && (txt.includes('합계') || txt.includes('총액') || txt.includes('액'))) {
                                        salesCol = c;
                                    }
                                }
                                if (newPatientCol !== -1 && salesCol !== -1) break;
                            }

                            // 2. 합계 행 탐색 (하단에서 역순으로 '합계' 행 찾기)
                            for (let r = rawData.length - 1; r >= 0; r--) {
                                const firstCell = String(rawData[r]?.[0] || rawData[r]?.[1] || '').trim();
                                if (firstCell === '합계' || firstCell === '총계' || firstCell === '전체합계') {
                                    totalRowIdx = r;
                                    break;
                                }
                            }

                            // 3. 데이터 추출
                            if (totalRowIdx !== -1) {
                                if (newPatientCol !== -1) extractedNewPatients = parseNum(rawData[totalRowIdx][newPatientCol]);
                                if (salesCol !== -1) extractedNewPatientSales = parseNum(rawData[totalRowIdx][salesCol]);
                            }

                            // [Fallback] 매트릭스 탐색 실패 시 그리드 서치 수행
                            if (extractedNewPatients === 0 || extractedNewPatientSales === 0) {
                                for (let r = 0; r < rawData.length; r++) {
                                    const row = rawData[r] || [];
                                    for (let c = 0; c < row.length; c++) {
                                        const cellText = String(row[c] || '').trim().replace(/\s+/g, '');
                                        if (cellText.includes('신환수') && !cellText.includes('내원') && (cellText.includes('합계') || cellText.includes('계'))) {
                                            for (let k = 1; k <= 3; k++) {
                                                const v = parseNum(row[c + k]);
                                                if (v > 0 && v < 2000) { extractedNewPatients = v; break; }
                                            }
                                        }
                                    }
                                }
                            }

                            const d = currentData.find(item => item.month === monthFromFile);
                            if (d) {
                                if (extractedNewPatients > 0) d.newPatient = extractedNewPatients;
                                if (extractedNewPatientSales > 0) d.newPatientSales = extractedNewPatientSales;
                                
                                localStorage.setItem('parsed_sales_data', JSON.stringify(currentData));
                                updatedCount++;
                                resolve();
                            } else {
                                reject(`파일 내 데이터(${extractedNewPatients}명, ${extractedNewPatientSales}원)는 찾았으나, ${monthFromFile} 데이터를 대시보드에 업데이트할 수 없습니다.`);
                            }
                        }
                        else if (fileName.includes("수납내역") || fileName.includes("환자별") || fileName.includes("의사별진료비수납액")) {
                            if (!monthFromFile) {
                                reject(`파일명에 월 정보가 없습니다 (${fileName})`);
                                return;
                            }

                            const colIndices = { chartNo: -1, name: -1, doctor: -1, amount: -1, path: -1 };
                            let headerRowIdx = -1;
                            
                            // Find headers
                            for (let i = 0; i < Math.min(20, rawData.length); i++) {
                                const row = rawData[i] || [];
                                row.forEach((cell, idx) => {
                                    if (cell != null) {
                                        const strCell = String(cell).trim().replace(/\s+/g, '');
                                        if (strCell.includes('차트번호')) colIndices.chartNo = idx;
                                        else if (strCell === '성명' || strCell === '이름' || strCell === '환자명') colIndices.name = idx;
                                        else if (strCell.includes('담당의') || strCell.includes('의사')) colIndices.doctor = idx;
                                        else if (strCell.includes('총수납액') || strCell.includes('수납합계')) colIndices.amount = idx;
                                        else if (strCell.includes('내원경로') || strCell.includes('유입')) colIndices.path = idx;
                                    }
                                });
                                if ((colIndices.chartNo !== -1 || colIndices.doctor !== -1) && colIndices.amount !== -1) {
                                    headerRowIdx = i;
                                    break;
                                }
                            }

                            if (headerRowIdx !== -1) {
                                const patients = [];
                                const doctorAgg = {};
                                for (let i = headerRowIdx + 1; i < rawData.length; i++) {
                                    const row = rawData[i] || [];
                                    const amount = parseNum(row[colIndices.amount]);
                                    const docName = String(row[colIndices.doctor] || '공동').trim() || '공동';
                                    const chartNo = colIndices.chartNo !== -1 ? String(row[colIndices.chartNo] || '').trim() : null;
                                    
                                    if (docName && amount > 0 && docName !== '합계' && docName !== '총합계' && docName !== '의사명') {
                                        if (chartNo && chartNo !== '합계') {
                                            patients.push({
                                                chartNo: chartNo,
                                                name: String(row[colIndices.name] || '미기재'),
                                                doctor: docName,
                                                totalPaid: amount,
                                                path: String(row[colIndices.path] || '직접내원')
                                            });
                                        }
                                        doctorAgg[docName] = (doctorAgg[docName] || 0) + amount;
                                    }
                                }

                                const d = currentData.find(item => item.month === monthFromFile);
                                if (d) {
                                    if (patients.length > 0) {
                                        patients.sort((a, b) => b.totalPaid - a.totalPaid);
                                        d.topPatients = patients.slice(0, 20);
                                    }
                                    d.doctorData = doctorAgg;
                                    updatedCount++;
                                    resolve();
                                } else {
                                    reject(`월 데이터를 찾을 수 없습니다 (${monthFromFile})`);
                                }
                            } else {
                                reject(`파일 구조 분석 실패 (${fileName})`);
                            }
                        }
                        else {
                            reject(`알 수 없는 파일 형식입니다 (${fileName}). 파일명에 '치료비용계획', '연간장부', '내원경로', '수납내역' 등의 키워드를 포함해주세요.`);
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
            localStorage.setItem('parsed_sales_data', JSON.stringify(currentData));
            alert(`${updatedCount}개의 파일 데이터가 파싱되어 매출 분석에 적용되었습니다.`);
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
