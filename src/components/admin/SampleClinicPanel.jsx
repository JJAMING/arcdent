import React, { useCallback, useEffect, useState } from 'react';
import { FlaskConical, RefreshCw } from 'lucide-react';
import { SAMPLE_CLINIC_NAME, adminClinicName, fillSampleClinic, findSampleClinic, isSampleClinic } from '../../utils/sampleClinic';

// 관리자모드 > 샘플 치과
// 미팅·시연용 "같이N치과"에 올해 1월 ~ 오늘의 가상 자료를 채웁니다. (실제 치과 자료는 건드리지 않습니다)
const SampleClinicPanel = ({ clinics = [], onSelectClinic }) => {
    const [sampleClinic, setSampleClinic] = useState(null);
    const [checked, setChecked] = useState(false);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const lookup = useCallback(async () => {
        try {
            const fromList = clinics.find(isSampleClinic);
            setSampleClinic(fromList || await findSampleClinic());
        } catch (err) {
            setError(err.message);
        } finally {
            setChecked(true);
        }
    }, [clinics]);

    useEffect(() => { lookup(); }, [lookup]);

    const handleFill = async () => {
        if (!sampleClinic || busy) return;
        setBusy(true);
        setError('');
        setSuccess('');
        try {
            const result = await fillSampleClinic(sampleClinic.id, { onProgress: setProgress });
            setSuccess(`채우기 완료: 월별 분석 자료 ${result.analyticsRows}건, 일별 기록 ${result.dailyRows}일, 상담일지 ${result.journals}건 (${result.months}개월)`);
            window.dispatchEvent(new Event("consultationJournalUpdated"));
            window.dispatchEvent(new Event("consultationAnalysisUpdated"));
            window.dispatchEvent(new Event('clinicOperationsUpdated'));
            window.dispatchEvent(new Event('salesDataUpdated'));
            window.dispatchEvent(new Event('patientLedgerUpdated'));
            window.dispatchEvent(new Event('newPatientAnalysisUpdated'));
        } catch (err) {
            setError(err.message || '샘플 데이터를 채우지 못했습니다.');
        } finally {
            setBusy(false);
            setProgress('');
        }
    };

    return (
        <div className="admin-card emr-card">
            <div className="admin-card-header">
                <FlaskConical size={24} className="admin-card-icon" />
                <h2>샘플 치과</h2>
            </div>
            <p className="admin-helper-text">
                원장님 미팅에서 다른 치과 자료를 보여드릴 수 없을 때 쓰는 가상 치과입니다.
                홈, 매출, 진료, 환자, 신환, 보험청구, 상담분석, 상담일지 메뉴에 올해 1월부터 오늘까지의 가상 숫자를 넣습니다.
                환자 이름은 모두 가상(예: 김○○)이고 실제 치과 자료는 건드리지 않습니다.
            </p>
            {error && <div className="admin-history-error">{error}</div>}
            {success && <div className="admin-implant-success">{success}</div>}

            <section className="clinic-settings-section">
                {!checked && <p>샘플 치과를 확인하는 중...</p>}
                {checked && !sampleClinic && (
                    <>
                        <h3>{SAMPLE_CLINIC_NAME}이(가) 아직 없습니다</h3>
                        <p>
                            Supabase SQL Editor에서 <strong>supabase_sample_clinic.sql</strong> 을 한 번 실행한 뒤 새로고침해 주세요.
                        </p>
                        <button type="button" className="admin-implant-secondary-btn emr-refresh-btn" onClick={lookup}>
                            <RefreshCw size={15} /> 다시 확인
                        </button>
                    </>
                )}
                {checked && sampleClinic && (
                    <>
                        <h3>{adminClinicName(sampleClinic)}</h3>
                        <p>
                            버튼을 누르면 올해 1월부터 오늘까지의 가상 자료가 채워지고, 이미 채워져 있으면 같은 숫자로 다시 덮어씁니다.
                            홈의 "오늘 실시간" 숫자는 관리자 화면에서 샘플 치과의 홈을 열 때마다 지금 시각 기준으로 자동 갱신됩니다.
                        </p>
                        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                            <button type="button" className="admin-implant-primary-btn" onClick={handleFill} disabled={busy}>
                                {busy ? (progress || '채우는 중...') : '샘플 데이터 채우기'}
                            </button>
                            <button type="button" className="admin-implant-secondary-btn" onClick={() => onSelectClinic?.(sampleClinic.id)} disabled={busy}>
                                이 치과 선택하기
                            </button>
                        </div>
                    </>
                )}
            </section>
        </div>
    );
};

export default SampleClinicPanel;
