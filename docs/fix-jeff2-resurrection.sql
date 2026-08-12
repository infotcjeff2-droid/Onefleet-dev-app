-- ============================================================
-- Fleet Pro — 修復 jeff2 復活問題（完整版）
-- 直接複製貼到 Supabase SQL Editor 執行即可
-- ============================================================

-- 1) 啟用 RLS（保險寫一次）
ALTER TABLE public.user_profile ENABLE ROW LEVEL SECURITY;

-- 2) 砍掉所有舊政策
DO $$
DECLARE p record;
BEGIN
    FOR p IN
        SELECT policyname FROM pg_policies WHERE tablename = 'user_profile'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_profile', p.policyname);
    END LOOP;
END $$;

-- 3) 重建政策：讓 anon（App 用的 key）也能 SELECT/INSERT/UPDATE/DELETE
-- ★ 這是修復的核心：讓 DELETE 通過 RLS 檢查

CREATE POLICY "public_read_user_profile"
ON public.user_profile FOR SELECT USING (is_deleted = false);

CREATE POLICY "public_insert_user_profile"
ON public.user_profile FOR INSERT WITH CHECK (true);

CREATE POLICY "public_update_user_profile"
ON public.user_profile FOR UPDATE USING (true) WITH CHECK (true);

-- ★ 重點：明確允許 DELETE，否則 hardDeleteUserProfile() 會被 RLS 擋下
CREATE POLICY "public_delete_user_profile"
ON public.user_profile FOR DELETE USING (true);

-- 4) 實體清除所有 is_deleted=true 的殭屍 row
DELETE FROM public.user_profile WHERE is_deleted = true;

-- 5) 處理重複：同 email 僅保留最舊一筆（最早 created_at），刪除其他
DELETE FROM public.user_profile
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at ASC) AS rn
        FROM public.user_profile
        WHERE is_deleted = false
    ) t
    WHERE rn > 1
);

-- 6) 特別處理：找到並刪除 jeff2 相關的復活資料
-- 先找出所有包含 jeff 的記錄
SELECT id, email, name, is_deleted, created_at, updated_at
FROM public.user_profile
WHERE email ILIKE '%jeff%' OR name ILIKE '%jeff%'
ORDER BY created_at;

-- 刪除 jeff2 相關的記錄（請根據上面查詢結果調整 email）
-- 將 'jeff2@yourdomain.com' 替換為實際的 jeff2 email
DELETE FROM public.user_profile
WHERE email ILIKE '%jeff2%';

-- 7) 驗證：列出剩餘政策 + 剩餘 row 數
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'user_profile' ORDER BY cmd;

SELECT COUNT(*) FILTER (WHERE is_deleted = false) AS active_users,
       COUNT(*) FILTER (WHERE is_deleted = true)  AS soft_deleted,
       COUNT(*)                                    AS total
FROM public.user_profile;
