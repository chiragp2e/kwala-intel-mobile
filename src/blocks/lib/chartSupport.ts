import type { ChartSpec } from '../types';

/** Every chart type the backend can send (the web app draws all of them). */
export const KNOWN_TYPES = new Set([
  'line', 'candlestick', 'bar', 'pie', 'scatter', 'boxplot', 'funnel',
  'histogram', 'waterfall', 'heatmap', 'treemap', 'calendar', 'depth', 'volume_profile', 'payoff',
]);

/** Gate for forward compatibility: only render specs we understand. */
export function isRenderable(spec: ChartSpec | null | undefined): spec is ChartSpec {
  return !!spec && spec.version === 1 && KNOWN_TYPES.has(spec.chart_type) && Array.isArray(spec.series) && spec.series.length > 0;
}
