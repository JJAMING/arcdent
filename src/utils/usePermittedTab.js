import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { canViewItem, firstVisibleItem } from './permissions';

/**
 * 분석 화면의 세부 탭 권한
 * - 지금 탭이 숨겨진 항목이면 보이는 첫 탭으로 자동 이동
 * - 돌려주는 함수로 탭 버튼을 보일지 정함: canSee('payment')
 */
export const usePermittedSubTab = (menu, subTab, setSubTab) => {
    const { permissions } = useAuth();
    useEffect(() => {
        if (!canViewItem(permissions, menu, subTab)) {
            const next = firstVisibleItem(permissions, menu, subTab);
            if (next !== subTab) setSubTab(next);
        }
    }, [permissions, menu, subTab, setSubTab]);
    return (key) => canViewItem(permissions, menu, key);
};
