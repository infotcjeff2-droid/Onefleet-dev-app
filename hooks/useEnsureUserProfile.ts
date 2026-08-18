/**
 * useEnsureUserProfile
 *
 * 當使用者透過 Clerk OAuth（Google / GitHub）或任何方式登入時，
 * 自動在 Supabase `user_profile` 表建立對應的 profile 記錄。
 *
 * 設計重點：
 *   - 使用 Clerk user.id 當 primary key，跨裝置 / 跨登入方式皆一致
 *   - upsert by id，已存在則只更新 last_sign_in_at，不覆蓋業務欄位
 *   - 第一次登入才會建立記錄，後續登入只是更新時間戳記
 */
import { useEffect, useRef } from 'react';
import { useUser } from '@clerk/expo';
import { supabase, hasSupabaseEnv } from '@/utils/supabase';

export function useEnsureUserProfile() {
  const { user, isSignedIn, isLoaded } = useUser();
  const ensuredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user || !hasSupabaseEnv) return;

    const clerkId = user.id;
    if (ensuredFor.current === clerkId) return;
    ensuredFor.current = clerkId;

    void (async () => {
      try {
        const email =
          user.primaryEmailAddress?.emailAddress ||
          user.emailAddresses[0]?.emailAddress ||
          `${clerkId}@no-email.clerk`;

        const name =
          user.fullName ||
          user.firstName ||
          user.username ||
          email.split('@')[0] ||
          'New User';

        const role =
          (user.publicMetadata?.role as string | undefined) || 'user';

        // 只關心「還活著」的記錄：若已經被管理者刪除,就不要 INSERT 復活
        const { data: existing, error: selectError } = await supabase!
          .from('user_profile')
          .select('id')
          .eq('id', clerkId)
          .eq('is_deleted', false)
          .maybeSingle();

        if (selectError) {
          console.warn('[useEnsureUserProfile] select failed:', selectError.message);
          return;
        }

        if (existing) {
          // 已存在 → 僅更新 avatar（email / name 保留本地業務資料）
          await supabase!
            .from('user_profile')
            .update({ avatar: user.imageUrl, updated_at: new Date().toISOString() })
            .eq('id', clerkId);
          return;
        }

        const { error: insertError } = await supabase!
          .from('user_profile')
          .insert({
            id: clerkId,
            email,
            name,
            role,
            avatar: user.imageUrl || null,
            // ★ Clerk OAuth 使用者標記為 'clerk'，區分網頁新增的 'managed' 使用者
            source: 'clerk',
          });

        if (insertError) {
          console.error('[useEnsureUserProfile] insert failed:', insertError.message);
        } else {
          console.log(`[useEnsureUserProfile] created profile for ${clerkId}`);
        }
      } catch (err) {
        console.error('[useEnsureUserProfile] unexpected error:', err);
      }
    })();
  }, [user, isSignedIn, isLoaded]);
}
