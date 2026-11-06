import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { formatMs, summarize, type ActivityItem } from '../chat/activity';
import { colors, fonts, radii, spacing } from '../theme/tokens';
import { Icon } from './Icon';
import { useReduceMotion } from './motion';

/** Re-renders on a one-second beat, only while something is running. */
function useTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** The web's `animate-spin` ring: 12px, 1.5px stroke, open at the top, one turn a second. */
function Spinner({ color }: { color: string }) {
  const reduce = useReduceMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    turn.value = withRepeat(withTiming(1, { duration: 1000, easing: Easing.linear }), -1);
    return () => cancelAnimation(turn);
  }, [turn, reduce]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  return <Animated.View style={[styles.spinner, { borderColor: color }, styles.spinnerGap, spin]} />;
}

function Row({ item, now }: { item: ActivityItem; now: number }) {
  const running = item.state === 'running';
  const failed = item.state === 'error';
  const color = running ? colors.textSecondary : failed ? 'rgba(239,68,68,0.8)' : colors.textTertiary;
  const elapsed = running ? formatMs(now - item.startedAt) : item.ms ? formatMs(item.ms) : '';
  return (
    <View style={styles.row}>
      <View style={styles.slot}>
        {running ? (
          <Spinner color={color} />
        ) : failed ? (
          <Icon name="alert-triangle" size={13} color={color} />
        ) : (
          <View style={styles.done}>
            <Icon name="check" size={14} color={colors.textTertiary} />
          </View>
        )}
      </View>
      <Text style={[styles.label, { color }]}>{item.label}</Text>
      {elapsed ? <Text style={styles.elapsed}>· {elapsed}</Text> : null}
    </View>
  );
}

/**
 * What the agent is doing while it does it, as the web app shows it
 * (kwala-intel-fe/src/components/ActivityFeed.tsx): the plan in prose, then a
 * row per tool call ticking from spinner to check. Once the answer starts it
 * folds to one line ("Checked 4 sources · 12s") that opens on tap.
 */
export function ActivityFeed({ items, thinking, collapsed }: { items: ActivityItem[]; thinking: string; collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const running = items.some(i => i.state === 'running');
  const now = useTick(running);

  if (!items.length && !thinking.trim()) return null;

  const foldable = collapsed && items.length > 0;
  const showRows = !foldable || open;
  const narration = thinking.trim() ? <Text style={styles.narration}>{thinking}</Text> : null;

  return (
    <View style={styles.box} accessibilityLiveRegion={running ? 'polite' : 'none'}>
      {foldable ? (
        <Pressable
          onPress={() => setOpen(v => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          hitSlop={8}
          style={styles.toggle}>
          <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
            <Icon name="chevron" size={14} color={colors.textTertiary} />
          </View>
          <Text style={styles.summary}>{summarize(items, now)}</Text>
        </Pressable>
      ) : (
        narration
      )}
      {showRows ? (
        <>
          {foldable && open ? narration : null}
          {items.length > 0 ? (
            <View style={styles.rows}>
              {items.map(item => (
                <Row key={item.id} item={item} now={now} />
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceElevated,
    backgroundColor: 'rgba(15,22,35,0.3)',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: 10,
  },
  narration: { fontFamily: fonts.regular, fontSize: 13.6, lineHeight: 22, color: colors.textSecondary },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summary: { fontFamily: fonts.regular, fontSize: 12, color: colors.textTertiary },
  rows: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  slot: { width: 14, height: 18, alignItems: 'center', justifyContent: 'center' },
  spinner: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5 },
  spinnerGap: { borderTopColor: 'transparent' },
  done: { opacity: 0.6 },
  label: { flex: 1, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18 },
  elapsed: { fontFamily: fonts.mono, fontSize: 11.5, lineHeight: 18, color: colors.textTertiary, opacity: 0.8 },
});
