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
  /** The Kwala Intel brand green (BRAND_GUIDELINES.md, dark): wordmark, splash. */
  brand: '#00a85a',
  /** The web app's `--color-primary` / `--color-primary-hover`: the user bubble gradient and the typing dots. */
  webPrimary: '#007f47',
  webPrimaryHover: '#006b3c',
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

/**
 * The web app's three typefaces (kwala-intel-fe/src/index.css): Geist for all
 * UI text and headings, JetBrains Mono for numbers and labels, Newsreader for
 * the editorial hero line. One registered family per weight, because React
 * Native picks a custom font by family name, not by fontWeight. They are loaded
 * in App.tsx and also bundled in android/app/src/main/assets/fonts.
 */
export const fonts = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  bold: 'Geist_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
  serif: 'Newsreader_500Medium',
  serifItalic: 'Newsreader_400Regular_Italic',
} as const;

/**
 * The web's `letter-spacing: -0.022em` on headings, in points. Body text's
 * -0.005em is left out: it is a tenth of a point, and on Android letter spacing
 * on text with nested spans in another font (bold, italic) can mis-measure the
 * line and clip its last word.
 */
const tracking = (size: number, em: number) => Math.round(size * em * 100) / 100;

export const type = {
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24, color: colors.textPrimary },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
    color: colors.textTertiary,
  },
  heading: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, letterSpacing: tracking(18, -0.022), color: colors.textPrimary },
  hero: {
    fontFamily: fonts.semibold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: tracking(32, -0.022),
    color: colors.textPrimary,
  },
  /** `.intel-headline`: the serif hero on the empty chat. */
  headline: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 36, color: colors.textPrimary },
} as const;

/** Smallest comfortable touch target (Apple HIG 44pt, Material 48dp). */
export const MIN_TOUCH = 44;
