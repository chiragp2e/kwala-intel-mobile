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
import { formatLongDate } from '../lib/dates';
import { formatInr } from '../lib/money';
import { PLAN_FEATURES, PLAN_NAME, availablePlans, effectiveMonthlyMinor, findPlan, type Cycle, type PaidPlan } from '../lib/plans';
import {
  annualSaving,
  columnAction,
  heldSubscription,
  isComplimentary,
  switchCopy,
  type ColumnAction,
} from '../lib/upgrade';
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

const CYCLE_LABEL: Record<Cycle, string> = { monthly: 'Billed every month', annual: 'Billed once a year' };

/** The web's PlanChoiceToggle: Pro, then Ultra with its sparkle and a "New" flag. */
function PlanTabs({ value, onChange }: { value: PaidPlan; onChange: (p: PaidPlan) => void }) {
  return (
    <View style={styles.tabs} accessibilityRole="radiogroup" accessibilityLabel="Plan">
      {(['pro', 'ultra'] as const).map(p => {
        const on = p === value;
        return (
          <Pressable
            key={p}
            onPress={() => onChange(p)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={p === 'ultra' ? 'Ultra, new' : 'Pro'}
            style={[styles.tab, on && styles.tabOn]}>
            {p === 'ultra' ? <Icon name="sparkles" size={14} color={ULTRA_SOFT} /> : null}
            <Text style={[styles.tabText, on && { color: p === 'ultra' ? ULTRA_SOFT : colors.primaryNeon }, p === 'ultra' && !on && { color: ULTRA_SOFT }]}>
              {PLAN_NAME[p]}
            </Text>
            {p === 'ultra' ? (
              <View style={styles.newBadge}>
                <Gradient radius={radii.pill} steps={12} />
                <Text style={styles.newBadgeText}>NEW</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

interface ColumnProps {
  plan: PaidPlan;
  cycle: Cycle;
  view: PlanView;
  /** What annual saves over monthly; measured against the subscriber's own bill when `theirs`. */
  saving: { minor: number; theirs: boolean };
  /** What this column offers the account: a purchase, its current plan, a switch, or nothing. */
  action: ColumnAction;
  starting: boolean;
  disabled: boolean;
  signedIn: boolean;
  onGet: () => void;
}

/** One billing cycle of the selected plan, as the web's PlanColumn: Annual is the featured one. */
function PlanColumn({ plan, cycle, view, saving, action, starting, disabled, signedIn, onGet }: ColumnProps) {
  const annual = cycle === 'annual';
  const ultra = plan === 'ultra';
  const featured = annual;
  const saved = annual ? saving.minor : 0;
  const accent = ultra ? ULTRA : colors.primary;
  // A paying customer's permitted move, worded as the web's pricing page offers it.
  const offer = action.kind === 'switch' ? switchCopy({ upgrade: action.upgrade, held: action.held, plan, cycle, amountMinor: view.amount_minor }) : null;
  const ctaLabel = offer ? offer.cta : signedIn ? `Get ${PLAN_NAME[plan]}` : `Sign in to get ${PLAN_NAME[plan]}`;
  return (
    <View style={[styles.column, featured && (ultra ? styles.featuredUltra : styles.featuredPro)]}>
      <View style={styles.columnTop}>
        <View style={styles.flex}>
          <Text style={styles.columnTitle}>{annual ? 'Annual' : 'Monthly'}</Text>
          <Text style={styles.columnSub}>{CYCLE_LABEL[cycle]}</Text>
        </View>
        {saved > 0 ? (
          <View style={styles.saveBadge}>
            <Text style={styles.saveBadgeText}>{`SAVE ${formatInr(saved)}${saving.theirs ? ' VS YOUR PLAN' : ''}`}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.price} accessibilityLabel={`${formatInr(view.amount_minor)} per ${annual ? 'year' : 'month'}`}>
        {formatInr(view.amount_minor)}
        <Text style={styles.per}> /{annual ? 'year' : 'month'}</Text>
      </Text>
      {annual ? <Text style={styles.effective}>{formatInr(effectiveMonthlyMinor(view))}/month effective</Text> : null}
      {view.tax ? (
        <Text style={styles.tax}>
          {formatInr(view.tax.base_minor)} + {formatInr(view.tax.tax_minor)} GST at {(view.tax.rate_bp / 100).toFixed(0)}% · inclusive
        </Text>
      ) : null}

      <View style={styles.features}>
        {PLAN_FEATURES[plan].map(f => (
          <View key={f} style={styles.feature}>
            <Icon name="check" size={16} color={ultra ? ULTRA_SOFT : colors.primaryNeon} />
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}
      </View>

      {offer ? (
        <View style={styles.offer}>
          <Text style={styles.offerTitle}>{offer.title}</Text>
          <Text style={styles.offerBody}>{offer.body}</Text>
        </View>
      ) : null}

      {action.kind === 'current' ? (
        <View style={styles.currentPill}>
          <Text style={styles.currentText}>This is your current plan</Text>
        </View>
      ) : action.kind === 'unavailable' ? (
        <View style={[styles.currentPill, styles.unavailable]} accessible accessibilityRole="text">
          <Text style={styles.unavailableText}>{action.reason}</Text>
        </View>
      ) : (
        <Pressable
          onPress={onGet}
          disabled={disabled}
          accessibilityState={{ busy: starting, disabled }}
          accessibilityRole="button"
          accessibilityLabel={`${offer ? offer.cta : `Get ${PLAN_NAME[plan]} ${annual ? 'annual' : 'monthly'}`}, ${formatInr(view.amount_minor)} per ${annual ? 'year' : 'month'}`}
          style={({ pressed }) => [
            styles.cta,
            featured ? [{ backgroundColor: accent }, shineGlow, { shadowColor: accent }] : [styles.ctaOutline, { borderColor: ultra ? 'rgba(109,108,240,0.5)' : 'rgba(74,166,100,0.5)' }],
            disabled && !starting && { opacity: 0.5 },
            pressed && { opacity: 0.9 },
          ]}>
          {featured && ultra ? <Gradient radius={radii.md} /> : null}
          {featured ? <Shine radius={radii.md} still={starting} /> : null}
          {starting ? (
            <View style={styles.waitRow}>
              <ActivityIndicator color={featured ? colors.onPrimary : accent} />
              <Text style={[styles.ctaText, !featured && { color: ultra ? ULTRA_SOFT : colors.primaryNeon }]}>Opening secure checkout…</Text>
            </View>
          ) : (
            <View style={styles.waitRow}>
              {ultra ? <Icon name="sparkles" size={18} color={featured ? colors.onPrimary : ULTRA_SOFT} /> : null}
              <Text style={[styles.ctaText, !featured && { color: ultra ? ULTRA_SOFT : colors.primaryNeon }]}>{ctaLabel}</Text>
              <Icon name="arrow-right" size={18} color={featured ? colors.onPrimary : ultra ? ULTRA_SOFT : colors.primaryNeon} />
            </View>
          )}
        </Pressable>
      )}

      <Text style={styles.fine}>
        Billed {formatInr(view.amount_minor)} today and {annual ? 'every year' : 'every month'} until you cancel.{offer?.fineSuffix ?? ''} Cancel
        anytime from billing settings - you keep access to the end of the period you paid for.
      </Text>
    </View>
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

  const sold = useMemo(() => (plans ? availablePlans(plans) : []), [plans]);
  useEffect(() => {
    if (sold.length && !sold.includes(plan)) setPlan(sold[sold.length - 1] as PaidPlan);
  }, [sold, plan]);

  const monthlyView = plans ? findPlan(plans, plan, 'monthly') : null;
  const annualView = plans ? findPlan(plans, plan, 'annual') : null;
  const held = entitlements?.plan;
  // The plan AND billing cycle held, from the plan code: only that column is
  // "current". A complimentary grant (a code no sold plan claims) is offered
  // every plan, as a free account is.
  const holding = heldSubscription(entitlements, plans ?? []);
  const comped = isComplimentary(entitlements, plans ?? []);
  const actionFor = (c: Cycle): ColumnAction => columnAction({ entitlements, plans: plans ?? [], plan, cycle: c });
  const saving = annualSaving(holding, plan, monthlyView, annualView);
  const q = entitlements?.quota;

  // A subscriber lands on the plan they hold, where their switch to annual is,
  // as the web's subscriber view is about their own plan. Once they pick a tab, theirs stands.
  const pickedTab = useRef(false);
  const heldTab = holding?.plan ?? null;
  useEffect(() => {
    if (heldTab && !pickedTab.current) setPlan(heldTab);
  }, [heldTab]);
  const pickTab = useCallback((p: PaidPlan) => {
    pickedTab.current = true;
    setPlan(p);
  }, []);

  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  /** Which column's button opened checkout, for its spinner. */
  const [startingCycle, setStartingCycle] = useState<Cycle | null>(null);
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

  const checkout = useCallback(async (cycle: Cycle) => {
    const view = plans ? findPlan(plans, plan, cycle) : null;
    if (!view) return;
    if (status !== 'signedIn') {
      navigation.navigate('SignIn');
      return;
    }
    setCheckoutError(null);
    setStartingCycle(cycle);
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
  }, [backend, navigation, open, payInApp, plan, plans, status]);

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
  // A subscriber, as the web's subscriber view: paid, and not on a complimentary grant.
  const paidHere = (held === 'pro' || held === 'ultra') && !comped;
  const compedUntil = comped ? (entitlements?.billing?.accessUntil ?? null) : null;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xxl }]}
      showsVerticalScrollIndicator={false}>
      {loaded ? <PlanTabs value={plan} onChange={pickTab} /> : null}

      <Text style={[styles.eyebrow, plan === 'ultra' && { color: ULTRA_SOFT }]}>KWALA INTEL {PLAN_NAME[plan].toUpperCase()}</Text>
      <Text style={styles.title} accessibilityRole="header">
        {paidHere && (held === 'pro' || held === 'ultra') ? `You are on ${PLAN_NAME[held]}` : 'Remove the daily limit'}
      </Text>
      {comped ? (
        <Text style={styles.sub}>
          You have complimentary {PLAN_NAME[held === 'ultra' ? 'ultra' : 'pro']}
          {compedUntil ? (
            <>
              {' '}
              until <Text style={styles.subStrong}>{formatLongDate(compedUntil)}</Text>
            </>
          ) : null}
          . Buying a plan ends it.
        </Text>
      ) : paidHere ? (
        <>
          <Text style={styles.sub}>
            {entitlements?.billing?.cancelAtPeriodEnd
              ? 'Your subscription is set to end. You keep full access until it does.'
              : 'Every limit is removed on your account. Nothing else to do.'}
          </Text>
          <Button label="Manage billing" variant="secondary" onPress={() => navigation.navigate('Billing')} style={styles.manage} />
        </>
      ) : q && !q.unlimited && q.limit > 0 ? (
        <Text style={styles.sub}>
          You have used {q.used} of {q.limit} free questions today.
        </Text>
      ) : (
        <Text style={styles.sub}>Every research feature, in English and Indian languages. Cancel anytime.</Text>
      )}

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
      ) : null}

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
        // Annual first and featured, then Monthly: the web's two columns, stacked.
        (['annual', 'monthly'] as const).map(c => {
          const view = c === 'annual' ? annualView : monthlyView;
          return view ? (
            <PlanColumn
              key={`${plan}-${c}`}
              plan={plan}
              cycle={c}
              view={view}
              saving={saving}
              action={actionFor(c)}
              starting={phase.kind === 'starting' && startingCycle === c}
              disabled={phase.kind === 'starting' || waiting}
              signedIn={status === 'signedIn'}
              onGet={() => void checkout(c)}
            />
          ) : null;
        })
      )}

      {loaded ? (
        <Text style={styles.footnote}>Payment is handled securely by Razorpay (UPI, cards, netbanking). Prices include GST.</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { padding: spacing.lg, gap: spacing.md },
  tabs: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: 4 },
  tab: {
    flex: 1,
    minHeight: MIN_TOUCH,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tabOn: { backgroundColor: 'rgba(0,127,71,0.12)', borderColor: 'rgba(0,127,71,0.3)' },
  tabText: { ...type.small, fontFamily: fonts.semibold, fontSize: 14, color: colors.textSecondary },
  newBadge: { borderRadius: radii.pill, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  newBadgeText: { fontFamily: fonts.monoMedium, fontSize: 9, color: colors.onPrimary, letterSpacing: 0.8 },
  eyebrow: { ...type.eyebrow, color: colors.primaryNeon, fontSize: 10, marginTop: spacing.sm },
  title: { ...type.hero, fontSize: 28, lineHeight: 34 },
  sub: { ...type.small, color: colors.textTertiary, marginTop: -4 },
  center: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  h: { ...type.body, fontFamily: fonts.bold },
  muted: { ...type.small, color: colors.textTertiary, textAlign: 'center' },
  column: { borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.lg + 4, gap: spacing.xs },
  featuredPro: { borderColor: 'rgba(74,166,100,0.45)' },
  featuredUltra: { borderColor: 'rgba(109,108,240,0.45)' },
  columnTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  columnTitle: { ...type.small, fontFamily: fonts.semibold, color: colors.textPrimary },
  columnSub: { ...type.small, fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  saveBadge: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: 'rgba(0,255,136,0.1)' },
  saveBadgeText: { fontFamily: fonts.monoMedium, fontSize: 9.5, letterSpacing: 1.2, color: colors.primaryNeon },
  price: { fontFamily: fonts.monoMedium, fontSize: 34, lineHeight: 42, color: colors.textPrimary, marginTop: spacing.md },
  per: { fontFamily: fonts.regular, fontSize: 14, color: colors.textSecondary },
  effective: { fontFamily: fonts.mono, fontSize: 12, color: colors.textTertiary },
  tax: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.textTertiary, marginTop: spacing.xs },
  features: { gap: 10, marginTop: spacing.lg, marginBottom: spacing.lg },
  feature: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  featureText: { ...type.small, flex: 1, color: colors.textSecondary },
  cta: { minHeight: MIN_TOUCH + 6, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ctaOutline: { borderWidth: 1, backgroundColor: 'transparent' },
  ctaText: { ...type.body, fontFamily: fonts.semibold, color: colors.onPrimary, fontSize: 15 },
  fine: { ...type.small, fontSize: 11, lineHeight: 17, color: colors.textTertiary, marginTop: spacing.sm },
  footnote: { ...type.small, fontSize: 12, lineHeight: 18, color: colors.textTertiary, textAlign: 'center' },
  currentPill: { minHeight: MIN_TOUCH + 4, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  currentText: { ...type.small, color: colors.textSecondary },
  unavailable: { borderColor: colors.border, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  unavailableText: { ...type.small, fontSize: 12, lineHeight: 18, color: colors.textSecondary, textAlign: 'center' },
  offer: {
    gap: 4,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(74,166,100,0.2)',
    backgroundColor: 'rgba(74,166,100,0.05)',
  },
  offerTitle: { ...type.small, fontFamily: fonts.semibold, color: colors.textPrimary },
  offerBody: { ...type.small, fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  subStrong: { fontFamily: fonts.semibold, color: colors.textPrimary },
  manage: { alignSelf: 'flex-start', marginTop: spacing.xs },
  checkoutError: { ...type.small, color: colors.danger },
  waitBox: { gap: spacing.md, padding: spacing.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
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
