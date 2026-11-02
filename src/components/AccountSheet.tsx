import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Entitlements } from '../api/schemas';
import { PLAN_NAME } from '../lib/plans';
import { MIN_TOUCH, colors, fonts, radii, spacing, type } from '../theme/tokens';
import { Icon } from './Icon';
import { Shine, shineGlow } from './Shine';

interface Props {
  visible: boolean;
  onClose: () => void;
  identity: string;
  entitlements: Entitlements | null;
  onPricing: () => void;
  onHistory: () => void;
  onSignOut: () => void;
}

function resetLabel(iso: string | null): string {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime())
    ? `Resets ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : 'Resets daily';
}

/**
 * The account menu, as a branded bottom sheet instead of a system alert. It
 * leads with what the person has (plan, today's usage) and the one action that
 * changes it, so plans are always one tap from the chat.
 */
export function AccountSheet({ visible, onClose, identity, entitlements, onPricing, onHistory, onSignOut }: Props) {
  const insets = useSafeAreaInsets();
  const plan = entitlements?.plan ?? 'free';
  const paid = plan !== 'free';
  const q = entitlements?.quota;
  const metered = q && !q.unlimited && q.limit > 0;
  const usedPct = metered ? Math.min(1, q.used / q.limit) : 0;
  const go = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close account menu" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} accessibilityViewIsModal>
        <View style={styles.grabber} />

        <View style={styles.who}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(identity[0] ?? 'K').toUpperCase()}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.identity} numberOfLines={1}>
              {identity}
            </Text>
            <View style={[styles.planBadge, paid && styles.planBadgePaid]}>
              <Text style={[styles.planBadgeText, paid && { color: colors.onPrimary }]}>
                {paid ? `${PLAN_NAME[plan]} plan` : 'Free plan'}
              </Text>
            </View>
          </View>
        </View>

        {metered ? (
          <View style={styles.usage} accessible accessibilityLabel={`${q.used} of ${q.limit} free messages used today. ${resetLabel(q.resetAt)}`}>
            <View style={styles.usageRow}>
              <Text style={styles.usageTitle}>Today's free messages</Text>
              <Text style={styles.usageCount}>
                {q.used}/{q.limit}
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${usedPct * 100}%` }, usedPct >= 0.8 && { backgroundColor: colors.danger }]} />
            </View>
            <Text style={styles.usageHint}>{resetLabel(q.resetAt)}</Text>
          </View>
        ) : null}

        {paid ? null : (
          <Pressable
            onPress={go(onPricing)}
            accessibilityRole="button"
            accessibilityLabel="Remove the daily limit, see plans"
            style={({ pressed }) => [styles.upgrade, shineGlow, pressed && { opacity: 0.9 }]}>
            <Shine radius={radii.lg} />
            <View style={styles.flex}>
              <Text style={styles.upgradeTitle}>Remove the daily limit</Text>
              <Text style={styles.upgradeSub}>Pro or Ultra · unlimited questions · cancel anytime</Text>
            </View>
            <Icon name="arrow-right" size={22} color={colors.onPrimary} />
          </Pressable>
        )}

        <View style={styles.rows}>
          <Row label="Chat history" onPress={go(onHistory)} />
          <Row label={paid ? 'Your plan & pricing' : 'Plans & pricing'} onPress={go(onPricing)} />
          <Row label="Sign out" onPress={go(onSignOut)} destructive />
        </View>
      </View>
    </Modal>
  );
}

function Row({ label, onPress, destructive }: { label: string; onPress: () => void; destructive?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceHover }]}>
      <Text style={[styles.rowText, destructive && { color: colors.error }]}>{label}</Text>
      {destructive ? null : <Icon name="chevron" size={20} color={colors.textTertiary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl + 4,
    borderTopRightRadius: radii.xl + 4,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    gap: spacing.lg,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.xs },
  flex: { flex: 1 },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.userBubble, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.bold, fontSize: 20, color: colors.onPrimary },
  identity: { ...type.body, fontFamily: fonts.semibold },
  planBadge: { alignSelf: 'flex-start', marginTop: 4, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 2, backgroundColor: colors.surfaceElevated },
  planBadgePaid: { backgroundColor: '#6d6cf0' },
  planBadgeText: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.8, color: colors.textSecondary },
  usage: { backgroundColor: colors.background, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  usageRow: { flexDirection: 'row', justifyContent: 'space-between' },
  usageTitle: { ...type.small, color: colors.textSecondary },
  usageCount: { fontFamily: fonts.mono, fontSize: 13, color: colors.textPrimary },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceElevated, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  usageHint: { ...type.eyebrow, fontSize: 10 },
  upgrade: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  upgradeTitle: { ...type.body, fontFamily: fonts.bold, color: colors.onPrimary },
  upgradeSub: { ...type.small, fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  rows: { borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: {
    minHeight: MIN_TOUCH + 8,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowText: { ...type.body },
});
