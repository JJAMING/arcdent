import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Users, Upload, FileSpreadsheet } from 'lucide-react';
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

        let salesDataMap = {};
        if (savedDataStr) {
            try {
                const parsed = JSON.parse(savedDataStr);
                if (Array.isArray(parsed)) salesDataMap["2025"] = parsed;
                else salesDataMap = parsed;
            } catch (e) { salesDataMap = {}; }
        }

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
                                        else if (strCell === '성명' || strCell === '이름' || strCell === '환자명' || strCell === '환자이름') tempColIndices.name = idx;
                                        else if (strCell.includes('담당의') || strCell.includes('의사')) tempColIndices.doctor = idx;
                                        if (strCell === '공단부담금' || strCell === '공단부담' || strCell === '보험청구액') tempColIndices.insurance = idx;
                                        if (strCell === '총수납액' || strCell === '수납합계' || strCell === '실수납액') tempColIndices.amount = idx;
                                        if (strCell.includes('내원경로')) tempColIndices.path = idx;
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

                        if (rawData.length === 0) {
                            targetSheetName = wb.SheetNames[0];
                            const ws = wb.Sheets[targetSheetName];
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
                            let match = str.match(/(\d{1,2})월/);
                            if (!match) match = str.match(/[\.\-\/](\d{1,2})(?!\d)/);
                            if (!match) match = str.match(/^(\d{1,2})[\.\-\/]/);
                            return match ? parseInt(match[1]) + '월' : null;
                        };

                        const extractYear = (str) => {
                            let match = str.match(/(20\d{2})년/) || str.match(/(\d{2})년/);
                            if (!match) {
                                const yMatch = str.match(/(20\d{2})[\.\-\/]/) || str.match(/(\d{2})[\.\-\/]/) || str.match(/^(\d{2})[\.\-\/]/);
                                if (yMatch) match = yMatch;
                            }
                            if (match) {
                                const y = match[1];
                                return y.length === 2 ? "20" + y : y;
                            }
                            return "2025";
                        };

                        const monthFromFile = extractMonth(fileName);
                        const yearFromFile = extractYear(fileName);

                        if (!salesDataMap[yearFromFile]) {
                            salesDataMap[yearFromFile] = JSON.parse(JSON.stringify(defaultData));
                        }
                        const currentYearData = salesDataMap[yearFromFile];

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
                                    else if (s.includes('차트') || s.includes('번호') || s.includes('ID')) { ci.chartNo = idx; found++; }
                                    else if (s.includes('작성일') || s.includes('상담일')) { ci.createdAt = idx; found++; }
                                    else if (s.includes('진행상태')) { ci.status = idx; found++; }
                                    else if (s.includes('수납상태')) { ci.payStatus = idx; found++; }
                                    else if (s.includes('계약금액') || s.includes('계획금액')) { ci.contractAmount = idx; found++; }
                                    else if (s.includes('현재수납') || s.includes('수납금액') || s.includes('납부금액') || s.includes('받은금액')) { ci.paidAmount = idx; found++; }
                                    else if (s.includes('최종내원')) { ci.lastVisit = idx; found++; }
                                    else if (s.includes('다음예약')) { ci.nextAppt = idx; found++; }
                                });
                                if (found >= 1) { headerRowIdx = i; break; }
                            }

                            if (headerRowIdx !== -1) {
                                const plans = [];
                                for (let i = headerRowIdx + 1; i < rawData.length; i++) {
                                    const row = rawData[i] || [];
                                    const name = ci.patientName !== -1 ? String(row[ci.patientName] || '').trim() : (row[0] ? String(row[0]).trim() : '');
                                    if (!name || name === '합계' || name === '총합계') continue;
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
                                
                                const savedPlans = localStorage.getItem('treatment_plan_data');
                                let allPlans = savedPlans ? JSON.parse(savedPlans) : [];
                                
                                plans.forEach(newP => {
                                    const index = allPlans.findIndex(oldP => {
                                        const oldName = String(oldP.patientName || '').replace(/\s+/g, '');
                                        const newName = String(newP.patientName || '').replace(/\s+/g, '');
                                        const oldChart = String(oldP.chartNo || '').trim();
                                        const newChart = String(newP.chartNo || '').trim();
                                        return oldP.year === newP.year && oldP.month === newP.month && oldChart === newChart && oldName === newName;
                                    });
                                    if (index !== -1) allPlans[index] = newP;
                                    else allPlans.push(newP);
                                });
                                
                                localStorage.setItem('treatment_plan_data', JSON.stringify(allPlans));
                                updatedCount++;
                                resolve();
                            } else {
                                reject(`파일 내 헤더를 찾을 수 없습니다. (${fileName})`);
                            }
                        }
                        else if (fileName.includes("월간장부")) {
                            const month = extractMonth(fileName);
                            if (!month) {
                                reject(`파일명에 월 정보가 없습니다 (${fileName})`);
                                return;
                            }
                            
                            let cashVal = 0, cardVal = 0, otherVal = 0;
                            let cashCol = -1, cardCol = -1, otherCol = -1, tonghapRowIdx = -1;

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

                            for (let r = 0; r < rawData.length; r++) {
                                const row = rawData[r] || [];
                                const found = row.some(cell => {
                                    if (cell == null) return false;
                                    const s = String(cell).trim().replace(/\s+/g, '');
                                    return s.includes(month) && (s.includes('통합') || s.includes('합계') || s.includes('계'));
                                });
                                if (found) { tonghapRowIdx = r; break; }
                            }

                            if (tonghapRowIdx !== -1) {
                                if (cashCol !== -1) cashVal = parseNum(rawData[tonghapRowIdx][cashCol]);
                                if (cardCol !== -1) cardVal = parseNum(rawData[tonghapRowIdx][cardCol]);
                                if (otherCol !== -1) otherVal = parseNum(rawData[tonghapRowIdx][otherCol]);
                            }

                            const d = currentYearData.find(item => item.month === month);
                            if (d) {
                                d.cash = cashVal;
                                d.card = cardVal;
                                d.other = otherVal;
                                d.netSales = cashVal + cardVal + otherVal;
                                d.total = d.netSales + (Number(d.insurance) || 0);
                                updatedCount++;
                                resolve();
                            } else {
                                reject(`대시보드에서 ${yearFromFile} ${month} 데이터를 찾을 수 없습니다.`);
                            }
                        }
                        else resolve();
                    } catch (error) { reject(`분석 중 오류 발생 (${fileName})`); }
                };
                reader.readAsBinaryString(file);
            });

            try { await processFile(); } catch (err) { alert(err); }
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
