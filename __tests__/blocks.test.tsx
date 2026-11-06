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

// ── Touch: every chart type answers a touch with a tooltip, as hovering does on the web ──
import { Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { sliceAt } from '../src/blocks/charts/ChartView';
import { unitFormatter } from '../src/blocks/lib/format';
import { MessageItem } from '../src/components/MessageItem';
import type { Block } from '../src/blocks/types';

function touchAt(x: number, y: number) {
  const point = { touchActive: true, startPageX: x, startPageY: y, startTimeStamp: 1, currentPageX: x, currentPageY: y, currentTimeStamp: 1, previousPageX: x, previousPageY: y, previousTimeStamp: 1 };
  return {
    nativeEvent: { pageX: x, pageY: y, touches: [{ pageX: x, pageY: y }], changedTouches: [], timestamp: 1 },
    touchHistory: { numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: 1, touchBank: [point] },
  };
}

const textOf = (n: TestRenderer.ReactTestInstance) =>
  n.findAllByType(Text).map(t => ([] as unknown[]).concat(t.props.children).join('')).join(' | ');

/** Draws `spec` 340 wide with the chart at the window's origin, touches it at (x, y), and returns the tooltip's text. */
function tipFor(spec: ChartSpec, x: number, y: number): string | null {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(<ChartView spec={spec} />, {
      createNodeMock: () => ({ measureInWindow: (cb: (x: number, y: number) => void) => cb(0, 0) }),
    });
  });
  act(() => {
    for (const i of r.root.findAll(n => typeof n.props.onLayout === 'function')) {
      i.props.onLayout({ nativeEvent: { layout: { width: 340, height: 230 } } });
    }
  });
  expect(r.root.findAll(n => n.props.testID === 'chart-tip')).toHaveLength(0);
  // The chart sits at the window's origin (RN's jest View mock never answers measureInWindow).
  for (const n of r.root.findAll(m => typeof (m.instance as { measureInWindow?: unknown } | null)?.measureInWindow === 'function')) {
    (n.instance as { measureInWindow: unknown }).measureInWindow = (cb: (x: number, y: number) => void) => cb(0, 0);
  }
  const area = r.root.findAll(n => typeof n.props.onResponderGrant === 'function' && typeof n.props.onLayout === 'function')[0];
  act(() => area.props.onResponderGrant(touchAt(x, y)));
  const tip = r.root.findAll(n => n.props.testID === 'chart-tip')[0];
  const text = tip ? textOf(tip) : null;
  act(() => r.unmount());
  return text;
}

/** The middle of category `i` of `n`, with the chart's 46px left and 12px right padding. */
const catX = (i: number, n: number) => 46 + ((340 - 58) / n) * (i + 0.5);

describe('chart touch', () => {
  it('bar: every series at the touched category, as the web does', () => {
    const fmt = unitFormatter('inr');
    expect(tipFor(specs.bar, catX(1, 4), 100)).toBe(`IT | Buy | ${fmt(80)} | Sell | ${fmt(100)}`);
  });

  it('histogram: the bucket and its count', () => {
    const spec: ChartSpec = { version: 1, chart_type: 'histogram', series: [{ name: 'Days', type: 'histogram', data: [[-1, 3], [0, 5], [1, 2]] }] };
    expect(tipFor(spec, catX(1, 3), 100)).toBe('0 | Days | 5');
  });

  it("waterfall: the step's change and the running total; a total bar, the total", () => {
    const spec: ChartSpec = {
      version: 1,
      chart_type: 'waterfall',
      y_axis: { unit: 'number' },
      series: [{ name: 'P&L', type: 'waterfall', data: [{ name: 'Start', value: 100 }, { name: 'Costs', value: -30 }, { name: 'End', total: true }] as never }],
    };
    const fmt = unitFormatter('number');
    expect(tipFor(spec, catX(1, 3), 100)).toBe(`Costs | Change | ${fmt(-30)} | Total | ${fmt(70)}`);
    expect(tipFor(spec, catX(2, 3), 100)).toBe(`End | Total | ${fmt(70)}`);
  });

  it('boxplot: the five numbers, top down', () => {
    expect(tipFor(specs.boxplot, catX(1, 2), 100)).toMatch(/^Feb \| Max \| .+ \| Q3 \| .+ \| Median \| .+ \| Q1 \| .+ \| Min \| /);
  });

  it('scatter: the dot nearest the finger, by name and series', () => {
    // Dots run left to right A, B, C; the middle of the plot is closest to B.
    expect(tipFor(specs.scatter, 160, 60)).toMatch(/^B · Peers \| X \| 14 \| Y \| /);
  });

  it('pie: the slice under the finger, with its share; nothing off the ring', () => {
    // The ring is centred at (170, 92); 60px straight up is the first slice.
    expect(tipFor(specs.pie, 170, 32)).toMatch(/^Banks \| 40\.0% \| /);
    expect(tipFor(specs.pie, 170, 92)).toBeNull();
  });

  it('funnel: the touched stage, and how much of the first stage is left', () => {
    expect(tipFor(specs.funnel, 170, 40)).toBe('Tried | Stages | 60 | Of the first stage | 60.0%');
  });

  it('line and candlestick still show the date under the finger', () => {
    expect(tipFor(specs.candlestick, 170, 100)).toMatch(/2026 \| Open \| /);
  });

  it('finds the slice clockwise from 12 o\'clock', () => {
    const quarters = [1, 1, 1, 1];
    expect(sliceAt(0.01, -1, quarters)).toBe(0);
    expect(sliceAt(1, 0.01, quarters)).toBe(1);
    expect(sliceAt(-0.01, 1, quarters)).toBe(2);
    expect(sliceAt(-1, -0.01, quarters)).toBe(3);
  });
});

describe('research this further', () => {
  const blocks: Block[] = [
    { type: 'prose', markdown: 'Flows turned.' },
    { type: 'chart', spec: specs.bar },
    { type: 'widget', widget: { kind: 'pill', label: 'Live' } as never },
  ];
  const buttons = (r: TestRenderer.ReactTestRenderer) =>
    r.root.findAll(n => n.props.accessibilityLabel === 'Research this further' && typeof n.props.onPress === 'function');

  it('puts the button on each subject block, and sends the block back in words', () => {
    const onPrompt = jest.fn();
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<BlockList blocks={blocks} onPrompt={onPrompt} />);
    });
    // Prose and the chart; not the inline pill.
    const found = buttons(r).filter((n, i, all) => all.findIndex(m => m.props.onPress === n.props.onPress) === i);
    expect(found).toHaveLength(2);
    act(() => found[1].props.onPress());
    expect(onPrompt).toHaveBeenCalledWith('Research this further — the chart "Sector flows"');
    act(() => r.unmount());
  });

  it('has no button where there is nowhere to send it', () => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<BlockList blocks={blocks} />);
    });
    expect(buttons(r)).toHaveLength(0);
    act(() => r.unmount());
  });
});

describe('long press to copy', () => {
  beforeEach(() => (Clipboard.setStringAsync as jest.Mock).mockClear());
  const longPressable = (r: TestRenderer.ReactTestRenderer) => r.root.findAll(n => typeof n.props.onLongPress === 'function')[0];

  it('copies your own message whole, instead of the text selection menu', async () => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<MessageItem message={{ id: 'u1', role: 'user', content: 'Is NIFTY overbought?', status: 'sent' } as never} statusText={null} onRetry={() => {}} />);
    });
    expect(r.root.findAll(n => n.props.selectable === true)).toHaveLength(0);
    await act(async () => longPressable(r).props.onLongPress());
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('Is NIFTY overbought?');
    expect(JSON.stringify(r.toJSON())).toContain('Copied');
    act(() => r.unmount());
  });

  it('copies an answer as the copy button does', async () => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<MessageItem message={{ id: 'a1', role: 'assistant', content: 'RSI is **78**.', status: 'sent' } as never} statusText={null} onRetry={() => {}} />);
    });
    await act(async () => longPressable(r).props.onLongPress());
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('RSI is **78**.');
    act(() => r.unmount());
  });
});
