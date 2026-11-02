import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getBackend } from '../api';
import type { PlanView } from '../api/schemas';
import { useAuth } from '../auth/AuthContext';
import { ChatError } from '../api/errors';
import { buildCheckoutOptions, hasLanded, resolveCheckout, type CheckoutTarget } from '../billing/checkout';
import { nativeCheckoutAvailable, openNativeCheckout } from '../billing/razorpay';
import { Button } from '../components/Button';
import { Gradient } from '../components/Gradient';
import { Icon } from '../components/Icon';
import { Shine, shineGlow } from '../components/Shine';
import { env } from '../config/env';
import { formatInr } from '../lib/money';
import {
  PLAN_FEATURES,
  PLAN_NAME,
  annualSavingMinor,
  availablePlans,
  effectiveMonthlyMinor,
  findPlan,
  type Cycle,
  type PaidPlan,
} from '../lib/plans';
import type { ScreenProps } from '../navigation/types';
import { useEntitlements, useInvalidate, usePlans } from '../state/queries';
import { MIN_TOUCH, colors, fonts, radii, spacing, type } from '../theme/tokens';

const ULTRA = '#6d6cf0';
const ULTRA_SOFT = '#a9a8ff';
const POLL_MS = 3000;
const WATCH_FOR_MS = 3 * 60_000;

type Phase =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'confirming'; target: CheckoutTarget; planCode: string; plan: PaidPlan; since: number }
  | { kind: 'slow'; target: CheckoutTarget; planCode: string; plan: PaidPlan }
  | { kind: 'done'; plan: PaidPlan };

const PLAN_TAGLINE: Record<PaidPlan, string> = {
  pro: 'Unlimited questions',
  ultra: 'Our strongest agent',
};

/** Per-month price for the chosen cycle, so the two plan cards compare like for like. */
function perMonth(view: PlanView | null, cycle: Cycle): number | null {
  if (!view) return null;
  return cycle === 'annual' ? effectiveMonthlyMinor(view) : view.amount_minor;
}

function PlanOption({
  plan,
  selected,
  price,
  current,
  onPress,
}: {
  plan: PaidPlan;
  selected: boolean;
  price: number | null;
  current: boolean;
  onPress: () => void;
}) {
  const ultra = plan === 'ultra';
  const accent = ultra ? ULTRA : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${PLAN_NAME[plan]}${price != null ? `, ${formatInr(price)} a month` : ''}${current ? ', your current plan' : ''}`}
      style={[styles.option, selected && { borderColor: accent, backgroundColor: ultra ? 'rgba(109,108,240,0.10)' : 'rgba(74,166,100,0.10)' }]}>
      <View style={styles.optionTop}>
        {ultra ? <Icon name="sparkles" size={18} color={ULTRA_SOFT} /> : null}
        <Text style={[styles.optionName, ultra && { color: ULTRA_SOFT }]}>
          {PLAN_NAME[plan]}
        </Text>
        {ultra ? (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>NEW</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.optionPrice}>{price != null ? formatInr(price) : '—'}</Text>
      <Text style={styles.optionPer}>per month</Text>
      <Text style={styles.optionTag} numberOfLines={1}>
        {current ? 'Your plan' : PLAN_TAGLINE[plan]}
      </Text>
      <View style={[styles.radio, selected && { borderColor: accent }]}>{selected ? <View style={[styles.radioDot, { backgroundColor: accent }]} /> : null}</View>
    </Pressable>
  );
}

export function PricingScreen({ navigation }: ScreenProps<'Pricing'>) {
  const insets = useSafeAreaInsets();
  const { status, user } = useAuth();
  const backend = useMemo(() => getBackend(), []);
  const plansQuery = usePlans();
  const plans = plansQuery.data ?? null;
  // A failed background refresh keeps the plans already shown; only a first load that fails is an error.
  const failed = plansQuery.isError && plans === null;
  const load = plansQuery.refetch;
  const { data: entitlements = null } = useEntitlements();
  const invalidate = useInvalidate();
  const [plan, setPlan] = useState<PaidPlan>('ultra');
  const [cycle, setCycle] = useState<Cycle>('annual');


  const sold = useMemo(() => (plans ? availablePlans(plans) : []), [plans]);
  useEffect(() => {
    if (sold.length && !sold.includes(plan)) setPlan(sold[sold.length - 1] as PaidPlan);
  }, [sold, plan]);

  const view = plans ? findPlan(plans, plan, cycle) : null;
  const saving = plans ? annualSavingMinor(findPlan(plans, plan, 'monthly'), findPlan(plans, plan, 'annual')) : 0;
  const bestSaving = plans
    ? Math.max(0, ...sold.map(p => annualSavingMinor(findPlan(plans, p, 'monthly'), findPlan(plans, p, 'annual'))))
    : 0;
  const held = entitlements?.plan;
  const isCurrent = held === plan;
  const ultra = plan === 'ultra';
  const accent = ultra ? ULTRA : colors.primary;

  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // A plan just bought: the chat header, usage chip and account sheet pick it up from the shared cache.
  useEffect(() => {
    if (phase.kind === 'done') void invalidate.entitlements();
  }, [invalidate, phase.kind]);
  const checkingRef = useRef(false);

  const open = useCallback(async (target: CheckoutTarget) => {
    if (target.kind === 'native') return; // the in-app sheet is opened by payInApp
    if (target.kind === 'web') {
      await Linking.openURL(target.url).catch(() => {});
      return;
    }
    // Razorpay's hosted page in an in-app browser tab (Custom Tab / SFSafariViewController).
    await WebBrowser.openBrowserAsync(target.url, {
      toolbarColor: colors.background,
      controlsColor: colors.primaryNeon,
      dismissButtonStyle: 'close',
      createTask: false,
      showTitle: true,
    }).catch(() => Linking.openURL(target.url));
  }, []);

  /**
   * Razorpay's native sheet. The button keeps its spinner while the sheet is
   * up; a successful payment goes to the server for verification and is then
   * watched like any other checkout, so a slow or failed verify still lands
   * through the webhook.
   */
  const payInApp = useCallback(
    async (target: Extract<CheckoutTarget, { kind: 'native' }>, buy: { planCode: string; plan: PaidPlan; cycle: Cycle; amountMinor: number }) => {
      const outcome = await openNativeCheckout(
        buildCheckoutOptions({
          target,
          name: `Kwala Intel ${PLAN_NAME[buy.plan]}`,
          description: `${formatInr(buy.amountMinor)} ${buy.cycle === 'annual' ? 'per year' : 'per month'} · GST included`,
          themeColor: colors.primary,
          email: user?.email,
          phone: user?.phone,
        }),
      );
      if (outcome.kind !== 'paid') {
        setPhase({ kind: 'idle' });
        if (outcome.kind === 'failed') setCheckoutError(outcome.message);
        return;
      }
      setPhase({ kind: 'confirming', target, planCode: buy.planCode, plan: buy.plan, since: Date.now() });
      if (!outcome.paymentId || !outcome.signature) return;
      const sub = await backend
        .verifyCheckout({ paymentId: outcome.paymentId, subscriptionId: outcome.subscriptionId, signature: outcome.signature })
        .catch(() => null);
      if (hasLanded(sub, buy.planCode, buy.plan)) setPhase({ kind: 'done', plan: buy.plan });
    },
    [backend, user],
  );

  const checkout = useCallback(async () => {
    if (!view) return;
    if (status !== 'signedIn') {
      navigation.navigate('SignIn');
      return;
    }
    setCheckoutError(null);
    setPhase({ kind: 'starting' });
    try {
      const target = await resolveCheckout(backend, {
        planCode: view.plan_code,
        plan,
        cycle,
        webBaseUrl: env.webBaseUrl,
        buildKeyId: env.razorpayKeyId,
        nativeAvailable: nativeCheckoutAvailable(),
      });
      if (target.kind === 'native') {
        await payInApp(target, { planCode: view.plan_code, plan, cycle, amountMinor: view.amount_minor });
        return;
      }
      setPhase({ kind: 'confirming', target, planCode: view.plan_code, plan, since: Date.now() });
      await open(target);
    } catch (e) {
      setPhase({ kind: 'idle' });
      setCheckoutError(e instanceof ChatError ? e.failure.message : 'Checkout could not be started. Please try again.');
    }
  }, [backend, cycle, navigation, open, payInApp, plan, status, view]);

  /** One look at the subscription; true once the plan just bought is active. */
  const checkNow = useCallback(async () => {
    if (checkingRef.current || (phase.kind !== 'confirming' && phase.kind !== 'slow')) return;
    checkingRef.current = true;
    try {
      const sub = await backend.getSubscription();
      if (hasLanded(sub, phase.planCode, phase.plan)) {
        setPhase({ kind: 'done', plan: phase.plan });
        // Close the payment tab if it is still up (iOS); a no-op elsewhere.
        WebBrowser.dismissBrowser();
      }
    } catch {
      // Offline or a blip: the next tick tries again.
    } finally {
      checkingRef.current = false;
    }
  }, [backend, phase]);

  // Watch for the webhook to activate the subscription: every few seconds, and
  // at once whenever the customer comes back from the payment tab.
  useEffect(() => {
    if (phase.kind !== 'confirming') return;
    const tick = setInterval(() => {
      if (Date.now() - phase.since > WATCH_FOR_MS) {
        setPhase({ kind: 'slow', target: phase.target, planCode: phase.planCode, plan: phase.plan });
        return;
      }
      void checkNow();
    }, POLL_MS);
    const sub = AppState.addEventListener('change', s => s === 'active' && void checkNow());
    return () => {
      clearInterval(tick);
      sub.remove();
    };
  }, [checkNow, phase]);

  const loaded = plans !== null && !failed && sold.length > 0;

  if (phase.kind === 'done') {
    const accentDone = phase.plan === 'ultra' ? ULTRA : colors.primary;
    return (
      <View style={[styles.root, styles.success, { paddingBottom: insets.bottom + spacing.xl }]} accessibilityLiveRegion="polite">
        <View style={[styles.successBadge, { backgroundColor: accentDone }]}>
          <Text style={styles.successTick}>✓</Text>
        </View>
        <Text style={styles.title} accessibilityRole="header">
          You're on {PLAN_NAME[phase.plan]}
        </Text>
        <Text style={[styles.sub, styles.centerText]}>Payment confirmed. No daily limit from now on. Your receipt is on its way by email.</Text>
        <Pressable
          onPress={() => navigation.popTo('Chat', { fresh: Date.now() })}
          accessibilityRole="button"
          accessibilityLabel="Start chatting"
          style={({ pressed }) => [styles.cta, styles.successCta, { backgroundColor: colors.primary }, shineGlow, pressed && { opacity: 0.9 }]}>
          <Shine radius={radii.md} />
          <Text style={styles.ctaText}>Start chatting →</Text>
        </Pressable>
      </View>
    );
  }

  const waiting = phase.kind === 'confirming' || phase.kind === 'slow';

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: loaded ? 180 + insets.bottom : spacing.xxl }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>LAUNCH PRICE · INCLUSIVE OF GST</Text>
        <Text style={styles.title} accessibilityRole="header">
          {held === 'pro' || held === 'ultra' ? `You're on ${PLAN_NAME[held]}` : 'Ask without limits'}
        </Text>
        <Text style={styles.sub}>Every research feature, in English and Indian languages. Cancel anytime.</Text>

        {plans === null && !failed ? (
          <View style={styles.center} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.muted}>Loading plans…</Text>
          </View>
        ) : failed ? (
          <View style={styles.center} accessibilityRole="alert">
            <Text style={styles.h}>Couldn't load plans</Text>
            <Text style={styles.muted}>Check your connection and try again.</Text>
            <Button label="Try again" variant="secondary" onPress={() => void load()} />
          </View>
        ) : sold.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.h}>Plans aren't available right now</Text>
            <Text style={styles.muted}>Please check back soon.</Text>
          </View>
        ) : (
          <>
            {/* Billing cycle first: it changes every price below. */}
            <View style={styles.cycle} accessibilityRole="tablist" accessibilityLabel="Billing cycle">
              {(['monthly', 'annual'] as const).map(c => {
                const on = c === cycle;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setCycle(c)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    style={[styles.cycleItem, on && styles.cycleOn]}>
                    <Text style={[styles.cycleText, on && { color: colors.textPrimary }]}>{c === 'annual' ? 'Annual' : 'Monthly'}</Text>
                    {c === 'annual' && bestSaving > 0 ? (
                      <View style={styles.saveBadge}>
                        <Text style={styles.saveBadgeText}>SAVE UP TO {formatInr(bestSaving)}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.options} accessibilityRole="radiogroup">
              {sold.map(p => (
                <PlanOption
                  key={p}
                  plan={p}
                  selected={p === plan}
                  price={perMonth(plans ? findPlan(plans, p, cycle) : null, cycle)}
                  current={held === p}
                  onPress={() => setPlan(p)}
                />
              ))}
            </View>

            <View style={styles.features}>
              <Text style={[styles.featuresTitle, { color: ultra ? ULTRA_SOFT : colors.primary }]}>
                WHAT YOU GET WITH {PLAN_NAME[plan].toUpperCase()}
              </Text>
              {PLAN_FEATURES[plan].map(f => (
                <View key={f} style={styles.feature}>
                  <View style={[styles.tick, { backgroundColor: ultra ? 'rgba(109,108,240,0.18)' : 'rgba(74,166,100,0.18)' }]}>
                    <Text style={[styles.tickText, { color: ultra ? ULTRA_SOFT : colors.primaryNeon }]}>✓</Text>
                  </View>
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
            </View>

            {view?.tax ? (
              <Text style={styles.tax}>
                {formatInr(view.tax.base_minor)} + {formatInr(view.tax.tax_minor)} GST at {(view.tax.rate_bp / 100).toFixed(0)}% · inclusive
              </Text>
            ) : null}
            <Text style={styles.fine}>
              Billed every {cycle === 'annual' ? 'year' : 'month'} until you cancel. Cancel anytime from billing settings and keep access
              until the end of the period you paid for. Payment is handled securely by Razorpay (UPI, cards, netbanking).
            </Text>
          </>
        )}
      </ScrollView>

      {/* Always on screen: what it costs and the one button to get it. */}
      {loaded && view ? (
        <View style={[styles.bar, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.barRow}>
            <View style={styles.flex}>
              <Text style={styles.barPrice}>
                {formatInr(view.amount_minor)}
                <Text style={styles.barPer}>{cycle === 'annual' ? ' /year' : ' /month'}</Text>
              </Text>
              <Text style={styles.barSub}>
                {cycle === 'annual'
                  ? saving > 0
                    ? `${formatInr(effectiveMonthlyMinor(view))}/mo · you save ${formatInr(saving)}`
                    : `${formatInr(effectiveMonthlyMinor(view))}/mo effective`
                  : 'Billed monthly · cancel anytime'}
              </Text>
            </View>
          </View>
          {checkoutError ? (
            <Text style={styles.checkoutError} accessibilityRole="alert">
              {checkoutError}
            </Text>
          ) : null}
          {waiting ? (
            <View style={styles.waitBox} accessibilityLiveRegion="polite">
              <View style={styles.waitRow}>
                {phase.kind === 'confirming' ? <ActivityIndicator color={colors.primaryNeon} /> : null}
                <Text style={styles.waitText}>
                  {phase.kind === 'slow'
                    ? 'Still confirming. Payments can take a minute to land.'
                    : phase.target.kind === 'native'
                      ? 'Payment received. Activating your plan…'
                      : 'Waiting for Razorpay to confirm your payment…'}
                </Text>
              </View>
              <View style={styles.waitActions}>
                {/* The in-app sheet already took the payment; reopening is only for the browser checkouts. */}
                {phase.target.kind !== 'native' ? (
                  <Pressable onPress={() => void open(phase.target)} accessibilityRole="button" style={styles.waitBtn}>
                    <Text style={styles.waitBtnText}>Reopen checkout</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => {
                    if (phase.kind === 'slow') setPhase({ ...phase, kind: 'confirming', since: Date.now() });
                    void checkNow();
                  }}
                  accessibilityRole="button"
                  style={[styles.waitBtn, styles.waitBtnPrimary]}>
                  <Text style={[styles.waitBtnText, { color: colors.onPrimary }]}>I've paid — check now</Text>
                </Pressable>
              </View>
            </View>
          ) : isCurrent ? (
            <View style={styles.currentPill}>
              <Text style={styles.currentText}>This is your current plan</Text>
            </View>
          ) : (
            <Pressable
              onPress={() => void checkout()}
              disabled={phase.kind === 'starting'}
              accessibilityState={{ busy: phase.kind === 'starting' }}
              accessibilityRole="button"
              accessibilityLabel={`Get ${PLAN_NAME[plan]} for ${formatInr(view.amount_minor)} per ${cycle === 'annual' ? 'year' : 'month'}`}
              style={({ pressed }) => [styles.cta, { backgroundColor: accent }, shineGlow, { shadowColor: accent }, pressed && { opacity: 0.9 }]}>
              {ultra ? <Gradient radius={radii.md} /> : null}
              <Shine radius={radii.md} still={phase.kind === 'starting'} />
              {phase.kind === 'starting' ? (
                <View style={styles.waitRow}>
                  <ActivityIndicator color={colors.onPrimary} />
                  <Text style={styles.ctaText}>Opening secure checkout…</Text>
                </View>
              ) : (
                <View style={styles.waitRow}>
                  {ultra ? <Icon name="sparkles" size={20} color={colors.onPrimary} /> : null}
                  <Text style={styles.ctaText}>
                    {status === 'signedIn' ? `Get ${PLAN_NAME[plan]}` : `Sign in to get ${PLAN_NAME[plan]}`}
                  </Text>
                  <Icon name="arrow-right" size={20} color={colors.onPrimary} />
                </View>
              )}
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { padding: spacing.lg, gap: spacing.md },
  eyebrow: { ...type.eyebrow, color: colors.primary, fontSize: 10 },
  title: { ...type.hero, fontSize: 28, lineHeight: 34 },
  sub: { ...type.small, color: colors.textTertiary, marginTop: -4 },
  center: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  h: { ...type.body, fontFamily: fonts.bold },
  muted: { ...type.small, color: colors.textTertiary, textAlign: 'center' },
  cycle: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: 4, marginTop: spacing.sm },
  cycleItem: { flex: 1, minHeight: MIN_TOUCH, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', gap: 2 },
  cycleOn: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderStrong },
  cycleText: { ...type.small, fontFamily: fonts.semibold, fontSize: 15, color: colors.textTertiary },
  saveBadge: { borderRadius: radii.pill, paddingHorizontal: 6 },
  saveBadgeText: { fontFamily: fonts.mono, fontSize: 9, color: colors.primaryNeon, letterSpacing: 0.6 },
  options: { flexDirection: 'row', gap: spacing.md },
  option: { flex: 1, borderRadius: radii.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.lg, gap: 2 },
  optionTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  optionName: { ...type.body, fontFamily: fonts.bold, fontSize: 17 },
  newBadge: { backgroundColor: ULTRA, borderRadius: radii.pill, paddingHorizontal: 6, paddingVertical: 1 },
  newBadgeText: { fontFamily: fonts.mono, fontSize: 9, color: colors.onPrimary, letterSpacing: 0.8 },
  optionPrice: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, color: colors.textPrimary },
  optionPer: { ...type.small, fontSize: 12, color: colors.textTertiary },
  optionTag: { ...type.small, fontSize: 12, color: colors.textSecondary, marginTop: spacing.sm },
  radio: { position: 'absolute', top: spacing.lg, right: spacing.md, width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  features: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  featuresTitle: { ...type.eyebrow, fontSize: 10 },
  feature: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  tick: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  tickText: { fontSize: 12, fontFamily: fonts.bold },
  featureText: { ...type.body, flex: 1, fontSize: 15, lineHeight: 22 },
  tax: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary, textAlign: 'center' },
  fine: { ...type.small, fontSize: 12, lineHeight: 18, color: colors.textTertiary, textAlign: 'center' },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 16,
  },
  barRow: { flexDirection: 'row', alignItems: 'center' },
  barPrice: { fontFamily: fonts.bold, fontSize: 24, color: colors.textPrimary },
  barPer: { fontFamily: fonts.regular, fontSize: 14, color: colors.textTertiary },
  barSub: { ...type.small, fontSize: 13, color: colors.primaryNeon },
  cta: { minHeight: MIN_TOUCH + 8, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  ctaText: { ...type.body, fontFamily: fonts.bold, color: colors.onPrimary, fontSize: 17 },
  currentPill: { minHeight: MIN_TOUCH + 4, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  currentText: { ...type.small, color: colors.textSecondary },
  checkoutError: { ...type.small, color: colors.danger, textAlign: 'center' },
  waitBox: { gap: spacing.md },
  waitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  waitText: { ...type.small, color: colors.textSecondary, flexShrink: 1 },
  waitActions: { flexDirection: 'row', gap: spacing.sm },
  waitBtn: { flex: 1, minHeight: MIN_TOUCH + 4, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  waitBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  waitBtnText: { ...type.small, fontFamily: fonts.semibold, color: colors.textPrimary, textAlign: 'center' },
  success: { alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  successBadge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  successTick: { fontFamily: fonts.bold, fontSize: 34, color: colors.onPrimary },
  centerText: { textAlign: 'center' },
  successCta: { alignSelf: 'stretch', marginTop: spacing.md },
});
