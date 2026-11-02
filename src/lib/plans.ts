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
