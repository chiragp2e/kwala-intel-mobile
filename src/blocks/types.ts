// The visual vocabulary an assistant message is built from.
//
// A message is an ordered list of blocks rather than "charts above, prose
// below", so the model can put three numbers on one line or set a level rail
// beside a chart. Layout lives in the payload; the renderer only obeys it.
//
// Everything here is forward-compatible by omission: unknown block types and
// unknown widget kinds are skipped item-by-item, never fatally, so the backend
// can emit a widget before any frontend knows how to draw it.

// Chart payload, as the backend emits it (mirrors the web app's types).
export interface ChartSpec {
  version: number;
  chart_type: string;
  title?: string;
  x_axis?: {
    type?: string; // scatter: 'time' | 'log' (log also kicks in automatically
    //               when all-positive values span ≥ 2 decades)
    label?: string;
    categories?: string[];
  };
  y_axis?: {
    type?: string; // scatter: 'log', same auto rule as x
    label?: string;
    unit?: string;
    /** heatmap: the row labels. The grid needs both axes named. */
    categories?: string[];
  };
  normalized?: boolean;
  series: ChartSeries[];
  /** Drawing primitives layered onto the chart (trendlines, levels, zones,
   *  event markers). Additive to version 1: renderers skip unknown kinds
   *  item-by-item, so the backend can introduce kinds before any frontend
   *  learns to draw them. */
  overlays?: ChartOverlay[];
  /** Tappable follow-up prompts shown as chips; each string is sent verbatim
   *  as the user's next message. */
  suggestions?: string[];
}

/** All coordinates are in data space: `ts` epoch ms or ISO (should match a
 *  point in the charted series — categorical axes snap to the nearest bar),
 *  `y` in the y-axis unit. `role` is semantic; the frontend owns the actual
 *  colors so overlays follow the theme. */
export interface ChartOverlay {
  kind: string; // 'line' | 'level' | 'zone' | 'vline' | 'point' | 'callout'
  //             | forward-compat unknown
  name?: string;
  role?: string; // 'bullish' | 'bearish' | 'neutral' | 'info'
  style?: string; // 'solid' | 'dashed'
  points?: [number | string, number][]; // line
  extend?: string; // line: 'none' | 'right'
  y?: number; // level · point · callout
  y_from?: number; // zone
  y_to?: number; // zone
  ts?: number | string; // vline · point · callout
  /** callout: the note itself. Falls back to `name` when absent, so a callout
   *  is never a marker with nothing to say. */
  text?: string;
}

export interface ChartSeries {
  name: string;
  type: string;
  /** line: [ts, value][] · candlestick: [ts, o, h, l, c][] ·
   *  bar: (number | null)[] · pie: {name, value}[] ·
   *  scatter: [x, y][], [x, y, size][] or [x, y, size, name][] (x numeric, or
   *    a timestamp when `x_axis.type` is `'time'`; `size` drives bubble area;
   *    `name` labels the point — pass `null` for size to name an unsized dot) ·
   *  boxplot: [min, q1, median, q3, max][], or [ts, min, q1, median, q3, max][]
   *    when the buckets carry their own x instead of `x_axis.categories` ·
   *  funnel: {name, value}[] in stage order */
  data: unknown[];
}

/** Semantic, never a color. The theme owns the palette so widgets follow it. */
export type Role = 'bullish' | 'bearish' | 'neutral' | 'info' | 'warning';

/** Currency follows the ASSET'S LISTING, never the reader's location: INFY on
 *  NSE is `inr`, its NYSE ADR is `usd`, and BTC stays `usd` for an Indian user.
 *  Mirrors `UNITS` in the backend's app/blocks.py — the two must agree. */
export type Unit = 'usd' | 'inr' | 'percent' | 'number';

/** `row` puts children on one line, `grid` auto-fits columns, `split` is a
 *  fixed two-column argument layout. All three collapse to stacked on narrow
 *  screens — the renderer owns that breakpoint, not the payload. */
export type GroupLayout = 'row' | 'grid' | 'split';

export interface ProseBlock {
  type: 'prose';
  markdown: string;
}

export interface ChartBlock {
  type: 'chart';
  spec: ChartSpec;
}

export interface WidgetBlock {
  type: 'widget';
  widget: Widget;
}

export interface GroupBlock {
  type: 'group';
  layout: GroupLayout;
  title?: string;
  blocks: Block[];
}

export type Block = ProseBlock | ChartBlock | WidgetBlock | GroupBlock;

// ── Widgets ──────────────────────────────────────────────────────────────

/** A signed change, shown next to the value it belongs to. `direction` says
 *  which way is good — shorting and drawdown metrics invert the usual reading,
 *  and a percentage alone can't express that. */
export interface Delta {
  value: number;
  unit?: Unit;
  /** "vs last close", "24h" — a delta without a period is not a fact. */
  period?: string;
  direction?: 'up_good' | 'down_good' | 'neutral';
  /** `false` for a level rather than a move — a probability never gets "+".
   *  Omitted means signed, which is what a delta almost always is. */
  signed?: boolean;
}

/** Label, value, optional delta, optional trend. The most reusable widget in
 *  the set: most single numbers in an answer are one of these, not a chart. */
export interface StatWidget {
  kind: 'stat';
  label: string;
  value: number | string;
  unit?: Unit;
  delta?: Delta;
  /** 12ish points is the readable range for a tile-sized sparkline. */
  trend?: number[];
  /** At most one hero per message; later heroes are demoted to normal. */
  emphasis?: 'hero' | 'normal';
  caption?: string;
  /** `full`: never compact, two decimals — index levels ("23,146.15", not
   *  "23.1K"). Omitted means the tile's usual compaction. */
  format?: 'full';
  /** `false`: a percent that is a probability or hit rate, shown without "+".
   *  Omitted falls back to the label heuristic in lib/blocks/figure.ts. */
  signed?: boolean;
}

export interface TrackBand {
  from: number;
  to: number;
  role?: Role;
  label?: string;
}

export interface TrackMarker {
  at: number;
  label?: string;
  role?: Role;
  /** risk_reward reads these to derive its R multiple. */
  name?: 'entry' | 'stop' | 'target' | string;
}

/** One horizontal scale, five presentations. Bullet, dumbbell/range, gauge,
 *  level rail, risk-reward and progress meter are all bands + a span + markers
 *  on a min→max line; `variant` picks the defaults, not a different component. */
export interface TrackWidget {
  kind: 'track';
  variant: 'meter' | 'bullet' | 'range' | 'rail' | 'risk_reward';
  min: number;
  max: number;
  value?: number;
  target?: number;
  range?: [number, number];
  bands?: TrackBand[];
  markers?: TrackMarker[];
  unit?: Unit;
  label?: string;
  caption?: string;
}

export interface SparklineWidget {
  kind: 'sparkline';
  label?: string;
  values: number[];
  role?: Role;
  /** Shown beside the line — a sparkline usually needs its endpoint stated. */
  value?: number | string;
  unit?: Unit;
}

export interface PillWidget {
  kind: 'pill';
  label: string;
  role?: Role;
}

export interface ChipWidget {
  kind: 'chip';
  delta: Delta;
  label?: string;
}

/** The call, how strongly it's held, and why — in one card instead of three
 *  paragraphs. */
export interface VerdictWidget {
  kind: 'verdict';
  call: string;
  role?: Role;
  /** 0–100. Rendered as a meter, so "high conviction" stops being a word. */
  conviction?: number;
  rationale?: string;
  caption?: string;
}

export interface SplitWidget {
  kind: 'split';
  left: { title: string; role?: Role; items: string[] };
  right: { title: string; role?: Role; items: string[] };
}

export interface TimelineEvent {
  /** Epoch ms or ISO. Undated events sort last rather than being dropped. */
  ts?: number | string;
  title: string;
  detail?: string;
  role?: Role;
}

export interface TimelineWidget {
  kind: 'timeline';
  events: TimelineEvent[];
}

export interface TableColumn {
  key: string;
  label: string;
  unit?: Unit;
  /** `heat` shades the cell by its value's rank within the column; `spark`
   *  renders a number[] as a line. Both keep the table scannable without
   *  making the reader parse digits. `full` never compacts and always shows
   *  two decimals — index levels. */
  format?: 'text' | 'number' | 'heat' | 'spark' | 'full';
  align?: 'left' | 'right';
  /** `false`: a probability column ("Stop-first", "Hit rate") — no "+". */
  signed?: boolean;
}

export interface TableWidget {
  kind: 'table';
  columns: TableColumn[];
  rows: Record<string, unknown>[];
  caption?: string;
}

export interface PositionWidget {
  kind: 'position';
  symbol: string;
  size: number;
  cost_basis: number;
  price: number;
  unit?: Unit;
  caption?: string;
}

/** Order-book depth at discrete prices. Not a chart: the reader scans for size
 *  clusters at levels, which a ladder shows and a curve hides. */
export interface LadderWidget {
  kind: 'ladder';
  levels: { price: number; bid?: number; ask?: number }[];
  mid?: number;
  unit?: Unit;
}

/** `prompt` sends text as the next user message — the mechanism the follow-up
 *  chips already use. `app` invokes a registered client action ("set alert"),
 *  and renders disabled when nothing has registered that action, so an
 *  unsupported suggestion is visible rather than silently broken. */
export interface ActionItem {
  label: string;
  action: 'prompt' | 'app';
  /** prompt: the message text. app: the registered action name. */
  target: string;
  params?: Record<string, unknown>;
}

export interface ActionsWidget {
  kind: 'actions';
  items: ActionItem[];
}

export type Widget =
  | StatWidget
  | TrackWidget
  | SparklineWidget
  | PillWidget
  | ChipWidget
  | VerdictWidget
  | SplitWidget
  | TimelineWidget
  | TableWidget
  | PositionWidget
  | LadderWidget
  | ActionsWidget;

export type WidgetKind = Widget['kind'];
