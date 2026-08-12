-- ============================================================
-- Fleet Pro — user_profile 表「使用者復活」修復
-- ============================================================
-- 原因：
--   1. 既有 DELETE 政策用 auth.role() = 'authenticated' 限縮，
--      但 App 走的是 anon key + Clerk JWT（setSession 注入），
--      auth.role() 實際是 'anon'，導致 DELETE 被 RLS 擋下，
--      軟刪失敗 → fallback pushUsers 也沒碰到被刪的 row →
--      下次 syncUsers() 就把這筆 is_deleted=false 的 row 拉回來。
--   2. 雲端可能留有 is_deleted=false 但本地已刪除的殭屍 row。
--
-- 執行步驟：
--   A. 先跑「診斷」段落看現況
--   B. 跑「清理殭屍 row」段落（先用 SELECT 預覽，再改成實際 DELETE）
--   C. 跑「重設 RLS 政策」段落（覆寫成 anon + Clerk JWT 可用）
--   D. 跑「驗證」段落確認結果
-- ============================================================


-- ============================================================
-- A. 診斷：看 user_profile 現況
-- ============================================================

-- A1. 列出目前所有 user_profile rows
SELECT id, email, name, role, is_deleted, created_at, updated_at
FROM public.user_profile
ORDER BY is_deleted DESC, updated_at DESC;

-- A2. 看目前的 RLS 政策
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'user_profile'
ORDER BY cmd, policyname;

-- A3. 看是否有重複 email（被復活的最大嫌疑）
SELECT email, COUNT(*) AS cnt, array_agg(id) AS ids, array_agg(is_deleted) AS deleted_flags
FROM public.user_profile
GROUP BY email
HAVING COUNT(*) > 1
ORDER BY cnt DESC;


-- ============================================================
-- B. 清理殭屍 row
-- ============================================================
-- 說明：
--   「殭屍 row」= 本地已從 managed_users 移除、但雲端仍存有
--   is_deleted=false 資料的情況。syncUsers() 會把它們拉回本地。
--
--   對應情境：
--   a) 之前用 soft delete 但 fallback 失敗 → 雲端 is_deleted 沒被改
--   b) 同一 email 出現兩筆（App-managed d999xxx + Clerk OAuth user_xxx）
--
--   ⚠️ 請先跑 SELECT 預覽，確認沒問題再解除註解跑 DELETE。

-- B1. 找出殭屍（同步到本地 managed_users 中已不存在的 id）
--     做法：把本地清單貼到下方 IN (...) 或子查詢，
--     列出雲端「不在本地清單內」的 rows
/*
SELECT id, email, name, role, is_deleted, updated_at
FROM public.user_profile
WHERE id NOT IN (
    -- 從 App 本地 AsyncStorage key 'managed_users' 複製出來的 id 清單
    'u-admin',
    'd001' -- ← 換成實際的 id
)
ORDER BY is_deleted, updated_at DESC;
*/

-- B2. 找出 is_deleted=true 但還沒被實體刪除的 row（垃圾桶期滿後應清掉）
SELECT id, email, name, role, is_deleted, updated_at
FROM public.user_profile
WHERE is_deleted = true
ORDER BY updated_at DESC;

-- B3. ⚠️ 實體刪除 is_deleted=true 的 row（先預覽 B2，再執行）
-- DELETE FROM public.user_profile WHERE is_deleted = true;

-- B4. 處理重複 email（同 email 多 id）：
--     預設策略：保留「最舊」一筆（先建立的為準），刪掉其他
/*
WITH ranked AS (
    SELECT id, email,
           ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at ASC) AS rn
    FROM public.user_profile
    WHERE is_deleted = false
)
SELECT id, email FROM ranked WHERE rn > 1;
*/
-- ⚠️ 確認 B4 預覽後再刪除：
-- DELETE FROM public.user_profile
-- WHERE id IN (
--     WITH ranked AS (
--         SELECT id, email,
--                ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at ASC) AS rn
--         FROM public.user_profile
--         WHERE is_deleted = false
--     )
--     SELECT id FROM ranked WHERE rn > 1
-- );


-- ============================================================
-- C. 重設 RLS 政策（讓 anon + Clerk JWT 也能 DELETE）
-- ============================================================

-- 確保 RLS 已啟用
ALTER TABLE public.user_profile ENABLE ROW LEVEL SECURITY;

-- 先清掉所有舊政策（idempotent）
DROP POLICY IF EXISTS "authenticated can read user_profile"   ON public.user_profile;
DROP POLICY IF EXISTS "authenticated can insert user_profile" ON public.user_profile;
DROP POLICY IF EXISTS "authenticated can update user_profile" ON public.user_profile;
DROP POLICY IF EXISTS "authenticated can delete user_profile" ON public.user_profile;
DROP POLICY IF EXISTS "public can read user_profile"         ON public.user_profile;
DROP POLICY IF EXISTS "public can insert user_profile"       ON public.user_profile;
DROP POLICY IF EXISTS "public can update user_profile"       ON public.user_profile;
DROP POLICY IF EXISTS "public can delete user_profile"       ON public.user_profile;
DROP POLICY IF EXISTS "anyone can read user_profile"         ON public.user_profile;
DROP POLICY IF EXISTS "anyone can insert user_profile"       ON public.user_profile;
DROP POLICY IF EXISTS "anyone can update user_profile"       ON public.user_profile;
DROP POLICY IF EXISTS "anyone can delete user_profile"       ON public.user_profile;
DROP POLICY IF EXISTS "anyone can upsert user_profile"       ON public.user_profile;
DROP POLICY IF EXISTS "anyone can soft delete user_profile"  ON public.user_profile;
DROP POLICY IF EXISTS "anon can read user_profile"           ON public.user_profile;
DROP POLICY IF EXISTS "authenticated can manage user_profile" ON public.user_profile;

-- 統一策略：對 anon / authenticated / service_role 都開放 CRUD
-- 因為 App 是用 anon key + Clerk JWT 存取，所有寫入都會經過 App 邏輯驗證
-- （manager 在前端 UI 操作,非開放 API）
--
-- 注意：生產環境若要嚴格控管,應改為僅 service_role 可寫，
-- 但目前此 App 的同步流程必須讓 anon key 寫入才能運作。

CREATE POLICY "public_read_user_profile"
ON public.user_profile FOR SELECT
USING (is_deleted = false);

CREATE POLICY "public_insert_user_profile"
ON public.user_profile FOR INSERT
WITH CHECK (true);

CREATE POLICY "public_update_user_profile"
ON public.user_profile FOR UPDATE
USING (true)
WITH CHECK (true);

-- ★ 重點：明確允許 DELETE，這是修復復活問題的核心
CREATE POLICY "public_delete_user_profile"
ON public.user_profile FOR DELETE
USING (true);


-- ============================================================
-- D. 驗證
-- ============================================================

-- D1. 列出重設後的政策（應該有 4 筆：SELECT/INSERT/UPDATE/DELETE）
SELECT policyname, cmd, permissive
FROM pg_policies
WHERE tablename = 'user_profile'
ORDER BY cmd;

-- D2. 計算目前 user_profile row 數
SELECT
    COUNT(*) FILTER (WHERE is_deleted = false) AS active_users,
    COUNT(*) FILTER (WHERE is_deleted = true)  AS soft_deleted_users,
    COUNT(*)                                    AS total
FROM public.user_profile;

-- D3. 找出同 email 的重複（若還有，就是 App 端的 managed_users 與雲端不同步）
SELECT email, COUNT(*) AS cnt, array_agg(id) AS ids
FROM public.user_profile
WHERE is_deleted = false
GROUP BY email
HAVING COUNT(*) > 1;