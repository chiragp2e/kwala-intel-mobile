import { colors } from '../theme/tokens';
import type { Role } from './types';

/** Solid colour for text and small marks. */
export const ROLE_COLOR: Record<Role, string> = {
  bullish: '#10d98a',
  bearish: '#f2556b',
  neutral: colors.textTertiary,
  info: colors.accent,
  warning: colors.danger,
};

/** The same hue as a wash, for pill, band and card backgrounds. */
export const ROLE_WASH: Record<Role, string> = {
  bullish: 'rgba(16, 217, 138, 0.13)',
  bearish: 'rgba(242, 85, 107, 0.14)',
  neutral: 'rgba(148, 163, 184, 0.12)',
  info: 'rgba(129, 140, 248, 0.14)',
  warning: 'rgba(245, 158, 11, 0.14)',
};

/** Status never travels as colour alone: every pill carries one of these. */
export const ROLE_GLYPH: Record<Role, string> = {
  bullish: '▲',
  bearish: '▼',
  neutral: '■',
  info: 'i',
  warning: '!',
};

export function role(r: string | undefined, fallback: Role = 'neutral'): Role {
  return r && r in ROLE_COLOR ? (r as Role) : fallback;
}

/** Series colours for charts, in a fixed order so a series keeps its hue. */
export const SERIES_COLORS = ['#0ea371', '#3b82f6', '#d97706', '#a855f7', '#0891b2'];
export const UP = '#10b981';
export const DOWN = '#f43f5e';
