export const colors = {
  // Backgrounds
  background: '#0D0F14',
  surface: '#161A23',
  card: '#1E2330',
  cardHover: '#252B3B',

  // Borders
  border: '#2A3040',
  borderActive: '#3D4560',

  // Primary
  primary: '#00C896',
  primaryDark: '#00A87A',
  primaryGlow: 'rgba(0, 200, 150, 0.15)',

  // Secondary
  secondary: '#3B9EFF',
  secondaryGlow: 'rgba(59, 158, 255, 0.15)',

  // Accent
  accent: '#FF7043',
  accentSecondary: '#FFB547',

  // Text
  textPrimary: '#F0F2F8',
  textSecondary: '#8B92A8',
  textTertiary: '#5A6178',

  // Semantic
  danger: '#FF4757',
  dangerGlow: 'rgba(255, 71, 87, 0.15)',
  success: '#00C896',
  warning: '#FFB547',

  // Overlay
  overlay: 'rgba(13, 15, 20, 0.8)',
  overlayLight: 'rgba(13, 15, 20, 0.5)',
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
  card: '0 4px 12px rgba(0, 0, 0, 0.3)',
  cardHover: '0 8px 24px rgba(0, 0, 0, 0.4)',
  glow: (color: string) => `0 0 20px ${color}`,
  button: '0 2px 8px rgba(0, 200, 150, 0.3)',
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
  active: { bg: 'rgba(0, 200, 150, 0.15)', text: '#00C896', dot: '#00C896' },
  maintenance: { bg: 'rgba(255, 181, 71, 0.15)', text: '#FFB547', dot: '#FFB547' },
  inactive: { bg: 'rgba(139, 146, 168, 0.15)', text: '#8B92A8', dot: '#8B92A8' },
  danger: { bg: 'rgba(255, 71, 87, 0.15)', text: '#FF4757', dot: '#FF4757' },
} as const;
