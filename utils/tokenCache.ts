// Web fallback: localStorage
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

// Lazy load native token cache to avoid import errors on web
let nativeTokenCache: {
  getToken: (key: string) => Promise<string | null>;
  saveToken: (key: string, value: string) => Promise<void>;
} | null = null;

async function getNativeTokenCache() {
  if (nativeTokenCache) return nativeTokenCache;
  
  try {
    const SecureStore = await import('expo-secure-store');
    nativeTokenCache = {
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
  } catch {
    nativeTokenCache = {
      getToken: async () => null,
      saveToken: async () => {},
    };
  }
  return nativeTokenCache;
}

export const tokenCache = webTokenCache;
