// Turns a block back into a sentence, so it can be handed to the agent as a
// research request.
//
// The obvious alternative — posting the block's JSON — reads as a blob in the
// user's own transcript, and the transcript is theirs to re-read. So this says
// in words what the block says on screen, reusing the same formatters: a number
// quoted to the agent always matches the number the reader is looking at.

import { compact, fmtPct, fmtPctLevel, formatValue } from './format';
import { statFigure } from './figure';
import type { Block, Delta, TableColumn, Widget } from '../types';

/** Long enough to carry a chart's worth of levels, short enough to read back
 *  as a message. Prose blocks are the ones that would otherwise run away. */
const MAX_LEN = 600;

const join = (parts: (string | undefined | null)[], sep = ', ') =>
  parts.filter((p): p is string => !!p && p.trim().length > 0).join(sep);

function num(v: number | string | undefined, unit?: TableColumn['unit']): string {
  if (v === undefined) return '';
  if (typeof v === 'string') return v;
  return unit === 'percent' ? formatValue(v, 'percent') : compact(v, unit);
}

function delta(d: Delta | undefined): string {
  if (!d) return '';
  const body =
    d.unit === 'percent'
      ? (d.signed === false ? fmtPctLevel : fmtPct)(d.value)
      : formatValue(d.value, d.unit ?? 'number');
  return d.period ? `${body} ${d.period}` : body;
}

function describeWidget(w: Widget): string | null {
  switch (w.kind) {
    case 'stat': {
      // The tile's own figure, so the agent is quoted the number on screen.
      const head = `${w.label} ${statFigure(w)}`.trim();
      return join([head, delta(w.delta), w.caption], ' · ');
    }
    case 'track': {
      const levels = (w.markers ?? [])
        .map((m) => join([m.label, formatValue(m.at, w.unit)], ' '))
        .filter(Boolean);
      const range = w.range
        ? `range ${formatValue(w.range[0], w.unit)}–${formatValue(w.range[1], w.unit)}`
        : '';
      const value = typeof w.value === 'number' ? `at ${formatValue(w.value, w.unit)}` : '';
      const target = typeof w.target === 'number' ? `target ${formatValue(w.target, w.unit)}` : '';
      const body = join([value, target, range, ...levels]);
      return join([w.label ?? w.variant, body], ': ') || null;
    }
    case 'sparkline': {
      const end = w.value !== undefined ? `ending at ${num(w.value, w.unit)}` : '';
      return join([w.label ?? 'trend', end], ' ') || null;
    }
    case 'verdict':
      return join(
        [
          `the call "${w.call}"`,
          typeof w.conviction === 'number' ? `conviction ${Math.round(w.conviction)}%` : '',
          w.rationale,
        ],
        ' · ',
      );
    case 'split':
      return join(
        [
          `${w.left.title}: ${w.left.items.join('; ')}`,
          `${w.right.title}: ${w.right.items.join('; ')}`,
        ],
        ' — ',
      );
    case 'timeline':
      return join(
        ['upcoming events', w.events.map((e) => join([e.title, e.detail], ' — ')).join('; ')],
        ': ',
      );
    case 'table': {
      // Row identity plus column names, not every cell: the agent needs to know
      // what is being compared, and it can ask for the numbers it wants.
      const first = w.columns[0];
      const names = w.rows
        .map((r) => String(r[first?.key] ?? ''))
        .filter(Boolean)
        .join(', ');
      return join([
        `a comparison of ${names || `${w.rows.length} rows`}`,
        `across ${w.columns.map((c) => c.label).join(', ')}`,
      ], ' ');
    }
    case 'position':
      return join([
        `position in ${w.symbol}`,
        `size ${compact(w.size)}`,
        `cost basis ${formatValue(w.cost_basis, w.unit ?? 'usd')}`,
        `last ${formatValue(w.price, w.unit ?? 'usd')}`,
      ]);
    case 'ladder':
      return join([
        'the order book',
        typeof w.mid === 'number' ? `around ${formatValue(w.mid, w.unit ?? 'usd')}` : '',
        `over ${w.levels.length} price levels`,
      ], ' ');
    // Inline widgets carry no research affordance, so they have nothing to say.
    case 'pill':
    case 'chip':
    case 'actions':
      return null;
  }
}

/** What this block is about, in words, or `null` when it is not a subject. */
export function describeBlock(block: Block): string | null {
  switch (block.type) {
    case 'prose':
      return block.markdown.trim() || null;
    case 'chart': {
      const { title, chart_type, series } = block.spec;
      if (title) return `the chart "${title}"`;
      const names = (series ?? []).map((s) => s.name).filter(Boolean).join(', ');
      return join([`a ${chart_type} chart`, names && `of ${names}`], ' ');
    }
    case 'widget':
      return describeWidget(block.widget);
    case 'group': {
      const kids = block.blocks.map(describeBlock).filter((d): d is string => !!d);
      if (!kids.length) return null;
      return join([block.title, kids.join('; ')], ': ');
    }
  }
}

/** The message sent on behalf of the reader when they ask to dig into a block.
 *  Phrased as a request, because it lands in the transcript as their own turn. */
export function researchPrompt(block: Block): string | null {
  const what = describeBlock(block);
  if (!what) return null;
  const trimmed = what.length > MAX_LEN ? `${what.slice(0, MAX_LEN - 1).trimEnd()}…` : what;
  return `Research this further — ${trimmed}`;
}
