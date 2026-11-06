import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatError } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { AddPhone } from '../components/AddPhone';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon, type IconName } from '../components/Icon';
import { displayName, formatPhone, initials, realEmail } from '../lib/identity';
import { PLAN_NAME } from '../lib/plans';
import type { ScreenProps } from '../navigation/types';
import { useEntitlements, useProfile, useUpdateDisplayName } from '../state/queries';
import { MIN_TOUCH, colors, fonts, radii, spacing, type } from '../theme/tokens';

/**
 * The signed-in account, laid out as the web app's Profile page
 * (kwala-intel-fe/src/pages/Profile.tsx): who you are, your display name (the
 * one thing you can edit here), your email and mobile number with whether they
 * are confirmed, and your plan with today's usage. About the company, the
 * policies and sign out sit below.
 */
export function ProfileScreen({ navigation }: ScreenProps<'Profile'>) {
  const insets = useSafeAreaInsets();
  const { status, user, signOut } = useAuth();
  const profileQuery = useProfile();
  const profile = profileQuery.data ?? null;
  const { data: entitlements } = useEntitlements();
  const save = useUpdateDisplayName();

  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [addingPhone, setAddingPhone] = useState(false);
  const [phoneAdded, setPhoneAdded] = useState(false);

  // The field starts from the stored name, and follows it until the user edits.
  const stored = profile?.display_name ?? '';
  useEffect(() => setDraft(stored), [stored]);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);
  useEffect(() => {
    if (!phoneAdded) return;
    const t = setTimeout(() => setPhoneAdded(false), 3000);
    return () => clearTimeout(t);
  }, [phoneAdded]);

  if (status !== 'signedIn' || !user) {
    return (
      <View style={styles.center}>
        <Text style={styles.h}>Sign in to see your profile</Text>
        <Button label="Sign in" onPress={() => navigation.navigate('SignIn')} />
      </View>
    );
  }

  const name = displayName(profile, user);
  const email = realEmail(user.email);
  const plan = entitlements?.plan ?? 'free';
  const paid = plan !== 'free';
  const q = entitlements?.quota;
  const metered = q && !q.unlimited && q.limit > 0;
  const usedPct = metered ? Math.min(1, q.used / q.limit) : 0;
  const changed = draft.trim() !== stored.trim() && draft.trim().length > 0;
  const saveError = save.error
    ? save.error instanceof ChatError
      ? save.error.failure.message
      : 'Failed to update profile'
    : null;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.who}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(name)}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.contact} numberOfLines={1}>
              {email ?? (user.phone ? formatPhone(user.phone) : '')}
            </Text>
            <View style={[styles.planBadge, paid && styles.planBadgePaid]}>
              <Text style={[styles.planBadgeText, paid && { color: colors.onPrimary }]}>{paid ? `${PLAN_NAME[plan]} plan` : 'Free plan'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Display name</Text>
          <TextInput
            value={draft}
            onChangeText={t => {
              setDraft(t);
              setSaved(false);
              save.reset();
            }}
            placeholder={profileQuery.isLoading ? 'Loading…' : 'Your display name'}
            placeholderTextColor={colors.textTertiary}
            maxLength={100}
            autoCapitalize="words"
            returnKeyType="done"
            accessibilityLabel="Display name"
            style={styles.input}
            selectionColor={colors.primaryNeon}
          />
          {saved ? (
            <Text style={styles.success} accessibilityLiveRegion="polite">
              Profile updated successfully
            </Text>
          ) : null}
          {saveError ? (
            <Text style={styles.error} accessibilityRole="alert">
              {saveError}
            </Text>
          ) : null}
          <Button
            label={save.isPending ? 'Saving...' : 'Save changes'}
            onPress={() => save.mutate(draft.trim(), { onSuccess: () => setSaved(true) })}
            disabled={!changed || save.isPending}
            loading={save.isPending}
          />
        </View>

        <View style={styles.card}>
          <Detail
            icon="mail"
            label="Email address"
            value={email ?? 'Not added'}
            badge={email ? (user.emailConfirmed ? 'Confirmed' : 'Unconfirmed') : null}
            ok={!!user.emailConfirmed}
          />
          <View style={styles.divider} />
          <Detail
            icon="phone"
            label="Mobile number"
            value={user.phone ? formatPhone(user.phone) : 'Not added'}
            badge={user.phone ? (user.phoneConfirmed ? 'Verified' : 'Unverified') : null}
            ok={!!user.phoneConfirmed}
          />
          {/* As on the web: a number is added, or an unverified one verified, with a code texted to it. It
              then doubles as a way to sign in. */}
          {addingPhone ? (
            <AddPhone
              current={user.phone && !user.phoneConfirmed ? formatPhone(user.phone) : null}
              onCancel={() => setAddingPhone(false)}
              onDone={() => {
                setAddingPhone(false);
                setPhoneAdded(true);
              }}
            />
          ) : !user.phoneConfirmed ? (
            <Pressable
              onPress={() => setAddingPhone(true)}
              accessibilityRole="button"
              accessibilityLabel={user.phone ? 'Verify now' : 'Add number'}
              style={({ pressed }) => [styles.addPhone, pressed && { backgroundColor: colors.surfaceHover }]}>
              <Icon name="phone" size={15} color={colors.primaryNeon} />
              <Text style={styles.addPhoneText}>{user.phone ? 'Verify now' : 'Add number'}</Text>
            </Pressable>
          ) : null}
          {phoneAdded ? (
            <Text style={styles.success} accessibilityLiveRegion="polite">
              Mobile number verified. You can now sign in with it too.
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Plan</Text>
          <Text style={styles.planName}>{paid ? `Kwala Intel ${PLAN_NAME[plan]}` : 'Free plan'}</Text>
          {metered ? (
            <View style={styles.usage} accessible accessibilityLabel={`${q.used} of ${q.limit} questions used today`}>
              <Text style={styles.usageText}>
                {q.used}/{q.limit} questions used today
              </Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${usedPct * 100}%` }, usedPct >= 0.8 && { backgroundColor: colors.danger }]} />
              </View>
            </View>
          ) : paid ? (
            <Text style={styles.usageText}>No daily limit.</Text>
          ) : null}
          <Button label={paid ? 'Your plan' : 'See plans'} variant={paid ? 'secondary' : 'primary'} onPress={() => navigation.navigate('Pricing')} />
        </View>

        <View style={styles.list}>
          {/* Plan, renewal, cancellation and invoices. Cancelling has to be reachable in-app, without contacting support. */}
          <Row icon="credit-card" label="Billing" onPress={() => navigation.navigate('Billing')} />
          <Row icon="info" label="About Kwala Intel" onPress={() => navigation.navigate('About')} />
          <Row icon="log-out" label="Sign out" onPress={() => setSignOutOpen(true)} warn last />
        </View>

        {profileQuery.isFetching && !profile ? <ActivityIndicator color={colors.primary} /> : null}
      </ScrollView>

      <ConfirmDialog
        visible={signOutOpen}
        title="Sign out?"
        body="You'll need to sign in again to get back to your chats."
        confirmLabel="Sign out"
        onCancel={() => setSignOutOpen(false)}
        onConfirm={() => {
          setSignOutOpen(false);
          navigation.popTo('Chat', { fresh: Date.now() });
          void signOut();
        }}
      />
    </KeyboardAvoidingView>
  );
}

function Detail({ icon, label, value, badge, ok }: { icon: IconName; label: string; value: string; badge: string | null; ok: boolean }) {
  return (
    <View style={styles.detail} accessible accessibilityLabel={`${label}: ${value}${badge ? `, ${badge}` : ''}`}>
      <Icon name={icon} size={18} color={colors.textTertiary} />
      <View style={styles.flex}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {badge ? (
        <View style={[styles.status, ok ? styles.statusOk : styles.statusWarn]}>
          <Text style={[styles.statusText, { color: ok ? colors.primaryNeon : colors.danger }]}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Row({ icon, label, onPress, warn, last }: { icon: IconName; label: string; onPress: () => void; warn?: boolean; last?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && { backgroundColor: colors.surfaceHover }]}>
      <Icon name={icon} size={18} color={warn ? colors.danger : colors.textSecondary} />
      <Text style={[styles.rowText, warn && { color: colors.danger }]}>{label}</Text>
      {warn ? null : <Icon name="chevron" size={20} color={colors.textTertiary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.background },
  h: { ...type.body, fontFamily: fonts.bold },
  flex: { flex: 1 },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.sm },
  avatar: { width: 64, height: 64, borderRadius: radii.lg, backgroundColor: colors.webPrimary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.bold, fontSize: 22, color: colors.onPrimary },
  name: { ...type.heading, fontSize: 20, lineHeight: 26 },
  contact: { ...type.small, color: colors.textTertiary },
  planBadge: { alignSelf: 'flex-start', marginTop: 6, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 2, backgroundColor: colors.surfaceElevated },
  planBadgePaid: { backgroundColor: '#6d6cf0' },
  planBadgeText: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.8, color: colors.textSecondary },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  label: { ...type.eyebrow, fontSize: 10 },
  input: {
    ...type.body,
    minHeight: MIN_TOUCH + 4,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
  },
  success: { ...type.small, color: colors.primaryNeon },
  error: { ...type.small, color: colors.danger },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  addPhone: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH - 4,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginLeft: 18 + spacing.md,
  },
  addPhoneText: { ...type.small, fontFamily: fonts.semibold, color: colors.primaryNeon },
  detail: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  value: { ...type.body, fontSize: 15, marginTop: 2 },
  status: { borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
  statusOk: { borderColor: 'rgba(0,255,136,0.3)', backgroundColor: 'rgba(0,255,136,0.08)' },
  statusWarn: { borderColor: 'rgba(245,158,11,0.4)', backgroundColor: colors.dangerBg },
  statusText: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.4 },
  planName: { ...type.body, fontFamily: fonts.semibold, fontSize: 17 },
  usage: { gap: spacing.sm },
  usageText: { ...type.small, color: colors.textSecondary },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceElevated, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  list: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { minHeight: MIN_TOUCH + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowText: { ...type.body, fontSize: 15, flex: 1 },
});
