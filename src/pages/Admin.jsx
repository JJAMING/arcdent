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

        let salesDataMap = savedDataStr ? JSON.parse(savedDataStr) : { "2025": JSON.parse(JSON.stringify(defaultData)) };
        const savedPerfStr = localStorage.getItem('treatment_performance_data');
        let treatmentPerfMap = savedPerfStr ? JSON.parse(savedPerfStr) : {};

        let updatedCount = 0;

        for (const file of files) {
            const processFile = () => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        const data = XLSX.read(event.target.result, { type: 'binary' });
                        const fileName = file.name;
                        let rawData = [];
                        let colIndices = {};
                        let headerRowIdx = -1;

                        // 시트 탐색
                        for (const sName of data.SheetNames) {
                            const ws = data.Sheets[sName];
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
                                    tempHeaderRowIdx = i;
                                    break;
                                }
                            }
                            if (tempHeaderRowIdx !== -1) {
                                rawData = rows;
                                colIndices = tempColIndices;
                                headerRowIdx = tempHeaderRowIdx;
                                break;
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
                            if (m) {
                                const y = m[1];
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

                        // 동의환자/치료비용계획 파일 처리
                        if (fileName.includes("치료비용") || fileName.includes("동의") || fileName.includes("치료비")) {
                            const ci = {
                                patientName: -1, chartNo: -1, createdAt: -1, status: -1, payStatus: -1,
                                contractAmount: -1, paidAmount: -1, lastVisit: -1, nextAppt: -1
                            };
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
                                    else if (s.includes('수납상태')) { ci.payStatus = idx; found++; }
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
                                        patientName: name,
                                        year: yearFromFile,
                                        month: monthFromFile,
                                        contractAmount: ci.contractAmount !== -1 ? parseNum(row[ci.contractAmount]) : 0,
                                        paidAmount: ci.paidAmount !== -1 ? parseNum(row[ci.paidAmount]) : 0,
                                        status: ci.status !== -1 ? String(row[ci.status] || '').trim() : '',
                                        createdAt: ci.createdAt !== -1 ? String(row[ci.createdAt] || '').trim() : `${yearFromFile}-${monthFromFile}`
                                    });
                                }

                                let allPlans = JSON.parse(localStorage.getItem('treatment_plan_data') || '[]');
                                
                                // [월간 전면 교체 로직]
                                allPlans = allPlans.filter(p => !(String(p.year) === String(yearFromFile) && String(p.month) === String(monthFromFile)));
                                allPlans = [...allPlans, ...plans];
                                
                                localStorage.setItem('treatment_plan_data', JSON.stringify(allPlans));
                                updatedCount++;
                                resolve();
                            } else { reject(`파일 내 헤더를 찾을 수 없습니다. (${fileName})`); }
                        }
                        // 월간장부 처리
                        else if (fileName.includes("월간장부")) {
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
                        else resolve();
                    } catch (err) { reject(`분석 오류: ${err.message}`); }
                };
                reader.readAsBinaryString(file);
            });
            try { await processFile(); } catch (err) { console.error(err); }
        }

        if (updatedCount > 0) {
            localStorage.setItem('parsed_sales_data', JSON.stringify(salesDataMap));
            alert(`${updatedCount}개 파일 처리 완료. (월 단위 데이터로 업데이트되었습니다.)`);
            window.location.reload();
        }
    };

    const triggerFileInput = () => fileInputRef.current?.click();

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

                <div className="admin-card file-upload">
                    <div className="admin-card-header">
                        <Upload size={24} className="admin-card-icon" />
                        <h2>엑셀 파일 업로드</h2>
                    </div>
                    <div className="upload-area" onClick={triggerFileInput}>
                        <FileSpreadsheet size={48} className="upload-icon" />
                        <h3>파일을 여기로 드래그하거나 클릭하여 업로드하세요</h3>
                        <p>.xlsx, .xls, .csv 지원</p>
                        <input type="file" multiple ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls, .csv" style={{ display: 'none' }} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Admin;
