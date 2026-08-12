-- ============================================================
-- Fleet Pro — 修正 Administrator 帳號的 role 欄位
-- 問題：user_profile 裡 id='u-admin' 的 row，role 不知何故被
--       改成 'company'，導致「使用者管理」畫面誤顯示 Administrator。
-- 解法：以 id 為錨點（最穩定，不受 name 變動影響），把 role 修回 'admin'。
-- 適用：Supabase SQL Editor 直接貼上執行。
-- ============================================================

-- 1) 預覽：先確認要修的 row
SELECT id, email, name, role, is_deleted, updated_at
FROM public.user_profile
WHERE id = 'u-admin';

-- 2) 預覽：看同 email 是否還有其他 row（避免改錯）
SELECT id, email, name, role, is_deleted, updated_at
FROM public.user_profile
WHERE email IN (
    SELECT email FROM public.user_profile WHERE id = 'u-admin'
)
ORDER BY created_at ASC;

-- ★★★ 確認上面預覽無誤後，再執行下方 UPDATE ★★★
-- 把 id = 'u-admin' 的 row role 修回 'admin'
UPDATE public.user_profile
SET    role = 'admin',
       updated_at = now()
WHERE  id = 'u-admin';

-- 3) 同步處理：如果同 email 還有「非 admin」row（例如重複註冊的殭屍），
--    一併把 role 改對，避免日後 syncUsers 又把錯誤版本拉下來。
/*
UPDATE public.user_profile
SET    role = 'admin',
       updated_at = now()
WHERE  email IN (SELECT email FROM public.user_profile WHERE id = 'u-admin')
  AND  role <> 'admin';
*/

-- 4) 驗證
SELECT id, email, name, role, is_deleted, updated_at
FROM public.user_profile
WHERE id = 'u-admin'
   OR email IN (SELECT email FROM public.user_profile WHERE id = 'u-admin')
ORDER BY created_at ASC;
