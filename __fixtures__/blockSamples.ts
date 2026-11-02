// Worked examples of the block contract.
//
// These drive the /labs/visuals page, and they are the reference the backend
// emitter should be written against — a payload here is a payload that renders.
// Values are hand-written rather than generated so the page is byte-stable and
// usable as a visual regression baseline.

import type { Block } from '../src/blocks/types';
import type { ChartSpec } from '../src/blocks/types';

const AAPL_TREND = [292, 288, 295, 301, 298, 307, 311, 305, 309, 314, 308, 306];
const NVDA_TREND = [171, 168, 175, 182, 179, 188, 194, 201, 197, 205, 212, 209];
const MSFT_TREND = [418, 421, 415, 409, 412, 405, 398, 402, 396, 391, 388, 392];

/** One answer to "what do you make of AAPL here?", composed instead of narrated.
 *  The prose that survives is the part a widget genuinely cannot carry. */
export const SAMPLE_ANSWER: Block[] = [
  {
    type: 'widget',
    widget: {
      kind: 'verdict',
      call: 'Constructive, but not at this price',
      role: 'neutral',
      conviction: 62,
      rationale:
        'Momentum is intact and the range is holding, but price sits in the upper third of the analyst band with earnings two weeks out.',
    },
  },
  {
    type: 'group',
    layout: 'row',
    blocks: [
      {
        type: 'widget',
        widget: {
          kind: 'stat',
          label: 'Last price',
          value: 305.93,
          unit: 'usd',
          emphasis: 'hero',
          delta: { value: 1.42, unit: 'percent', period: 'today' },
          trend: AAPL_TREND,
        },
      },
      {
        type: 'widget',
        widget: {
          kind: 'stat',
          label: 'Market cap',
          value: 4_620_000_000_000,
          unit: 'usd',
          delta: { value: 1.42, unit: 'percent', period: 'today' },
        },
      },
      {
        type: 'widget',
        widget: {
          kind: 'stat',
          label: 'RSI (14)',
          value: 68,
          caption: 'Approaching overbought',
        },
      },
    ],
  },
  {
    type: 'group',
    layout: 'split',
    title: 'Where price sits',
    blocks: [
      {
        type: 'widget',
        widget: {
          kind: 'track',
          variant: 'bullet',
          label: 'Analyst target range',
          min: 260,
          max: 360,
          value: 305.93,
          target: 316,
          range: [300, 316],
          unit: 'usd',
          caption: 'Street target $316',
        },
      },
      {
        type: 'widget',
        widget: {
          kind: 'track',
          variant: 'rail',
          label: 'Key levels',
          min: 280,
          max: 330,
          value: 305.93,
          unit: 'usd',
          markers: [
            { at: 288, label: 'Support', role: 'bullish' },
            { at: 305.93, label: 'Now', role: 'neutral' },
            { at: 316, label: 'Resist', role: 'bearish' },
          ],
        },
      },
    ],
  },
  {
    type: 'widget',
    widget: {
      kind: 'split',
      left: {
        title: 'Bull case',
        role: 'bullish',
        items: [
          'Services margin still expanding',
          'Buyback pace absorbs most of the float drift',
          'Range low has held three times since March',
        ],
      },
      right: {
        title: 'Bear case',
        role: 'bearish',
        items: [
          'Hardware refresh cycle keeps slipping',
          'Multiple is a full turn above its five-year median',
          'China mix still shrinking year over year',
        ],
      },
    },
  },
  {
    type: 'widget',
    widget: {
      kind: 'track',
      variant: 'risk_reward',
      label: 'If you take the long here',
      min: 285,
      max: 335,
      unit: 'usd',
      markers: [
        { at: 296, label: 'Stop', role: 'bearish', name: 'stop' },
        { at: 306, label: 'Entry', role: 'neutral', name: 'entry' },
        { at: 326, label: 'Target', role: 'bullish', name: 'target' },
      ],
    },
  },
  {
    type: 'widget',
    widget: {
      kind: 'timeline',
      events: [
        { ts: '2026-08-28', title: 'Q4 earnings', detail: 'Consensus $2.41 EPS', role: 'info' },
        { ts: '2026-09-09', title: 'Product event', role: 'neutral' },
        { title: 'Buyback authorization review', detail: 'Timing not announced' },
      ],
    },
  },
  { type: 'prose', markdown: 'Sizing note: this assumes you are not already long the sector.' },
  {
    type: 'widget',
    widget: {
      kind: 'actions',
      items: [
        { label: 'Set alert at $316', action: 'app', target: 'set_alert', params: { price: 316 } },
        { label: 'Add to watchlist', action: 'app', target: 'add_to_watchlist' },
        { label: 'Compare with MSFT', action: 'prompt', target: 'Compare AAPL with MSFT' },
      ],
    },
  },
];

/** Every widget kind, including the ones the worked answer had no reason to use. */
export const SAMPLE_GALLERY: Block[] = [
  {
    type: 'group',
    layout: 'row',
    title: 'Signal strip — a row of stat tiles',
    blocks: [
      {
        type: 'widget',
        widget: {
          kind: 'stat',
          label: 'Fear & greed',
          value: 71,
          caption: 'Greed',
          delta: { value: 6, period: 'week' },
        },
      },
      {
        type: 'widget',
        widget: {
          kind: 'stat',
          label: '24h volume',
          value: 88_400_000_000,
          unit: 'usd',
          delta: { value: -12.4, unit: 'percent', period: '24h' },
        },
      },
      {
        type: 'widget',
        widget: {
          kind: 'stat',
          label: 'Max drawdown',
          value: -18.2,
          unit: 'percent',
          // Down is good here: a shrinking drawdown is the improvement.
          delta: { value: -3.1, unit: 'percent', period: 'month', direction: 'down_good' },
        },
      },
    ],
  },
  {
    type: 'group',
    layout: 'row',
    title: 'Status and deltas',
    blocks: [
      { type: 'widget', widget: { kind: 'pill', label: 'Overbought', role: 'warning' } },
      { type: 'widget', widget: { kind: 'pill', label: 'Uptrend intact', role: 'bullish' } },
      { type: 'widget', widget: { kind: 'pill', label: 'Below 200DMA', role: 'bearish' } },
      {
        type: 'widget',
        widget: { kind: 'chip', label: 'vs sector', delta: { value: 4.2, unit: 'percent' } },
      },
    ],
  },
  {
    type: 'group',
    layout: 'grid',
    title: 'Track — one primitive, five variants',
    blocks: [
      {
        type: 'widget',
        widget: {
          kind: 'track',
          variant: 'meter',
          label: 'RSI (14)',
          min: 0,
          max: 100,
          value: 68,
          bands: [
            { from: 0, to: 30, role: 'bullish', label: 'Oversold' },
            { from: 30, to: 70, role: 'neutral' },
            { from: 70, to: 100, role: 'bearish', label: 'Overbought' },
          ],
        },
      },
      {
        type: 'widget',
        widget: {
          kind: 'track',
          variant: 'meter',
          label: '% of 52-week range',
          min: 0,
          max: 100,
          value: 82,
        },
      },
      {
        type: 'widget',
        widget: {
          kind: 'track',
          variant: 'range',
          label: 'Analyst targets',
          min: 240,
          max: 400,
          value: 305.93,
          range: [286, 352],
          unit: 'usd',
          caption: '34 analysts',
        },
      },
      {
        type: 'widget',
        widget: {
          kind: 'track',
          variant: 'bullet',
          label: 'Revenue vs guidance',
          min: 0,
          max: 120,
          value: 97,
          target: 100,
          bands: [
            { from: 0, to: 80, role: 'bearish' },
            { from: 80, to: 100, role: 'warning' },
            { from: 100, to: 120, role: 'bullish' },
          ],
        },
      },
    ],
  },
  {
    type: 'group',
    layout: 'grid',
    title: 'Small multiples — a grid of sparklines',
    blocks: [
      {
        type: 'widget',
        widget: { kind: 'sparkline', label: 'AAPL', values: AAPL_TREND, value: 305.93, unit: 'usd', role: 'bullish' },
      },
      {
        type: 'widget',
        widget: { kind: 'sparkline', label: 'NVDA', values: NVDA_TREND, value: 209.4, unit: 'usd', role: 'bullish' },
      },
      {
        type: 'widget',
        widget: { kind: 'sparkline', label: 'MSFT', values: MSFT_TREND, value: 392.1, unit: 'usd', role: 'bearish' },
      },
    ],
  },
  {
    type: 'widget',
    widget: {
      kind: 'table',
      caption: 'Heat is per column — each is ranked against its own extremes.',
      columns: [
        { key: 'sym', label: 'Symbol', format: 'text' },
        { key: 'price', label: 'Price', unit: 'usd' },
        { key: 'chg', label: '1D', unit: 'percent', format: 'heat' },
        { key: 'chg30', label: '30D', unit: 'percent', format: 'heat' },
        { key: 'cap', label: 'Mkt cap', unit: 'usd' },
        { key: 'trend', label: 'Trend', format: 'spark' },
      ],
      rows: [
        { sym: 'AAPL', price: 305.93, chg: 1.42, chg30: 6.1, cap: 4_620_000_000_000, trend: AAPL_TREND },
        { sym: 'NVDA', price: 209.4, chg: 3.86, chg30: 22.4, cap: 5_140_000_000_000, trend: NVDA_TREND },
        { sym: 'MSFT', price: 392.1, chg: -0.94, chg30: -6.2, cap: 2_910_000_000_000, trend: MSFT_TREND },
      ],
    },
  },
  {
    type: 'widget',
    widget: {
      kind: 'position',
      symbol: 'AAPL',
      size: 120,
      cost_basis: 271.4,
      price: 305.93,
      caption: 'Opened 14 Mar 2026',
    },
  },
  {
    type: 'widget',
    widget: {
      kind: 'ladder',
      mid: 305.9,
      levels: [
        { price: 306.2, ask: 1840 },
        { price: 306.1, ask: 920 },
        { price: 306.0, ask: 2610 },
        { price: 305.9, bid: 3120, ask: 480 },
        { price: 305.8, bid: 1450 },
        { price: 305.7, bid: 2980 },
        { price: 305.6, bid: 760 },
      ],
    },
  },
];

// ── Charts ───────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const START = Date.parse('2026-06-01T00:00:00Z');

/** Deterministic wobble. Not randomness — the page doubles as a visual
 *  regression baseline, so every run has to draw the identical curve. */
const wobble = (i: number, amp: number) =>
  Math.sin(i * 0.7) * amp + Math.sin(i * 0.23) * amp * 0.6;

const priceSeries = Array.from({ length: 40 }, (_, i) => [
  START + i * DAY,
  Math.round((300 + i * 0.45 + wobble(i, 6)) * 100) / 100,
]) as [number, number][];

const chart = (spec: ChartSpec): Block => ({ type: 'chart', spec });

export const SAMPLE_CHARTS: Block[] = [
  {
    type: 'group',
    layout: 'row',
    title: 'Annotation layer — zones, levels, points and callouts on one chart',
    blocks: [
      chart({
        version: 1,
        chart_type: 'line',
        title: 'AAPL with the analysis drawn on it',
        y_axis: { unit: 'usd' },
        series: [{ name: 'AAPL', type: 'line', data: priceSeries }],
        overlays: [
          { kind: 'zone', y_from: 300, y_to: 316, role: 'info', name: 'Analyst band' },
          { kind: 'level', y: 288, role: 'bullish', name: 'Support', style: 'dashed' },
          { kind: 'level', y: 320, role: 'bearish', name: 'Resistance', style: 'dashed' },
          { kind: 'vline', ts: START + 22 * DAY, role: 'neutral', name: 'Earnings' },
          { kind: 'point', ts: START + 12 * DAY, y: priceSeries[12][1], role: 'bullish', name: 'Breakout' },
          {
            kind: 'callout',
            ts: START + 31 * DAY,
            y: priceSeries[31][1],
            role: 'bearish',
            text: 'Volume dried up',
          },
        ],
      }),
    ],
  },
  {
    type: 'group',
    layout: 'row',
    title: 'Distribution and attribution',
    blocks: [
      chart({
        version: 1,
        chart_type: 'histogram',
        title: 'Daily return distribution',
        y_axis: { unit: 'number' },
        series: [
          {
            name: 'days',
            type: 'histogram',
            data: [
              [-5, 2], [-4, 4], [-3, 9], [-2, 18], [-1, 31],
              [0, 44], [1, 34], [2, 21], [3, 11], [4, 5], [5, 2],
            ],
          },
        ],
      }),
      chart({
        version: 1,
        chart_type: 'waterfall',
        title: 'Revenue bridge by segment',
        y_axis: { unit: 'usd' },
        series: [
          {
            name: 'bridge',
            type: 'waterfall',
            data: [
              { name: 'FY25', value: 383_000 },
              { name: 'iPhone', value: 12_400 },
              { name: 'Services', value: 21_800 },
              { name: 'Wearables', value: -6_200 },
              { name: 'Mac', value: -3_100 },
              { name: 'FY26', total: true },
            ],
          },
        ],
      }),
    ],
  },
  {
    type: 'group',
    layout: 'row',
    title: 'Grids — sector map and correlation',
    blocks: [
      chart({
        version: 1,
        chart_type: 'treemap',
        title: 'Market map by weight',
        y_axis: { unit: 'usd' },
        series: [
          {
            name: 'map',
            type: 'treemap',
            data: [
              { name: 'Tech', value: 3400 },
              { name: 'Financials', value: 1580 },
              { name: 'Healthcare', value: 1320 },
              { name: 'Energy', value: 780 },
              { name: 'Industrials', value: 690 },
              { name: 'Staples', value: 520 },
              { name: 'Utilities', value: 310 },
            ],
          },
        ],
      }),
      chart({
        version: 1,
        chart_type: 'heatmap',
        title: 'Sector performance by week',
        y_axis: { unit: 'percent', categories: ['Tech', 'Fins', 'Health', 'Energy'] },
        x_axis: { categories: ['W1', 'W2', 'W3', 'W4', 'W5'] },
        series: [
          {
            name: 'perf',
            type: 'heatmap',
            data: [
              [0, 0, 2.1], [1, 0, 3.4], [2, 0, -1.2], [3, 0, 4.8], [4, 0, 1.9],
              [0, 1, 0.6], [1, 1, 1.1], [2, 1, 2.2], [3, 1, -0.4], [4, 1, 0.9],
              [0, 2, -1.8], [1, 2, 0.3], [2, 2, 1.4], [3, 2, 2.0], [4, 2, -0.7],
              [0, 3, 5.2], [1, 3, -2.6], [2, 3, 3.1], [3, 3, 0.8], [4, 3, 2.4],
            ],
          },
        ],
      }),
    ],
  },
  chart({
    version: 1,
    chart_type: 'calendar',
    title: 'Daily returns',
    y_axis: { unit: 'percent' },
    series: [
      {
        name: 'returns',
        type: 'calendar',
        data: Array.from({ length: 90 }, (_, i) => [
          new Date(START + i * DAY).toISOString().slice(0, 10),
          Math.round(wobble(i, 2.4) * 100) / 100,
        ]),
      },
    ],
  }),
  {
    type: 'group',
    layout: 'row',
    title: 'Trading-native',
    blocks: [
      chart({
        version: 1,
        chart_type: 'depth',
        title: 'Order book depth',
        y_axis: { unit: 'number' },
        series: [
          {
            name: 'Bids',
            type: 'line',
            data: [[305.9, 3120], [305.8, 4570], [305.7, 7550], [305.6, 8310], [305.4, 9900]],
          },
          {
            name: 'Asks',
            type: 'line',
            data: [[306.0, 2610], [306.1, 3530], [306.2, 5370], [306.4, 6800], [306.6, 8420]],
          },
        ],
      }),
      chart({
        version: 1,
        chart_type: 'volume_profile',
        title: 'Volume at price',
        y_axis: { unit: 'usd' },
        series: [
          {
            name: 'volume',
            type: 'volume_profile',
            data: [
              [303.0, 1_240_000], [304.0, 2_180_000], [305.0, 4_900_000],
              [306.0, 3_150_000], [307.0, 1_720_000], [308.0, 880_000],
            ],
          },
        ],
      }),
    ],
  },
  chart({
    version: 1,
    chart_type: 'payoff',
    title: 'Long call spread at expiry — $300/$320',
    y_axis: { unit: 'usd' },
    series: [
      {
        name: 'P&L',
        type: 'payoff',
        data: [
          [280, -620], [300, -620], [306.2, 0], [310, 380], [320, 1380], [340, 1380],
        ],
      },
    ],
  }),
];

/** A message in the shape the backend still sends today: markdown plus a
 *  chart list, with no blocks at all. Rendering this through the same
 *  normalize → BlockList path is the check that the migration did not change
 *  what an existing answer looks like — charts first, then the prose. */
export const SAMPLE_LEGACY_MESSAGE = {
  content:
    "AAPL is holding its range. The 50-day is still above the 200-day, and the last three tests of $288 have held.\n\n- **Support** sits at $288\n- **Resistance** is $316\n\nEarnings on 28 Aug is the next real catalyst.",
  charts: [
    {
      version: 1,
      chart_type: 'line',
      title: 'AAPL, 40 sessions',
      y_axis: { unit: 'usd' },
      series: [{ name: 'AAPL', type: 'line', data: priceSeries }],
    },
  ] as ChartSpec[],
};

// ── Stress ───────────────────────────────────────────────────────────────

/** Payloads taken from real answers, kept because they broke the layout: a
 *  four-tile row whose hero value is wider than its tile, and a rail with six
 *  long labels on a narrow card. Anything that renders these cleanly at every
 *  width renders the ordinary cases too. */
export const SAMPLE_STRESS: Block[] = [
  {
    type: 'widget',
    widget: {
      kind: 'verdict',
      call: "Hold — don't chase the bounce, buy the washout",
      role: 'neutral',
      conviction: 62,
      rationale:
        'Beat on earnings but -11% off highs and stuck below the 50d MA — elite fundamentals, soft tape',
    },
  },
  {
    type: 'group',
    layout: 'row',
    blocks: [
      {
        type: 'widget',
        widget: {
          kind: 'stat',
          label: 'AAPL (NASDAQ)',
          value: 305.93,
          unit: 'usd',
          emphasis: 'hero',
          delta: { value: 0.22, unit: 'percent', period: 'today' },
          caption: '52w $223.78 – $344.57',
        },
      },
      {
        type: 'widget',
        widget: { kind: 'stat', label: 'RSI (14)', value: 43.67, caption: 'neutral, not oversold' },
      },
      {
        type: 'widget',
        widget: {
          kind: 'stat',
          label: 'Trailing P/E',
          value: 35.08,
          caption: 'Forward P/E 32.18 · PEG 1.20',
        },
      },
      {
        type: 'widget',
        widget: {
          kind: 'stat',
          label: 'Market Cap',
          value: 4_500_000_000_000,
          unit: 'usd',
          caption: '$4.46T · Beta 1.09',
        },
      },
    ],
  },
  {
    type: 'group',
    layout: 'split',
    blocks: [
      {
        type: 'widget',
        widget: {
          kind: 'track',
          variant: 'range',
          label: 'Analyst Target Band',
          min: 215,
          max: 400,
          value: 305.93,
          range: [290, 340],
          unit: 'usd',
        },
      },
      {
        type: 'widget',
        widget: {
          kind: 'track',
          variant: 'rail',
          label: 'Price Map',
          min: 280,
          max: 344.57,
          value: 305.93,
          unit: 'usd',
          markers: [
            { at: 280.48, label: '200D MA', role: 'bullish' },
            { at: 300.0, label: 'Support', role: 'bullish' },
            { at: 305.93, label: 'Now', role: 'neutral' },
            { at: 309.19, label: '50D MA', role: 'bearish' },
            { at: 316.85, label: 'Resistance', role: 'bearish' },
            { at: 344.57, label: '52w high', role: 'bearish' },
          ],
        },
      },
    ],
  },
  {
    type: 'widget',
    widget: {
      kind: 'stat',
      label: 'A very long label that has no business being this long at all',
      value: '$1,284,004.55',
      emphasis: 'hero',
      caption: 'Strings are passed through unformatted, so they can be any width',
    },
  },
];
