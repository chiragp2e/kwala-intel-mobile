import { FULL, clampWin, isFull, nearestIndex, pinchWin, visibleRange, zoomAround } from '../src/blocks/charts/zoom';

describe('chart zoom window', () => {
  it('zooms in around the anchor and keeps the point under it still', () => {
    const w = zoomAround(FULL, 0.5, 0.25, 0.05);
    expect(w.b - w.a).toBeCloseTo(0.5);
    // the point 25% across the old window (0.25) is still 25% across the new one
    expect(w.a + 0.25 * (w.b - w.a)).toBeCloseTo(0.25);
  });

  it('never goes past the data or below the minimum span', () => {
    expect(zoomAround(FULL, 2, 0.5, 0.05)).toEqual(FULL);
    const tight = zoomAround({ a: 0.4, b: 0.45 }, 0.1, 0.5, 0.05);
    expect(tight.b - tight.a).toBeCloseTo(0.05);
    expect(clampWin(-0.2, 0.3, 0.05)).toEqual({ a: 0, b: 0.5 });
    const right = clampWin(0.8, 1.4, 0.05);
    expect(right.b).toBeCloseTo(1);
    expect(right.b - right.a).toBeCloseTo(0.6);
  });

  it('pinch zooms by the spread and follows the fingers when they move', () => {
    const zoomed = pinchWin(FULL, 0.5, 2, 0.5, 0.05);
    expect(zoomed.a).toBeCloseTo(0.25);
    expect(zoomed.b).toBeCloseTo(0.75);
    // same spread, fingers dragged right: the data moves with them, so the window moves left
    const panned = pinchWin({ a: 0.25, b: 0.75 }, 0.5, 1, 0.7, 0.05);
    expect(panned.a).toBeCloseTo(0.15);
    expect(panned.b - panned.a).toBeCloseTo(0.5);
  });

  it('knows when it is showing everything', () => {
    expect(isFull(FULL)).toBe(true);
    expect(isFull({ a: 0, b: 0.9 })).toBe(false);
  });
});

describe('finding points', () => {
  const xs = [10, 20, 30, 40, 50];
  it('picks the nearest timestamp', () => {
    expect(nearestIndex(xs, 24)).toBe(1);
    expect(nearestIndex(xs, 26)).toBe(2);
    expect(nearestIndex(xs, -5)).toBe(0);
    expect(nearestIndex(xs, 999)).toBe(4);
  });

  it('keeps a neighbour either side so the line reaches the plot edge', () => {
    expect(visibleRange(xs, 25, 45)).toEqual([1, 4]);
    expect(visibleRange(xs, 10, 50)).toEqual([0, 4]);
    expect(visibleRange(xs, 31, 33)).toEqual([2, 3]);
  });
});
