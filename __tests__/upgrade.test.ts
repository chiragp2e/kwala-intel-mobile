import { PlanViewSchema, parseEntitlements, parseList } from '../src/api/schemas';
import { planOfCode, type Cycle, type PaidPlan } from '../src/lib/plans';
import {
  annualSaving,
  columnAction,
  heldSubscription,
  isComplimentary,
  shownAccessUntil,
  shownDays,
  switchCopy,
  upgradePreview,
  type ColumnAction,
} from '../src/lib/upgrade';

const plans = parseList(PlanViewSchema, [
  { plan_code: 'pro_in_monthly_v2', plan: 'pro', billing_interval: 'monthly', amount_minor: 19900 },
  { plan_code: 'pro_in_annual_v2', plan: 'pro', billing_interval: 'annual', amount_minor: 199900 },
  { plan_code: 'ultra_in_monthly_v1', plan: 'ultra', billing_interval: 'monthly', amount_minor: 100000 },
  { plan_code: 'ultra_in_annual_v1', plan: 'ultra', billing_interval: 'annual', amount_minor: 1000000 },
]);

// Noon UTC, so the calendar dates below are the same in any time zone the tests run in.
const NOW = new Date('2026-11-06T12:00:00Z');
const ACCESS_UNTIL = '2026-11-26T12:00:00Z';

/** GET /auth/me/context for an account on `plan`, holding `code` (none for a free account). */
const ctx = (plan: string, code?: string, billing: Record<string, unknown> = {}) =>
  parseEntitlements({
    data: {
      billing: { plan, ...(code ? { plan_code: code, access_until: ACCESS_UNTIL, amount_minor: 19900 } : {}), ...billing },
      quota: plan === 'free' ? { limit: 2, used: 1 } : { unlimited: true },
    },
  });

const action = (ent: ReturnType<typeof ctx>, plan: PaidPlan, cycle: Cycle) => columnAction({ entitlements: ent, plans, plan, cycle, now: NOW });
const kinds = (ent: ReturnType<typeof ctx>) => ({
  pro: { monthly: action(ent, 'pro', 'monthly').kind, annual: action(ent, 'pro', 'annual').kind },
  ultra: { monthly: action(ent, 'ultra', 'monthly').kind, annual: action(ent, 'ultra', 'annual').kind },
});
const reason = (a: ColumnAction) => (a.kind === 'unavailable' ? a.reason : null);

describe('the plan and cycle a plan code names', () => {
  it('reads codes on sale from the price list, including ones the app has never heard of', () => {
    expect(planOfCode('pro_in_annual_v2', plans)).toEqual({ plan: 'pro', cycle: 'annual' });
    const dev = parseList(PlanViewSchema, [{ plan_code: 'ultra_in_monthly_dev', plan: 'ultra', billing_interval: 'monthly', amount_minor: 1 }]);
    expect(planOfCode('ultra_in_monthly_dev', dev)).toEqual({ plan: 'ultra', cycle: 'monthly' });
  });

  it('falls back to the plan code prefix for a price row without a plan', () => {
    const old = parseList(PlanViewSchema, [{ plan_code: 'ultra_in_annual_v9', billing_interval: 'annual', amount_minor: 1 }]);
    expect(planOfCode('ultra_in_annual_v9', old)).toEqual({ plan: 'ultra', cycle: 'annual' });
  });

  it('knows the superseded codes grandfathered customers still hold, even with no price list', () => {
    expect(planOfCode('pro_in_monthly_v1')).toEqual({ plan: 'pro', cycle: 'monthly' });
    expect(planOfCode('pro_in_annual_v1', plans)).toEqual({ plan: 'pro', cycle: 'annual' });
  });

  it('never guesses at a code nothing claims (a complimentary grant)', () => {
    expect(planOfCode('pro_in_comp_v1', plans)).toBeNull();
    expect(planOfCode(null, plans)).toBeNull();
  });
});

describe('reading the subscription out of /auth/me/context', () => {
  it('keeps the plan code and the rest of the billing block', () => {
    const ent = ctx('pro', 'pro_in_monthly_v2', { cancel_at_period_end: true, upgrade_refund_minor: 12000, upgrade_refund_days: 19 });
    expect(ent?.billing).toEqual({
      planCode: 'pro_in_monthly_v2',
      amountMinor: 19900,
      accessUntil: ACCESS_UNTIL,
      cancelAtPeriodEnd: true,
      paymentIssue: false,
      upgradeRefundMinor: 12000,
      upgradeRefundDays: 19,
    });
  });

  it('does not lose the plan over one odd billing field', () => {
    const ent = ctx('ultra', 'ultra_in_annual_v1', { amount_minor: 'lots', access_until: 42 });
    expect(ent?.plan).toBe('ultra');
    expect(ent?.billing).toMatchObject({ planCode: 'ultra_in_annual_v1', amountMinor: null, accessUntil: null });
  });

  it('has no billing block without a plan code', () => {
    expect(ctx('free')?.billing).toBeUndefined();
  });
});

describe('which pricing column is current (MOB-13)', () => {
  it('a Pro monthly subscriber: only Pro monthly is current, Pro annual is the switch to annual', () => {
    const ent = ctx('pro', 'pro_in_monthly_v2');
    expect(kinds(ent)).toEqual({ pro: { monthly: 'current', annual: 'switch' }, ultra: { monthly: 'switch', annual: 'switch' } });
    const annual = action(ent, 'pro', 'annual');
    expect(annual.kind === 'switch' && annual.upgrade.kind).toBe('cycle');
    const ultra = action(ent, 'ultra', 'annual');
    expect(ultra.kind === 'switch' && ultra.upgrade.kind).toBe('plan');
  });

  it('a Pro annual subscriber: only Pro annual is current, and nothing moves to monthly', () => {
    const ent = ctx('pro', 'pro_in_annual_v2');
    expect(kinds(ent)).toEqual({ pro: { monthly: 'unavailable', annual: 'current' }, ultra: { monthly: 'unavailable', annual: 'switch' } });
    expect(reason(action(ent, 'pro', 'monthly'))).toBe('Moving from Pro annual to monthly is not available.');
    expect(reason(action(ent, 'ultra', 'monthly'))).toBe('Moving from Pro annual to a monthly plan is not available.');
  });

  it('an Ultra subscriber: their own cycle is current, and Pro is never offered as a move down', () => {
    const monthly = ctx('ultra', 'ultra_in_monthly_v1');
    expect(kinds(monthly)).toEqual({ pro: { monthly: 'unavailable', annual: 'unavailable' }, ultra: { monthly: 'current', annual: 'switch' } });
    expect(reason(action(monthly, 'pro', 'annual'))).toBe('You’re on Ultra. Moving down to Pro is not available.');
    const annual = ctx('ultra', 'ultra_in_annual_v1');
    expect(kinds(annual).ultra).toEqual({ monthly: 'unavailable', annual: 'current' });
  });

  it('a grandfathered monthly subscriber may move to the price on sale, or to annual', () => {
    const ent = ctx('pro', 'pro_in_monthly_v1', { amount_minor: 9900 });
    const same = action(ent, 'pro', 'monthly');
    expect(same.kind === 'switch' && same.upgrade.kind).toBe('reprice');
    const annual = action(ent, 'pro', 'annual');
    expect(annual.kind === 'switch' && annual.upgrade.kind).toBe('cycle');
  });

  it('never marks more than one column current', () => {
    for (const code of ['pro_in_monthly_v2', 'pro_in_annual_v2', 'ultra_in_monthly_v1', 'ultra_in_annual_v1']) {
      const k = kinds(ctx(code.startsWith('ultra') ? 'ultra' : 'pro', code));
      const current = [k.pro.monthly, k.pro.annual, k.ultra.monthly, k.ultra.annual].filter(x => x === 'current');
      expect(current).toHaveLength(1);
    }
  });

  it('a free or signed-out account just buys', () => {
    expect(kinds(ctx('free'))).toEqual({ pro: { monthly: 'buy', annual: 'buy' }, ultra: { monthly: 'buy', annual: 'buy' } });
    expect(columnAction({ entitlements: null, plans, plan: 'pro', cycle: 'annual', now: NOW }).kind).toBe('buy');
  });

  it('a complimentary grant gets every plan, as a free account does', () => {
    const ent = ctx('pro', 'pro_in_comp_v1');
    expect(isComplimentary(ent, plans, NOW.getTime())).toBe(true);
    expect(heldSubscription(ent, plans, NOW.getTime())).toBeNull();
    expect(kinds(ent)).toEqual({ pro: { monthly: 'buy', annual: 'buy' }, ultra: { monthly: 'buy', annual: 'buy' } });
  });

  it('a paid plan whose access has run out is treated as free', () => {
    const ent = ctx('pro', 'pro_in_monthly_v2', { access_until: '2026-11-01T00:00:00Z' });
    expect(kinds(ent).pro).toEqual({ monthly: 'buy', annual: 'buy' });
  });

  it('without a plan code from the server, sells neither cycle of the plan held rather than guess', () => {
    const ent = parseEntitlements({ billing: { plan: 'pro' } });
    expect(kinds(ent)).toEqual({ pro: { monthly: 'current', annual: 'current' }, ultra: { monthly: 'buy', annual: 'buy' } });
  });
});

describe('what a switch says (the web pricing page wording)', () => {
  const copyFor = (ent: ReturnType<typeof ctx>, plan: PaidPlan, cycle: Cycle, amountMinor: number) => {
    const a = action(ent, plan, cycle);
    if (a.kind !== 'switch') throw new Error(`expected a switch, got ${a.kind}`);
    return switchCopy({ upgrade: a.upgrade, held: a.held, plan, cycle, amountMinor, now: NOW });
  };

  it('monthly to annual: the saving against their own bill, the days kept, the new date', () => {
    expect(copyFor(ctx('pro', 'pro_in_monthly_v2'), 'pro', 'annual', 199900)).toEqual({
      title: 'Move to annual and save ₹389 a year',
      body: 'Pay ₹1,999 today and keep the 19 days left on your current plan — Pro runs to 25 November 2027, and monthly billing stops.',
      cta: 'Switch to annual',
      fineSuffix: ' Your monthly plan is cancelled as part of this, and the days remaining on it are added to the year.',
    });
  });

  it('claims no saving where their grandfathered rate makes annual cost more', () => {
    expect(copyFor(ctx('pro', 'pro_in_monthly_v1', { amount_minor: 9900 }), 'pro', 'annual', 199900).title).toBe('Move to annual');
  });

  it('a re-price is stated plainly, not as a saving', () => {
    const c = copyFor(ctx('pro', 'pro_in_monthly_v1', { amount_minor: 9900 }), 'pro', 'monthly', 19900);
    expect(c.title).toBe('Move to the current plan');
    expect(c.body).toBe('Pay ₹199 today and keep the 19 days left on your current plan — Pro runs to 25 December 2026, then renews at ₹199 a month.');
    expect(c.cta).toBe('Move to current plan');
  });

  it("Pro to Ultra: a fresh period from today, and the server's refund for the unused days", () => {
    const ent = ctx('pro', 'pro_in_monthly_v2', { upgrade_refund_minor: 12000, upgrade_refund_days: 19 });
    expect(copyFor(ent, 'ultra', 'monthly', 100000)).toMatchObject({
      title: 'Move to Ultra',
      body: 'Pay ₹1,000 today — Ultra runs to 6 December 2026, and your Pro billing stops. ₹120 for your 19 unused Pro days is refunded to you within 5–7 working days.',
      cta: 'Switch to Ultra',
    });
    expect(copyFor(ctx('pro', 'pro_in_monthly_v2'), 'ultra', 'annual', 1000000).body).toBe(
      'Pay ₹10,000 today — Ultra runs to 6 November 2027, and your Pro billing stops.',
    );
  });
});

describe('upgrade arithmetic', () => {
  const held = heldSubscription(ctx('pro', 'pro_in_monthly_v2'), plans, NOW.getTime());

  it('counts the paid days left without the one-day access grace, and adds the year on to them', () => {
    const u = upgradePreview({ held, onSaleCode: 'pro_in_annual_v2', selectedPlan: 'pro', selectedCycle: 'annual', now: NOW })!;
    expect(u.carriedDays).toBe(20);
    expect(shownDays(u, NOW)).toBe(19);
    expect(shownAccessUntil(u, 'annual').toISOString()).toBe('2027-11-25T12:00:00.000Z');
  });

  it('offers nothing once plan moves are switched off', () => {
    expect(upgradePreview({ held, onSaleCode: 'ultra_in_annual_v1', selectedPlan: 'ultra', selectedCycle: 'annual', allowPlanUpgrade: false, now: NOW })).toBeNull();
  });

  it('measures the annual saving against what a monthly subscriber actually pays', () => {
    const monthly = plans[0]!;
    const annual = plans[1]!;
    expect(annualSaving(held, 'pro', monthly, annual)).toEqual({ minor: 38900, theirs: true });
    expect(annualSaving(null, 'pro', monthly, annual)).toEqual({ minor: 38900, theirs: false });
    const legacy = heldSubscription(ctx('pro', 'pro_in_monthly_v1', { amount_minor: 9900 }), plans, NOW.getTime());
    expect(annualSaving(legacy, 'pro', monthly, annual).minor).toBe(0);
    // Their Pro bill says nothing about an Ultra saving.
    expect(annualSaving(held, 'ultra', plans[2]!, plans[3]!)).toEqual({ minor: 200000, theirs: false });
  });
});
