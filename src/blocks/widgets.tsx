import React, { Component, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii, spacing } from '../theme/tokens';
import { hasAppAction, runAppAction } from './lib/actions';
import { cellFigure, resolveDelta, rowName, statFigure } from './lib/figure';
import { compact, deltaRole, formatDelta, formatValue } from './lib/format';
import { rMultiple, spanPct, valuePct } from './lib/track';
import { useBlockHost } from './host';
import { ROLE_COLOR, ROLE_GLYPH, ROLE_WASH, role } from './roles';
import { Sparkline } from './Sparkline';
import type {
  ActionItem,
  ActionsWidget,
  ChipWidget,
  LadderWidget,
  PillWidget,
  PositionWidget,
  SparklineWidget,
  SplitWidget,
  StatWidget,
  TableColumn,
  TableWidget,
  TimelineWidget,
  TrackWidget,
  VerdictWidget,
  Widget,
} from './types';


// ── Stat, chip, pill ────────────────────────────────────────────────────────

export function DeltaChip({ widget }: { widget: ChipWidget }) {
  const delta = resolveDelta(widget.delta, widget.label);
  const r = delta.signed === false ? 'neutral' : deltaRole(delta);
  return (
    <View style={[s.chip, { backgroundColor: ROLE_WASH[r] }]}>
      {widget.label ? <Text style={s.chipDim}>{widget.label}</Text> : null}
      <Text style={[s.chipText, { color: ROLE_COLOR[r] }]}>{formatDelta(delta)}</Text>
      {delta.period ? <Text style={s.chipDim}>{delta.period}</Text> : null}
    </View>
  );
}

export function StatusPill({ widget }: { widget: PillWidget }) {
  const r = role(widget.role, 'neutral');
  return (
    <View style={[s.pill, { backgroundColor: ROLE_WASH[r] }]}>
      <Text style={[s.pillGlyph, { color: ROLE_COLOR[r] }]}>{ROLE_GLYPH[r]}</Text>
      <Text style={s.pillText}>{widget.label}</Text>
    </View>
  );
}

export function StatTile({ widget }: { widget: StatWidget }) {
  const { label, delta, trend, emphasis, caption } = widget;
  const hero = emphasis === 'hero';
  return (
    <View style={s.card}>
      <Text style={s.label} numberOfLines={1}>
        {label}
      </Text>
      <View style={s.statRow}>
        <Text style={[s.statValue, hero && s.statHero]} adjustsFontSizeToFit numberOfLines={1}>
          {statFigure(widget)}
        </Text>
        {delta ? <DeltaChip widget={{ kind: 'chip', delta }} /> : null}
      </View>
      {trend && trend.length > 1 ? (
        <View style={{ marginTop: 6 }}>
          <Sparkline values={trend} role={delta ? deltaRole(delta) : 'info'} height={hero ? 44 : 28} />
        </View>
      ) : null}
      {caption ? <Text style={s.caption}>{caption}</Text> : null}
    </View>
  );
}

function SparklineCard({ widget }: { widget: SparklineWidget }) {
  const { label, values, value, unit } = widget;
  return (
    <View style={s.card}>
      {label || value !== undefined ? (
        <View style={s.between}>
          {label ? (
            <Text style={s.label} numberOfLines={1}>
              {label}
            </Text>
          ) : (
            <View />
          )}
          {value !== undefined ? (
            <Text style={[s.smallValue, { color: ROLE_COLOR[role(widget.role, 'neutral')] }]}>
              {typeof value === 'number' ? formatValue(value, unit) : value}
            </Text>
          ) : null}
        </View>
      ) : null}
      <Sparkline values={values} role={widget.role} />
    </View>
  );
}

// ── Verdict, split, position ────────────────────────────────────────────────

export function VerdictCard({ widget }: { widget: VerdictWidget }) {
  const r = role(widget.role, 'neutral');
  const conviction = typeof widget.conviction === 'number' ? valuePct(widget.conviction, 0, 100) : undefined;
  return (
    <View style={[s.cardPlain, { backgroundColor: ROLE_WASH[r], paddingHorizontal: 14, paddingVertical: 12 }]}>
      <View style={s.row}>
        <Text style={[s.pillGlyph, { color: ROLE_COLOR[r] }]}>{ROLE_GLYPH[r]}</Text>
        <Text style={s.verdictCall}>{widget.call}</Text>
      </View>
      {conviction !== undefined ? (
        <View style={{ marginTop: 10 }}>
          <View style={s.between}>
            <Text style={s.eyebrow}>CONVICTION</Text>
            <Text style={s.smallValue}>{Math.round(widget.conviction!)}%</Text>
          </View>
          <View style={s.meterTrack}>
            <View style={[s.meterFill, { width: `${conviction}%`, backgroundColor: ROLE_COLOR[r] }]} />
          </View>
        </View>
      ) : null}
      {widget.rationale ? <Text style={s.body}>{widget.rationale}</Text> : null}
      {widget.caption ? <Text style={s.caption}>{widget.caption}</Text> : null}
    </View>
  );
}

function Side({ title, items, r }: { title: string; items: string[]; r?: string }) {
  const rr = role(r, 'neutral');
  return (
    <View style={[s.card, { flex: 1 }]}>
      <View style={s.row}>
        <Text style={[s.pillGlyph, { color: ROLE_COLOR[rr] }]}>{ROLE_GLYPH[rr]}</Text>
        <Text style={s.sideTitle}>{title.toUpperCase()}</Text>
      </View>
      <View style={{ marginTop: 8, gap: 6 }}>
        {items.map((it, i) => (
          <View key={i} style={s.bullet}>
            <View style={[s.dot, { backgroundColor: ROLE_COLOR[rr] }]} />
            <Text style={s.bulletText}>{it}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function SplitCard({ widget }: { widget: SplitWidget }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Side title={widget.left.title} items={widget.left.items} r={widget.left.role ?? 'bullish'} />
      <Side title={widget.right.title} items={widget.right.items} r={widget.right.role ?? 'bearish'} />
    </View>
  );
}

export function PositionCard({ widget }: { widget: PositionWidget }) {
  const { symbol, size, cost_basis, price, unit = 'usd', caption } = widget;
  const pnl = (price - cost_basis) * size;
  const cost = cost_basis * size;
  const pnlPct = cost === 0 ? 0 : (pnl / Math.abs(cost)) * 100;
  const cell = (label: string, body: string) => (
    <View style={s.posCell}>
      <Text style={s.eyebrow}>{label.toUpperCase()}</Text>
      <Text style={s.posValue} numberOfLines={1}>
        {body}
      </Text>
    </View>
  );
  return (
    <View style={s.card}>
      <View style={[s.between, { marginBottom: 10 }]}>
        <Text style={s.symbol}>{symbol}</Text>
        <DeltaChip widget={{ kind: 'chip', delta: { value: pnlPct, unit: 'percent' } }} />
      </View>
      <View style={s.posGrid}>
        {cell('Size', compact(size))}
        {cell('Cost basis', formatValue(cost_basis, unit))}
        {cell('Market value', compact(size * price, unit))}
        {cell('Unrealized', compact(pnl, unit))}
      </View>
      {caption ? <Text style={s.caption}>{caption}</Text> : null}
    </View>
  );
}

// ── Track ───────────────────────────────────────────────────────────────────

function Marker({ pct, r, hollow }: { pct: number; r?: string; hollow?: boolean }) {
  return (
    <View
      style={[
        s.marker,
        { left: `${pct}%`, height: hollow ? 16 : 20, backgroundColor: ROLE_COLOR[role(r, 'neutral')] },
      ]}
    />
  );
}

export function Track({ widget }: { widget: TrackWidget }) {
  const { variant, min, max, value, target, range, bands, markers, unit, label, caption } = widget;
  const fmt = (v: number) => formatValue(v, unit);
  const list = markers ?? [];
  const named = (name: string) => list.find(m => m.name === name)?.at;
  const R = variant === 'risk_reward' ? rMultiple(named('entry'), named('stop'), named('target')) : undefined;
  const valueAt = typeof value === 'number' ? valuePct(value, min, max) : undefined;
  const labelled = list.filter(m => m.label);
  const rr = (a: number, b: number) => spanPct(a, b, min, max);

  return (
    <View style={s.card}>
      {label || typeof value === 'number' ? (
        <View style={[s.between, { marginBottom: 10 }]}>
          {label ? <Text style={s.trackLabel}>{label}</Text> : <View />}
          {typeof value === 'number' ? <Text style={s.trackValue}>{fmt(value)}</Text> : null}
        </View>
      ) : null}

      <View style={s.track}>
        {bands?.map((b, i) => {
          const { left, width } = rr(b.from, b.to);
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: ROLE_WASH[role(b.role, 'neutral')],
                borderTopLeftRadius: i === 0 ? 6 : 0,
                borderBottomLeftRadius: i === 0 ? 6 : 0,
                borderTopRightRadius: i === bands.length - 1 ? 6 : 0,
                borderBottomRightRadius: i === bands.length - 1 ? 6 : 0,
              }}
            />
          );
        })}
        {variant === 'meter' && valueAt !== undefined ? (
          <View
            style={[
              s.meterFill,
              {
                position: 'absolute',
                height: '100%',
                width: `${valueAt}%`,
                backgroundColor: ROLE_COLOR[role(bands?.find(b => value! >= b.from && value! <= b.to)?.role, 'info')],
              },
            ]}
          />
        ) : null}
        {range ? (
          <View
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${rr(range[0], range[1]).left}%`,
              width: `${rr(range[0], range[1]).width}%`,
              borderRadius: 6,
              backgroundColor: 'rgba(129,140,248,0.28)',
              borderWidth: 1,
              borderColor: 'rgba(129,140,248,0.5)',
            }}
          />
        ) : null}
        {variant === 'risk_reward' && named('entry') !== undefined ? (
          <>
            {named('stop') !== undefined ? (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${rr(named('stop')!, named('entry')!).left}%`,
                  width: `${rr(named('stop')!, named('entry')!).width}%`,
                  backgroundColor: ROLE_WASH.bearish,
                }}
              />
            ) : null}
            {named('target') !== undefined ? (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${rr(named('entry')!, named('target')!).left}%`,
                  width: `${rr(named('entry')!, named('target')!).width}%`,
                  backgroundColor: ROLE_WASH.bullish,
                }}
              />
            ) : null}
          </>
        ) : null}
        {variant !== 'meter' && valueAt !== undefined ? <Marker pct={valueAt} r="neutral" /> : null}
        {typeof target === 'number' ? <Marker pct={valuePct(target, min, max)} r="info" hollow /> : null}
        {list.map((m, i) => (
          <Marker key={i} pct={valuePct(m.at, min, max)} r={m.role} />
        ))}
      </View>

      {/* Labelled markers are listed beneath: phone-width tracks have no room for
          labels hung off the bar without overlapping each other. */}
      {labelled.length > 0 ? (
        <View style={s.legend}>
          {labelled.map((m, i) => (
            <View key={i} style={s.legendItem}>
              <View style={[s.legendMark, { backgroundColor: ROLE_COLOR[role(m.role, 'neutral')] }]} />
              <Text style={s.eyebrow} numberOfLines={1}>
                {String(m.label).toUpperCase()}
              </Text>
              <Text style={[s.smallValue, { color: ROLE_COLOR[role(m.role, 'neutral')] }]}>{fmt(m.at)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[s.between, { marginTop: 8 }]}>
        <Text style={s.scale}>{fmt(min)}</Text>
        {R !== undefined ? <Text style={s.smallValue}>{R}R</Text> : null}
        {caption && R === undefined ? <Text style={[s.caption, { flex: 1, textAlign: 'center', marginTop: 0 }]}>{caption}</Text> : null}
        <Text style={s.scale}>{fmt(max)}</Text>
      </View>
    </View>
  );
}

// ── Timeline ────────────────────────────────────────────────────────────────

function parseTs(ts: number | string | undefined): number | undefined {
  if (ts === undefined) return undefined;
  const ms = typeof ts === 'number' ? ts : Date.parse(String(ts).replace(' ', 'T'));
  return Number.isFinite(ms) ? ms : undefined;
}

export function Timeline({ widget }: { widget: TimelineWidget }) {
  const events = [...widget.events]
    .map(e => ({ ...e, ms: parseTs(e.ts) }))
    .sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity));
  if (!events.length) return null;
  return (
    <View style={[s.card, { paddingVertical: 14 }]}>
      {events.map((e, i) => {
        const r = role(e.role, 'info');
        return (
          <View key={i} style={s.tlRow}>
            <View style={s.tlRail}>
              <View style={[s.tlDot, { backgroundColor: ROLE_COLOR[r] }]} />
              {i < events.length - 1 ? <View style={s.tlLine} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: i < events.length - 1 ? 14 : 0 }}>
              <View style={s.tlHead}>
                <Text style={s.tlTitle}>{e.title}</Text>
                <Text style={[s.tlDate, { color: e.ms === undefined ? colors.textTertiary : ROLE_COLOR[r] }]}>
                  {e.ms === undefined
                    ? 'Date TBC'
                    : new Date(e.ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
              </View>
              {e.detail ? <Text style={s.tlDetail}>{e.detail}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Table ───────────────────────────────────────────────────────────────────

const HEAT_MAX = 0.26;

function cellText(value: unknown, col: TableColumn, name?: string): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return cellFigure(value, col, name);
  return String(value);
}

export function DataTable({ widget }: { widget: TableWidget }) {
  const { columns, rows, caption } = widget;
  if (!columns.length || !rows.length) return null;

  const maxAbs = new Map<string, number>();
  for (const col of columns) {
    if (col.format !== 'heat') continue;
    const vals = rows.map(r => r[col.key]).filter((v): v is number => typeof v === 'number');
    maxAbs.set(col.key, vals.length ? Math.max(...vals.map(Math.abs)) : 0);
  }
  const left = (col: TableColumn) => (col.align ?? (col.format === 'text' ? 'left' : 'right')) === 'left';
  // First column (the name) is wider; numbers hug their content.
  const widthOf = (col: TableColumn, i: number) => (col.format === 'spark' ? 88 : i === 0 ? 120 : 92);

  return (
    <View style={[s.cardPlain, { overflow: 'hidden' }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false} nestedScrollEnabled>
        <View>
          <View style={[s.trow, s.thead]}>
            {columns.map((col, i) => (
              <Text key={col.key} style={[s.th, { width: widthOf(col, i), textAlign: left(col) ? 'left' : 'right' }]} numberOfLines={1}>
                {col.label.toUpperCase()}
              </Text>
            ))}
          </View>
          {rows.map((row, ri) => (
            <View key={ri} style={[s.trow, ri < rows.length - 1 && s.rowLine]}>
              {columns.map((col, i) => {
                const raw = row[col.key];
                if (col.format === 'spark') {
                  return (
                    <View key={col.key} style={{ width: widthOf(col, i), paddingHorizontal: 10, justifyContent: 'center' }}>
                      <Sparkline values={Array.isArray(raw) ? (raw as number[]) : []} height={20} />
                    </View>
                  );
                }
                const heat = col.format === 'heat' && typeof raw === 'number';
                const strength = heat ? (Math.abs(raw as number) / (maxAbs.get(col.key) || 1)) * HEAT_MAX : 0;
                return (
                  <Text
                    key={col.key}
                    numberOfLines={1}
                    style={[
                      s.td,
                      { width: widthOf(col, i), textAlign: left(col) ? 'left' : 'right' },
                      heat && { backgroundColor: `rgba(${(raw as number) >= 0 ? '16,217,138' : '242,85,107'},${strength.toFixed(3)})` },
                    ]}>
                    {cellText(raw, col, rowName(row, columns))}
                  </Text>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
      {caption ? <Text style={[s.caption, { paddingHorizontal: 10, paddingVertical: 8, marginTop: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>{caption}</Text> : null}
    </View>
  );
}

// ── Ladder ──────────────────────────────────────────────────────────────────

export function Ladder({ widget }: { widget: LadderWidget }) {
  const { levels, mid, unit = 'usd' } = widget;
  if (!levels.length) return null;
  const peak = Math.max(...levels.flatMap(l => [l.bid ?? 0, l.ask ?? 0]), 0);
  const rows = [...levels].sort((a, b) => b.price - a.price);
  const pct = (v?: number) => (peak === 0 || !v ? 0 : (v / peak) * 100);
  return (
    <View style={[s.card, { paddingHorizontal: 10 }]}>
      <View style={s.ladRow}>
        <Text style={[s.eyebrow, { flex: 1, textAlign: 'right' }]}>BID</Text>
        <Text style={[s.eyebrow, { width: 84, textAlign: 'center' }]}>PRICE</Text>
        <Text style={[s.eyebrow, { flex: 1 }]}>ASK</Text>
      </View>
      {rows.map((l, i) => {
        const crossed = mid !== undefined && l.price === mid;
        return (
          <View key={i} style={[s.ladRow, crossed && s.ladMid]}>
            <View style={s.ladSide}>
              <View style={[s.ladBar, { right: 0, width: `${pct(l.bid)}%`, backgroundColor: ROLE_WASH.bullish }]} />
              <Text style={[s.ladNum, { textAlign: 'right' }]}>{l.bid ? formatValue(l.bid, 'number') : ''}</Text>
            </View>
            <Text style={[s.ladPrice, crossed && { color: colors.textPrimary }]}>{formatValue(l.price, unit)}</Text>
            <View style={s.ladSide}>
              <View style={[s.ladBar, { left: 0, width: `${pct(l.ask)}%`, backgroundColor: ROLE_WASH.bearish }]} />
              <Text style={s.ladNum}>{l.ask ? formatValue(l.ask, 'number') : ''}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Actions ─────────────────────────────────────────────────────────────────

export function ActionChips({ widget }: { widget: ActionsWidget }) {
  const { onPrompt } = useBlockHost();
  const enabled = (i: ActionItem) => (i.action === 'prompt' ? Boolean(onPrompt) : hasAppAction(i.target));
  const run = (i: ActionItem) => (i.action === 'prompt' ? onPrompt?.(i.target) : runAppAction(i.target, i.params));
  const items = widget.items.filter(i => i && typeof i.label === 'string');
  if (!items.length) return null;
  return (
    <View style={s.actions}>
      {items.map((item, i) => {
        const live = enabled(item);
        return (
          <Pressable
            key={i}
            disabled={!live}
            onPress={() => run(item)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ disabled: !live }}
            style={({ pressed }) => [s.action, !live && s.actionOff, pressed && { backgroundColor: colors.surfaceHover }]}>
            <Text style={[s.actionText, !live && { color: colors.textTertiary }]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Dispatch ────────────────────────────────────────────────────────────────

/** One malformed widget must cost only itself. */
class WidgetBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Dispatch({ widget }: { widget: Widget }) {
  switch (widget.kind) {
    case 'stat':
      return <StatTile widget={widget} />;
    case 'track':
      return <Track widget={widget} />;
    case 'sparkline':
      return <SparklineCard widget={widget} />;
    case 'pill':
      return <StatusPill widget={widget} />;
    case 'chip':
      return <DeltaChip widget={widget} />;
    case 'verdict':
      return <VerdictCard widget={widget} />;
    case 'split':
      return <SplitCard widget={widget} />;
    case 'timeline':
      return <Timeline widget={widget} />;
    case 'table':
      return <DataTable widget={widget} />;
    case 'position':
      return <PositionCard widget={widget} />;
    case 'ladder':
      return <Ladder widget={widget} />;
    case 'actions':
      return <ActionChips widget={widget} />;
    default:
      return null;
  }
}

export function WidgetView({ widget }: { widget: Widget }) {
  return (
    <WidgetBoundary>
      <Dispatch widget={widget} />
    </WidgetBoundary>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardPlain: { borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  between: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  label: { fontFamily: fonts.regular, fontSize: 12, color: colors.textTertiary },
  eyebrow: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 0.9, color: colors.textTertiary },
  caption: { fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 16, color: colors.textTertiary, marginTop: 8 },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: 10 },
  smallValue: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textSecondary },
  scale: { fontFamily: fonts.regular, fontSize: 11, color: colors.textTertiary },
  statRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  statValue: { fontFamily: fonts.semibold, fontSize: 21, lineHeight: 28, color: colors.textPrimary, flexShrink: 1 },
  statHero: { fontSize: 34, lineHeight: 40 },
  chip: { flexDirection: 'row', alignItems: 'baseline', gap: 4, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
  chipText: { fontFamily: fonts.semibold, fontSize: 12.5 },
  chipDim: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textTertiary },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: radii.pill, paddingHorizontal: 11, paddingVertical: 5 },
  pillGlyph: { fontFamily: fonts.bold, fontSize: 10 },
  pillText: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textPrimary },
  verdictCall: { fontFamily: fonts.semibold, fontSize: 18, color: colors.textPrimary, flex: 1 },
  meterTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(148,163,184,0.18)', marginTop: 5, overflow: 'hidden' },
  meterFill: { height: 6, borderRadius: 3 },
  sideTitle: { fontFamily: fonts.semibold, fontSize: 11.5, letterSpacing: 0.8, color: colors.textPrimary },
  bullet: { flexDirection: 'row', gap: 8 },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 8 },
  bulletText: { flex: 1, fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 20, color: colors.textSecondary },
  symbol: { fontFamily: fonts.monoMedium, fontSize: 15, color: colors.textPrimary },
  posGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  posCell: { width: '50%', paddingRight: 8 },
  posValue: { fontFamily: fonts.medium, fontSize: 14, color: colors.textPrimary, marginTop: 2 },
  trackLabel: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary, flex: 1 },
  trackValue: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textPrimary },
  track: { height: 10, borderRadius: 6, backgroundColor: 'rgba(148,163,184,0.16)', justifyContent: 'center' },
  marker: { position: 'absolute', width: 4, borderRadius: 2, top: -5, marginLeft: -2, borderWidth: 2, borderColor: colors.surface },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendMark: { width: 4, height: 12, borderRadius: 2 },
  tlRow: { flexDirection: 'row', gap: 12 },
  tlRail: { width: 10, alignItems: 'center' },
  tlDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  tlLine: { flex: 1, width: 1, backgroundColor: colors.border, marginTop: 4 },
  tlHead: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 },
  tlTitle: { fontFamily: fonts.medium, fontSize: 14, color: colors.textPrimary },
  tlDate: { fontFamily: fonts.regular, fontSize: 11.5 },
  tlDetail: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.textSecondary, marginTop: 2 },
  trow: { flexDirection: 'row' },
  thead: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  th: { fontFamily: fonts.medium, fontSize: 10, letterSpacing: 0.7, color: colors.textTertiary, paddingHorizontal: 10, paddingVertical: 9 },
  td: { fontFamily: fonts.regular, fontSize: 13, color: colors.textPrimary, paddingHorizontal: 10, paddingVertical: 9 },
  ladRow: { flexDirection: 'row', alignItems: 'center', minHeight: 24, gap: 6 },
  ladMid: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  ladSide: { flex: 1, height: 20, justifyContent: 'center' },
  ladBar: { position: 'absolute', top: 1, bottom: 1, borderRadius: 3 },
  ladNum: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textSecondary, paddingHorizontal: 4 },
  ladPrice: { width: 84, textAlign: 'center', fontFamily: fonts.medium, fontSize: 12, color: colors.textSecondary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 8 },
  actionOff: { borderColor: colors.border, opacity: 0.7 },
  actionText: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.textPrimary },
});
