# 刪除邏輯完整梳理

最後更新: 2026-07-31

---

## 1. 總覽

本專案有 **三條獨立的刪除路徑**:

1. **使用者刪除** (`userManagementStore.softDeleteUser()` / `deleteUser()`)
2. **司機刪除** (`driverStore.deleteDriver()`)
3. **垃圾桶還原** (`trashStore` + `app/onefleet-system-admin/trash.tsx`)

所有刪除都會把資料丟到**垃圾桶 (`trashStore`) 保留 30 天**,但同時從本地 `managed_users` 與 Supabase `user_profile` 表**真刪除**(不是 `is_deleted=true` 標記)。

---

## 2. Supabase `user_profile` 表結構

執行 `docs/user-profile-add-password.sql` 套用新增欄位:

```sql
ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS password text;
```

| 欄位 | 用途 |
| --- | --- |
| `id` (PK) | App 內部 id (`u-admin` / `d999xxx` / `u999xxx`) 或 Clerk OAuth id |
| `email` | 登入 email |
| `name` / `name_zh` / `name_en` | 顯示名稱 |
| `role` | `admin` / `company` / `driver` / `user` |
| `company_id` | 司機所屬公司 id |
| **`password`** | 明碼密碼;**僅供本地驗證使用,生產環境應改用 bcrypt** |
| `is_deleted` | 一律為 `false`;「軟刪」改用垃圾桶 (30 天) |
| `created_at` / `updated_at` | 時間戳 |

---

## 3. 刪除流程:`softDeleteUser()`

**檔案**: `store/userManagementStore.ts:200-237`

```
使用者按「刪除」按鈕
  ↓
handleDelete(user) → Alert 確認
  ↓
deleteUser(user.id)  // 別名,委派給 softDeleteUser
  ↓
softDeleteUser(id)
  ├─ 1. 從本地 `users` 移除該 user
  ├─ 2. await persistUsers(updated)         // 寫入 AsyncStorage
  ├─ 3. 嘗試 hardDeleteUserProfile(id)     // Supabase 真 DELETE
  │     ├─ 成功: 結束
  │     └─ 失敗: 退而求其次 pushUsers(剩餘 users)
  ├─ 4. addToTrash('user', target)         // 30 天垃圾桶快照
  └─ 5. 回傳 TrashItem
  ↓
UI 顯示「已移到垃圾桶,30 天內可還原」
```

### 關鍵點

- **`hardDeleteUserProfile`** 是 `DELETE FROM user_profile WHERE id = ?`(真刪,不是 `is_deleted=true`)。
- 若 `hasSupabaseEnv === false`(沒設 Supabase env),跳過步驟 3,只在本地運作。
- 若 `hardDeleteUserProfile` 拋錯 (例如 RLS 拒絕),改用 `pushUsers(updated)` 把剩餘 users 推上去 — 因為被刪的 user 不在 `updated` 裡,也不會被復活。

---

## 4. 同步流程:`syncUsers()`

**檔案**: `store/userManagementStore.ts:107-173`

**觸發時機**:
- `app/_layout.tsx:42-49` — App 啟動時
- `store/authStore.ts:158-188` — `checkAuth()` 內
- `app/(tabs)/profile.tsx:1147-1171` — Profile 頁 mount / `refreshKey` 變化
- `app/settings.tsx:57-83` — 按「同步使用者」按鈕

**合併策略** (修正後):

```
remoteUsers = fetchUserProfiles()  // 過濾 is_deleted=false
localUsers  = get().users

合併 Map<id, user>:
  1. 遠端每筆 user → mergedById.set(user.id, user)
  2. 本地每筆 local:
     ├─ 若 local.id 已在 mergedById → 遠端優先
     │    但若本地有 password 而遠端為空 → 補 password
     ├─ 若 local.email 在 remoteByEmail 命中(同 email 不同 id) → 視為「過期副本」
     │    但若本地有 password 而遠端為空 → 補 password
     └─ 若本地有、雲端無 → 保留(剛新增或剛被刪)

merged = Array.from(mergedById.values())
if (hasNewLocal) → 推回雲端(含 password)
```

**為什麼用 `id` 而非 `email` 作主鍵**:
- App-managed user 與 OAuth user 可能有相同 email 但不同 id(前者是 `d999xxx`,後者是 `user_clerk_id`)。
- 修正前以 email 為鍵會誤判:用 A 帳號登入,以 B 帳號的 email 過濾,會被遠端覆蓋。
- 修正後以 id 為鍵,本地與遠端用同一 id 對應同一筆,精準。

---

## 5. 防復活機制(避免「刪了又出現」)

| 復活路徑 | 防護 |
| --- | --- |
| **A. syncUsers 拉回** | `fetchUserProfiles()` 過濾 `is_deleted=false`;`hardDeleteUserProfile` 真刪,雲端無 row |
| **B. driverStore.loadDrivers 重建** | 修正後不再從 `managed_users` 自動 push 新 driver |
| **C. useEnsureUserProfile 自動 INSERT** | 修正後 SELECT 加 `.eq('is_deleted', false)`,已刪的不會再被當成「existing」 |
| **D. pushUsersInBackground 重新建立** | `softDeleteUser` 從本地 users 移除 → `pushUsers` 只推剩餘 users |
| **E. syncUsers 合併時遠端優先** | 修正後以 id 為主鍵;本地有、雲端無的 id 仍保留(不會被遠端覆蓋) |
| **F. RLS 政策 QUERY 帶回已刪** | RLS SELECT 政策 `is_deleted = false` |
| **G. 垃圾桶還原誤觸** | 垃圾桶 UI 有 30 天保留;管理員手動點「還原」才會從 trashStore 加回 (見第 7 節) |

---

## 6. 帳號密碼同步到 Supabase

### 6.1 `user_profile` 表新增 `password` 欄位

執行 `docs/user-profile-add-password.sql`:
```sql
ALTER TABLE public.user_profile ADD COLUMN IF NOT EXISTS password text;
UPDATE public.user_profile SET password = '@tcjeff09' WHERE id = 'u-admin' AND password IS NULL;
```

### 6.2 Managed users 密碼同步

- `pushUsers()` 與 `addUser` / `updateUser` 都會把 `password` 一起上傳到 Supabase。
- `mapUserToDbProfile()` 包含 `password: user.password ?? null`。

### 6.3 Admin 帳號的密碼同步

**檔案**: `store/authStore.ts:12-28`

```ts
async function ensureAdminSyncedToSupabase(email: string, password: string): Promise<void> {
  if (!hasSupabaseEnv) return;
  await syncUserProfiles([{
    id: 'u-admin',
    email,
    name: 'Administrator',
    role: 'admin',
    password,
  }]);
}
```

**觸發時機**: 當使用者用 `admin` / `@tcjeff09` 登入成功後,自動呼叫此函式把 admin 帳號密碼同步到 Supabase。多裝置登入時,可用同一組 admin 帳號密碼。

### 6.4 新增使用者時也同步密碼

**檔案**: `store/userManagementStore.ts:175-203`

```ts
addUser: async (name, email, password, role, ...) => {
  const newUser: ManagedUser = {
    id: generateId(role),
    ...,
    password,  // ← 包含密碼
  };
  const updated = sanitizeUsers([...get().users, newUser]);
  set({ users: updated });
  await persistUsers(updated);
  pushUsersInBackground(updated, ...);  // ← 上傳到 Supabase 時含 password
}
```

### 6.5 登入時從 Supabase 拉取密碼

**檔案**: `store/authStore.ts:96-142`

若本地 `managed_users` 為空(全新安裝/換裝置),自動呼叫 `syncUsers()` 從 Supabase 拉取,然後用拉到的 `password` 驗證。

---

## 7. 垃圾桶還原邏輯

**檔案**: `app/onefleet-system-admin/trash.tsx:138-171`

### 7.1 還原 user

```ts
if (item.kind === 'user') {
  await restoreUser(name, email, password, role, ...);  // 呼叫 addUser
  await removeFromTrash(item.trashId);
}
```

- `restoreUser` 委派給 `userManagementStore.addUser()` — 會重新建立 managed_user 並 `pushUsersInBackground` 上傳到 Supabase。
- **注意**: 還原時若 email 已被新使用者佔用,`addUser` 會回傳 `Email already registered` 並失敗。

### 7.2 還原 driver

```ts
if (item.kind === 'driver') {
  await addDriver(name, phone, email, ...);  // 呼叫 driverStore.addDriver
}
```

- `driverStore.addDriver` 只更新本地 `managed_drivers`,**但已包含 `hardDeleteUserProfile` 邏輯的修正後** — 還原後下次 `syncUsers` 會自動同步到 Supabase。

### 7.3 永久刪除

`handlePermanentDelete(item)` 只從 `trashStore` 移除,不會再影響 `user_profile`。

---

## 8. 刪除邏輯的一致性檢查

| 場景 | 修正前 | 修正後 |
| --- | --- | --- |
| 用戶管理頁面刪除使用者 | 只清本地;sync 復活 | 真刪 Supabase + 垃圾桶 |
| 個人頁面司機列表刪除 | 只清本地;loadDrivers 復活 | 真刪 Supabase + 垃圾桶 |
| 從垃圾桶還原 | 只重建本地;sync 覆蓋 | 重建本地 + Supabase |
| 換裝置登入 | 找不到使用者 | 從 Supabase 拉取(含 password) |
| 多裝置 admin 登入 | 帳號密碼只在本機 | 密碼同步到 Supabase,多裝置通用 |
| 刪除公司 | 旗下司機 companyId 變孤兒 | 同上(待優化) |

---

## 9. 已知限制與後續優化

1. **密碼明碼儲存**: 目前 `user_profile.password` 是明碼;建議改用 bcrypt 雜湊(Edge Function `clerk-user-sync` 已有 `hashPassword` 範例)。
2. **刪除公司 cascade**: 刪除公司時,旗下司機的 `companyId` 變孤兒;建議在 `softDeleteUser` 內檢查 `role === 'company'` 時同步處理旗下司機。
3. **垃圾桶還原 email 衝突**: 還原時若 email 已存在,會失敗;建議在還原前提示「email 已被使用,將覆蓋現有帳號」。
4. **還原不上傳 Supabase**: 已修正 — `addUser` 內部已含 `pushUsersInBackground`。
5. **SSO/真實密碼雜湊**: 建議整合 Supabase Auth 或 Clerk 處理密碼雜湊,讓 App 只需要管理使用者 profile metadata。

---

## 10. 測試清單

- [ ] 在 Supabase 執行 `docs/user-profile-add-password.sql`
- [ ] App 重新整理後,user-management 頁面應該仍能正常顯示使用者
- [ ] 刪除一個 driver,離開頁面再回來,確認**不再出現**
- [ ] 從垃圾桶還原剛刪的 driver,確認重新出現在 managed_drivers
- [ ] 重啟 App,確認刪除的 driver 沒有從 Supabase 復活
- [ ] 用 `admin` / `@tcjeff09` 登入,到 Supabase `user_profile` 表確認 `id='u-admin'` 的 row 有 `password='@tcjeff09'`
- [ ] 在另一台裝置或用 web 測試登入同一個 driver 帳號,確認能驗證成功
