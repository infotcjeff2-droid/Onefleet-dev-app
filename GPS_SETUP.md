# FleetPro GPS 設定說明

## 問題說明

Web 端無法連接到 808GPS API，是因為**跨域 (CORS) 限制**。

瀏覽器不允許從 `http://localhost:8081` 直接請求 `https://console.onefleet.hk`，
因為它們是不同的域名。

## 解決方案

使用本地 Proxy 服務器轉發請求到 808GPS API。

## 啟動方式

### 方式一：同時啟動 Proxy + Web（推薦）

```bash
cd fleet-pro
npm run dev
```

這會同時啟動：
- GPS Proxy Server (http://localhost:3001)
- Expo Web 開發伺服器 (http://localhost:8081)

### 方式二：分開啟動

終端機 1 - 啟動 Proxy：
```bash
cd fleet-pro
npm run proxy
```

終端機 2 - 啟動 Web：
```bash
cd fleet-pro
npm run web
```

## 驗證是否正常

1. 確保終端機顯示：
   ```
   GPS Proxy Server 已啟動
   監聽端口: http://localhost:3001
   ```

2. 打開瀏覽器 http://localhost:8081

3. 登入並進入「系統設定 → 808GPS Provider」

4. 點擊「Test」測試連線

5. 如果連線成功，應該顯示「Connected」

6. 返回車輛頁面，GPS 追蹤器應該能顯示位置

## 常見問題

### Q: 終端機顯示「端口已被佔用」
```
端口 3001 已被佔用！請先關閉其他使用該端口的程式。
```

解決方法：
```bash
# 查找佔用端口的進程
netstat -ano | findstr :3001

# 結束進程（將 PID 換成實際的數字）
taskkill /PID <PID> /F
```

### Q: 顯示「Connected」但 GPS 追蹤器仍然沒有信號

可能原因：
1. **設備離線** - 車載 GPS 設備沒有連接網絡
2. **JSESSION 過期** - 需要重新登入
3. **設備 ID 錯誤** - 確認輸入的設備號碼正確

解決方法：
- 前往「系統設定 → 808GPS Provider」
- 點擊「Disconnect」斷開連線
- 重新輸入帳號密碼並連線

### Q: 移動設備（iOS/Android）需要 Proxy 嗎？

不需要！移動設備直接連接 API，沒有 CORS 問題。

## 生產環境部署

如果要在網路上部署 Web 版本，需要：

1. 部署一個支持 HTTPS 的 Proxy 服務器
2. 修改 `EXPO_PUBLIC_GPS_PROXY_URL` 為你的代理 URL

例如：
```
EXPO_PUBLIC_GPS_PROXY_URL=https://your-proxy.example.com/api/gps
```

Proxy 服務器代碼在 `server/gpsProxy.js`。
