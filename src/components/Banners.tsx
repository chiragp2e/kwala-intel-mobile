import NetInfo from '@react-native-community/netinfo';
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { QuotaInfo } from '../api/errors';
import { env } from '../config/env';
import { MIN_TOUCH, colors, radii, spacing, type } from '../theme/tokens';

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

export function GuestBanner({ onSignUp, onDismiss }: { onSignUp: () => void; onDismiss: () => void }) {
  return (
    <View style={styles.guest}>
      <Text style={styles.guestText} numberOfLines={3}>
        <Text style={styles.bold}>You're browsing as a guest. </Text>
        Sign up for free to chat with our AI Market Analyst.
      </Text>
      <Pressable onPress={onSignUp} accessibilityRole="button" accessibilityLabel="Sign up for free" style={styles.cta}>
        <Text style={styles.ctaText}>Sign up for free</Text>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={8}
        style={styles.close}>
        <Text style={styles.closeText}>×</Text>
      </Pressable>
    </View>
  );
}

/**
 * The free daily limit was reached. Payments are not part of this app, so the
 * card points to the web app for plans. (Store policy on linking out to
 * purchase is a release check; see docs/RELEASE_CHECKLIST.md.)
 */
export function QuotaCard({ quota }: { quota: QuotaInfo | null }) {
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
        onPress={() => void Linking.openURL(`${env.webBaseUrl}/pricing`).catch(() => {})}
        accessibilityRole="link"
        accessibilityLabel="See plans on the Kwala website"
        style={styles.cta}>
        <Text style={styles.ctaText}>See plans on the web</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  text: { ...type.small },
  guest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  guestText: { ...type.small, flex: 1, color: colors.textSecondary },
  bold: { fontWeight: '700', color: colors.textPrimary },
  cta: {
    minHeight: MIN_TOUCH - 8,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { ...type.small, color: colors.onPrimary, fontWeight: '600' },
  close: { width: MIN_TOUCH - 8, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.textTertiary, fontSize: 24 },
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
  quotaTitle: { ...type.body, fontWeight: '700' },
  quotaBody: { ...type.small },
});
