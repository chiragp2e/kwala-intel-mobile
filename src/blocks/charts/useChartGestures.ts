import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, type View } from 'react-native';
import { pinchWin, type Win } from './zoom';

interface Options {
  width: number;
  /** Plot area, in chart pixels. */
  left: number;
  right: number;
  win: Win;
  setWin: (w: Win) => void;
  minSpan: number;
  /** Zoom and pan only act when this is true; touching still inspects. */
  zoomable: boolean;
}

const HOLD_MS = 1600;

/** A touch on the chart, in the chart's own pixels (0,0 is its top left). */
export interface ChartTouch {
  x: number;
  y: number;
}

/**
 * Touch handling for a chart: one finger scrubs a crosshair (and the tooltip
 * follows it), two fingers pinch to zoom and drag to pan. A mostly vertical
 * drag is left alone so the chat list can still scroll past the chart. Each
 * chart decides what the touch points at (a date, a bar, a slice, a dot).
 */
export function useChartGestures({ width, left, right, win, setWin, minSpan, zoomable }: Options) {
  const [scrub, setScrub] = useState<ChartTouch | null>(null);
  const viewRef = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0 });
  const live = useRef({ width, left, right, win, setWin, minSpan, zoomable });
  live.current = { width, left, right, win, setWin, minSpan, zoomable };
  const engaged = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const pinch = useRef<{ dist: number; win: Win; anchor: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const measure = useCallback(() => {
    viewRef.current?.measureInWindow((x, y) => {
      if (Number.isFinite(x) && Number.isFinite(y)) origin.current = { x, y };
    });
  }, []);

  const clearScrub = useCallback(() => {
    clearTimeout(hideTimer.current);
    setScrub(null);
  }, []);

  const handlers = useMemo(() => {
    const plotX = (pageX: number) => {
      const { left: l, right: r, width: w } = live.current;
      return Math.min(w - r, Math.max(l, pageX - origin.current.x));
    };
    const local = (pageX: number, pageY: number): ChartTouch => ({ x: pageX - origin.current.x, y: pageY - origin.current.y });
    const frac = (px: number) => {
      const { left: l, right: r, width: w } = live.current;
      return Math.min(1, Math.max(0, (px - l) / Math.max(1, w - l - r)));
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Until a drag is clearly horizontal (or a second finger lands), the chat list may take the touch back.
      // Measured from the event itself: a quick first move can arrive before onPanResponderMove has seen
      // any, and a sideways drag on a chart is a scrub, not the history drawer's swipe.
      onPanResponderTerminationRequest: e => {
        if (engaged.current) return false;
        const dx = Math.abs(e.nativeEvent.pageX - start.current.x);
        const dy = Math.abs(e.nativeEvent.pageY - start.current.y);
        return !(dx > 4 && dx >= dy);
      },
      onPanResponderGrant: e => {
        clearTimeout(hideTimer.current);
        engaged.current = false;
        pinch.current = null;
        const { pageX, pageY } = e.nativeEvent;
        start.current = { x: pageX, y: pageY };
        // Measured on every touch: the chart moves as the chat scrolls.
        viewRef.current?.measureInWindow((x, y) => {
          if (Number.isFinite(x) && Number.isFinite(y)) origin.current = { x, y };
          setScrub(local(pageX, pageY));
        });
      },
      onPanResponderMove: (e, g) => {
        const touches = e.nativeEvent.touches;
        if (touches.length >= 2) {
          engaged.current = true;
          const [t0, t1] = touches;
          const dist = Math.max(1, Math.abs(t0.pageX - t1.pageX));
          const centre = plotX((t0.pageX + t1.pageX) / 2);
          if (!pinch.current) {
            pinch.current = { dist, win: live.current.win, anchor: frac(centre) };
            setScrub(null);
            return;
          }
          if (!live.current.zoomable) return;
          const p = pinch.current;
          live.current.setWin(pinchWin(p.win, p.anchor, dist / p.dist, frac(centre), live.current.minSpan));
          return;
        }
        pinch.current = null;
        if (!engaged.current) {
          if (Math.abs(g.dy) > Math.max(8, Math.abs(g.dx) * 1.2)) return;
          if (Math.abs(g.dx) > 4) engaged.current = true;
        }
        setScrub(local(e.nativeEvent.pageX, e.nativeEvent.pageY));
      },
      onPanResponderRelease: () => {
        engaged.current = false;
        pinch.current = null;
        hideTimer.current = setTimeout(() => setScrub(null), HOLD_MS);
      },
      onPanResponderTerminate: () => {
        engaged.current = false;
        pinch.current = null;
        setScrub(null);
      },
    }).panHandlers;
  }, []);

  return { viewRef, handlers, scrub, clearScrub, measure };
}
