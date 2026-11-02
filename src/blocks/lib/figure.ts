// Decides how a stat tile's or a table cell's number is drawn: compact or
// exact, signed or not.
//
// The payload says so explicitly where it can — `format: "full"` on index
// levels, `signed: false` on probabilities. Answers stored before the backend
// emitted those flags still have to render right, so each flag falls back to a
// label heuristic. An explicit flag always wins over the heuristic.

import { formatFigure, type FigureStyle } from './format';
import type { Delta, StatWidget, TableColumn, Unit } from '../types';

// An index level. Substring on "nifty" on purpose: it catches NIFTY 50,
// NIFTY50, BANKNIFTY, FINNIFTY and NIFTY MIDCAP 100 in one go. "vix\b" catches
// both "India VIX" and "INDIAVIX".
const INDEX_LABEL = /nifty|sensex|midcap|\bindex\b|\bindices\b|vix\b/i;

// Figures that sit under an index's name but are amounts or counts, not the
// level: those compact exactly as they did before.
const NOT_A_LEVEL =
  /vol(ume)?s?\b|turnover|traded|open interest|\boi\b|market cap|m\.?cap|\baum\b|flows?\b|contracts|shares|\bqty\b|quantity|\blots?\b/i;

// No index trades anywhere near a million; a figure that large under an index
// label is an amount or a count, so it keeps its compaction.
const LEVEL_CEILING = 1e6;

// A probability or hit rate — a level, not a move. Word edges where a bare
// substring would catch a name: "first\b" matches "stop-first" and "T1-first"
// but not Firstsource, "\bhits?\b" not "white".
const PROBABILITY_LABEL =
  /first\b|\bhits?\b|probab|\bodds\b|\bchances?\b|win rate|success|likelihood|↑|↓|\bflat\b/i;

export function isIndexLabel(label: string | undefined): boolean {
  return !!label && INDEX_LABEL.test(label) && !NOT_A_LEVEL.test(label);
}

export function isProbabilityLabel(label: string | undefined): boolean {
  return !!label && PROBABILITY_LABEL.test(label);
}

/** Heuristic "never compact" for a value whose label names an index. Rupees
 *  are left alone: they compact only from a lakh, which no index level
 *  reaches, so the only rupee figures this could touch are ₹ crore amounts. */
function looksLikeLevel(v: number, unit: Unit | undefined, labels: (string | undefined)[]): boolean {
  if (unit === 'percent' || unit === 'inr') return false;
  if (Math.abs(v) >= LEVEL_CEILING) return false;
  // Any label calling it an amount vetoes the lot — "Volume" in a NIFTY row.
  if (labels.some((l) => !!l && NOT_A_LEVEL.test(l))) return false;
  return labels.some(isIndexLabel);
}

function signedFrom(explicit: boolean | undefined, label: string | undefined): boolean {
  if (typeof explicit === 'boolean') return explicit;
  return !isProbabilityLabel(label);
}

export function statStyle(w: StatWidget): FigureStyle {
  const v = typeof w.value === 'number' ? w.value : NaN;
  return {
    full: w.format === 'full' || looksLikeLevel(v, w.unit, [w.label]),
    signed: signedFrom(w.signed, w.label),
  };
}

/** The tile's headline as drawn. Strings pass through untouched; a missing
 *  value (a malformed widget) draws nothing rather than "undefined". */
export function statFigure(w: StatWidget): string {
  if (typeof w.value !== 'number') return w.value == null ? '' : String(w.value);
  return formatFigure(w.value, w.unit, statStyle(w));
}

/** A row is named by its first column when that cell is text — "NIFTY 50",
 *  "RRKABEL". */
export function rowName(row: Record<string, unknown>, columns: TableColumn[]): string | undefined {
  const first = columns[0];
  if (!first) return undefined;
  const v = row[first.key];
  return typeof v === 'string' ? v : undefined;
}

export function cellStyle(v: number, col: TableColumn, name?: string): FigureStyle {
  return {
    full: col.format === 'full' || looksLikeLevel(v, col.unit, [col.label, name]),
    signed: signedFrom(col.signed, col.label),
  };
}

export function cellFigure(v: number, col: TableColumn, name?: string): string {
  return formatFigure(v, col.unit, cellStyle(v, col, name));
}

/** A delta is signed unless the payload says otherwise, or — for an inline
 *  chip, whose label is the delta's own — the label reads as a probability. A
 *  stat's delta does not inherit the stat's label: a change in a hit rate is
 *  still a change. */
export function resolveDelta(delta: Delta, label?: string): Delta {
  const signed = signedFrom(delta.signed, label);
  return signed === (delta.signed !== false) ? delta : { ...delta, signed };
}
