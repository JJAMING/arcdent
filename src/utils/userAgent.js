// 브라우저 User-Agent 원문은 사람이 읽기엔 너무 장황해서("Mozilla/5.0 (Windows NT ...")
// 관리자 화면에는 "운영체제 · 브라우저" 정도로 요약해서 보여줍니다. 원문이 필요하면
// 호출하는 쪽에서 title 속성 등으로 그대로 노출하면 됩니다.
export const describeUserAgent = (ua) => {
    const value = String(ua || '');
    if (!value) return '-';

    const isMobile = /Mobile|Android(?!.*Tablet)/i.test(value) && !/iPad/i.test(value);

    let os = '기타 OS';
    if (/Windows/i.test(value)) os = 'Windows';
    else if (/iPhone|iPad|iPod/i.test(value)) os = 'iOS';
    else if (/Mac OS X/i.test(value)) os = 'macOS';
    else if (/Android/i.test(value)) os = 'Android';
    else if (/Linux/i.test(value)) os = 'Linux';

    let browser = '기타 브라우저';
    if (/Edg\//i.test(value)) browser = 'Edge';
    else if (/OPR\/|Opera/i.test(value)) browser = 'Opera';
    else if (/Chrome\//i.test(value) && !/Chromium/i.test(value)) browser = 'Chrome';
    else if (/Firefox\//i.test(value)) browser = 'Firefox';
    else if (/Safari\//i.test(value) && !/Chrome\//i.test(value)) browser = 'Safari';

    return `${os} · ${browser}${isMobile ? ' (모바일)' : ''}`;
};
