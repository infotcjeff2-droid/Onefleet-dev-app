-- ============================================================
-- Fleet Pro — user_profile 表新增 password 欄位
-- 用途：讓 admin / driver / company 帳號的密碼可以同步到 Supabase,
--       解決多裝置登入時「帳號存在但密碼沒同步」造成另一台裝置登入失敗的問題。
--
-- ⚠️ 安全性提醒：本欄位以明碼儲存。實務上應該改用 bcrypt / argon2 雜湊。
--    但因為目前 App 端 `authStore.login()` 與 `managed_users` 本地儲存
--    已是明碼比對,為保持一致性,本欄位先採明碼,
--    後續請改用 Edge Function 雜湊後再寫入。
-- ============================================================

-- 1. 新增 password 欄位（若不存在）
ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS password text;

-- 2. 為既有 admin 帳號設定預設密碼（僅在 password 為 NULL 時）
--    對應 constants/mockData.ts 中的 adminCredentials
UPDATE public.user_profile
SET password = '@tcjeff09'
WHERE id = 'u-admin' AND password IS NULL;

-- 3. 驗證
SELECT id, email, role, password IS NOT NULL AS has_password
FROM public.user_profile
WHERE password IS NOT NULL OR id = 'u-admin';
