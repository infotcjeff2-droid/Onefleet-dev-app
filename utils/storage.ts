import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

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
    try {
      const stored = localStorage.getItem(this._storageKey);
      if (stored) {
        this._data = JSON.parse(stored);
      }
    } catch {
      this._data = {};
    }
    this._init = true;
  }

  private save() {
    localStorage.setItem(this._storageKey, JSON.stringify(this._data));
  }

  async setItem(key: string, value: string): Promise<void> {
    if (isWeb) {
      this.init();
      this._data[key] = value;
      this.save();
      return Promise.resolve();
    }
    return AsyncStorage.setItem(key, value);
  }

  async getItem(key: string): Promise<string | null> {
    if (isWeb) {
      this.init();
      return Promise.resolve(this._data[key] || null);
    }
    return AsyncStorage.getItem(key);
  }

  async removeItem(key: string): Promise<void> {
    if (isWeb) {
      this.init();
      delete this._data[key];
      this.save();
      return Promise.resolve();
    }
    return AsyncStorage.removeItem(key);
  }
}

export const storage = new WebStorage('fleetpro_storage');

export const isWebPlatform = isWeb;
