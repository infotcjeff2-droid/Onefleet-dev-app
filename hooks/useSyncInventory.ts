/**
 * useSyncInventory
 *
 * 自動同步「庫存與配送」資料到雲端：
 * 1. 當已登入用戶的公司 role 改變或登入完成時，
 *    從 Supabase 拉取屬於該 company 的完整庫存快照 (syncFromCloud)
 * 2. App 從背景回到前景時，也重新拉取一次
 * 3. 即使使用者在一台全新裝置登入，第一次就會把「另一台已建立的庫存」拉下來
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useInventoryStore } from '@/store/inventoryStore';
import { useAuthStore } from '@/store/authStore';
import { inventorySyncEnabled } from '@/utils/inventorySync';

export function useSyncInventory() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const syncFromCloud = useInventoryStore((s) => s.syncFromCloud);

  // 紀錄上次為哪位 user sync 過，避免重複打 API
  const syncedFor = useRef<string | null>(null);

  // 1) 登入（或切換帳號）後，自動拉一次雲端庫存
  useEffect(() => {
    if (!isAuthenticated || !user || !inventorySyncEnabled) return;
    const key = `${user.id}:${user.companyId ?? ''}`;
    if (syncedFor.current === key) return;
    syncedFor.current = key;

    console.log(`[useSyncInventory] sync triggered for ${key}`);
    void syncFromCloud();
  }, [isAuthenticated, user, syncFromCloud]);

  // 2) App 回前景時重新同步
  useEffect(() => {
    if (!inventorySyncEnabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isAuthenticated) {
        console.log('[useSyncInventory] AppState active -> re-sync');
        void syncFromCloud();
      }
    });
    return () => sub.remove();
  }, [isAuthenticated, syncFromCloud]);
}
