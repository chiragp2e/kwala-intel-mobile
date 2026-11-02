import { PlanViewSchema, parseList } from '../src/api/schemas';
import { formatInr } from '../src/lib/money';
import { annualSavingMinor, availablePlans, effectiveMonthlyMinor, findPlan } from '../src/lib/plans';

const row = (plan: 'pro' | 'ultra' | undefined, cycle: string, amount: number, code = `${plan}_x_${cycle}`) => ({
  plan_code: code,
  plan,
  billing_interval: cycle,
  currency: 'INR',
  amount_minor: amount,
  display_name: '',
  tax: { total_minor: amount, base_minor: 1, tax_minor: 1, rate_bp: 1800 },
});

describe('formatInr', () => {
  it.each([
    [1000000, '₹10,000'],
    [100000, '₹1,000'],
    [84746, '₹847.46'],
    [152542, '₹1,525.42'],
    [12345678900, '₹12,34,56,789'],
    [19900, '₹199'],
    [5, '₹0.05'],
    [0, '₹0'],
    [-250, '-₹2.50'],
  ])('%i paise -> %s', (paise, out) => expect(formatInr(paise)).toBe(out));
});

const row2 = (cycle: string, amount: number) => parseList(PlanViewSchema, [row('pro', cycle, amount)])[0]!;

describe('plan helpers', () => {
  const plans = parseList(PlanViewSchema, [
    row('pro', 'monthly', 19900),
    row('pro', 'annual', 199900),
    row('ultra', 'monthly', 100000),
    row('ultra', 'annual', 1000000),
    { bad: true },
  ]);

  it('drops rows that are not a priced plan', () => expect(plans).toHaveLength(4));

  it("matches the plan as well as the cycle, never another plan's price", () => {
    expect(findPlan(plans, 'ultra', 'annual')?.amount_minor).toBe(1000000);
    expect(findPlan(plans, 'pro', 'monthly')?.amount_minor).toBe(19900);
  });

  it('falls back to the plan code when the server sends no plan', () => {
    const [p] = parseList(PlanViewSchema, [row(undefined, 'monthly', 100000, 'ultra_in_monthly_v1')]);
    expect(findPlan([p!], 'ultra', 'monthly')).not.toBeNull();
    expect(findPlan([p!], 'pro', 'monthly')).toBeNull();
  });

  it('computes the annual saving against twelve monthly payments, never negative', () => {
    expect(annualSavingMinor(findPlan(plans, 'ultra', 'monthly'), findPlan(plans, 'ultra', 'annual'))).toBe(200000);
    expect(annualSavingMinor(findPlan(plans, 'pro', 'monthly'), findPlan(plans, 'pro', 'annual'))).toBe(38900);
    // An annual price above twelve months of monthly saves nothing, and is never shown as a saving.
    expect(annualSavingMinor(row2('monthly', 1000), row2('annual', 20000))).toBe(0);
    expect(annualSavingMinor(null, null)).toBe(0);
  });

  it('spreads the annual price over twelve months', () => {
    expect(effectiveMonthlyMinor(findPlan(plans, 'ultra', 'annual')!)).toBe(83333);
  });

  it('lists only the plans the server sells', () => {
    expect(availablePlans(plans)).toEqual(['pro', 'ultra']);
    expect(availablePlans(plans.filter(p => p.plan === 'ultra'))).toEqual(['ultra']);
    expect(availablePlans([])).toEqual([]);
  });
});
