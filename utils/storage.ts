import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// 檢查是否在瀏覽器環境中（有 window/localStorage）
const hasWindow = typeof window !== 'undefined';
const isWebPlatform = Platform.OS === 'web' && hasWindow;

interface StorageAdapter {
  setItem: (key: string, value: string) => Promise<void>;
  getItem: (key: string) => Promise<string | null>;
  removeItem: (key: string) => Promise<void>;
}

class WebStorage implements StorageAdapter {
  private _data: Record<string, string> = {};
  private _init = false;
  private _storageKey: string;

  constructor(storageKey = 'app_storage') {
    this._storageKey = storageKey;
  }

  private init() {
    if (this._init) return;
    // 確保 localStorage 可用
    if (typeof localStorage === 'undefined') {
      console.log('[WebStorage] localStorage 不可用, 跳過初始化');
      this._init = true;
      return;
    }
    try {
      const stored = localStorage.getItem(this._storageKey);
      if (stored) {
        this._data = JSON.parse(stored);
        console.log('[WebStorage] 從 localStorage 載入資料, keys:', Object.keys(this._data).length);
      } else {
        console.log('[WebStorage] localStorage 中無資料, 使用空物件');
      }
    } catch (e) {
      console.warn('[WebStorage] localStorage 讀取失敗:', e);
      this._data = {};
    }
    this._init = true;
  }

  private save() {
    const jsonData = JSON.stringify(this._data);
    try {
      localStorage.setItem(this._storageKey, jsonData);
      console.log('[WebStorage] 已儲存資料到 localStorage, 大小:', jsonData.length, 'bytes');
    } catch (e) {
      console.warn('[WebStorage] localStorage 儲存失敗 (可能已滿或被阻止):', e);
      // 嘗試只儲存每個 key 到獨立的 localStorage item（減少單一 JSON 的大小）
      this._saveIndividual();
    }
  }

  /** 個別儲存每個 key 到獨立的 localStorage item */
  private _saveIndividual() {
    for (const [key, value] of Object.entries(this._data)) {
      try {
        localStorage.setItem(key, value);
      } catch {
        // 忽略
      }
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    if (isWebPlatform) {
      this.init();
      this._data[key] = value;
      console.log('[WebStorage] setItem, key:', key, 'value length:', value.length);
      this.save();
      // 同步寫入獨立的 localStorage key，避免大 JSON 序列化瓶頸
      try {
        localStorage.setItem(key, value);
        console.log('[WebStorage] setItem 已寫入獨立 localStorage key:', key);
      } catch (e) {
        console.warn('[WebStorage] 獨立 localStorage 寫入失敗:', e);
      }
      return Promise.resolve();
    }
    return AsyncStorage.setItem(key, value);
  }

  async getItem(key: string): Promise<string | null> {
    if (isWebPlatform) {
      // 確保 localStorage 可用
      if (typeof localStorage === 'undefined') {
        console.log('[WebStorage] localStorage 不可用, 使用 AsyncStorage');
        return AsyncStorage.getItem(key);
      }
      this.init();
      // 優先從獨立 localStorage 讀取（避免大 JSON 解析）
      try {
        const direct = localStorage.getItem(key);
        if (direct !== null) {
          this._data[key] = direct;
          console.log('[WebStorage] getItem 從獨立 localStorage 讀取 key:', key);
          return Promise.resolve(direct);
        }
      } catch (e) {
        console.warn('[WebStorage] 獨立 localStorage 讀取失敗:', e);
      }
      const result = this._data[key] || null;
      if (result === null) {
        console.log('[WebStorage] getItem 未找到 key:', key);
      }
      return Promise.resolve(result);
    }
    return AsyncStorage.getItem(key);
  }

  async removeItem(key: string): Promise<void> {
    if (isWebPlatform) {
      this.init();
      delete this._data[key];
      try {
        this.save();
      } catch {
        // 當主 JSON 太大無法保存時，仍嘗試刪除獨立 key
      }
      try {
        localStorage.removeItem(key);
      } catch {
        // 忽略錯誤
      }
      return Promise.resolve();
    }
    return AsyncStorage.removeItem(key);
  }
}

export const storage = new WebStorage('fleetpro_storage');

export { isWebPlatform };
