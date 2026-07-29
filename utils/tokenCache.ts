import * as SecureStore from 'expo-secure-store';
import * as Platform from 'react-native';

// Web fallback: localStorage (expo-secure-store 不支援 web，會 throw)
const memoryTokenCache = new Map<string, string>();

const webTokenCache = {
  async getToken(key: string): Promise<string | null> {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memoryTokenCache.get(key) ?? null;
    }
  },
  async saveToken(key: string, value: string): Promise<void> {
    if (typeof window === 'undefined') {
      memoryTokenCache.set(key, value);
      return;
    }
    try {
      window.localStorage.setItem(key, value);
    } catch {
      memoryTokenCache.set(key, value);
    }
  },
};

const nativeTokenCache = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Ignore error
    }
  },
};

export const tokenCache =
  Platform.OS === 'web' ? webTokenCache : nativeTokenCache;
