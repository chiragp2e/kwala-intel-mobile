import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { BlockList } from '../src/blocks/BlockList';
import { normalizeBlocks } from '../src/blocks/lib/normalize';
import { compact, formatValue } from '../src/blocks/lib/format';
import { SAMPLE_ANSWER, SAMPLE_CHARTS, SAMPLE_GALLERY, SAMPLE_STRESS } from '../__fixtures__/blockSamples';

// The web app's own worked examples of the block contract: every one has to
// render here without throwing, including the stress set built from awkward data.
describe.each([
  ['answer', SAMPLE_ANSWER],
  ['gallery', SAMPLE_GALLERY],
  ['charts', SAMPLE_CHARTS],
  ['stress', SAMPLE_STRESS],
])('block samples: %s', (_name, blocks) => {
  it('normalises and renders', () => {
    const clean = normalizeBlocks({ blocks });
    expect(clean.length).toBeGreaterThan(0);
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<BlockList blocks={clean} onPrompt={() => {}} />);
    });
    // Charts and sparklines draw only once they know their width; give them one.
    act(() => {
      for (const inst of r.root.findAll(n => typeof n.props.onLayout === 'function')) {
        inst.props.onLayout({ nativeEvent: { layout: { width: 340, height: 200 } } });
      }
    });
    expect(r.toJSON()).not.toBeNull();
    act(() => r.unmount());
  });
});

describe('figures match the web app', () => {
  it('groups rupees in lakhs and compacts to crore', () => {
    expect(formatValue(1234567.89, 'inr')).toBe('₹12,34,567.89');
    expect(compact(42_000_000, 'inr')).toBe('₹4.2cr');
  });
  it('signs percent changes', () => {
    expect(formatValue(2.4, 'percent')).toBe('+2.4%');
    expect(formatValue(-3.2, 'percent')).toBe('-3.2%');
  });
});

// The chart types the web samples do not cover. Each must actually draw (an SVG),
// not fall back to the "drawn on the web app" note, which is also what a thrown
// error turns into.
import { ChartView } from '../src/blocks/charts/ChartView';
import type { ChartSpec } from '../src/blocks/types';

const t0 = Date.parse('2026-10-01T00:00:00Z');
const day = 86400000;
const specs: Record<string, ChartSpec> = {
  bar: {
    version: 1,
    chart_type: 'bar',
    title: 'Sector flows',
    x_axis: { categories: ['Banks', 'IT', 'Energy', 'Metals'] },
    y_axis: { unit: 'inr' },
    series: [
      { name: 'Buy', type: 'bar', data: [120, 80, -30, 45] },
      { name: 'Sell', type: 'bar', data: [90, 100, 20, 10] },
    ],
  },
  candlestick: {
    version: 1,
    chart_type: 'candlestick',
    y_axis: { unit: 'usd' },
    series: [{ name: 'AAPL', type: 'candlestick', data: Array.from({ length: 30 }, (_, i) => [t0 + i * day, 100 + i, 106 + i, 98 + i, 103 + i * 0.9]) }],
    overlays: [
      { kind: 'level', y: 115, name: 'Resistance', role: 'bearish' },
      { kind: 'zone', y_from: 105, y_to: 110, role: 'bullish' },
      { kind: 'point', ts: t0 + 10 * day, y: 112, name: 'Breakout', role: 'info' },
    ],
  },
  pie: {
    version: 1,
    chart_type: 'pie',
    y_axis: { unit: 'percent' },
    series: [{ name: 'Mix', type: 'pie', data: [{ name: 'Banks', value: 40 }, { name: 'IT', value: 25 }, { name: 'Energy', value: 35 }] }],
  },
  scatter: {
    version: 1,
    chart_type: 'scatter',
    series: [{ name: 'Peers', type: 'scatter', data: [[10, 5, 30, 'A'], [14, 7, 10, 'B'], [22, 3, 50, 'C']] }],
  },
  funnel: {
    version: 1,
    chart_type: 'funnel',
    series: [{ name: 'Stages', type: 'funnel', data: [{ name: 'Seen', value: 100 }, { name: 'Tried', value: 60 }, { name: 'Paid', value: 20 }] }],
  },
  boxplot: {
    version: 1,
    chart_type: 'boxplot',
    x_axis: { categories: ['Jan', 'Feb'] },
    series: [{ name: 'Returns', type: 'boxplot', data: [[-4, -1, 1, 3, 6], [-3, 0, 2, 4, 8]] }],
  },
};

describe.each(Object.entries(specs))('chart type %s', (type, spec) => {
  it('draws an svg, not the fallback', () => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<ChartView spec={spec} />);
    });
    act(() => {
      for (const i of r.root.findAll(n => typeof n.props.onLayout === 'function')) {
        i.props.onLayout({ nativeEvent: { layout: { width: 340, height: 200 } } });
      }
    });
    const json = JSON.stringify(r.toJSON());
    expect(json).not.toContain('drawn on the web app');
    // The funnel is stacked bars in plain Views; every other type is an SVG.
    expect(json).toContain(type === 'funnel' ? 'Paid' : 'RNSVGSvgView');
    expect(type).toBe(spec.chart_type);
  });
});
