# 司機 (Driver) ↔ 公司 (Company) 關聯梳理

最後更新: 2026-07-31

---

## 1. 資料模型總覽

本專案**沒有獨立的 `drivers` 表或 `companies` 表**。所有使用者(包含 admin / company / driver / user)都統一儲存在 `public.user_profile` 這張表裡,以 `role` 欄位區分身份。

| 角色 (`role`) | 用途 | 識別方式 |
| --- | --- | --- |
| `admin` | 系統管理員 | Clerk OAuth 登入 + `user_profile.id = clerk user id` |
| `company` | 公司帳號 | App 內建立;其 `user.id` 即「公司 ID」 |
| `driver` | 司機帳號 | App 內建立;`company_id` 欄位指向所屬公司 |
| `user` | 一般使用者 | (目前未使用) |

### 1.1 `user_profile` 表結構

```sql
CREATE TABLE public.user_profile (
    id          text PRIMARY KEY,         -- 主鍵,對應 Clerk user id 或 App 內部 ID
    email       text NOT NULL,
    name        text NOT NULL,
    name_zh     text,
    name_en     text,
    phone       text,
    avatar      text,
    address     text,
    role        text NOT NULL CHECK (role IN ('admin','company','driver','user')),
    company_id  text,                     -- ← 司機所屬公司 (僅 driver 角色使用)
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now(),
    is_deleted  boolean DEFAULT false
);
```

> ⚠️ **重要**: `company_id` 是純 `text`,**沒有 `FOREIGN KEY` 約束**,也沒有 `companies` 表。
> 因此 driver.companyId 只是一個指向「公司帳號 user.id」的字串,並無資料庫層級的外鍵保護。

### 1.2 公司帳號的「自我指涉」設計

- 一個 `role='company'` 的 user,其 **`user.id` 本身就是公司 ID**。
- 所有 `role='driver'` 的 user,若 `company_id = <某 company 的 user.id>`,即表示歸屬該公司。
- 換句話說,**「公司」不是一張獨立的資料表,而是一種「角色身份」**。

---

## 2. App 內的雙重儲存

雖然雲端只有一張 `user_profile` 表,但 App 為了方便本地查詢與離線操作,在 `AsyncStorage` 額外維護了兩個陣列:

| Storage Key | 內容 | 主要負責 Store | 用途 |
| --- | --- | --- | --- |
| `managed_users` | 所有 `user_profile` 記錄(不限角色) | `userManagementStore` | 登入驗證、新增/編輯/刪除使用者、撈取 companies/drivers |
| `managed_drivers` | 司機清單(從 user_profile 中 `role='driver'` 抽出) | `driverStore` | 指派車輛、配送單簽收、聯絡司機等業務邏輯 |

### 2.1 修正前的問題(已修復)

> 修正 commit: 2026-07-31 「修正司機刪除後又再出現」

**問題**: `driverStore.loadDrivers()` 從 `managed_users` 中 `role='driver'` 的使用者**自動重建** `managed_drivers`,即使已被 `deleteDriver` 移除,下次 `loadDrivers()` 又會重新插入,造成「刪不掉」的假象。

**根因鏈**:

1. `softDeleteUser(id)` 只更新本地 `managed_users`,**沒有同步刪除 Supabase `user_profile`**。
2. `syncUsers()` 從 Supabase 拉回 `is_deleted=false` 的使用者,以 email 為鍵合併(遠端優先)→ 被「軟刪」的使用者復活。
3. `driverStore.loadDrivers()` 從 `managed_users` 把 `role='driver'` 重建為 Driver → 司機再次出現。

**修正策略**:
- `softDeleteUser` 改為**真硬刪除** Supabase `user_profile` 記錄(`hardDeleteUserProfile`);垃圾桶 `trashStore` 仍保留 30 天快照供還原。
- `driverStore.loadDrivers()` **不再 push 新 driver**,只更新既有 driver 的 `companyId`(以 `managed_users` 為準)。
- `driverStore.deleteDriver()` 也呼叫 `hardDeleteUserProfile(id)`,確保雲端同步。

### 2.2 修正後的「單一真相來源」

| 物件 | 單一真相來源 |
| --- | --- |
| 公司清單 | `userManagementStore.users` 中 `role === 'company'` |
| 司機清單 | `driverStore.drivers` (即本地 `managed_drivers`) |
| 司機所屬公司 (`companyId`) | `userManagementStore.users` 中 `role === 'driver'` 的 `companyId` 欄位,**於 `loadDrivers()` 時同步給既有 driver** |

---

## 3. 關聯圖(ERD)

```
┌────────────────────────────────────────────────────┐
│                public.user_profile                  │
├────────────────────────────────────────────────────┤
│ id (PK, text)                                      │
│ role      : 'admin' | 'company' | 'driver' | 'user' │
│ company_id: text  (僅 driver 使用)                  │
│ ...                                                │
└────────────────────────────────────────────────────┘
         ▲                              ▲
         │ role='driver'                │ role='company'
         │ company_id ────────────────▶ │ id = <company_id>
         │                              │
         │                              │
   ┌─────┴──────┐                 ┌─────┴──────┐
   │  Driver    │                 │  Company   │
   │  本地物件  │                 │  本地物件  │
   │  drivers[] │                 │  users[]   │
   │            │                 │ (role==='  │
   │  companyId │                 │  company') │
   └────────────┘                 └────────────┘
        (driverStore)              (userManagementStore)
```

---

## 4. 關鍵程式碼位置

### 4.1 Store 層

| 檔案 | 函式 | 行號(大致) | 用途 |
| --- | --- | --- | --- |
| `store/userManagementStore.ts` | `softDeleteUser(id)` | 200-225 | 軟刪除:垃圾桶 + 雲端硬刪除 |
| `store/userManagementStore.ts` | `deleteUser(id)` | 227-229 | 向後相容別名,委派給 `softDeleteUser` |
| `store/userManagementStore.ts` | `syncUsers()` | 103-149 | 從 Supabase 拉使用者,以 email 合併 |
| `store/userManagementStore.ts` | `getCompanies()` | 244-246 | 取得所有公司 |
| `store/userManagementStore.ts` | `getCompanyById(id)` | 248-250 | 以 ID 找公司 |
| `store/userManagementStore.ts` | `getUsersByCompanyId(companyId)` | 252-254 | 取得該公司所有使用者(主要是司機) |
| `store/driverStore.ts` | `loadDrivers()` | 67-141 | 載入司機,**只更新既有 driver 的 companyId**,不再 push 新項 |
| `store/driverStore.ts` | `addDriver()` | 144-162 | 新增司機(本地) |
| `store/driverStore.ts` | `updateDriver()` | 164-173 | 更新司機(本地) |
| `store/driverStore.ts` | `deleteDriver(id)` | 175-189 | 刪除司機(本地 + 雲端硬刪除) |
| `store/driverStore.ts` | `getDriversByCompanyId(companyId)` | 194-196 | 以 companyId 過濾司機 |

### 4.2 UI 層

| 檔案 | 位置 | 用途 |
| --- | --- | --- |
| `app/(tabs)/profile.tsx` | 行 485-524 | 新增/編輯使用者 modal 的「選擇公司」欄位 |
| `app/(tabs)/profile.tsx` | 行 694-723 | 司機公司挑選 (新增用戶) |
| `app/(tabs)/profile.tsx` | 行 897-909 | 編輯用戶時的公司挑選 |
| `app/(tabs)/profile.tsx` | 行 1076-1105 | DriverEditModal 的公司挑選 |
| `app/(tabs)/profile.tsx` | 行 1508-1540 | 司機管理列表:公司角色登入時,僅顯示 `companyId === user.id` 的司機 |
| `app/onefleet-system-admin/user-management.tsx` | 行 405-414 | 後台使用者列表:顯示司機的公司名稱 |
| `components/company/CompanyList.tsx` | 行 73-101 | 刪除公司前查 `getDriversByCompanyId` 提示 |
| `components/company/CompanyFormModal.tsx` | 行 155-204 | 新增/編輯公司 |
| `components/company/DriverFormModal.tsx` | 行 87, 111, 161, 263-272 | 編輯/新增司機 modal,含公司挑選 |
| `utils/deliveryOrderSync.ts` | 行 187-220 | 配送單的權限過濾(用 companyId / assigned_driver_id) |

---

## 5. 業務規則

### 5.1 建立司機時

1. 管理員透過 `userManagementStore.addUser(role='driver', companyId=...)` 建立。
2. `companyId` 必須指向一個 `role='company'` 的 user.id;若無,司機就會「無所屬」(在公司列表中不會出現)。
3. 雲端同步:新增會 `syncUserProfiles()` upsert 到 `user_profile`。

### 5.2 刪除司機時

1. UI 確認 → `userManagementStore.softDeleteUser(id)`。
2. 從本地 `managed_users` 移除該 user。
3. `hardDeleteUserProfile(id)` 從 Supabase `user_profile` 刪除該記錄。
4. 同步刪除 `managed_drivers` 中同 ID 的 driver(`driverStore.deleteDriver(id)`)。
5. 原 user snapshot 存入 `trashStore`(30 天可還原)。

### 5.3 刪除公司時

> ⚠️ 目前**沒有強制檢查**:刪除公司後,旗下司機的 `companyId` 會變成「孤兒 ID」(指著一個不存在的 user)。

- 建議:在 `softDeleteUser` 時,若 `role === 'company'`,把 `getUsersByCompanyId(companyId)` 的所有司機一併警告 / 自動 unbind / 一併丟入垃圾桶。
- 目前 `components/company/CompanyList.tsx` 會顯示警告,但允許繼續刪除。

### 5.4 還原(從垃圾桶)

`app/onefleet-system-admin/trash.tsx` 的 `handleRestore`:
- `kind === 'user'` → `addUser(...)`(從 snapshot 重建 user,**注意**:還原時不會呼叫 `addUserProfile` 上傳到 Supabase,只重建本地)。
- `kind === 'driver'` → `addDriver(...)`(本地)。

> ⚠️ 還原後司機的 `companyId` 與 `password` 必須由管理員手動設定。建議在 UI 上提示。

---

## 6. 同步策略總結

```
       App 本地 (AsyncStorage)            雲端 (Supabase user_profile)
       ─────────────────────            ──────────────────────────────
       managed_users  ───pushUsers()──▶  upsert (by id, is_deleted=false)
                                          │
                                          └─── fetchUserProfiles() ──┐
                                                                      │
       managed_users  ◀─── syncUsers() 合併 (email 為鍵, 遠端優先) ◀──┘

       managed_drivers ────────────────▶ (沒有獨立雲端表;
                                          driver 是 user_profile 中 role='driver')
```

- **新增 / 編輯**: `addUser` / `updateUser` → `pushUsersInBackground()` → upsert 到雲端。
- **刪除**: `softDeleteUser` → `hardDeleteUserProfile` (真刪除) + 垃圾桶快照。
- **同步下載**: `syncUsers()` → `fetchUserProfiles()` 過濾 `is_deleted=false` → 與本地以 email 合併(遠端優先)。
- **新舊 user 比較**: 用 `email.toLowerCase()` 作為唯一鍵,避免同一人重複新增。

---

## 7. 已知的邊界情境

| 情境 | 行為 |
| --- | --- |
| 公司帳號被刪,但旗下司機沒被刪 | 司機的 `companyId` 變孤兒;UI 顯示 `未知公司` |
| 司機換公司(從 A 換到 B) | 透過 `updateUser` 改 `companyId` 即可;`loadDrivers()` 同步 |
| 兩個使用者共用同一 email | 合併時以 email 為鍵,後者會覆蓋前者(可能誤刪) |
| Supabase 沒有 `user_profile` 環境變數 | `hasSupabaseEnv=false`,所有同步函式 no-op,只在本地運作 |
| 從垃圾桶還原 user | 只重建本地,不主動上傳 Supabase;下次 `syncUsers()` 會被遠端覆蓋回去(還原失敗) |

---

## 8. 後續優化建議

1. **建立獨立的 `companies` 資料表**,並加 `FOREIGN KEY (company_id) REFERENCES companies(id)` 約束,避免孤兒 ID。
2. **刪除公司時 cascade**:自動把旗下司機的 `companyId` 設為 null 或一併軟刪除。
3. **垃圾桶還原時補上雲端同步**:還原後呼叫 `addUserProfile` / `addDriver`,確保多裝置一致。
4. **email 衝突時以 id 為主鍵**:若同一人員曾用不同 email 建立,目前會被當作兩人;應在合併邏輯中保留 id 不變。
5. **補上單元測試**:對 `syncUsers` / `softDeleteUser` / `loadDrivers` 三個最容易出錯的函式加測試。