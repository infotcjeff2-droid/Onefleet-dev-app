/**
 * 從地址字串產生穩定的合成座標，用於內部距離估算。
 * 不依賴真實地理位置，僅作為路徑分配演算法的 deterministic seed。
 */
function hashStringToNumber(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** 將地址轉換為座標（lat 範圍 -90~90, lng 範圍 -180~180） */
export function addressToCoords(address: string): { lat: number; lng: number } {
  if (!address || address.length === 0) {
    return { lat: 0, lng: 0 };
  }
  const seed = hashStringToNumber(address);
  // 使用 seed 產生範圍為 +/-89 的緯度，+/-179 的經度
  const lat = ((seed % 178) - 89) + ((seed % 1000) / 1000);
  const lng = (((seed * 7) % 358) - 179) + ((seed % 997) / 997);
  return { lat, lng };
}

/** 取得倉庫的內部座標，如不存在則根據 address 即時計算 */
export function getWarehouseCoords(warehouse: { address: string; internalCoords?: { lat: number; lng: number } }): { lat: number; lng: number } {
  if (warehouse.internalCoords) return warehouse.internalCoords;
  return addressToCoords(warehouse.address);
}
