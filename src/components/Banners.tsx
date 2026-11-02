import NetInfo from '@react-native-community/netinfo';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { QuotaInfo } from '../api/errors';
import { Shine, shineGlow } from './Shine';
import { MIN_TOUCH, colors, radii, spacing, type, fonts } from '../theme/tokens';

export function useIsOffline(): boolean {
  const [offline, setOffline] = useState(false);
  useEffect(() => NetInfo.addEventListener(s => setOffline(s.isConnected === false || s.isInternetReachable === false)), []);
  return offline;
}

export function OfflineBanner() {
  return (
    <View style={[styles.bar, { backgroundColor: colors.dangerBg }]} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Text style={[styles.text, { color: colors.danger }]}>You're offline. Messages will send when you're back online.</Text>
    </View>
  );
}

/**
 * The free daily limit was reached. The card opens the in-app pricing screen;
 * checkout itself happens on the web app (see docs/RELEASE_CHECKLIST.md).
 */
export function QuotaCard({ quota, onSeePlans }: { quota: QuotaInfo | null; onSeePlans: () => void }) {
  const reset = quota?.resetAt ? new Date(quota.resetAt) : null;
  const resetLabel =
    reset && !Number.isNaN(reset.getTime())
      ? `Resets ${reset.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      : 'Resets daily';
  return (
    <View style={styles.quota} accessibilityRole="alert">
      <Text style={styles.quotaTitle}>You've used today's free messages</Text>
      {quota ? (
        <Text style={styles.quotaBody}>
          {quota.used} of {quota.limit} used. {resetLabel}.
        </Text>
      ) : null}
      <Pressable
        onPress={onSeePlans}
        accessibilityRole="button"
        accessibilityLabel="See plans and pricing"
        style={[styles.cta, shineGlow]}>
        <Shine radius={radii.sm} />
        <Text style={styles.ctaText}>See plans</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  text: { ...type.small },
  cta: {
    minHeight: MIN_TOUCH - 8,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { ...type.small, color: colors.onPrimary, fontFamily: fonts.semibold },
  quota: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'flex-start',
  },
  quotaTitle: { ...type.body, fontFamily: fonts.bold },
  quotaBody: { ...type.small },
});
