import { Platform } from 'react-native';

/**
 * Design tokens, taken from the dark theme of the Kwala web app and the
 * supplied screenshots. The screenshots are dark only, so version one ships
 * dark only.
 */
export const colors = {
  background: '#050810',
  backgroundDeep: '#03060c',
  surface: '#0b1018',
  surfaceSecondary: '#0f1623',
  surfaceElevated: '#131a26',
  surfaceHover: '#182033',
  border: '#1c2434',
  borderStrong: '#2a3550',
  textPrimary: '#f8fafc',
  textSecondary: '#cbd5e1',
  textTertiary: '#94a3b8',
  // The button green in the screenshots (the CSS token #007f47 is the text
  // colour on light; the filled buttons use this lighter green).
  primary: '#4aa664',
  primaryPressed: '#3f9158',
  primaryNeon: '#00ff88',
  onPrimary: '#ffffff',
  userBubble: '#2f8f5a',
  danger: '#f59e0b',
  dangerBg: 'rgba(251, 191, 36, 0.12)',
  error: '#ef4444',
  bullish: '#00ff88',
  bearish: '#ef4444',
  accent: '#818cf8',
  overlay: 'rgba(3, 6, 12, 0.7)',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radii = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

/**
 * Bricolage Grotesque, one registered family per weight (React Native picks a
 * font by family name, not by fontWeight, for custom fonts). If a font fails to
 * load the unknown family name falls back to the system font, which is the
 * "Bricolage Grotesque Fallback" behaviour.
 */
export const fonts = {
  regular: 'BricolageGrotesque_400Regular',
  medium: 'BricolageGrotesque_500Medium',
  semibold: 'BricolageGrotesque_600SemiBold',
  bold: 'BricolageGrotesque_700Bold',
  mono,
} as const;

export const type = {
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24, color: colors.textPrimary },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  eyebrow: {
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
    color: colors.textTertiary,
  },
  hero: {
    fontFamily: fonts.semibold,
    fontSize: 32,
    lineHeight: 38,
    color: colors.textPrimary,
  },
} as const;

/** Smallest comfortable touch target (Apple HIG 44pt, Material 48dp). */
export const MIN_TOUCH = 44;
