# FleetPro - 技術棧文件 (Tech Stack)

> 最後更新：2026-06-08

---

## 框架與運行時 (Framework & Runtime)

| 項目 | 名稱 | 版本 | 說明 |
|------|------|------|------|
| Framework | **Expo** | SDK 54 (~54.0.33) | React Native 開發框架，提供統一的跨平台開發體驗 |
| Runtime | **React Native** | 0.81.5 | 底層原生移動開發框架 |
| Web Runtime | **React DOM** | 19.1.0 | 網頁版運行環境 |
| Web Rendering | **react-native-web** | 0.21.0 | 將 React Native 元件轉譯為 Web DOM |
| Language | **TypeScript** | ~5.9.2 | 強類型 JavaScript 超集 (strict mode) |

---

## 核心函式庫 (Core Libraries)

### 路由與導航

| 函式庫 | 版本 | 用途 |
|--------|------|------|
| `expo-router` | ~6.0.23 | 檔案式路由 (file-based routing) |
| `@react-navigation/native` | ^7.1.8 | 底層導航容器 |
| `react-native-screens` | ~4.16.0 | 原生螢幕導航效能優化 |
| `react-native-safe-area-context` | ~5.6.0 | 安全區域處理 (瀏海/Home Bar) |

### 狀態管理

| 函式庫 | 版本 | 用途 |
|--------|------|------|
| `zustand` | ^5.0.13 | 輕量級全域狀態管理 (無 boilerplate) |

### UI 與樣式

| 函式庫 | 版本 | 用途 |
|--------|------|------|
| `nativewind` | ^4.2.3 | Tailwind CSS 語法用於 React Native |
| `expo-linear-gradient` | ~15.0.8 | 漸層背景元件 |
| `@expo/vector-icons` | ^15.0.3 | 圖示庫 (內含 Ionicons, MaterialIcons 等) |
| `lucide-react-native` | ^1.14.0 | Lucide 圖示 (統一 stroke width, 圓角) |

### 動畫與手勢

| 函式庫 | 版本 | 用途 |
|--------|------|------|
| `react-native-reanimated` | ~4.1.1 | 高效能動畫庫 |
| `react-native-gesture-handler` | ~2.28.0 | 手勢處理 |

### 資料儲存

| 函式庫 | 版本 | 用途 |
|--------|------|------|
| `@react-native-async-storage/async-storage` | 2.2.0 | 本地持久化儲存 (跨 app 重啟保留資料) |

### Expo 生態

| 函式庫 | 版本 | 用途 |
|--------|------|------|
| `expo` | ~54.0.33 | Expo 核心 SDK |
| `expo-constants` | ~18.0.13 | App 常數 (如 dimensions, env) |
| `expo-font` | ~14.0.11 | 自訂字型載入 |
| `expo-linking` | ~8.0.11 | 深層連結 (deep linking) |
| `expo-splash-screen` | ~31.0.13 | 啟動畫面管理 |
| `expo-status-bar` | ~3.0.9 | 狀態列控制 |
| `expo-web-browser` | ~15.0.10 | 網頁瀏覽器視圖 |
| `react-native-worklets` | ^0.5.1 | Worklets 支援 (reanimated v4 依賴) |

---

## 開發依賴 (Dev Dependencies)

| 函式庫 | 版本 | 用途 |
|--------|------|------|
| `typescript` | ~5.9.2 | TypeScript 編譯器 |
| `@types/react` | ~19.1.0 | React 型別定義 |
| `react-test-renderer` | 19.1.0 | React 元件測試渲染 |

---

## 架構概覽

```
fleet-pro/
├── app/                  # 頁面 (expo-router 檔案式路由)
│   ├── (auth)/           # 認證流程 (登入/註冊)
│   ├── (tabs)/           # 分頁導航 (車輛/儀表板/個人)
│   └── vehicle/          # 車輛詳情與新增
├── components/           # React 元件
│   ├── ui/               # 基礎 UI 元件 (Button, Card, Badge...)
│   ├── vehicle/          # 車輛相關元件
│   └── auth/             # 認證相關元件
├── constants/            # 常數 (主題色, 假資料)
├── hooks/                # 自訂 Hooks (useAuth, useVehicles)
├── store/                # Zustand 狀態 stores
├── types/                # TypeScript 型別定義
└── tailwind.config.ts    # Tailwind/NativeWind 配置
```

---

## 技術決策摘要

| 決策 | 選擇 | 原因 |
|------|------|------|
| 路由系統 | expo-router | 檔案式路由直覺易懂，與 Expo 生態深度整合 |
| 樣式方案 | NativeWind (Tailwind) | 生產效率高，響應式設計快速 |
| 狀態管理 | Zustand | 極簡 API，無 Provider 包裝，效能佳 |
| 動畫方案 | Reanimated v4 | 執行緒級動畫，60fps 流暢效能 |
| 圖示方案 | Lucide React Native | 設計語言統一，stroke-based 風格現代 |
| 持久化 | AsyncStorage | 輕量、無需後端，適合本地優先 app |
| 目標平台 | Mobile-first (iOS/Android) + Web | 單碼基底多平台部署 |

---

## 目前資料流

```
Mock Data (constants/mockData.ts)
       ↓
  Zustand Store (vehicleStore)
       ↓
 AsyncStorage (持久化)
```

> 目前版本**無後端**，所有資料均存於本地。

---

## 啟動指令

```bash
# 安裝依賴
npm install

# 啟動開發伺服器
npm start

# 執行 Android
npm run android

# 執行 iOS
npm run ios

# 執行 Web
npm run web
```
