// 병원관리자 계정 권한: 메뉴 · 세부 항목 · 금액 숨기기
// profiles.permissions (jsonb) 에 저장합니다. null(없음) = 전체 보기 (관리자 · 원장님)
//   { hiddenMenus: ['sales'], hiddenItems: ['sales:payment'], hideAmounts: true }
// 메뉴 숨김은 Supabase 권한 규칙(RLS)에서도 막고, 세부 항목·금액은 화면에서 가립니다.
// ※ 메뉴 id 는 사이드바(App.jsx)와, 항목 key 는 각 분석 화면의 탭 id 와 같아야 합니다.

export const PERMISSION_CATALOG = [
    {
        menu: 'home',
        label: 'HOME (실시간 현황)',
        items: [
            { key: 'goal', label: '목표 달성' },
            { key: 'pathNewPatients', label: '내원경로별 신환 (목표 카드 안)' },
            { key: 'live', label: '오늘 실시간 현황' },
            { key: 'monthCompare', label: '이번 달 vs 지난달' },
            { key: 'calendar', label: '일별 현황 달력' },
        ],
    },
    {
        menu: 'sales',
        label: '매출분석',
        items: [
            { key: 'total', label: '총 매출 현황' },
            { key: 'payment', label: '결제 분포도' },
            { key: 'newPatient', label: '신환수익 비교' },
            { key: 'agreed', label: '동의환자 수납액' },
            { key: 'topFee', label: '진료비 상위' },
            { key: 'doctor', label: '매출분석(의사)' },
            { key: 'summary', label: '매출 분석 정리' },
        ],
    },
    {
        menu: 'treatment',
        label: '진료분석',
        items: [
            { key: 'implant', label: '임플란트 1차 수술' },
            { key: 'insurance', label: '보험 임플/틀니' },
        ],
    },
    {
        menu: 'patient',
        label: '환자분석',
        items: [
            { key: 'newOld', label: '총 환자수 (신환/구환)' },
            { key: 'byDoctor', label: '총 환자수 (의사)' },
            { key: 'labRequest', label: '기공물 의뢰 현황' },
        ],
    },
    {
        menu: 'new-patient',
        label: '신환분석',
        items: [
            { key: 'source', label: '신환 내원경로 현황' },
            { key: 'treatmentConversion', label: '내원 경로별 치료 이행율' },
            { key: 'age', label: '연령별 신환 현황' },
            { key: 'unitPrice', label: '내원 경로별 객단가' },
        ],
    },
    {
        menu: 'insurance',
        label: '보험청구분석',
        items: [
            { key: 'claim', label: '보험청구액 통계' },
            { key: 'fee', label: '보험수가별 통계' },
            { key: 'adjustment', label: '조정건수/금액' },
        ],
    },
    {
        menu: 'consultation',
        label: '상담분석',
        items: [
            { key: 'overall', label: '전체 동의율' },
            { key: 'consultant', label: '상담자별 동의율' },
            { key: 'rejected', label: '미동의 환자 현황' },
        ],
    },
    {
        menu: 'journal',
        label: '상담일지',
        items: [
            { key: 'list', label: '상담 목록 보기' },
            { key: 'write', label: '작성·수정·삭제 (끄면 보기만)' },
        ],
    },
];

const MENU_IDS = new Set(PERMISSION_CATALOG.map(entry => entry.menu));
const ITEM_IDS = new Set(PERMISSION_CATALOG.flatMap(entry => entry.items.map(item => `${entry.menu}:${item.key}`)));

/** 저장 전 정리: 모르는 값은 버림 */
export const normalizePermissions = (permissions) => {
    if (!permissions || typeof permissions !== 'object') return null;
    return {
        hiddenMenus: Array.from(new Set((permissions.hiddenMenus || []).filter(id => MENU_IDS.has(id)))),
        hiddenItems: Array.from(new Set((permissions.hiddenItems || []).filter(id => ITEM_IDS.has(id)))),
        hideAmounts: Boolean(permissions.hideAmounts),
    };
};

export const EMPTY_PERMISSIONS = Object.freeze({ hiddenMenus: [], hiddenItems: [], hideAmounts: false });

export const canViewMenu = (permissions, menu) => {
    if (!permissions) return true;
    if ((permissions.hiddenMenus || []).includes(menu)) return false;
    // 세부 항목이 전부 꺼져 있으면 메뉴도 숨김
    const entry = PERMISSION_CATALOG.find(item => item.menu === menu);
    if (entry && entry.items.length > 0) {
        return entry.items.some(item => !(permissions.hiddenItems || []).includes(`${menu}:${item.key}`));
    }
    return true;
};

export const canViewItem = (permissions, menu, key) => {
    if (!permissions) return true;
    if (!canViewMenu(permissions, menu)) return false;
    return !(permissions.hiddenItems || []).includes(`${menu}:${key}`);
};

export const shouldHideAmounts = (permissions) => Boolean(permissions?.hideAmounts);

/** 보이는 항목 중 첫 번째 (현재 탭이 숨겨졌을 때 이동할 곳) */
export const firstVisibleItem = (permissions, menu, fallback) => {
    const entry = PERMISSION_CATALOG.find(item => item.menu === menu);
    const visible = entry?.items.find(item => canViewItem(permissions, menu, item.key));
    return visible?.key || fallback;
};

export const describePermissions = (permissions) => {
    if (!permissions) return '전체 보기';
    const hiddenMenuCount = PERMISSION_CATALOG.filter(entry => !canViewMenu(permissions, entry.menu)).length;
    const hiddenItemCount = (permissions.hiddenItems || []).length;
    const parts = [];
    if (hiddenMenuCount) parts.push(`메뉴 ${hiddenMenuCount}개 숨김`);
    if (hiddenItemCount) parts.push(`세부 ${hiddenItemCount}개 숨김`);
    if (permissions.hideAmounts) parts.push('금액 숨김');
    return parts.length ? parts.join(' · ') : '전체 보기';
};
