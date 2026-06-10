export const colors = {
  // Backgrounds
  background: '#FFFFFF',
  surface: '#F5F6FA',
  card: '#FFFFFF',
  cardHover: '#F0F1F5',

  // Borders
  border: '#E0E2EA',
  borderActive: '#C8CAD6',

  // Primary
  primary: '#00A87A',
  primaryDark: '#008F68',
  primaryGlow: 'rgba(0, 200, 150, 0.15)',

  // Secondary
  secondary: '#2B7FD4',
  secondaryGlow: 'rgba(59, 158, 255, 0.15)',

  // Accent
  accent: '#E85A2C',
  accentSecondary: '#E69500',

  // Text
  textPrimary: '#0D0F14',
  textSecondary: '#5A6178',
  textTertiary: '#8B92A8',

  // Semantic
  danger: '#D93F4A',
  dangerGlow: 'rgba(255, 71, 87, 0.15)',
  success: '#00A87A',
  warning: '#E69500',

  // Overlay
  overlay: 'rgba(13, 15, 20, 0.6)',
  overlayLight: 'rgba(13, 15, 20, 0.3)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
  '6xl': 64,
} as const;

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const;

export const typography = {
  fontFamily: {
    display: 'DM Sans',
    mono: 'JetBrains Mono',
  },
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 28,
    '4xl': 32,
  },
  fontWeight: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
} as const;

export const shadows = {
  card: '0 4px 12px rgba(0, 0, 0, 0.08)',
  cardHover: '0 8px 24px rgba(0, 0, 0, 0.12)',
  glow: (color: string) => `0 0 20px ${color}`,
  button: '0 2px 8px rgba(0, 168, 122, 0.25)',
} as const;

export const animation = {
  duration: {
    fast: 100,
    normal: 150,
    slow: 250,
    page: 350,
  },
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const;

export const layout = {
  headerHeight: 56,
  tabBarHeight: 64,
  maxContentWidth: 480,
  cardRadius: 16,
  buttonRadius: 12,
  inputRadius: 12,
  modalRadius: 24,
} as const;

export const statusColors = {
  active: { bg: 'rgba(0, 168, 122, 0.12)', text: '#00A87A', dot: '#00A87A' },
  maintenance: { bg: 'rgba(230, 149, 0, 0.12)', text: '#E69500', dot: '#E69500' },
  inactive: { bg: 'rgba(90, 97, 120, 0.12)', text: '#5A6178', dot: '#5A6178' },
  danger: { bg: 'rgba(217, 63, 74, 0.12)', text: '#D93F4A', dot: '#D93F4A' },
} as const;
