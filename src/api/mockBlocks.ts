/**
 * DEVELOPMENT ONLY, for the mock backend: one of every chart type the app draws, plus a row of tiles and some
 * prose, so charts can be checked on a device without an account. Ask the mock anything containing "chart".
 * Made-up numbers; not a statement about what the real service returns.
 */
const DAY = 86400000;
const t0 = Date.UTC(2026, 9, 1);
const wave = (i: number, base: number, amp: number) => Math.round((base + amp * Math.sin(i / 3) + i * amp * 0.08) * 100) / 100;

const strikes = Array.from({ length: 21 }, (_, i) => 24550 + i * 50);
const callOi = [0.8, 2.6, 1.2, 2.9, 1.5, 4.3, 1.4, 3.9, 1.9, 11.2, 2.2, 4.6, 0.9, 5.8, 2.3, 5.7, 1.1, 5.0, 1.4, 10.1, 1.3].map(m => m * 1e6);
const putOi = [3.3, 6.7, 3.0, 6.3, 4.0, 5.2, 2.2, 3.5, 1.8, 4.9, 0.6, 1.0, 0.2, 0.3, 0.1, 0.2, 0.05, 0.1, 0.03, 0.4, 0.02].map(m => m * 1e6);

const chart = (spec: Record<string, unknown>) => ({ type: 'chart', spec: { version: 1, ...spec } });

export function mockChartGallery(): Record<string, unknown>[] {
  return [
    { type: 'prose', markdown: 'A **development** gallery: every chart type, each with its own tooltip. Touch and drag across a chart to read it.' },
    {
      type: 'group',
      layout: 'row',
      blocks: [
        { type: 'widget', widget: { kind: 'stat', label: 'Room to the call wall', value: 3.87, unit: 'percent' } },
        { type: 'widget', widget: { kind: 'stat', label: 'Room to the put wall', value: 4.12, unit: 'percent' } },
      ],
    },
    chart({
      chart_type: 'bar',
      title: 'NIFTY open interest by strike (09 Nov), spot 25,030.35',
      x_axis: { categories: strikes.map(s => s.toFixed(2)) },
      y_axis: { unit: 'number' },
      series: [
        { name: 'Call OI', type: 'bar', data: callOi },
        { name: 'Put OI', type: 'bar', data: putOi },
      ],
    }),
    chart({
      chart_type: 'line',
      title: 'BTC and ETH, last 30 days (indexed)',
      x_axis: { type: 'time' },
      y_axis: { unit: 'number' },
      series: [
        { name: 'BTC', type: 'line', data: Array.from({ length: 30 }, (_, i) => [t0 + i * DAY, wave(i, 100, 6)]) },
        { name: 'ETH', type: 'line', data: Array.from({ length: 30 }, (_, i) => [t0 + i * DAY, wave(i + 4, 98, 9)]) },
      ],
      overlays: [{ kind: 'level', y: 105, name: 'Resistance', role: 'bearish' }],
    }),
    chart({
      chart_type: 'candlestick',
      title: 'RELIANCE daily candles',
      y_axis: { unit: 'inr' },
      series: [
        {
          name: 'RELIANCE',
          type: 'candlestick',
          data: Array.from({ length: 24 }, (_, i) => {
            const o = wave(i, 2900, 40);
            const c = wave(i + 1, 2900, 40);
            return [t0 + i * DAY, o, Math.max(o, c) + 18, Math.min(o, c) - 15, c];
          }),
        },
      ],
    }),
    chart({
      chart_type: 'histogram',
      title: 'Distribution of daily returns, 1 year',
      series: [{ name: 'Days', type: 'histogram', data: [-3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3].map((r, i) => [r, [2, 4, 9, 16, 28, 41, 47, 39, 27, 17, 10, 5, 2][i]]) }],
    }),
    chart({
      chart_type: 'waterfall',
      title: 'Quarterly profit bridge (₹ cr)',
      y_axis: { unit: 'number' },
      series: [
        {
          name: 'Profit',
          type: 'waterfall',
          data: [
            { name: 'Q1 profit', value: 1200 },
            { name: 'Revenue', value: 420 },
            { name: 'Costs', value: -260 },
            { name: 'Tax', value: -110 },
            { name: 'Other', value: 35 },
            { name: 'Q2 profit', total: true },
          ],
        },
      ],
    }),
    chart({
      chart_type: 'scatter',
      title: 'Risk against return, large caps',
      x_axis: { label: 'Volatility' },
      y_axis: { unit: 'percent', label: 'Return' },
      series: [
        { name: 'Banks', type: 'scatter', data: [[18, 12.5, 40, 'HDFCBANK'], [22, 9.1, 25, 'ICICIBANK'], [26, 4.2, 12, 'AXISBANK']] },
        { name: 'IT', type: 'scatter', data: [[20, 15.2, 35, 'TCS'], [24, 11.8, 20, 'INFY'], [30, -2.4, 8, 'WIPRO']] },
      ],
    }),
    chart({
      chart_type: 'boxplot',
      title: 'Monthly return spread by sector',
      x_axis: { categories: ['Banks', 'IT', 'Pharma', 'Auto', 'FMCG'] },
      y_axis: { unit: 'percent' },
      series: [{ name: 'Returns', type: 'boxplot', data: [[-6, -2, 1, 3.5, 8], [-8, -3, 0.5, 4, 9], [-4, -1, 1.5, 2.8, 6], [-9, -4, -0.5, 2, 7], [-3, -0.5, 0.8, 1.9, 4]] }],
    }),
    chart({
      chart_type: 'pie',
      title: 'Portfolio by asset',
      y_axis: { unit: 'inr' },
      series: [
        {
          name: 'Holdings',
          type: 'pie',
          data: [
            { name: 'Equity', value: 520000 },
            { name: 'Crypto', value: 180000 },
            { name: 'Gold', value: 90000 },
            { name: 'Cash', value: 60000 },
          ],
        },
      ],
    }),
    chart({
      chart_type: 'funnel',
      title: 'Signals to trades this month',
      series: [
        {
          name: 'Signals',
          type: 'funnel',
          data: [
            { name: 'Signals seen', value: 1240 },
            { name: 'Passed filters', value: 410 },
            { name: 'Alerts sent', value: 160 },
            { name: 'Trades taken', value: 38 },
          ],
        },
      ],
    }),
    { type: 'prose', markdown: 'Each card has a microscope button in its corner: it asks to **research this further**.' },
  ];
}
