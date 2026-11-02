import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatRemaining, msUntil } from '../lib/countdown';
import { PLAN_FEATURES } from '../lib/plans';
import { colors, fonts, radii, spacing } from '../theme/tokens';
import { Icon } from './Icon';
import { FadeIn } from './motion';
import { Shine, shineGlow } from './Shine';

interface Props {
  visible: boolean;
  used: number;
  limit: number;
  /** When the free questions come back, from the server. */
  resetAt: string | null;
  /** The question they just tried to ask is waiting in the message box. */
  hasDraft?: boolean;
  onClose: () => void;
  onSeePlans: () => void;
  /** The reset time arrived while the modal was open: refresh the allowance. */
  onReset?: () => void;
}

/** Re-renders about once a second at the end and every 20s otherwise, enough for a "6h 12m" read-out. */
function useRemaining(resetAt: string | null, active: boolean, onReset?: () => void): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, [active, resetAt]);
  const left = msUntil(resetAt, now);
  const done = left !== null && left <= 0;
  useEffect(() => {
    if (active && done) onReset?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, done]);
  return left;
}

/**
 * Shown when the free daily questions are used up. It says exactly where the
 * person stands (5 of 5, back in 6h 12m), what upgrading changes, and keeps
 * one obvious way forward. Amber, not red: red means a falling price here.
 */
export function UpgradeModal({ visible, used, limit, resetAt, hasDraft, onClose, onSeePlans, onReset }: Props) {
  const left = useRemaining(resetAt, visible, onReset);
  const back = left !== null && left <= 0;
  const segments = Math.min(Math.max(limit, 1), 12);
  const filled = Math.min(segments, Math.round((Math.min(used, limit) / Math.max(limit, 1)) * segments));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root} accessibilityViewIsModal>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <FadeIn style={styles.card}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={styles.close}>
            <Icon name="close" size={20} color={colors.textTertiary} />
          </Pressable>

          <View style={styles.hero}>
            <View style={styles.halo} />
            <View style={styles.badge}>
              <Icon name="gauge" size={30} color={colors.danger} />
            </View>
          </View>

          <Text style={styles.eyebrow}>DAILY LIMIT REACHED</Text>
          <Text style={styles.title} accessibilityRole="header">
            {back ? 'Your free questions are back' : `You've used all ${limit} free questions today`}
          </Text>

          <View style={styles.meter} accessible accessibilityLabel={`${used} of ${limit} free questions used today`}>
            <View style={styles.segments}>
              {Array.from({ length: segments }, (_, i) => (
                <View key={i} style={[styles.segment, i < filled && styles.segmentOn]} />
              ))}
            </View>
            <Text style={styles.count}>
              {used}
              <Text style={styles.countOf}> / {limit}</Text>
            </Text>
          </View>

          <View style={styles.reset}>
            <Icon name="clock" size={15} color={colors.textTertiary} />
            <Text style={styles.resetText}>
              {back ? 'Resets now' : left === null ? 'Resets daily at midnight IST' : `Resets in ${formatRemaining(left)}`}
              {!back && left !== null ? <Text style={styles.resetDim}> · midnight IST</Text> : null}
            </Text>
          </View>

          <View style={styles.rule} />

          <Text style={styles.lead}>Upgrade and keep going</Text>
          <View style={styles.list}>
            {PLAN_FEATURES.pro.slice(0, 3).map(f => (
              <View key={f} style={styles.item}>
                <View style={styles.tick}>
                  <Icon name="check" size={12} color={colors.primaryNeon} />
                </View>
                <Text style={styles.itemText}>{f}</Text>
              </View>
            ))}
          </View>

          {hasDraft ? (
            <Text style={styles.draft}>Your question is saved in the message box. Send it as soon as you're back.</Text>
          ) : null}

          <Pressable
            onPress={onSeePlans}
            accessibilityRole="button"
            accessibilityLabel="See plans and upgrade"
            style={({ pressed }) => [styles.cta, shineGlow, pressed && { opacity: 0.9 }]}>
            <Shine radius={radii.lg} />
            <Icon name="sparkles" size={17} color={colors.onPrimary} />
            <Text style={styles.ctaText}>See plans & upgrade</Text>
          </Pressable>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Not now" style={styles.later}>
            <Text style={styles.laterText}>{back ? 'Keep chatting' : 'Not now'}</Text>
          </Pressable>
        </FadeIn>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 18,
  },
  close: { position: 'absolute', top: 10, right: 10, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  hero: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  halo: { position: 'absolute', width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(245,158,11,0.10)' },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.4)',
  },
  eyebrow: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 2, color: colors.danger },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, textAlign: 'center', color: colors.textPrimary },
  meter: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs },
  segments: { flex: 1, flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceHover },
  segmentOn: { backgroundColor: colors.danger },
  count: { fontFamily: fonts.mono, fontSize: 16, color: colors.textPrimary },
  countOf: { color: colors.textTertiary },
  reset: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resetText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
  resetDim: { fontFamily: fonts.regular, color: colors.textTertiary },
  rule: { alignSelf: 'stretch', height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  lead: { alignSelf: 'flex-start', fontFamily: fonts.semibold, fontSize: 15, color: colors.textPrimary },
  list: { alignSelf: 'stretch', gap: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tick: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,255,136,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(0,255,136,0.28)',
  },
  itemText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, color: colors.textSecondary },
  draft: { alignSelf: 'stretch', fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, color: colors.textTertiary },
  cta: {
    alignSelf: 'stretch',
    minHeight: 50,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.xs,
  },
  ctaText: { fontFamily: fonts.bold, fontSize: 16, color: colors.onPrimary },
  later: { minHeight: 40, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  laterText: { fontFamily: fonts.medium, fontSize: 14, color: colors.textTertiary },
});
