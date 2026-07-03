import React, { createContext, useContext, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect } from 'react';

export type FontScale = 'normal' | 'large' | 'larger';

const FONT_SCALE_KEY = 'app_font_scale';

export const fontScaleValues: Record<FontScale, number> = {
  normal: 1,
  large: 1.15,
  larger: 1.3,
};

interface FontScaleContextValue {
  fontScale: FontScale;
  setFontScale: (scale: FontScale) => void;
  getScaledSize: (size: number) => number;
}

const FontScaleContext = createContext<FontScaleContextValue>({
  fontScale: 'normal',
  setFontScale: async () => {},
  getScaledSize: (size: number) => size,
});

export function useFontScale() {
  return useContext(FontScaleContext);
}

interface FontScaleProviderProps {
  children: React.ReactNode;
}

export function FontScaleProvider({ children }: FontScaleProviderProps) {
  const [fontScale, setFontScaleState] = useState<FontScale>('normal');

  useEffect(() => {
    AsyncStorage.getItem(FONT_SCALE_KEY).then((stored) => {
      if (stored === 'normal' || stored === 'large' || stored === 'larger') {
        setFontScaleState(stored);
      }
    }).catch(() => {});
  }, []);

  const setFontScale = async (scale: FontScale) => {
    setFontScaleState(scale);
    try {
      await AsyncStorage.setItem(FONT_SCALE_KEY, scale);
    } catch {
      // ignore
    }
  };

  const getScaledSize = useMemo(() => {
    const scaleValue = fontScaleValues[fontScale];
    return (size: number) => Math.round(size * scaleValue);
  }, [fontScale]);

  return (
    <FontScaleContext.Provider value={{ fontScale, setFontScale, getScaledSize }}>
      {children}
    </FontScaleContext.Provider>
  );
}
