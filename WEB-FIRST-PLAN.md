# FleetPro ─ Web-First 改造計畫

> 目標:把「以 App (iOS/Android) 為主」轉成「以 Web 為主、App 仍可打包」。  
> Expo SDK 54 + expo-router + react-native-web → 這是 Expo 官方最推薦的 Universal App 路徑,
> 程式碼可以完全共用,主要工作量在 **RWD 導航、storage shim、desktop-only 元件、部署**。

---

## 已完成 (本次 commit)

| 項目 | 內容 | 狀態 |
|------|------|------|
| `metro.config.js` | 把 `expo/AppEntry.js` 別名到 `expo-router/entry`,Web 不再炸 `Unable to resolve '../../App'` | ✅ |
| `npx expo export --platform web` | 29 個靜態路由全部 pre-render 成功 | ✅ |
| `.env.example` | 新增,提供 Secret 注入模板 | ✅ |
| `.gitignore` | 加入 `.env`,阻止下次再被 commit | ✅ |
| `vercel.json` | 補 SPA fallback `/(.*) → /index.html` + 快取標頭 | ✅ |
| `package.json` scripts | `web:dev` / `web:build` / `web:serve` | ✅ |
| `.github/workflows/deploy.yml` | 既有檔案已 OK,直接部署到 GH Pages | ✅ |

---

## ⚠ 既有問題要記得處理

1. **`.env` 已在 git 歷史裡**(從 commit 訊息可見)。  
   - 到 Supabase 後台 **rotate** `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`(雖然是 anon,但仍暴露 project)。
   - 到 808GPS 控制台變更帳號密碼。
   - 用 `git filter-repo --path .env --invert-paths` 重寫歷史(會 force push,先跟團隊講)。
2. **`EXPO_PUBLIC_*` 變數會被打進 web bundle**──這些是設計上就會 ship 給客戶端的,
   所以 Supabase anon key 是 OK 的;但**絕對不要**用 `EXPO_PUBLIC_` 開任何 service_role。

---

## 部署環境變數設定 (Secrets) — 操作手冊

### 1. 本地 (localhost)

```bash
# 第一次
cp .env.example .env
# 編輯 .env,填入三個 EXPO_PUBLIC_* 值
```

`.env` 已被 `.gitignore` 排除,不會被 commit。
驗證:`npm run web:dev` → 看 Supabase 連線是否成功。

---

### 2. Vercel (推薦)

#### 第一次接 repo

1. 進 https://vercel.com → **Add New Project** → 選 `infotcjeff2-droid/Onefleet-dev-app` (或你的 repo)。
2. **Framework Preset** 選 **Other**(Vercel 會忽略它,直接用我們的 `vercel.json`)。
3. **Root Directory** 預設就好,不要改。
4. **Build Command** / **Output Directory** 留空(從 `vercel.json` 讀)。
5. 不要先 Deploy,先去設定環境變數。

#### 設定環境變數

Project → Settings → Environment Variables → 選 Production / Preview / Development:

| Name | Value |
|------|-------|
| `EXPO_PUBLIC_SUPABASE_URL` | `https://dwamxsvuikjfqhayfhap.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `<anon key>` |
| `EXPO_PUBLIC_GPS_PROXY_URL` | `https://console.onefleet.hk` |

按 **Add**,三個變數每個都要新增。Production / Preview / Development 都勾。

#### 部署

按 **Deploy**。之後只要 `git push origin main`,Vercel 自動 build + 部署。
**注意**:Vercel 預設會忽略 `.env` 檔,只看 Project Settings,所以 `.env` 是否 commit 對 Vercel 無影響。
但 GH Pages 部署要靠 `.github/workflows/deploy.yml`,下面會處理。

#### Vercel SPA routing 注意

`vercel.json` 的 rewrites `/(.*) → /index.html` 已處理 SPA fallback。
驗證:打開 `https://<project>.vercel.app/vehicle-management` 應該直接渲染該頁。

---

### 3. GitHub Pages

#### 設定 Secrets

進 repo → Settings → Secrets and variables → Actions → **New repository secret**:

| Name | Value |
|------|-------|
| `EXPO_PUBLIC_SUPABASE_URL` | `https://dwamxsvuikjfqhayfhap.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `<anon key>` |
| `EXPO_PUBLIC_GPS_PROXY_URL` | `https://console.onefleet.hk` |

> ⚠ GH Pages 的 base path 是 `/<repo-name>/`,Expo 自動處理(`experiments.baseUrl: /` 已設)。

#### Pages 設定

Settings → Pages → Source = **GitHub Actions**(不要選 Deploy from a branch)。

#### Workflow 變更

`.github/workflows/deploy.yml` 已經會跑 `npm ci` + `npx expo export --platform web` + upload `dist/`。
Expo CLI 在 build 時會自動讀 `process.env.EXPO_PUBLIC_*`,但 GitHub Actions 預設不會把 `secrets.*` 注入 `process.env` 給 build step。
需要在 build step 前加上 `env:` 區塊(見下方 A-3 修改)。

---

### 4. 驗證部署成功

跑完 build 後打開網址,在 Chrome DevTools 切到 Network → 應該看到:
- `/login` 靜態 HTML (Server-side rendered by expo-router)
- `/_expo/static/css/global-*.css` (約 401 B)
- `/_expo/static/js/web/entry-*.js` (約 4.7 MB,Expo dev bundle 正常)
- localStorage 中應有 `fleetpro_storage`、`gps808_config`(如果有連線過 GPS)。

---

## 接下來要做的工項 (Roadmap,照優先序)

### Phase A — 桌機/平板 RWD 導航 (高優先,1~2 天)
目前 `(tabs)/_layout.tsx` 是底部 tab bar。寬螢幕上很擠。

- [ ] **(tabs)/_layout.tsx** 改 responsive
  - `< 768px`:維持底部 tab
  - `>= 768px`:左側 sidebar(FleetPro logo + 連結清單 + 登出)
- [ ] 把 `useWindowDimensions`(RN built-in)放到新的 `hooks/useLayout.ts`
- [ ] 桌面版的 header 加上 `user.name` 與 role badge

### Phase B — Web 特定 UX (中優先,1~2 天)
- [ ] **深色模式**:Global CSS 預設是淺色 (`#FFFFFF`),但 `useColorScheme` 回 `'dark'`。
  → 在 `global.css` 改成 `prefers-color-scheme: dark`,或加上 `data-theme` 切換。
- [ ] **`noindex` meta**:在 `app.json` 加 `web.metaTags` 避免 admin 後台被 Google 收錄。
- [ ] **PWA manifest**:在 `web/` 加 `manifest.json` (icon、display=standalone、theme_color=#0D0F14)。
- [ ] **Web Login 流程**:`(auth)/login.tsx` 已能用,但要驗證 redirect 在 web 下不會卡 spinner。
- [ ] **瀏覽器 back/forward**:`expo-router` 預設支援,但 `/vehicle/[id]` 深層連結要測。

### Phase C — Store & Utils 已知 web-only fix (低優先,半天)
你之前 commit 修過的:
- [x] `storage.ts` 已經是 web localStorage shim
- [x] `gps808Store` 處理 web 沒 cookie 的 re-login
- [x] `gps808Api` 提供 `setServerUrl` proxy 機制

剩餘:
- [ ] `utils/fleetSync.ts`:確認 `Platform.OS === 'web'` 分支正常
- [ ] `expo-web-browser` 在 web 應該 polyfill 成 `window.open`,確認登入 callback 能收回
- [ ] `expo-image-picker` 在 web 走 `<input type=file>`,UI 要確認

### Phase D — 桌面/平板專屬元件 (未來,視需求)
- [ ] `components/shell/DesktopShell.tsx` ─ sidebar + topbar + content
- [ ] 把 `BentoGrid` / `VehicleCard` 改成 grid (CSS grid 在 web 上原生支援)
- [ ] 多欄 table 取代平板/手機的卡片清單

### Phase E — App 仍能打包 (Promise)
- [ ] 不要把 `react-native-*` 元件全砍掉;`expo build` 仍可運作
- [ ] `app.json.ios.bundleIdentifier` / `android.package` 維持 `com.fleetpro.app`
- [ ] 任何 desktop-only 元件放進 `components/desktop/`,並用 `Platform.OS === 'web'` guard

---

## 建議的工作流程 (Web-first daily dev)

```bash
# 1. 本地開發
npm run web:dev          # 等同 expo start --web --port 8081

# 2. 改完後 build 一次驗證
npm run web:build
npm run web:serve        # 本地 4173 看 SPA + 真的 client-side routing

# 3. 部署
git push                 # Vercel auto-build + GH Pages workflow auto-build
```

---

## 驗證清單 (Phase A 完成後跑一次)

- [ ] 在 Chrome DevTools 切到 iPhone SE (375px) → 看到底部 tab
- [ ] 切到 iPad (768px) → 看到 sidebar
- [ ] 切到 1440px → sidebar + 寬鬆 padding
- [ ] 登入 → 跳轉 `/(tabs)` → 重新整理仍登入 (localStorage 還在)
- [ ] 開 `/vehicle/abc-123` → 直接打網址能進該頁 (SPA 路由)
- [ ] `npx expo run:android` 仍能 build 出 APK (沒破壞 mobile)

---

## 開放議題 (要再問 user)

1. **是否要 dark mode toggle?** (目前 `themeStore.ts` 有,但 `useColorScheme` 寫死 `'dark'`)
2. **要不要做 SSR?** (expo-router `experiments` 已有 `static rendering`,SSR 需要再換 `output: 'server'`,部署需要 Node runtime)
3. **808GPS API 認證方式?** (browser 的 cookie 跟 RN 不同,要驗證 cookie 在 proxy 後是怎麼存的)
4. **要不要拆 `apps/web` 與 `apps/mobile` 的 monorepo?** 目前單一 codebase 已能雙跑,不必拆。
