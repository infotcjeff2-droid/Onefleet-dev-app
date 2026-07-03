/**
 * 清除舊司機資料（Jeff 等）的腳本
 * 用途：移除以前用戶管理功能建立的司機角色用戶（Jeff, Jeff2 等）
 * 執行方式：npx ts-node --esm clear-old-drivers.ts
 * 或在 Expo Web 瀏覽器 console 執行 localStorage 清除（見下方）
 */

/**
 * ===== 在 Expo Web 瀏覽器 DevTools Console 執行以下程式碼 =====
 *
 * 會清除 fleetpro_storage 中存放的 managed_users 和 managed_drivers 資料，
 * 讓 driverStore 重新初始化（只用 defaultDrivers）。
 *
 * 執行完後請重新整理頁面（Refresh）。
 */

// 清除所有儲存的司機/用戶資料（重新初始化）
localStorage.removeItem('fleetpro_storage');

// 如果只想清除 managed_users（保留 managed_drivers），用以下程式碼：
/*
const raw = localStorage.getItem('fleetpro_storage');
if (raw) {
  const data = JSON.parse(raw);
  delete data['managed_users'];
  localStorage.setItem('fleetpro_storage', JSON.stringify(data));
  console.log('已清除 managed_users，保留其他資料');
}
*/

console.log('已清除所有 fleetpro_storage 資料，重新整理後會看到乾淨的司機列表。');
