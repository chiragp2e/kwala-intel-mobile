import React, { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { ClipPath, Circle, Defs, G, Line, Path, Polygon, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { Icon, type IconName } from '../../components/Icon';
import { colors, fonts, radii } from '../../theme/tokens';
import { compact, fmtNum, fmtPctLevel, formatValue, unitFormatter } from '../lib/format';
import type { ChartOverlay, ChartSpec, Unit } from '../types';
import { DOWN, ROLE_COLOR, SERIES_COLORS, UP, role } from '../roles';
import { dateLabel, linear, niceTicks, num, toMs } from './scale';
import { chartExportAvailable, shareChartImage } from './exportChart';
import { useChartGestures, type ChartTouch } from './useChartGestures';
import { FULL, isFull, nearestIndex, visibleRange, zoomAround, type Win } from './zoom';

/** One hue, darkest at the top, so the order of the stages reads in the colour. */
const FUNNEL = ['#0b6b49', '#0f7f58', '#13946a', '#1ca97c', '#2dbf8f'];
const PAD = { l: 46, r: 12, t: 12, b: 24 };
const H = 230;
const GRID = 'rgba(148,163,184,0.14)';
const AXIS = colors.textTertiary;

type Pt = [number, number];

/** What a touch points at: the tooltip's text and the marks that show which part of the chart it is about. */
interface Tip {
  /** A crosshair at this x (time and category axes). */
  x?: number;
  dashed?: boolean;
  /** A shaded column behind the touched category. */
  band?: { x: number; w: number };
  /** A ring around the touched dot. */
  ring?: { x: number; y: number; r: number };
  /** The touched bar, slice or stage, for charts that light it up. */
  index?: number;
  /** Where the box goes: beside `at.x`, top at `at.y` (default: the top of the chart). */
  at?: { x: number; y?: number };
  title: string;
  rows: { color: string; label: string; value: string; y?: number }[];
}

/** The tooltip box is about this tall: a title line and a line per row. */
const tipHeight = (tip: Tip) => 26 + tip.rows.length * 19;

function ActionButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [s.action, pressed && { backgroundColor: colors.surfaceHover }]}>
      <Icon name={icon} size={15} color={colors.textTertiary} />
    </Pressable>
  );
}

function TipOverlay({ tip, w, h }: { tip: Tip; w: number; h: number }) {
  const ax = tip.at?.x ?? tip.x ?? w / 2;
  const right = ax > w / 2;
  const room = Math.max(120, (right ? ax : w - ax) - 14);
  const top = Math.max(4, Math.min(h - tipHeight(tip) - 4, tip.at?.y ?? 4));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        {tip.band ? <Rect x={tip.band.x} y={PAD.t} width={tip.band.w} height={H - PAD.t - PAD.b} fill="rgba(148,163,184,0.14)" /> : null}
        {tip.x !== undefined ? (
          <Line x1={tip.x} x2={tip.x} y1={PAD.t} y2={H - PAD.b} stroke="rgba(203,213,225,0.6)" strokeWidth={1} strokeDasharray={tip.dashed ? '4,4' : undefined} />
        ) : null}
        {tip.ring ? <Circle cx={tip.ring.x} cy={tip.ring.y} r={tip.ring.r + 3} fill="none" stroke={colors.textPrimary} strokeWidth={1.5} /> : null}
        {tip.x !== undefined
          ? tip.rows.map((r, i) =>
              r.y === undefined ? null : <Circle key={i} cx={tip.x} cy={r.y} r={4.5} fill={r.color} stroke={colors.surface} strokeWidth={1.5} />,
            )
          : null}
      </Svg>
      <View testID="chart-tip" style={[s.tip, { top, maxWidth: Math.min(260, room), minWidth: Math.min(150, room) }, right ? { right: w - ax + 10 } : { left: ax + 10 }]}>
        <Text style={s.tipTitle}>{tip.title}</Text>
        {tip.rows.map((r, i) => (
          <View key={i} style={s.tipRow}>
            <View style={[s.tipSwatch, { backgroundColor: r.color }]} />
            <Text style={s.tipLabel} numberOfLines={1}>
              {r.label}
            </Text>
            <Text style={s.tipValue}>{r.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * The card every chart sits in: title, a download button, touch inspection,
 * and, for charts that have a time axis, zoom controls. A touch shows what is
 * under the finger, as hovering does on the web: a crosshair or highlight and
 * a tooltip (`tip`), which stays for a moment after the finger lifts. A pinch
 * zooms and the +/- buttons do the same for anyone who would rather tap.
 * Downloading photographs the card as it is now, zoom included, and opens the
 * share sheet.
 */
function Frame({
  spec,
  children,
  legend,
  zoomable = false,
  minSpan = 0.05,
  tip,
  fixedHeight = true,
}: {
  spec: ChartSpec;
  /** Draws the chart; `active` is what the finger is on, for charts that highlight it. */
  children: (w: number, win: Win, active: Tip | null) => React.ReactNode;
  legend?: React.ReactNode;
  zoomable?: boolean;
  minSpan?: number;
  /** What a touch at chart pixel `at` points to, or null for nothing. */
  tip: (w: number, win: Win, at: ChartTouch) => Tip | null;
  /** Cartesian charts are H tall; pie and funnel take the height of what they draw. */
  fixedHeight?: boolean;
}) {
  const [w, setW] = useState(0);
  const [h, setH] = useState(H);
  const [win, setWin] = useState<Win>(FULL);
  const [capturing, setCapturing] = useState(false);
  const cardRef = useRef<View>(null);
  const canExport = useMemo(chartExportAvailable, []);
  const g = useChartGestures({ width: w, left: PAD.l, right: PAD.r, win, setWin, minSpan, zoomable });
  const shown = w > 0 && g.scrub !== null && !capturing ? tip(w, win, g.scrub) : null;
  const zoomed = !isFull(win);
  const showActions = zoomable || canExport;

  const download = async () => {
    g.clearScrub();
    setCapturing(true);
    await new Promise<void>(r => setTimeout(r, 90));
    const result = await shareChartImage(cardRef.current, spec.title ?? spec.chart_type);
    setCapturing(false);
    if (result !== 'shared') Alert.alert("Couldn't save the chart", 'Something went wrong while making the image. Please try again.');
  };

  return (
    <View ref={cardRef} collapsable={false} style={s.card}>
      {spec.title || showActions ? (
        <View style={s.head}>
          <Text style={[s.title, s.flex]}>{spec.title ?? ''}</Text>
          {showActions ? (
            <View style={[s.actions, capturing && { opacity: 0 }]}>
              {zoomable ? (
                <>
                  {zoomed ? <ActionButton icon="rotate-ccw" label="Reset zoom" onPress={() => setWin(FULL)} /> : null}
                  <ActionButton icon="zoom-out" label="Zoom out" onPress={() => setWin(zoomAround(win, 1 / 0.55, 0.5, minSpan))} />
                  <ActionButton icon="zoom-in" label="Zoom in" onPress={() => setWin(zoomAround(win, 0.55, 0.5, minSpan))} />
                </>
              ) : null}
              {canExport ? <ActionButton icon="download" label="Download chart as image" onPress={() => void download()} /> : null}
            </View>
          ) : null}
        </View>
      ) : null}
      <View ref={g.viewRef} onLayout={e => { setW(Math.floor(e.nativeEvent.layout.width)); g.measure(); }} style={s.fill} {...g.handlers}>
        {w > 0 ? (
          <View style={fixedHeight ? { width: w, height: H } : { width: w }} onLayout={e => setH(Math.floor(e.nativeEvent.layout.height))}>
            {children(w, win, shown)}
            {shown ? <TipOverlay tip={shown} w={w} h={fixedHeight ? H : h} /> : null}
          </View>
        ) : (
          <View style={{ height: H }} />
        )}
      </View>
      {legend}
    </View>
  );
}

function Legend({ names, colorsList }: { names: string[]; colorsList: string[] }) {
  if (names.length < 2) return null;
  return (
    <View style={s.legend}>
      {names.map((n, i) => (
        <View key={i} style={s.legendItem}>
          <View style={[s.swatch, { backgroundColor: colorsList[i % colorsList.length] }]} />
          <Text style={s.legendText} numberOfLines={1}>
            {n}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Y gridlines + labels, shared by every cartesian chart. */
function YAxis({ ticks, y, w, fmt }: { ticks: number[]; y: (v: number) => number; w: number; fmt: (v: number) => string }) {
  return (
    <>
      {ticks.map((t, i) => (
        <G key={i}>
          <Line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
          <SvgText x={PAD.l - 6} y={y(t) + 3.5} fontSize={10} fill={AXIS} textAnchor="end">
            {fmt(t)}
          </SvgText>
        </G>
      ))}
    </>
  );
}

function XLabels({ labels, w }: { labels: { at: number; text: string }[]; w: number }) {
  return (
    <>
      {labels.map((l, i) => (
        <SvgText
          key={i}
          x={Math.min(w - PAD.r - 2, Math.max(PAD.l + 2, l.at))}
          y={H - 7}
          fontSize={10}
          fill={AXIS}
          textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}>
          {l.text}
        </SvgText>
      ))}
    </>
  );
}

function axisFmt(unit?: string) {
  const u = unit as Unit | undefined;
  return (v: number) => {
    if (u === 'percent') return unitFormatter(u)(v);
    // Abbreviate big numbers ("1.2cr", "40K"); small ones read as a scale, not an amount, so no cents.
    const short = compact(v, u);
    return /[KMBTLcr]$/.test(short) ? short : unitFormatter(u)(v);
  };
}

// ── Overlays ────────────────────────────────────────────────────────────────

function Overlays({
  overlays,
  xOf,
  y,
  w,
  fmt,
}: {
  overlays?: ChartOverlay[];
  xOf: (ts: number | string) => number | undefined;
  y: (v: number) => number;
  w: number;
  fmt: (v: number) => string;
}) {
  if (!overlays?.length) return null;
  return (
    <>
      {overlays.map((o, i) => {
        const c = ROLE_COLOR[role(o.role, 'neutral')];
        const dash = o.style === 'dashed' ? '5,4' : undefined;
        if (o.kind === 'level' && typeof o.y === 'number') {
          return (
            <G key={i}>
              <Line x1={PAD.l} x2={w - PAD.r} y1={y(o.y)} y2={y(o.y)} stroke={c} strokeWidth={1.2} strokeDasharray={dash ?? '5,4'} />
              <SvgText x={w - PAD.r - 2} y={y(o.y) - 4} fontSize={9.5} fill={c} textAnchor="end">
                {o.name ? `${o.name} ${fmt(o.y)}` : fmt(o.y)}
              </SvgText>
            </G>
          );
        }
        if (o.kind === 'zone' && typeof o.y_from === 'number' && typeof o.y_to === 'number') {
          const top = Math.min(y(o.y_from), y(o.y_to));
          return <Rect key={i} x={PAD.l} y={top} width={w - PAD.l - PAD.r} height={Math.abs(y(o.y_from) - y(o.y_to))} fill={c} opacity={0.12} />;
        }
        if (o.kind === 'line' && o.points?.length) {
          const pts = o.points.map(([t, v]) => [xOf(t), y(v)] as const).filter(([px]) => px !== undefined);
          if (pts.length < 2) return null;
          return <Polyline key={i} points={pts.map(([px, py]) => `${px},${py}`).join(' ')} stroke={c} strokeWidth={1.4} strokeDasharray={dash} fill="none" />;
        }
        if (o.kind === 'vline' && o.ts !== undefined) {
          const px = xOf(o.ts);
          return px === undefined ? null : <Line key={i} x1={px} x2={px} y1={PAD.t} y2={H - PAD.b} stroke={c} strokeWidth={1} strokeDasharray={dash ?? '3,3'} />;
        }
        if ((o.kind === 'point' || o.kind === 'callout') && o.ts !== undefined && typeof o.y === 'number') {
          const px = xOf(o.ts);
          if (px === undefined) return null;
          const text = o.kind === 'callout' ? (o.text ?? o.name) : undefined;
          return (
            <G key={i}>
              <Circle cx={px} cy={y(o.y)} r={4} fill={c} stroke={colors.surface} strokeWidth={1.5} />
              {text ? (
                <SvgText x={Math.min(w - PAD.r - 2, Math.max(PAD.l, px))} y={y(o.y) - 8} fontSize={9.5} fill={c} textAnchor="middle">
                  {text}
                </SvgText>
              ) : null}
            </G>
          );
        }
        return null;
      })}
    </>
  );
}

// ── Line / area ─────────────────────────────────────────────────────────────

/** A tooltip heading: the date, with the time when the visible span is short enough for it to matter. */
function tipDate(ms: number, spanMs: number): string {
  const d = new Date(ms);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return spanMs <= 3 * 86400000 ? `${date}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : date;
}

function LineChart({ spec }: { spec: ChartSpec }) {
  const unit = spec.y_axis?.unit;
  const fmt = unitFormatter(unit as Unit);
  const series = spec.series
    .filter(sr => sr.type === 'line' || sr.type === spec.chart_type)
    .map(sr => {
      const pts = (sr.data as unknown[])
        .map(d => (Array.isArray(d) ? ([toMs(d[0]), num(d[1])] as Pt) : null))
        .filter((p): p is Pt => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
      return { name: sr.name, pts, xs: pts.map(p => p[0]) };
    })
    .filter(sr => sr.pts.length > 1);
  if (!series.length) return null;

  const all = series.flatMap(sr => sr.pts);
  const x0 = Math.min(...all.map(p => p[0]));
  const x1 = Math.max(...all.map(p => p[0]));
  const levels = (spec.overlays ?? []).flatMap(o => (o.kind === 'level' && typeof o.y === 'number' ? [o.y] : []));
  const densest = Math.max(...series.map(sr => sr.pts.length));
  const minSpan = Math.min(1, Math.max(0.02, 5 / densest));

  // Everything that depends on the width and the visible window, shared by drawing and the tooltip.
  const view = (w: number, win: Win) => {
    const wx0 = x0 + win.a * (x1 - x0);
    const wx1 = x0 + win.b * (x1 - x0);
    const shown = series.map(sr => {
      const [i, j] = visibleRange(sr.xs, wx0, wx1);
      return sr.pts.slice(i, j + 1);
    });
    // The y-axis re-fits to what is on screen, so zooming into a quiet week widens its range.
    const inside = shown.flatMap(pts => pts.filter(p => p[0] >= wx0 && p[0] <= wx1));
    const basis = inside.length ? inside : shown.flat();
    const lv = isFull(win) ? levels : [];
    let lo = Math.min(...basis.map(p => p[1]), ...lv);
    let hi = Math.max(...basis.map(p => p[1]), ...lv);
    const pad = (hi - lo || Math.abs(hi) * 0.1 || 1) * 0.08;
    lo -= pad;
    hi += pad;
    const ticks = niceTicks(lo, hi, 4);
    const x = linear(wx0, wx1, PAD.l, w - PAD.r);
    const y = linear(Math.min(lo, ticks[0]), Math.max(hi, ticks[ticks.length - 1]), H - PAD.b, PAD.t);
    return { wx0, wx1, shown, ticks, x, y };
  };

  const tip = (w: number, win: Win, at: ChartTouch): Tip | null => {
    const v = view(w, win);
    const px = Math.min(w - PAD.r, Math.max(PAD.l, at.x));
    const t = v.wx0 + ((px - PAD.l) / Math.max(1, w - PAD.l - PAD.r)) * (v.wx1 - v.wx0);
    // Snap to the closest timestamp any series has, then read every series at it.
    let snap = series[0].xs[nearestIndex(series[0].xs, t)];
    for (const sr of series) {
      const c = sr.xs[nearestIndex(sr.xs, t)];
      if (Math.abs(c - t) < Math.abs(snap - t)) snap = c;
    }
    return {
      x: v.x(snap),
      title: tipDate(snap, v.wx1 - v.wx0),
      rows: series.map((sr, i) => {
        const p = sr.pts[nearestIndex(sr.xs, snap)];
        return { color: SERIES_COLORS[i % SERIES_COLORS.length], label: sr.name || spec.y_axis?.label || 'Value', value: fmt(p[1]), y: v.y(p[1]) };
      }),
    };
  };

  return (
    <Frame spec={spec} zoomable minSpan={minSpan} tip={tip} legend={<Legend names={series.map(sr => sr.name)} colorsList={SERIES_COLORS} />}>
      {(w, win) => {
        const { wx0, wx1, shown, ticks, x, y } = view(w, win);
        const labels = [0, 1 / 3, 2 / 3, 1].map(f => ({ at: x(wx0 + (wx1 - wx0) * f), text: dateLabel(wx0 + (wx1 - wx0) * f, wx1 - wx0) }));
        const area = series.length === 1;
        return (
          <Svg width={w} height={H}>
            <Defs>
              <ClipPath id="plot">
                <Rect x={PAD.l} y={0} width={Math.max(1, w - PAD.l - PAD.r)} height={H - PAD.b + 2} />
              </ClipPath>
            </Defs>
            <YAxis ticks={ticks} y={y} w={w} fmt={axisFmt(unit)} />
            <XLabels labels={labels} w={w} />
            <G clipPath="url(#plot)">
              {shown.map((pts, i) => {
                const c = SERIES_COLORS[i % SERIES_COLORS.length];
                const line = pts.map(p => `${x(p[0])},${y(p[1])}`).join(' ');
                return (
                  <G key={i}>
                    {area ? <Polygon points={`${x(pts[0][0])},${H - PAD.b} ${line} ${x(pts[pts.length - 1][0])},${H - PAD.b}`} fill={c} opacity={0.12} /> : null}
                    <Polyline points={line} fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  </G>
                );
              })}
              <Overlays overlays={spec.overlays} xOf={t => (Number.isFinite(toMs(t)) ? x(toMs(t)) : undefined)} y={y} w={w} fmt={fmt} />
            </G>
          </Svg>
        );
      }}
    </Frame>
  );
}

// ── Candlestick ─────────────────────────────────────────────────────────────

function CandleChart({ spec }: { spec: ChartSpec }) {
  const unit = spec.y_axis?.unit;
  const fmt = unitFormatter(unit as Unit);
  const sr = spec.series.find(x => x.type === 'candlestick') ?? spec.series[0];
  const candles = (sr.data as unknown[])
    .map(d => (Array.isArray(d) ? { t: toMs(d[0]), o: num(d[1]), h: num(d[2]), l: num(d[3]), c: num(d[4]) } : null))
    .filter((c): c is { t: number; o: number; h: number; l: number; c: number } => !!c && [c.o, c.h, c.l, c.c].every(Number.isFinite));
  if (!candles.length) return null;
  const total = candles.length;
  const minSpan = Math.min(1, Math.max(0.02, 8 / total));
  const levels = (spec.overlays ?? []).flatMap(o => (o.kind === 'level' && typeof o.y === 'number' ? [o.y] : []));

  const view = (w: number, win: Win) => {
    const from = Math.min(total - 1, Math.floor(win.a * total + 1e-6));
    const to = Math.max(from + 1, Math.min(total, Math.ceil(win.b * total - 1e-6)));
    const shown = candles.slice(from, to);
    const lv = isFull(win) ? levels : [];
    let lo = Math.min(...shown.map(c => c.l), ...lv);
    let hi = Math.max(...shown.map(c => c.h), ...lv);
    const pad = (hi - lo || 1) * 0.06;
    lo -= pad;
    hi += pad;
    const ticks = niceTicks(lo, hi, 4);
    const y = linear(Math.min(lo, ticks[0]), Math.max(hi, ticks[ticks.length - 1]), H - PAD.b, PAD.t);
    const step = (w - PAD.l - PAD.r) / shown.length;
    const cx = (i: number) => PAD.l + step * (i + 0.5);
    return { shown, ticks, y, step, cx, n: shown.length, span: shown[shown.length - 1].t - shown[0].t };
  };

  const tip = (w: number, win: Win, at: ChartTouch): Tip | null => {
    const v = view(w, win);
    const i = Math.min(v.n - 1, Math.max(0, Math.floor((at.x - PAD.l) / v.step)));
    const c = v.shown[i];
    const col = c.c >= c.o ? UP : DOWN;
    return {
      x: v.cx(i),
      title: tipDate(c.t, v.span),
      rows: [
        { color: colors.textTertiary, label: 'Open', value: fmt(c.o) },
        { color: colors.textTertiary, label: 'High', value: fmt(c.h) },
        { color: colors.textTertiary, label: 'Low', value: fmt(c.l) },
        { color: col, label: 'Close', value: fmt(c.c), y: v.y(c.c) },
      ],
    };
  };

  return (
    <Frame spec={spec} zoomable minSpan={minSpan} tip={tip}>
      {(w, win) => {
        const { shown, ticks, y, step, cx, n, span } = view(w, win);
        const bw = Math.max(1.5, Math.min(14, step * 0.68));
        const labels = [0, 1 / 3, 2 / 3, 1].map(f => {
          const i = Math.min(n - 1, Math.round((n - 1) * f));
          return { at: cx(i), text: dateLabel(shown[i].t, span) };
        });
        const idxOf = (t: number | string) => {
          const ms = toMs(t);
          if (!Number.isFinite(ms)) return undefined;
          let best = 0;
          shown.forEach((c, i) => {
            if (Math.abs(c.t - ms) < Math.abs(shown[best].t - ms)) best = i;
          });
          return cx(best);
        };
        return (
          <Svg width={w} height={H}>
            <YAxis ticks={ticks} y={y} w={w} fmt={axisFmt(unit)} />
            <XLabels labels={labels} w={w} />
            {shown.map((c, i) => {
              const col = c.c >= c.o ? UP : DOWN;
              const top = y(Math.max(c.o, c.c));
              const bot = y(Math.min(c.o, c.c));
              return (
                <G key={i}>
                  <Line x1={cx(i)} x2={cx(i)} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth={1} />
                  <Rect x={cx(i) - bw / 2} y={top} width={bw} height={Math.max(1, bot - top)} fill={col} />
                </G>
              );
            })}
            <Overlays overlays={spec.overlays} xOf={idxOf} y={y} w={w} fmt={fmt} />
          </Svg>
        );
      }}
    </Frame>
  );
}

// ── Bar / histogram / waterfall ─────────────────────────────────────────────

interface Bar {
  label: string;
  /** [from, to] in data space. */
  span: [number, number];
  color: string;
}

interface BarsProps {
  spec: ChartSpec;
  groups: Bar[][];
  legendNames?: string[];
  gap?: number;
  unit?: string;
  /** The tooltip for category `i`: its rows, one per series. */
  rowsAt: (i: number) => Tip['rows'];
  /** The web's pointer: a dashed line for bars, a shaded column for histogram and waterfall. */
  pointer?: 'line' | 'band';
}

function BarsFrame({ spec, groups, legendNames, gap = 0.28, unit, rowsAt, pointer = 'line' }: BarsProps) {
  const cats = groups[0]?.length ?? 0;
  if (!cats) return null;
  const vals = groups.flat().flatMap(b => b.span);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  const ticks = niceTicks(lo, hi * 1.05, 4);
  const y = linear(Math.min(lo, ticks[0]), Math.max(hi, ticks[ticks.length - 1]), H - PAD.b, PAD.t);
  const stepOf = (w: number) => (w - PAD.l - PAD.r) / cats;

  const tip = (w: number, _win: Win, at: ChartTouch): Tip | null => {
    const step = stepOf(w);
    const i = Math.min(cats - 1, Math.max(0, Math.floor((at.x - PAD.l) / step)));
    const cx = PAD.l + step * (i + 0.5);
    return {
      ...(pointer === 'band' ? { band: { x: PAD.l + step * i, w: step } } : { x: cx, dashed: true }),
      index: i,
      at: { x: cx },
      title: groups[0][i].label,
      rows: rowsAt(i),
    };
  };

  return (
    <Frame spec={spec} tip={tip} legend={legendNames ? <Legend names={legendNames} colorsList={SERIES_COLORS} /> : undefined}>
      {w => {
        const inner = w - PAD.l - PAD.r;
        const step = stepOf(w);
        const slot = step * (1 - gap);
        const bw = slot / groups.length;
        const every = Math.max(1, Math.ceil(cats / Math.max(2, Math.floor(inner / 46))));
        return (
          <Svg width={w} height={H}>
            <YAxis ticks={ticks} y={y} w={w} fmt={axisFmt(unit)} />
            {groups.map((g, gi) =>
              g.map((b, i) => {
                const a = y(b.span[0]);
                const c = y(b.span[1]);
                const x = PAD.l + step * i + (step - slot) / 2 + bw * gi;
                return <Rect key={`${gi}-${i}`} x={x} y={Math.min(a, c)} width={Math.max(1, bw - 1)} height={Math.max(1, Math.abs(a - c))} rx={2} fill={b.color} />;
              }),
            )}
            {groups[0].map((b, i) =>
              i % every === 0 ? (
                <SvgText key={i} x={PAD.l + step * (i + 0.5)} y={H - 7} fontSize={9.5} fill={AXIS} textAnchor="middle">
                  {b.label.length > 8 ? `${b.label.slice(0, 7)}…` : b.label}
                </SvgText>
              ) : null,
            )}
          </Svg>
        );
      }}
    </Frame>
  );
}

function BarChart({ spec }: { spec: ChartSpec }) {
  const unit = spec.y_axis?.unit;
  const fmt = unitFormatter(unit as Unit);
  const bars = spec.series.filter(sr => sr.type === 'bar' || sr.type === spec.chart_type);
  const cats = spec.x_axis?.categories ?? [];
  const groups = bars.map((sr, si) =>
    (sr.data as unknown[]).map((v, i) => {
      const n = Array.isArray(v) ? num(v[1]) : num(v);
      return { label: cats[i] ?? String(i + 1), span: [0, Number.isFinite(n) ? n : 0] as [number, number], color: SERIES_COLORS[si % SERIES_COLORS.length] };
    }),
  );
  // As on the web (trigger 'axis'): every series' value at the touched category.
  const rowsAt = (i: number) =>
    groups.flatMap((g, gi) => (g[i] ? [{ color: g[i].color, label: bars[gi].name || spec.y_axis?.label || 'Value', value: fmt(g[i].span[1]) }] : []));
  return <BarsFrame spec={spec} groups={groups} legendNames={bars.map(b => b.name)} unit={unit} rowsAt={rowsAt} />;
}

function HistogramChart({ spec }: { spec: ChartSpec }) {
  const pts = ((spec.series[0]?.data ?? []) as unknown[])
    .map(p => (Array.isArray(p) ? ([num(p[0]), num(p[1])] as Pt) : null))
    .filter((p): p is Pt => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  const group = pts.map(p => ({ label: compact(p[0]), span: [0, p[1]] as [number, number], color: p[0] < 0 ? DOWN : UP }));
  const rowsAt = (i: number) => [{ color: group[i].color, label: spec.series[0]?.name || 'Count', value: fmtNum(pts[i][1]) }];
  return <BarsFrame spec={spec} groups={[group]} gap={0.04} rowsAt={rowsAt} pointer="band" />;
}

function WaterfallChart({ spec }: { spec: ChartSpec }) {
  const unit = spec.y_axis?.unit;
  const fmt = unitFormatter(unit as Unit);
  const items = ((spec.series[0]?.data ?? []) as unknown[]).filter((d): d is Record<string, unknown> => !!d && typeof d === 'object');
  let run = 0;
  const steps = items.map(it => {
    const v = num(it.value);
    if (it.total) return { bar: { label: String(it.name ?? ''), span: [0, run] as [number, number], color: colors.accent }, change: null, total: run };
    const from = run;
    run += Number.isFinite(v) ? v : 0;
    return { bar: { label: String(it.name ?? ''), span: [from, run] as [number, number], color: v >= 0 ? UP : DOWN }, change: Number.isFinite(v) ? v : 0, total: run };
  });
  // The step's own amount, as on the web, and where the running total stands after it.
  const rowsAt = (i: number) => {
    const st = steps[i];
    const total = { color: colors.accent, label: 'Total', value: fmt(st.total) };
    return st.change === null ? [total] : [{ color: st.bar.color, label: 'Change', value: fmt(st.change) }, total];
  };
  return <BarsFrame spec={spec} groups={[steps.map(st => st.bar)]} unit={unit} rowsAt={rowsAt} pointer="band" />;
}

// ── Scatter ─────────────────────────────────────────────────────────────────

function ScatterChart({ spec }: { spec: ChartSpec }) {
  const timeX = spec.x_axis?.type === 'time';
  const series = spec.series.map(sr => ({
    name: sr.name,
    pts: (sr.data as unknown[])
      .map(d => (Array.isArray(d) ? { x: timeX ? toMs(d[0]) : num(d[0]), y: num(d[1]), size: num(d[2]), name: d[3] as string | undefined } : null))
      .filter((p): p is { x: number; y: number; size: number; name: string | undefined } => !!p && Number.isFinite(p.x) && Number.isFinite(p.y)),
  }));
  const all = series.flatMap(sr => sr.pts);
  if (!all.length) return null;
  const yUnit = spec.y_axis?.unit;
  const fmt = unitFormatter(yUnit as Unit);
  const xs = all.map(p => p.x);
  const ys = all.map(p => p.y);
  const [xlo, xhi] = [Math.min(...xs), Math.max(...xs)];
  const [ylo, yhi] = [Math.min(...ys), Math.max(...ys)];
  const xp = (xhi - xlo || 1) * 0.06;
  const yp = (yhi - ylo || 1) * 0.1;
  const yt = niceTicks(ylo - yp, yhi + yp, 4);
  const xt = niceTicks(xlo - xp, xhi + xp, 4);
  const y = linear(ylo - yp, yhi + yp, H - PAD.b, PAD.t);
  const xOf = (w: number) => linear(xlo - xp, xhi + xp, PAD.l + 4, w - PAD.r - 4);
  const sizes = all.map(p => p.size).filter(Number.isFinite);
  const smax = sizes.length ? Math.max(...sizes) : 0;
  const r = (p: { size: number }) => (Number.isFinite(p.size) && smax > 0 ? 3 + Math.sqrt(p.size / smax) * 9 : 4.5);
  const xText = (v: number) => (timeX ? tipDate(v, xhi - xlo) : fmtNum(v));

  // As on the web (trigger 'item'): the dot nearest the finger, its name and series, then x, y and size.
  const tip = (w: number, _win: Win, at: ChartTouch): Tip | null => {
    const x = xOf(w);
    let best: { si: number; p: (typeof all)[number]; d: number } | null = null;
    series.forEach((sr, si) =>
      sr.pts.forEach(p => {
        const d = Math.hypot(x(p.x) - at.x, y(p.y) - at.y);
        if (!best || d < best.d) best = { si, p, d };
      }),
    );
    if (!best) return null;
    const { si, p } = best as { si: number; p: (typeof all)[number] };
    const color = SERIES_COLORS[si % SERIES_COLORS.length];
    const px = x(p.x);
    const py = y(p.y);
    const title = [p.name, series[si].name].filter(Boolean).join(' · ') || 'Point';
    const rows = [
      { color, label: spec.x_axis?.label || 'X', value: xText(p.x) },
      { color, label: spec.y_axis?.label || 'Y', value: fmt(p.y) },
      ...(Number.isFinite(p.size) ? [{ color, label: 'Size', value: fmtNum(p.size) }] : []),
    ];
    const box = 26 + rows.length * 19;
    return { ring: { x: px, y: py, r: r(p) }, at: { x: px, y: py < H / 2 ? py + r(p) + 8 : py - r(p) - 8 - box }, title, rows };
  };

  return (
    <Frame spec={spec} tip={tip} legend={<Legend names={series.map(sr => sr.name)} colorsList={SERIES_COLORS} />}>
      {w => {
        const x = xOf(w);
        return (
          <Svg width={w} height={H}>
            <YAxis ticks={yt.filter(t => t >= ylo - yp && t <= yhi + yp)} y={y} w={w} fmt={axisFmt(yUnit)} />
            {xt.filter(t => t >= xlo - xp && t <= xhi + xp).map((t, i) => (
              <SvgText key={i} x={x(t)} y={H - 7} fontSize={10} fill={AXIS} textAnchor="middle">
                {timeX ? dateLabel(t, xhi - xlo) : compact(t)}
              </SvgText>
            ))}
            {series.map((sr, si) =>
              sr.pts.map((p, i) => (
                <Circle key={`${si}-${i}`} cx={x(p.x)} cy={y(p.y)} r={r(p)} fill={SERIES_COLORS[si % SERIES_COLORS.length]} opacity={0.72} stroke={colors.surface} strokeWidth={1} />
              )),
            )}
            {all.length <= 12
              ? series.flatMap((sr, si) =>
                  sr.pts.map((p, i) =>
                    p.name ? (
                      <SvgText key={`l${si}-${i}`} x={x(p.x)} y={y(p.y) - r(p) - 3} fontSize={9.5} fill={colors.textSecondary} textAnchor="middle">
                        {p.name}
                      </SvgText>
                    ) : null,
                  ),
                )
              : null}
          </Svg>
        );
      }}
    </Frame>
  );
}

// ── Box plot ────────────────────────────────────────────────────────────────

function BoxplotChart({ spec }: { spec: ChartSpec }) {
  const unit = spec.y_axis?.unit;
  const fmt = unitFormatter(unit as Unit);
  const cats = spec.x_axis?.categories ?? [];
  const rows = ((spec.series[0]?.data ?? []) as unknown[])
    .map(d => (Array.isArray(d) ? (d.length >= 6 ? d.slice(1, 6) : d.slice(0, 5)).map(num) : null))
    .filter((r): r is number[] => !!r && r.length === 5 && r.every(Number.isFinite));
  if (!rows.length) return null;
  const lo = Math.min(...rows.map(r => r[0]));
  const hi = Math.max(...rows.map(r => r[4]));
  const ticks = niceTicks(lo, hi, 4);
  const y = linear(Math.min(lo, ticks[0]), Math.max(hi, ticks[ticks.length - 1]), H - PAD.b, PAD.t);
  const stepOf = (w: number) => (w - PAD.l - PAD.r) / rows.length;
  const name = (i: number) => cats[i] ?? String(i + 1);

  // As on the web: the five numbers of the touched box, top down.
  const tip = (w: number, _win: Win, at: ChartTouch): Tip | null => {
    const step = stepOf(w);
    const i = Math.min(rows.length - 1, Math.max(0, Math.floor((at.x - PAD.l) / step)));
    const r = rows[i];
    const c = colors.accent;
    return {
      band: { x: PAD.l + step * i, w: step },
      index: i,
      at: { x: PAD.l + step * (i + 0.5) },
      title: name(i),
      rows: [
        { color: c, label: 'Max', value: fmt(r[4]) },
        { color: c, label: 'Q3', value: fmt(r[3]) },
        { color: colors.textPrimary, label: 'Median', value: fmt(r[2]) },
        { color: c, label: 'Q1', value: fmt(r[1]) },
        { color: c, label: 'Min', value: fmt(r[0]) },
      ],
    };
  };

  return (
    <Frame spec={spec} tip={tip}>
      {w => {
        const step = stepOf(w);
        const bw = Math.min(28, step * 0.55);
        return (
          <Svg width={w} height={H}>
            <YAxis ticks={ticks} y={y} w={w} fmt={axisFmt(unit)} />
            {rows.map((r, i) => {
              const cx = PAD.l + step * (i + 0.5);
              return (
                <G key={i}>
                  <Line x1={cx} x2={cx} y1={y(r[0])} y2={y(r[4])} stroke={colors.textTertiary} strokeWidth={1.2} />
                  <Rect x={cx - bw / 2} y={y(r[3])} width={bw} height={Math.max(1, y(r[1]) - y(r[3]))} fill={colors.accent} opacity={0.35} stroke={colors.accent} strokeWidth={1.2} rx={2} />
                  <Line x1={cx - bw / 2} x2={cx + bw / 2} y1={y(r[2])} y2={y(r[2])} stroke={colors.textPrimary} strokeWidth={2} />
                  <SvgText x={cx} y={H - 7} fontSize={9.5} fill={AXIS} textAnchor="middle">
                    {name(i).slice(0, 8)}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        );
      }}
    </Frame>
  );
}

// ── Pie / funnel ────────────────────────────────────────────────────────────

function pieSlices(spec: ChartSpec) {
  return ((spec.series[0]?.data ?? []) as unknown[])
    .filter((d): d is { name: string; value: number } => !!d && typeof d === 'object' && Number.isFinite(num((d as { value: unknown }).value)))
    .map(d => ({ name: String((d as { name: unknown }).name), value: num(d.value) }))
    .filter(d => d.value > 0);
}

/** Which slice an angle falls in, measured clockwise from 12 o'clock as the slices are drawn. */
export function sliceAt(dx: number, dy: number, values: number[]): number {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return -1;
  const turn = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
  let acc = 0;
  for (let i = 0; i < values.length; i++) {
    acc += (values[i] / total) * Math.PI * 2;
    if (turn < acc) return i;
  }
  return values.length - 1;
}

function PieChart({ spec }: { spec: ChartSpec }) {
  const slices = pieSlices(spec);
  const total = slices.reduce((a, b) => a + b.value, 0);
  if (!slices.length || total <= 0) return null;
  const unit = spec.y_axis?.unit as Unit | undefined;
  const R = 78;
  const r = 48;
  const C = 92;
  const valueText = (v: number) => (unit === 'percent' ? fmtPctLevel(v) : formatValue(v, unit));
  const pct = (v: number) => `${((v / total) * 100).toFixed(1)}%`;
  let a0 = -Math.PI / 2;
  const arcs = slices.map((sl, i) => {
    const sweep = (sl.value / total) * Math.PI * 2;
    const from = a0;
    const to = a0 + Math.min(sweep, Math.PI * 2 - 1e-4);
    a0 += sweep;
    const big = sweep > Math.PI ? 1 : 0;
    const d = (outer: number) => {
      const p = (rad: number, a: number) => `${C + rad * Math.cos(a)},${C + rad * Math.sin(a)}`;
      return `M${p(outer, from)} A${outer},${outer} 0 ${big} 1 ${p(outer, to)} L${p(r, to)} A${r},${r} 0 ${big} 0 ${p(r, from)} Z`;
    };
    return { d, color: SERIES_COLORS[i % SERIES_COLORS.length] };
  });

  // As on the web (trigger 'item'): the touched slice, its value and its share. Touches off the ring show nothing.
  const tip = (w: number, _win: Win, at: ChartTouch): Tip | null => {
    const dx = at.x - w / 2;
    const dy = at.y - C;
    const dist = Math.hypot(dx, dy);
    if (dist < r - 14 || dist > R + 16) return null;
    const i = sliceAt(dx, dy, slices.map(sl => sl.value));
    if (i < 0) return null;
    const sl = slices[i];
    return {
      index: i,
      at: { x: at.x, y: at.y + 18 },
      title: sl.name,
      rows: [{ color: arcs[i].color, label: pct(sl.value), value: valueText(sl.value) }],
    };
  };

  return (
    <Frame spec={spec} tip={tip} fixedHeight={false}>
      {(_w, _win, active) => (
        <View style={{ alignItems: 'center', gap: 12 }}>
          <Svg width={C * 2} height={C * 2}>
            {arcs.map((a, i) => {
              const on = active?.index === i;
              const dim = active?.index !== undefined && !on;
              return <Path key={i} d={a.d(on ? R + 6 : R)} fill={a.color} opacity={dim ? 0.35 : 1} stroke={colors.surface} strokeWidth={2} />;
            })}
          </Svg>
          <View style={{ alignSelf: 'stretch', gap: 6 }}>
            {slices.map((sl, i) => (
              <View key={i} style={[s.pieRow, active?.index !== undefined && active.index !== i && s.dimmed]}>
                <View style={[s.swatch, { backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }]} />
                <Text style={[s.legendText, { flex: 1 }]} numberOfLines={1}>
                  {sl.name}
                </Text>
                <Text style={s.pieValue}>{valueText(sl.value)}</Text>
                <Text style={s.piePct}>{pct(sl.value)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </Frame>
  );
}

/** Funnel rows: each stage's bar, and the gap under it. */
const STAGE_H = 30;
const STAGE_GAP = 6;

function FunnelChart({ spec }: { spec: ChartSpec }) {
  const stages = pieSlices(spec);
  if (!stages.length) return null;
  const fmt = unitFormatter(spec.y_axis?.unit as Unit);
  const top = stages[0].value;

  // As on the web: the touched stage and its value, plus how much of the first stage is left by then.
  const tip = (_w: number, _win: Win, at: ChartTouch): Tip | null => {
    const i = Math.floor(at.y / (STAGE_H + STAGE_GAP));
    if (i < 0 || i >= stages.length) return null;
    const st = stages[i];
    const color = FUNNEL[Math.min(i, FUNNEL.length - 1)];
    return {
      index: i,
      at: { x: at.x, y: i * (STAGE_H + STAGE_GAP) + STAGE_H + 6 },
      title: st.name,
      rows: [
        { color, label: spec.series[0]?.name || 'Value', value: fmt(st.value) },
        ...(i > 0 ? [{ color, label: 'Of the first stage', value: `${((st.value / top) * 100).toFixed(1)}%` }] : []),
      ],
    };
  };

  return (
    <Frame spec={spec} tip={tip} fixedHeight={false}>
      {(_w, _win, active) => (
        <View style={{ gap: STAGE_GAP }}>
          {stages.map((st, i) => (
            <View key={i} style={[{ alignItems: 'center' }, active?.index !== undefined && active.index !== i && s.dimmed]}>
              <View style={[s.funnelBar, { width: `${Math.max(14, (st.value / top) * 100)}%`, backgroundColor: FUNNEL[Math.min(i, FUNNEL.length - 1)] }]}>
                <Text style={s.funnelText} numberOfLines={1}>
                  {st.name} · {compact(st.value)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </Frame>
  );
}

// ── Fallback + dispatch ─────────────────────────────────────────────────────

function Unsupported({ spec }: { spec: ChartSpec }) {
  return (
    <View style={s.card}>
      {spec.title ? <Text style={s.title}>{spec.title}</Text> : null}
      <Text style={s.note}>This {spec.chart_type.replace('_', ' ')} chart is drawn on the web app. Open the same chat there to see it.</Text>
    </View>
  );
}

export function ChartView({ spec }: { spec: ChartSpec }) {
  try {
    switch (spec.chart_type) {
      case 'line':
        return <LineChart spec={spec} />;
      case 'candlestick':
        return <CandleChart spec={spec} />;
      case 'bar':
        return <BarChart spec={spec} />;
      case 'histogram':
        return <HistogramChart spec={spec} />;
      case 'waterfall':
        return <WaterfallChart spec={spec} />;
      case 'scatter':
        return <ScatterChart spec={spec} />;
      case 'boxplot':
        return <BoxplotChart spec={spec} />;
      case 'pie':
        return <PieChart spec={spec} />;
      case 'funnel':
        return <FunnelChart spec={spec} />;
      default:
        return <Unsupported spec={spec} />;
    }
  } catch {
    return <Unsupported spec={spec} />;
  }
}

const s = StyleSheet.create({
  card: { borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 8 },
  title: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textPrimary },
  flex: { flex: 1 },
  fill: { width: '100%' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  action: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  tip: { position: 'absolute', padding: 9, gap: 5, borderRadius: 10, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: 'rgba(19,26,38,0.97)' },
  tipTitle: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textSecondary, marginBottom: 1 },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tipSwatch: { width: 8, height: 8, borderRadius: 4 },
  tipLabel: { flex: 1, fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  tipValue: { fontFamily: fonts.bold, fontSize: 12, color: colors.textPrimary },
  note: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.textTertiary },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  legendText: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  swatch: { width: 9, height: 9, borderRadius: 2 },
  pieRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pieValue: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textPrimary },
  piePct: { fontFamily: fonts.regular, fontSize: 12, color: colors.textTertiary, width: 46, textAlign: 'right' },
  dimmed: { opacity: 0.45 },
  funnelBar: { height: STAGE_H, borderRadius: 6, justifyContent: 'center', paddingHorizontal: 10 },
  funnelText: { fontFamily: fonts.semibold, fontSize: 12, color: '#f8fafc' },
});
