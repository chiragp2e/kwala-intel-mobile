import type { Entitlements, PlanView } from '../api/schemas';
import { formatLongDate } from './dates';
import { formatInr } from './money';
import { PLAN_NAME, findPlan, planOfCode, type Cycle, type PaidPlan, type PlanAndCycle } from './plans';

/**
 * What a customer who already pays may buy, and how the pricing screen says
 * it. A port of the web app's rules (kwala-intel-fe/src/lib/billing/upgrade.ts
 * and the purchase guard in components/billing/UpgradeSheet.tsx), which mirror
 * the server's isPermittedTransition:
 *
 *   - monthly to annual on the same plan: allowed; the days already paid for
 *     are added to the year
 *   - a superseded plan code to the one on sale, same cycle: allowed (a re-price)
 *   - Pro to Ultra: allowed, except annual to monthly; unused Pro days are refunded
 *   - everything else (annual to monthly, Ultra to Pro, the exact plan held):
 *     refused, so it is never offered
 *
 * Pure, because each sentence here is a promise about money.
 */

/** Order of the paid plans, mirroring productRank on the server. A move is only ever up. */
const PLAN_RANK: Record<PaidPlan, number> = { pro: 1, ultra: 2 };

const DAY_MS = 24 * 60 * 60 * 1000;
/** BILLING_ACCESS_GRACE on the server: access runs this far past the paid period. Offers quote the paid period. */
const ACCESS_GRACE_MS = DAY_MS;

/** Whether Pro may move up to Ultra: the web's PLAN_UPGRADES_ENABLED, the server's crossProductUpgrades. */
export const PLAN_UPGRADES_ENABLED = true;

/** The paid subscription an account holds, with the plan and cycle its code names. */
export interface Holding extends PlanAndCycle {
  planCode: string;
  accessUntil: string | null;
  /** What they are actually billed, in paise; often not the list price after a price change. */
  amountMinor: number | null;
  upgradeRefundMinor: number | null;
  upgradeRefundDays: number | null;
}

export interface UpgradePreview {
  /**
   * `cycle`: monthly to annual. `reprice`: same cycle, from a superseded code
   * to the one on sale. `plan`: Pro to Ultra.
   */
  kind: 'cycle' | 'reprice' | 'plan';
  /** Whole days of paid access carried across; 0 for `plan`, which refunds them instead. */
  carriedDays: number;
  /** Where access lands. For `plan`, one fresh period from today. */
  newAccessUntil: Date;
  currentAccessUntil: Date;
  /** `plan` only: the server's own refund figure, in paise. Never estimated here. */
  refundMinor: number | null;
}

/** Holds a paid plan right now. A cancelled plan with access left is still paid (the web's isPaid). */
export function hasPaidAccess(ent: Entitlements | null | undefined, nowMs: number = Date.now()): boolean {
  if (!ent || ent.plan === 'free') return false;
  const until = ent.billing?.accessUntil;
  if (!until) return true;
  const t = Date.parse(until);
  return Number.isNaN(t) ? true : t > nowMs;
}

/** The paid subscription held. Null for a free account and for a complimentary grant. */
export function heldSubscription(
  ent: Entitlements | null | undefined,
  plans: PlanView[],
  nowMs: number = Date.now(),
): Holding | null {
  if (!ent?.billing || !hasPaidAccess(ent, nowMs)) return null;
  const named = planOfCode(ent.billing.planCode, plans);
  if (!named) return null;
  const b = ent.billing;
  return {
    ...named,
    planCode: b.planCode,
    accessUntil: b.accessUntil,
    amountMinor: b.amountMinor,
    upgradeRefundMinor: b.upgradeRefundMinor,
    upgradeRefundDays: b.upgradeRefundDays,
  };
}

/**
 * Paid access on a code no sold plan claims: a complimentary grant. As on the
 * web it gets the page a free account does, every plan and cycle; buying ends
 * the grant on the server.
 */
export function isComplimentary(ent: Entitlements | null | undefined, plans: PlanView[], nowMs: number = Date.now()): boolean {
  return !!ent?.billing && hasPaidAccess(ent, nowMs) && planOfCode(ent.billing.planCode, plans) === null;
}

/** A preview only for a move the server permits; null for everything else. */
export function upgradePreview(input: {
  held: Holding | null;
  /** The code on sale for the selected plan and cycle; null when it is not sold. */
  onSaleCode: string | null;
  selectedPlan: PaidPlan;
  selectedCycle: Cycle;
  /** Overrides PLAN_UPGRADES_ENABLED. For tests. */
  allowPlanUpgrade?: boolean;
  now?: Date;
}): UpgradePreview | null {
  const { held, onSaleCode, selectedPlan, selectedCycle } = input;
  const now = input.now ?? new Date();
  if (!held || !held.accessUntil) return null;

  // Another plan: only up the ladder, and never annual to monthly.
  const isPlanUpgrade =
    held.plan !== selectedPlan &&
    (input.allowPlanUpgrade ?? PLAN_UPGRADES_ENABLED) &&
    PLAN_RANK[selectedPlan] > PLAN_RANK[held.plan] &&
    !(held.cycle === 'annual' && selectedCycle === 'monthly');
  if (held.plan !== selectedPlan && !isPlanUpgrade) return null;

  const isCycleUpgrade = !isPlanUpgrade && held.cycle === 'monthly' && selectedCycle === 'annual';
  // Re-buying the identical code is refused server-side as a second mandate.
  const isReprice = !isPlanUpgrade && held.cycle === selectedCycle && onSaleCode !== null && held.planCode !== onSaleCode;
  if (!isPlanUpgrade && !isCycleUpgrade && !isReprice) return null;

  const current = new Date(held.accessUntil);
  if (Number.isNaN(current.getTime()) || current <= now) return null;

  // Calendar arithmetic: "a year" or "a month" as the provider bills it. A
  // plan move starts fresh today; the others add on to the paid days.
  const newAccessUntil = new Date(isPlanUpgrade ? now : current);
  if (selectedCycle === 'annual') newAccessUntil.setFullYear(newAccessUntil.getFullYear() + 1);
  else newAccessUntil.setMonth(newAccessUntil.getMonth() + 1);

  const leftMs = current.getTime() - now.getTime();
  return {
    kind: isPlanUpgrade ? 'plan' : isCycleUpgrade ? 'cycle' : 'reprice',
    carriedDays: isPlanUpgrade ? 0 : Math.ceil(leftMs / DAY_MS),
    newAccessUntil,
    currentAccessUntil: current,
    refundMinor: isPlanUpgrade ? held.upgradeRefundMinor : null,
  };
}

function paidPeriodEnd(upgrade: UpgradePreview): Date {
  return new Date(upgrade.currentAccessUntil.getTime() - ACCESS_GRACE_MS);
}

/** Whole paid days left, the grace not counted: the number the offer quotes. */
export function shownDays(upgrade: UpgradePreview, now: Date = new Date()): number {
  if (upgrade.kind === 'plan') return upgrade.carriedDays;
  return Math.max(0, Math.floor((paidPeriodEnd(upgrade).getTime() - now.getTime()) / DAY_MS));
}

/** The date shown beside shownDays: the paid period's end plus the new cycle, so the two agree. */
export function shownAccessUntil(upgrade: UpgradePreview, cycle: Cycle): Date {
  if (upgrade.kind === 'plan') return upgrade.newAccessUntil;
  const d = paidPeriodEnd(upgrade);
  if (cycle === 'annual') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

/** What one priced column offers this account. */
export type ColumnAction =
  /** Free, signed out or complimentary: an ordinary first purchase. */
  | { kind: 'buy' }
  /** The plan AND cycle held. */
  | { kind: 'current' }
  /** A permitted move from what is held. */
  | { kind: 'switch'; upgrade: UpgradePreview; held: Holding }
  /** Refused by the server, so not offered; `reason` says why. */
  | { kind: 'unavailable'; reason: string };

/** Why a paying customer cannot buy a column: the web's purchaseBlockedReason. */
function blockedReason(held: PlanAndCycle, plan: PaidPlan, cycle: Cycle): string {
  if (held.plan !== plan) {
    if (held.plan === 'ultra') return `You’re on ${PLAN_NAME.ultra}. Moving down to ${PLAN_NAME[plan]} is not available.`;
    if (held.cycle === 'annual' && cycle === 'monthly') {
      return `Moving from ${PLAN_NAME[held.plan]} annual to a monthly plan is not available.`;
    }
    return `You’re on ${PLAN_NAME[held.plan]}. Switching to ${PLAN_NAME[plan]} is not available yet.`;
  }
  if (held.cycle === 'annual' && cycle === 'monthly') return `Moving from ${PLAN_NAME[plan]} annual to monthly is not available.`;
  return `You’re already on ${PLAN_NAME[plan]} ${held.cycle}. There is nothing to buy here.`;
}

/**
 * The pricing screen's decision for one column. Only the plan and cycle the
 * account actually holds is "current"; the other cycle of the same plan is the
 * monthly-to-annual switch when the server permits it.
 */
export function columnAction(args: {
  entitlements: Entitlements | null | undefined;
  plans: PlanView[];
  plan: PaidPlan;
  cycle: Cycle;
  now?: Date;
}): ColumnAction {
  const now = args.now ?? new Date();
  const ent = args.entitlements;
  if (!ent || !hasPaidAccess(ent, now.getTime())) return { kind: 'buy' };
  if (!ent.billing) {
    // A server that sends no plan code leaves the cycle held unknown. Rather
    // than guess, neither cycle of the plan held is sold (the server would
    // refuse a second subscription anyway).
    return ent.plan === args.plan ? { kind: 'current' } : { kind: 'buy' };
  }
  const held = heldSubscription(ent, args.plans, now.getTime());
  if (!held) return { kind: 'buy' };
  const upgrade = upgradePreview({
    held,
    onSaleCode: findPlan(args.plans, args.plan, args.cycle)?.plan_code ?? null,
    selectedPlan: args.plan,
    selectedCycle: args.cycle,
    now,
  });
  if (upgrade) return { kind: 'switch', upgrade, held };
  if (held.plan === args.plan && held.cycle === args.cycle) return { kind: 'current' };
  return { kind: 'unavailable', reason: blockedReason(held, args.plan, args.cycle) };
}

/**
 * What paying annually saves over a year of monthly payments, in paise. For a
 * monthly subscriber of this plan it is measured against what THEY pay
 * (`theirs`), which after a price change is often not the list price. Never
 * negative.
 */
export function annualSaving(
  held: Holding | null,
  plan: PaidPlan,
  monthly: PlanView | null,
  annual: PlanView | null,
): { minor: number; theirs: boolean } {
  if (!annual) return { minor: 0, theirs: false };
  const theirs = held && held.plan === plan && held.cycle === 'monthly' && held.amountMinor != null ? held.amountMinor : null;
  const base = theirs ?? monthly?.amount_minor ?? null;
  if (base === null) return { minor: 0, theirs: false };
  return { minor: Math.max(0, base * 12 - annual.amount_minor), theirs: theirs !== null };
}

export interface SwitchCopy {
  title: string;
  body: string;
  /** The button. */
  cta: string;
  /** Added to the column's billing line, after "until you cancel." */
  fineSuffix: string;
}

const dayWord = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/**
 * The words for a permitted move, as the web's pricing page offers it to a
 * subscriber: what they pay today, the date they will have access to, and
 * what happens to the plan they hold.
 */
export function switchCopy(args: {
  upgrade: UpgradePreview;
  held: Holding;
  plan: PaidPlan;
  cycle: Cycle;
  /** This column's price, in paise. */
  amountMinor: number;
  now?: Date;
}): SwitchCopy {
  const { upgrade, held, plan, cycle, amountMinor } = args;
  const pay = formatInr(amountMinor);
  if (upgrade.kind === 'plan') {
    const refund =
      upgrade.refundMinor != null && upgrade.refundMinor > 0
        ? ` ${formatInr(upgrade.refundMinor)} for your ${held.upgradeRefundDays != null ? `${held.upgradeRefundDays} ` : ''}unused ${PLAN_NAME[held.plan]} days is refunded to you within 5–7 working days.`
        : '';
    return {
      title: `Move to ${PLAN_NAME[plan]}`,
      body: `Pay ${pay} today — ${PLAN_NAME[plan]} runs to ${formatLongDate(upgrade.newAccessUntil)}, and your ${PLAN_NAME[held.plan]} billing stops.${refund}`,
      cta: `Switch to ${PLAN_NAME[plan]}`,
      fineSuffix: ` Your ${PLAN_NAME[held.plan]} plan is cancelled as part of this, and the unused part of it is refunded.`,
    };
  }
  const kept = `Pay ${pay} today and keep the ${dayWord(shownDays(upgrade, args.now))} left on your current plan — ${PLAN_NAME[plan]} runs to ${formatLongDate(shownAccessUntil(upgrade, cycle))}`;
  if (upgrade.kind === 'reprice') {
    return {
      title: 'Move to the current plan',
      body: `${kept}, then renews at ${pay} ${cycle === 'annual' ? 'a year' : 'a month'}.`,
      cta: 'Move to current plan',
      fineSuffix: '',
    };
  }
  // Only a saving against their OWN monthly bill; a grandfathered rate often has none.
  const saves = held.amountMinor != null && held.cycle === 'monthly' ? held.amountMinor * 12 - amountMinor : 0;
  return {
    title: saves > 0 ? `Move to annual and save ${formatInr(saves)} a year` : 'Move to annual',
    body: `${kept}, and monthly billing stops.`,
    cta: 'Switch to annual',
    fineSuffix: ' Your monthly plan is cancelled as part of this, and the days remaining on it are added to the year.',
  };
}
