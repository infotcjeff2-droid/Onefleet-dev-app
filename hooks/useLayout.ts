import { useWindowDimensions } from 'react-native';

export const BREAKPOINTS = {
  tablet: 768,
  desktop: 1024,
  wide: 1440,
} as const;

export type LayoutKind = 'mobile' | 'tablet' | 'desktop' | 'wide';

export function useLayout(): {
  width: number;
  height: number;
  kind: LayoutKind;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isWide: boolean;
} {
  const { width, height } = useWindowDimensions();

  const kind: LayoutKind =
    width >= BREAKPOINTS.wide
      ? 'wide'
      : width >= BREAKPOINTS.desktop
      ? 'desktop'
      : width >= BREAKPOINTS.tablet
      ? 'tablet'
      : 'mobile';

  return {
    width,
    height,
    kind,
    isMobile: kind === 'mobile',
    isTablet: kind === 'tablet',
    isDesktop: kind === 'desktop' || kind === 'wide',
    isWide: kind === 'wide',
  };
}