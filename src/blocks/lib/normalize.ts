// Turns whatever the backend sent into blocks the renderer can trust.
//
// The rule throughout: skip the item, never the answer. A widget kind this
// build has never heard of, a malformed chart, a group nested too deep — each
// is dropped or repaired on its own, so one bad element in a response cannot
// blank the whole reply. That is the same bargain `isRenderable` already makes
// for chart specs, extended to the rest of the vocabulary.

import { isRenderable } from './chartSupport';
import type { Block, GroupLayout, Widget, WidgetKind } from '../types';
import type { ChartSpec } from '../types';

/** Widget kinds this build can draw. Anything else is skipped rather than
 *  rendered as a placeholder — a half-drawn widget is worse than none. */
const KNOWN_WIDGETS: ReadonlySet<string> = new Set<WidgetKind>([
  'stat',
  'track',
  'sparkline',
  'pill',
  'chip',
  'verdict',
  'split',
  'timeline',
  'table',
  'position',
  'ladder',
  'actions',
]);

const LAYOUTS: ReadonlySet<string> = new Set<GroupLayout>(['row', 'grid', 'split']);

/** Groups may nest one level. Deeper layouts are flattened into their parent
 *  rather than dropped: a flatter arrangement still answers the question. */
const MAX_GROUP_DEPTH = 2;

interface RawMessage {
  content?: string;
  charts?: ChartSpec[];
  blocks?: Block[];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function widgetOk(w: unknown): w is Widget {
  return isObject(w) && typeof w.kind === 'string' && KNOWN_WIDGETS.has(w.kind);
}

/** Depth-first walk that both filters and repairs. Returns the blocks worth
 *  rendering; a group whose children all fell away returns nothing itself. */
function clean(input: unknown, depth: number): Block[] {
  if (!Array.isArray(input)) return [];
  const out: Block[] = [];

  for (const raw of input) {
    if (!isObject(raw)) continue;

    if (raw.type === 'prose') {
      const markdown = typeof raw.markdown === 'string' ? raw.markdown : '';
      if (markdown.trim()) out.push({ type: 'prose', markdown });
      continue;
    }

    if (raw.type === 'chart') {
      if (isRenderable(raw.spec as ChartSpec)) out.push({ type: 'chart', spec: raw.spec as ChartSpec });
      continue;
    }

    if (raw.type === 'widget') {
      if (widgetOk(raw.widget)) out.push({ type: 'widget', widget: raw.widget });
      continue;
    }

    if (raw.type === 'group') {
      const children = clean(raw.blocks, depth + 1);
      if (!children.length) continue;
      // Past the depth cap the group's own box is dropped and its children are
      // adopted by the parent, which is why this splices rather than pushes.
      if (depth >= MAX_GROUP_DEPTH) {
        out.push(...children);
        continue;
      }
      const layout = LAYOUTS.has(raw.layout as string) ? (raw.layout as GroupLayout) : 'row';
      out.push({
        type: 'group',
        layout,
        ...(typeof raw.title === 'string' && raw.title ? { title: raw.title } : {}),
        blocks: children,
      });
      continue;
    }
    // Unknown block type: skipped, so the backend can ship one before we draw it.
  }

  return out;
}

/** A dashboard leads with exactly one number. The model may mark several tiles
 *  as the headline; the first wins and the rest render as ordinary tiles. */
function demoteExtraHeroes(blocks: Block[], seen: { hero: boolean }): Block[] {
  return blocks.map((b) => {
    if (b.type === 'group') {
      return { ...b, blocks: demoteExtraHeroes(b.blocks, seen) };
    }
    if (b.type === 'widget' && b.widget.kind === 'stat' && b.widget.emphasis === 'hero') {
      if (seen.hero) return { ...b, widget: { ...b.widget, emphasis: 'normal' as const } };
      seen.hero = true;
    }
    return b;
  });
}

/** The renderer's single entry point. Accepts both the block payload and the
 *  older `content` + `charts[]` shape, so history written before this contract
 *  still renders — as its charts followed by its prose, which is exactly what
 *  the old hardcoded layout did. */
export function normalizeBlocks(message: RawMessage): Block[] {
  const explicit = clean(message.blocks, 0);
  if (explicit.length) return demoteExtraHeroes(explicit, { hero: false });
  // An explicit but entirely unrenderable block list still suppresses the
  // legacy path — the backend spoke the new contract, we just couldn't draw it.
  if (Array.isArray(message.blocks) && message.blocks.length) return [];

  const legacy: Block[] = [];
  for (const spec of message.charts ?? []) {
    if (isRenderable(spec)) legacy.push({ type: 'chart', spec });
  }
  if (typeof message.content === 'string' && message.content.trim()) {
    legacy.push({ type: 'prose', markdown: message.content });
  }
  return legacy;
}
