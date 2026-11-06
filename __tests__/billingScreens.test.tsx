import React from 'react';
import * as WebBrowser from 'expo-web-browser';
import TestRenderer, { act } from 'react-test-renderer';
import { PlanViewSchema, parseEntitlements, parseInvoices, parseList, parseSubscription } from '../src/api/schemas';
import { BillingScreen } from '../src/screens/BillingScreen';
import { PricingScreen } from '../src/screens/PricingScreen';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'dismiss' })), dismissBrowser: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/config/env', () => ({ env: { webBaseUrl: 'https://web.test', razorpayKeyId: '', apiBaseUrl: 'https://api.test', useMockBackend: false } }));
const mockAuth = jest.fn();
jest.mock('../src/auth/AuthContext', () => ({ useAuth: () => mockAuth() }));
const mockBackend = {
  createCheckoutIntent: jest.fn(async () => ({ intent_id: 'ci_1' })),
  startSubscription: jest.fn(async () => ({ intent_id: 'ci_1', short_url: 'https://rzp.test/x' })),
  getSubscription: jest.fn(async () => null),
  getInvoiceDownloadUrl: jest.fn(async () => 'https://store.test/inv.pdf?sig=1'),
  emailInvoice: jest.fn(async () => {}),
};
jest.mock('../src/api', () => ({ getBackend: () => mockBackend }));

const mockQ = {
  plans: jest.fn(),
  entitlements: jest.fn(),
  subscription: jest.fn(),
  address: jest.fn(),
  invoices: jest.fn(),
  states: jest.fn(),
  change: jest.fn(),
  save: jest.fn(),
};
const mockInvalidate = { entitlements: jest.fn(), sessions: jest.fn() };
jest.mock('../src/state/queries', () => ({
  usePlans: () => mockQ.plans(),
  useEntitlements: () => mockQ.entitlements(),
  useInvalidate: () => mockInvalidate,
  useSubscription: () => mockQ.subscription(),
  useBillingAddress: () => mockQ.address(),
  useInvoices: () => mockQ.invoices(),
  useGstStates: () => mockQ.states(),
  useSubscriptionChange: () => mockQ.change(),
  useSaveBillingAddress: () => mockQ.save(),
}));

const plans = parseList(PlanViewSchema, [
  { plan_code: 'pro_in_monthly_v2', plan: 'pro', billing_interval: 'monthly', amount_minor: 19900 },
  { plan_code: 'pro_in_annual_v2', plan: 'pro', billing_interval: 'annual', amount_minor: 199900 },
  { plan_code: 'ultra_in_monthly_v1', plan: 'ultra', billing_interval: 'monthly', amount_minor: 100000 },
  { plan_code: 'ultra_in_annual_v1', plan: 'ultra', billing_interval: 'annual', amount_minor: 1000000 },
]);
const inAWhile = new Date(Date.now() + 20 * 86_400_000).toISOString();
const holding = (plan: 'pro' | 'ultra', code: string) =>
  parseEntitlements({ billing: { plan, plan_code: code, access_until: inAWhile, amount_minor: 19900 }, quota: { unlimited: true } });

// The pull-to-refresh element is a prop, and would make the tree circular.
const texts = (r: TestRenderer.ReactTestRenderer) => JSON.stringify(r.toJSON(), (k, v) => (k === 'refreshControl' ? undefined : v));
const count = (r: TestRenderer.ReactTestRenderer, s: string) => texts(r).split(s).length - 1;
const byLabel = (r: TestRenderer.ReactTestRenderer, label: string) =>
  r.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
/** Lets the promise chain a press starts (checkout, a download) run to the end. */
const flush = () =>
  act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });
const press = async (r: TestRenderer.ReactTestRenderer, label: string) => {
  await act(async () => {
    byLabel(r, label).props.onPress();
  });
  await flush();
};
const navigation = { navigate: jest.fn(), popTo: jest.fn(), setOptions: jest.fn() };

function render(el: React.ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(el);
  });
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockReturnValue({ status: 'signedIn', user: { id: 'u1', email: 'ada@example.com', phone: null } });
  mockQ.plans.mockReturnValue({ data: plans, isError: false, refetch: jest.fn() });
});

describe('PricingScreen: only the plan and cycle held is current (MOB-13)', () => {
  it('a Pro monthly subscriber sees Pro monthly as current and an enabled switch to Pro annual', async () => {
    mockQ.entitlements.mockReturnValue({ data: holding('pro', 'pro_in_monthly_v2') });
    const r = render(<PricingScreen navigation={navigation as never} route={undefined as never} />);
    expect(texts(r)).toContain('You are on Pro');
    // It opens on the plan they hold, not the default Ultra tab.
    const proTab = r.root.find(n => n.props.accessibilityRole === 'radio' && n.props.accessibilityLabel === 'Pro' && n.props.onPress);
    expect(proTab.props.accessibilityState).toEqual({ selected: true });
    expect(count(r, 'This is your current plan')).toBe(1);
    expect(texts(r)).toContain('Move to annual and save ₹389 a year');
    expect(texts(r)).toContain('and monthly billing stops.');
    expect(texts(r)).toContain('SAVE ₹389 VS YOUR PLAN');

    const cta = byLabel(r, 'Switch to annual, ₹1,999 per year');
    expect(cta.props.disabled).toBe(false);
    await act(async () => {
      cta.props.onPress();
    });
    await flush();
    expect(mockBackend.createCheckoutIntent).toHaveBeenCalledWith('pro_in_annual_v2');
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://rzp.test/x', expect.any(Object));
    act(() => r.unmount());
  });

  it('a Pro annual subscriber is told monthly is not available, with no buy button for it', () => {
    mockQ.entitlements.mockReturnValue({ data: holding('pro', 'pro_in_annual_v2') });
    const r = render(<PricingScreen navigation={navigation as never} route={undefined as never} />);
    expect(count(r, 'This is your current plan')).toBe(1);
    expect(texts(r)).toContain('Moving from Pro annual to monthly is not available.');
    expect(r.root.findAll(n => n.props.accessibilityLabel === 'Get Pro monthly, ₹199 per month')).toHaveLength(0);
  });

  it('links a subscriber to billing', async () => {
    mockQ.entitlements.mockReturnValue({ data: holding('pro', 'pro_in_monthly_v2') });
    const r = render(<PricingScreen navigation={navigation as never} route={undefined as never} />);
    await press(r, 'Manage billing');
    expect(navigation.navigate).toHaveBeenCalledWith('Billing');
  });

  it('a free account gets both cycles to buy and nothing marked current', () => {
    mockQ.entitlements.mockReturnValue({ data: parseEntitlements({ billing: { plan: 'free' }, quota: { limit: 2, used: 1 } }) });
    const r = render(<PricingScreen navigation={navigation as never} route={undefined as never} />);
    expect(count(r, 'This is your current plan')).toBe(0);
    expect(byLabel(r, 'Get Ultra annual, ₹10,000 per year').props.disabled).toBe(false);
    expect(byLabel(r, 'Get Ultra monthly, ₹1,000 per month').props.disabled).toBe(false);
  });
});

describe('BillingScreen (MOB-14)', () => {
  const tax = { total_minor: 19900, base_minor: 16864, tax_minor: 3036, rate_bp: 1800 };
  const active = parseSubscription({
    data: {
      status: 'active',
      plan: 'pro',
      plan_code: 'pro_in_monthly_v2',
      tax,
      current_period_end: '2026-12-06T12:00:00Z',
      access_until: '2026-12-07T12:00:00Z',
      cancel_at_period_end: false,
      can_resume: false,
    },
  });
  const mutate = jest.fn();
  const saveMutate = jest.fn();
  const renderBilling = () => render(<BillingScreen navigation={navigation as never} route={undefined as never} />);

  beforeEach(() => {
    mockQ.entitlements.mockReturnValue({ data: parseEntitlements({ billing: { plan: 'free' }, quota: { limit: 2, used: 0 } }) });
    mockQ.subscription.mockReturnValue({ data: active, isError: false, refetch: jest.fn() });
    mockQ.address.mockReturnValue({ data: null, isPending: false, refetch: jest.fn() });
    mockQ.invoices.mockReturnValue({ data: [], isError: false, refetch: jest.fn() });
    mockQ.states.mockReturnValue({ data: [{ code: '29', name: 'Karnataka' }, { code: '33', name: 'Tamil Nadu' }], isPending: false, isError: false });
    mockQ.change.mockReturnValue({ mutate, isPending: false, variables: undefined });
    mockQ.save.mockReturnValue({ mutate: saveMutate, isPending: false });
  });

  it('shows the plan, its amount with GST, and when it renews', () => {
    const t = texts(renderBilling());
    for (const s of ['Your plan, renewal date, and cancellation.', 'Current plan', 'Kwala Intel Pro', 'Active', 'Amount', '₹199', '(₹168.64 + ₹30.36 GST)', 'Renews on', '6 Dec 2026']) {
      expect(t).toContain(s);
    }
    expect(t).toContain('Cancelling stops auto-renewal.');
  });

  it('asks before cancelling, then cancels', async () => {
    const r = renderBilling();
    await press(r, 'Cancel subscription');
    expect(mutate).not.toHaveBeenCalled();
    expect(texts(r)).toContain('Cancel and keep access until 6 Dec 2026?');
    await press(r, 'Keep it');
    expect(texts(r)).not.toContain('Cancel and keep access until');
    await press(r, 'Cancel subscription');
    await press(r, 'Yes, cancel');
    expect(mutate).toHaveBeenCalledWith('cancel', expect.any(Object));
  });

  it('offers resume while it is possible, and a fresh purchase once it is not', async () => {
    mockQ.subscription.mockReturnValue({ data: { ...active, cancel_at_period_end: true, can_resume: true }, isError: false, refetch: jest.fn() });
    let r = renderBilling();
    expect(texts(r)).toContain('Ending');
    expect(texts(r)).toContain('Access until');
    expect(texts(r)).toContain('7 Dec 2026');
    await press(r, 'Resume subscription');
    expect(mutate).toHaveBeenCalledWith('resume', expect.any(Object));

    mockQ.subscription.mockReturnValue({ data: { ...active, cancel_at_period_end: true, can_resume: false }, isError: false, refetch: jest.fn() });
    r = renderBilling();
    await press(r, 'Subscribe again');
    expect(navigation.navigate).toHaveBeenCalledWith('Pricing');
  });

  it('warns about a failed payment without saying the account is closed', () => {
    mockQ.subscription.mockReturnValue({ data: { ...active, payment_issue: true }, isError: false, refetch: jest.fn() });
    expect(texts(renderBilling())).toContain('The last payment did not go through. Your access continues while we retry');
  });

  it('a free account sees its allowance and a way to Pro, and no billing details or history', async () => {
    mockQ.subscription.mockReturnValue({ data: parseSubscription({ data: { status: 'none', plan: 'free' } }), isError: false, refetch: jest.fn() });
    const r = renderBilling();
    const t = texts(r);
    expect(t).toContain('Free plan');
    expect(t).toContain('2 AI research questions a day, resetting at midnight IST.');
    expect(t).not.toContain('Billing details');
    expect(t).not.toContain('Payment history');
    await press(r, 'Get Pro');
    expect(navigation.navigate).toHaveBeenCalledWith('Pricing');
  });

  it('shows the address on file and lets it be edited', async () => {
    mockQ.address.mockReturnValue({
      data: { billing_name: 'Ada Lovelace', address: '1 MG Road, Bengaluru 560001', state_code: '29', state_name: 'Karnataka' },
      isPending: false,
      refetch: jest.fn(),
    });
    const r = renderBilling();
    for (const s of ['Billing details', 'Ada Lovelace', '1 MG Road, Bengaluru 560001', 'Karnataka (29)']) expect(texts(r)).toContain(s);
    await press(r, 'Edit billing details');
    expect(texts(r)).toContain('Changes apply to future invoices. Invoices already issued cannot be changed.');
    expect(texts(r)).toContain('Save changes');
  });

  it('a payer with no address is asked for one, checked before it is sent', async () => {
    const r = renderBilling();
    await press(r, 'Save and continue');
    expect(texts(r)).toContain('Enter the name to show on your invoice.');
    expect(saveMutate).not.toHaveBeenCalled();

    const type = (label: string, value: string) =>
      act(() => r.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onChangeText === 'function').props.onChangeText(value));
    type('Name on invoice', '  Ada Lovelace ');
    type('Billing address', ' 1 MG Road, Bengaluru 560001 ');
    await press(r, 'State, search your state');
    await press(r, 'Karnataka');
    await press(r, 'Save and continue');
    expect(saveMutate).toHaveBeenCalledWith(
      { address: '1 MG Road, Bengaluru 560001', state_code: '29', billing_name: 'Ada Lovelace' },
      expect.any(Object),
    );
  });

  it('lists payments with their invoices, and opens a download in the in-app browser', async () => {
    mockQ.invoices.mockReturnValue({
      data: parseInvoices([
        { id: 'a', invoice_number: 'KI/2026-27/00002', invoice_date: '2026-10-06T12:00:00Z', total_minor: 19900, line_description: 'Kwala Intel Pro Monthly', state: 'emailed', downloadable: true },
        { id: 'b', total_minor: 19900, state: 'queued', created_at: '2026-09-06T12:00:00Z' },
        { id: 'c', total_minor: 19900, state: 'blocked', created_at: '2026-08-06T12:00:00Z' },
      ]),
      isError: false,
      refetch: jest.fn(),
    });
    const r = renderBilling();
    for (const s of ['Payment history', '06 Oct 2026', 'Kwala Intel Pro Monthly', 'Invoice no. KI/2026-27/00002', 'Download', 'Preparing…', 'Contact support']) {
      expect(texts(r)).toContain(s);
    }
    await press(r, 'Download invoice KI/2026-27/00002');
    expect(mockBackend.getInvoiceDownloadUrl).toHaveBeenCalledWith('a');
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://store.test/inv.pdf?sig=1', expect.any(Object));
    await press(r, 'Email this invoice');
    expect(mockBackend.emailInvoice).toHaveBeenCalledWith('a');
    expect(r.root.findAll(n => n.props.accessibilityLabel === 'Invoice sent').length).toBeGreaterThan(0);
    act(() => r.unmount());
  });

  it('asks a guest to sign in', () => {
    mockAuth.mockReturnValue({ status: 'signedOut', user: null });
    expect(texts(renderBilling())).toContain('Sign in to see your billing');
  });

  it('offers a retry when the subscription cannot be read', async () => {
    const refetch = jest.fn();
    mockQ.subscription.mockReturnValue({ data: undefined, isError: true, error: new Error('offline'), refetch });
    const r = renderBilling();
    expect(texts(r)).toContain('Could not load your subscription.');
    await press(r, 'Try again');
    expect(refetch).toHaveBeenCalled();
  });
});
