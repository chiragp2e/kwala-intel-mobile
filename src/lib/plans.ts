import type { PlanView } from '../api/schemas';

export type Cycle = 'monthly' | 'annual';
export type PaidPlan = 'pro' | 'ultra';

export const PLAN_NAME: Record<PaidPlan, string> = { pro: 'Pro', ultra: 'Ultra' };

/** The same lists the Kwala web app shows (kwala-intel-fe/src/lib/billing/plans.ts). */
export const PLAN_FEATURES: Record<PaidPlan, string[]> = {
  pro: [
    'Unlimited AI research questions',
    'Every sector and watchlist unlocked',
    'Full market telemetry and standard indicators',
    'Answers in English and Indian languages',
  ],
  ultra: [
    'Strongest Kwala Intel AI Agent yet',
    'Advanced models for complex tasks',
    'Early access to advanced Kwala Intel features',
    'Higher response token limit',
    'Higher reasoning power',
    'Everything in Pro',
  ],
};

/** The priced row for one plan and cycle. Matches the plan as well as the cycle, so one plan's price never sits beside another's button. */
export function findPlan(plans: PlanView[], plan: PaidPlan, cycle: Cycle): PlanView | null {
  return (
    plans.find(p => p.billing_interval === cycle && (p.plan ? p.plan === plan : p.plan_code.startsWith(`${plan}_`))) ?? null
  );
}

/** What paying annually saves over twelve monthly payments, in paise. 0 when it saves nothing. */
export function annualSavingMinor(monthly: PlanView | null, annual: PlanView | null): number {
  if (!monthly || !annual) return 0;
  return Math.max(0, monthly.amount_minor * 12 - annual.amount_minor);
}

/** The annual price spread over twelve months, in paise (rounded). */
export function effectiveMonthlyMinor(annual: PlanView): number {
  return Math.round(annual.amount_minor / 12);
}

/** Which plans the server actually sells, in display order. */
export function availablePlans(plans: PlanView[]): PaidPlan[] {
  return (['pro', 'ultra'] as const).filter(p => findPlan(plans, p, 'monthly') || findPlan(plans, p, 'annual'));
}

export interface PlanAndCycle {
  plan: PaidPlan;
  cycle: Cycle;
}

/**
 * Every code the web app knows (kwala-intel-fe/src/lib/billing/plans.ts): the
 * ones on sale and the superseded ones still held by grandfathered customers.
 * Read-only: this names what somebody is ON, it never picks what to sell.
 */
const KNOWN_CODES: Record<string, PlanAndCycle> = {
  pro_in_monthly_v2: { plan: 'pro', cycle: 'monthly' },
  pro_in_annual_v2: { plan: 'pro', cycle: 'annual' },
  ultra_in_monthly_v1: { plan: 'ultra', cycle: 'monthly' },
  ultra_in_annual_v1: { plan: 'ultra', cycle: 'annual' },
  pro_in_monthly_v1: { plan: 'pro', cycle: 'monthly' },
  pro_in_annual_v1: { plan: 'pro', cycle: 'annual' },
};

/**
 * The plan and billing cycle a plan code names: the server's price list first
 * (every code on sale), then the codes above. Null for a code neither claims,
 * such as a complimentary grant: an unknown code is never guessed at, because
 * the answer decides what a paying customer is offered.
 */
export function planOfCode(planCode: string | null | undefined, plans: PlanView[] = []): PlanAndCycle | null {
  if (!planCode) return null;
  const row = plans.find(p => p.plan_code === planCode);
  if (row) {
    const plan = row.plan ?? (planCode.startsWith('ultra_') ? 'ultra' : planCode.startsWith('pro_') ? 'pro' : null);
    if (plan) return { plan, cycle: row.billing_interval };
  }
  return KNOWN_CODES[planCode] ?? null;
}
