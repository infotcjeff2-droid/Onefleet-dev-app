/**
 * Clerk 與 Supabase RLS 整合。
 *
 * Clerk 透過 OAuth (Google/GitHub) 登入後，會取得 JWT session token。
 * 將此 token 傳給 Supabase client，讓子 auth.uid() 能正確解析出 Clerk user ID，
 * 這樣 fleet_sync 的 RLS 政策 (auth.uid()::text = user_id) 才能正常運作。
 *
 * 使用方式：在 app/_layout.tsx 的 AppContent 中呼叫 useSyncClerkToSupabase()
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '@clerk/expo';
import { setSupabaseAuthFromClerk } from '@/utils/supabase';

/**
 * 當 Clerk 使用者登入/登出時，自動同步 session token 到 Supabase。
 * 這讓子 auth.uid() 能正確識別 Clerk user ID，觸發 RLS 隔離。
 * 
 * Web 環境：跳過 Clerk 整合，使用其他認證方式
 */
export function useSyncClerkToSupabase() {
  const isWeb = Platform.OS === 'web';
  
  // Web 環境下 Clerk 未初始化，跳過 sync
  if (isWeb) {
    return;
  }

  const { isSignedIn, getToken, isLoaded } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn) {
      // Clerk 已登入 → 取得 JWT 並設定給 Supabase
      void (async () => {
        const token = await getToken({ template: 'supabase-jwt' });
        await setSupabaseAuthFromClerk(async () => token);
      })();
    } else {
      // Clerk 未登入 → 清除 Supabase session
      void setSupabaseAuthFromClerk(async () => null);
    }
  }, [isSignedIn, isLoaded, getToken]);
}
