import { create } from 'zustand';
import { colors as defaultColors } from '@/constants/theme';

interface ThemeState {
  colors: typeof defaultColors;
  isDark: boolean;
}

export const useThemeStore = create<ThemeState>((set) => ({
  colors: defaultColors,
  isDark: true,
}));

export { defaultColors };
