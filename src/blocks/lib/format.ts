// Number formatting shared by charts and widgets, so an axis tick and the stat
// tile above it can never disagree about what the same value looks like.

import type { Delta, Role, Unit } from '../types';

// A currency is a symbol plus the digit grouping its readers expect. Rupees
// group in lakhs — "12,34,567", not "1,234,567" — so en-US grouping on a rupee
// value is the same class of error as the $ sign it replaces, only quieter.
const CURRENCY = {
  usd: { symbol: '$', locale: 'en-US' },
  inr: { symbol: '₹', locale: 'en-IN' },
} as const;

type Currency = keyof typeof CURRENCY;

function isCurrency(unit?: Unit | string): unit is Currency {
  return unit === 'usd' || unit === 'inr';
}

/** A price as a reader expects it quoted — "$58,231.50", "₹12,34,567.89".
 *  `cents` off gives the axis-tick flavour: "$300", not "$300.00", because a
 *  tick is read as a scale rather than an amount and forced cents only widen
 *  the column. */
function money(v: number, cents: boolean, ccy: Currency): string {
  if (!Number.isFinite(v)) return '';
  const { symbol, locale } = CURRENCY[ccy];
  const sign = v < 0 ? `-${symbol}` : symbol;
  const abs = Math.abs(v);
  if (abs === 0) return `${symbol}0`;
  if (abs >= 1) {
    return (
      sign +
      abs.toLocaleString(locale, {
        maximumFractionDigits: 2,
        ...(cents ? { minimumFractionDigits: 2 } : {}),
      })
    );
  }
  // A small cap rounded to two decimals is "$0.00", which is not a price.
  return sign + parseFloat(abs.toPrecision(4)).toString();
}

/** Signed percent for changes: "+12.4%" / "-3.2%". Unsigned reads as a level
 *  rather than a move, which is the wrong claim for every percent we show. */
export function fmtPct(v: number): string {
  if (!Number.isFinite(v)) return '';
  return (v > 0 ? '+' : '') + v.toLocaleString('en-US', { maximumFractionDigits: 2 }) + '%';
}

/** A percent that is a level, not a move — a probability, a hit rate, the
 *  odds that the stop trades first. "+25%" on one of those reads as a return,
 *  which is the wrong claim; a negative still shows its "-" because that is
 *  the number, but nothing here ever gains a "+". Kept apart from `fmtPct`
 *  rather than as a flag on it, because `fmtPct` is handed to chart axes as a
 *  callback and a second positional argument there would be the tick index. */
export function fmtPctLevel(v: number): string {
  if (!Number.isFinite(v)) return '';
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 }) + '%';
}

export function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return '';
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function formatValue(v: number, unit?: Unit): string {
  if (!Number.isFinite(v)) return '';
  if (isCurrency(unit)) return money(v, true, unit);
  if (unit === 'percent') return fmtPct(v);
  return fmtNum(v);
}

/** Axis-flavoured dispatch, used by the chart builders. */
export function unitFormatter(unit?: Unit | string): (v: number) => string {
  if (isCurrency(unit)) return (v: number) => money(v, false, unit);
  if (unit === 'percent') return fmtPct;
  return fmtNum;
}

// [divisor, suffix, the magnitude at which it takes over]. Thousands only
// abbreviate from five digits: "1,284" is already short and exact, and "1.3K"
// throws away a digit to save one character.
const SCALES: [number, string, number][] = [
  [1e12, 'T', 1e12],
  [1e9, 'B', 1e9],
  [1e6, 'M', 1e6],
  [1e3, 'K', 1e4],
];

// Rupees count in lakhs and crores. "₹4.2M" beside prose reading "₹42L" is the
// same two-conventions-in-one-card bug the `inr` unit exists to kill, so the
// magnitudes have to change with the symbol. Thresholds mirror `_fmt_value` in
// the backend's app/blocks.py. The 1e12 step is a lakh crore — where large-cap
// India actually sits, and without it a ₹6 lakh crore cap reads "₹600000cr".
const SCALES_INR: [number, string, number][] = [
  [1e12, 'L cr', 1e12],
  [1e7, 'cr', 1e7],
  [1e5, 'L', 1e5],
];

/** Tile-sized numbers: "1,284", "12.9K", "$4.2M". A stat tile has room for a
 *  magnitude, not for nine digits — and the exact figure belongs in the
 *  tooltip or the table, not in the headline. */
export function compact(v: number, unit?: Unit): string {
  if (!Number.isFinite(v)) return '';
  if (unit === 'percent') return fmtPct(v);
  const abs = Math.abs(v);
  const hit = (unit === 'inr' ? SCALES_INR : SCALES).find(([, , from]) => abs >= from);
  // Below the first step the exact figure is already short — and for a share
  // price that is the whole point: the tile reads "₹1,144.00" like its caption.
  if (!hit) return formatValue(v, unit);

  const [size, suffix] = hit;
  // One decimal, but never a bare ".0" — that reads as precision we don't have.
  const scaled = parseFloat((abs / size).toFixed(1));
  const body = scaled.toString() + suffix;
  if (isCurrency(unit)) return (v < 0 ? '-' : '') + CURRENCY[unit].symbol + body;
  return (v < 0 ? '-' : '') + body;
}

/** The exact figure, never abbreviated: "23,146.15", "₹23,146.15". An index
 *  level is read to the point — a trader placing a stop at 23,140 cannot use
 *  "23.1K" — so this always carries two decimals, grouped the way the
 *  currency's readers group (lakhs for rupees). Percent stays a percent. */
export function fmtFull(v: number, unit?: Unit): string {
  if (!Number.isFinite(v)) return '';
  if (unit === 'percent') return fmtPct(v);
  if (isCurrency(unit)) return money(v, true, unit);
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** How one figure should be drawn, decided upstream from the payload's flags
 *  and the label heuristics in `lib/blocks/figure.ts`. */
export interface FigureStyle {
  /** Never compact; two decimals. */
  full?: boolean;
  /** `false`: a percent level (probability) — no "+". Defaults to signed. */
  signed?: boolean;
}

/** The tile/cell dispatch: compact by default, exact when `full`, and a
 *  percent signed unless it is a level. */
export function formatFigure(v: number, unit?: Unit, style: FigureStyle = {}): string {
  if (!Number.isFinite(v)) return '';
  if (unit === 'percent') return style.signed === false ? fmtPctLevel(v) : fmtPct(v);
  return style.full ? fmtFull(v, unit) : compact(v, unit);
}

export function formatDelta(delta: Delta): string {
  const { value, unit } = delta;
  if (!Number.isFinite(value)) return '';
  if (unit === 'percent') return delta.signed === false ? fmtPctLevel(value) : fmtPct(value);
  const body = compact(Math.abs(value), unit);
  const plus = delta.signed === false ? '' : '+';
  return (value > 0 ? plus : value < 0 ? '-' : '') + body;
}

/** Which way is good. A rise is bullish for price and bearish for drawdown, and
 *  only the payload knows which one this is. */
export function deltaRole(delta: Delta): Role {
  if (!Number.isFinite(delta.value) || delta.value === 0) return 'neutral';
  if (delta.direction === 'neutral') return 'neutral';
  const rising = delta.value > 0;
  const upIsGood = delta.direction !== 'down_good';
  return rising === upIsGood ? 'bullish' : 'bearish';
}
