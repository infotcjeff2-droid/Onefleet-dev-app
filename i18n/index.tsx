import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { zhTW } from './zh-TW';
import { en } from './en';

export type Locale = 'zh-TW' | 'en';

const STORAGE_KEY = 'app_locale';

const translations: Record<Locale, typeof zhTW> = {
  'zh-TW': zhTW,
  en: en,
};

type TranslationKey = string;
type Flattened = Record<string, string>;

function flatten(obj: Record<string, unknown>, prefix = ''): Flattened {
  const result: Flattened = {};
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(result, flatten(val as Record<string, unknown>, fullKey));
    } else if (typeof val === 'string') {
      result[fullKey] = val;
    }
  }
  return result;
}

const flatCache: Record<Locale, Flattened> = {
  'zh-TW': flatten(translations['zh-TW']),
  en: flatten(translations.en),
};

interface I18nContextValue {
  locale: Locale;
  t: (key: string) => string;
  setLocale: (locale: Locale) => Promise<void>;
  isInitialized: boolean;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'zh-TW',
  t: (key) => key,
  setLocale: async () => {},
  isInitialized: false,
});

export function useTranslation() {
  return useContext(I18nContext);
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('zh-TW');
  const [isInitialized, setIsInitialized] = useState(false);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'zh-TW' || stored === 'en') {
        setLocaleState(stored);
      }
      setIsInitialized(true);
    }).catch(() => {
      setIsInitialized(true);
    });
  }, []);

  const setLocale = useCallback(async (newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, newLocale);
    } catch {
      // ignore
    }
    forceUpdate((n) => n + 1);
  }, []);

  const t = useCallback(
    (key: string): string => {
      return flatCache[locale][key] ?? key;
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, t, setLocale, isInitialized }}>
      {children}
    </I18nContext.Provider>
  );
}
