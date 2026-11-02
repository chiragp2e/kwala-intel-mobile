/**
 * The visible slice of a time-series chart, as fractions of the full x-range
 * (0 = first point, 1 = last). Pure functions, so the gesture code and the
 * buttons share one set of rules and the maths can be tested without a screen.
 */
export interface Win {
  a: number;
  b: number;
}

export const FULL: Win = { a: 0, b: 1 };

const EPS = 1e-4;

export const isFull = (w: Win): boolean => w.b - w.a >= 1 - EPS;

/** Keeps the window inside [0, 1] and no narrower than `minSpan`, shifting rather than shrinking at an edge. */
export function clampWin(a: number, b: number, minSpan: number): Win {
  const span = Math.min(1, Math.max(minSpan, b - a));
  const start = Math.min(1 - span, Math.max(0, a));
  return { a: start, b: start + span };
}

/** Zooms by `factor` (below 1 zooms in) keeping the point under `anchor` (0..1 across the window) still. */
export function zoomAround(win: Win, factor: number, anchor: number, minSpan: number): Win {
  const span = win.b - win.a;
  const next = Math.min(1, Math.max(minSpan, span * factor));
  const under = win.a + anchor * span;
  return clampWin(under - anchor * next, under - anchor * next + next, minSpan);
}

/**
 * A two-finger gesture: `scale` is how far the fingers have spread since the
 * start (above 1 zooms in). The data point that was under the fingers' centre
 * (`startAnchor`) follows them to `anchor`, so pinching also pans.
 */
export function pinchWin(start: Win, startAnchor: number, scale: number, anchor: number, minSpan: number): Win {
  const span = start.b - start.a;
  const next = Math.min(1, Math.max(minSpan, span / Math.max(scale, 0.05)));
  const under = start.a + startAnchor * span;
  return clampWin(under - anchor * next, under - anchor * next + next, minSpan);
}

/** Index of the value in ascending `xs` nearest to `t`. */
export function nearestIndex(xs: number[], t: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= t) lo = mid;
    else hi = mid;
  }
  return Math.abs(xs[lo] - t) <= Math.abs(xs[hi] - t) ? lo : hi;
}

/**
 * The inclusive index range of ascending `xs` that covers [from, to], plus one
 * neighbour either side so a line still runs to the edge of the plot.
 */
export function visibleRange(xs: number[], from: number, to: number): [number, number] {
  let first = 0;
  let last = xs.length - 1;
  while (first < xs.length - 1 && xs[first + 1] <= from) first++;
  while (last > 0 && xs[last - 1] >= to) last--;
  return [first, Math.max(first, last)];
}
