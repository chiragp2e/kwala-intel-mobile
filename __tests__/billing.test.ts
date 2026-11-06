import { ChatError, classifyChatResponse, networkFailure } from '../src/api/errors';
import {
  parseBillingAddress,
  parseDownloadUrl,
  parseEntitlements,
  parseGstStates,
  parseInvoices,
  parseSubscription,
  type Invoice,
} from '../src/api/schemas';
import {
  billingAddressError,
  billingErrorMessage,
  billingFormError,
  billingNameError,
  billingView,
  filterStates,
  freeQuotaLimit,
  invoiceAction,
  invoiceDownloadError,
  invoicesPending,
  showsBillingDetails,
} from '../src/lib/billing';
import { formatInvoiceDate, formatLongDate, formatShortDate } from '../src/lib/dates';

const tax = { total_minor: 19900, base_minor: 16864, tax_minor: 3036, rate_bp: 1800 };
const sub = (over: Record<string, unknown> = {}) =>
  parseSubscription({
    data: {
      status: 'active',
      plan: 'pro',
      plan_code: 'pro_in_monthly_v2',
      tax,
      current_period_end: '2026-12-06T12:00:00Z',
      access_until: '2026-12-07T12:00:00Z',
      cancel_at_period_end: false,
      can_resume: false,
      payment_issue: false,
      ...over,
    },
  });

describe('GET /billing/subscription', () => {
  it("reads the billing screen's fields", () => {
    expect(sub()).toMatchObject({ status: 'active', plan_code: 'pro_in_monthly_v2', tax, current_period_end: '2026-12-06T12:00:00Z' });
  });

  it("drops an odd billing field rather than the answer, so the checkout watcher still sees the plan land", () => {
    const s = sub({ cancel_at_period_end: 'yes', tax: { total_minor: 'x' }, current_period_end: 7 });
    expect(s).toMatchObject({ status: 'active', plan_code: 'pro_in_monthly_v2' });
    expect(s?.cancel_at_period_end).toBeUndefined();
    expect(s?.tax).toBeUndefined();
    expect(s?.current_period_end).toBeUndefined();
  });

  it('still reads the short answer older servers send', () => {
    expect(parseSubscription({ data: { status: 'none', plan: 'free' } })).toEqual({ status: 'none', plan: 'free' });
  });
});

describe('billingView (MOB-14)', () => {
  it('a free account: no paid plan, nothing to cancel', () => {
    expect(billingView(parseSubscription({ data: { status: 'none', plan: 'free' } }))).toMatchObject({
      paidPlan: null,
      isPaid: false,
      cancelling: false,
      amount: null,
      separateAccessUntil: null,
    });
    expect(billingView(null).isPaid).toBe(false);
  });

  it('an active subscription renews on the period end, and shows its amount with the GST split', () => {
    expect(billingView(sub())).toMatchObject({
      paidPlan: 'pro',
      isPaid: true,
      cancelling: false,
      amount: { totalMinor: 19900, baseMinor: 16864, taxMinor: 3036 },
      dateLabel: 'Renews on',
      dateIso: '2026-12-06T12:00:00Z',
      periodEnd: '2026-12-06T12:00:00Z',
      // A day of access grace is not a second date.
      separateAccessUntil: null,
    });
  });

  it('a cancelled subscription shows when access ends, and whether it can be resumed', () => {
    const v = billingView(sub({ cancel_at_period_end: true, can_resume: true }));
    expect(v).toMatchObject({ cancelling: true, canResume: true, dateLabel: 'Access until', dateIso: '2026-12-07T12:00:00Z' });
  });

  it('after a monthly-to-annual switch, shows access running past the next charge as its own date', () => {
    const v = billingView(sub({ current_period_end: '2027-11-06T12:00:00Z', access_until: '2027-11-26T12:00:00Z' }));
    expect(v.separateAccessUntil).toBe('2027-11-26T12:00:00Z');
    expect(billingView(sub({ access_until: '2027-11-26T12:00:00Z', cancel_at_period_end: true })).separateAccessUntil).toBeNull();
  });

  it('reports a failed debit', () => {
    expect(billingView(sub({ payment_issue: true })).paymentIssue).toBe(true);
  });

  it('shows billing details to a payer, or to anyone with an address on file', () => {
    expect(showsBillingDetails(true, null)).toBe(true);
    expect(showsBillingDetails(false, { address: 'x' })).toBe(true);
    expect(showsBillingDetails(false, null)).toBe(false);
  });

  it("describes the free allowance from the account's own limit when known", () => {
    expect(freeQuotaLimit(parseEntitlements({ billing: { plan: 'free' }, quota: { limit: 3, used: 0 } }))).toBe(3);
    expect(freeQuotaLimit(null)).toBe(2);
  });
});

describe('payment history', () => {
  const rows = parseInvoices({
    data: [
      { id: 'a', total_minor: 19900, state: 'emailed', downloadable: true, line_description: 'Kwala Intel Pro Monthly' },
      { id: 'b', total_minor: 19900, state: 'awaiting_address' },
      { id: 'c', total_minor: 19900, state: 'blocked' },
      { id: '', total_minor: 1 },
      { id: 'd' },
    ],
  });

  it('drops rows it cannot read', () => expect(rows.map(r => r.id)).toEqual(['a', 'b', 'c']));

  it('offers a download only where there is a PDF, and never a button that fails', () => {
    expect(rows.map(invoiceAction)).toEqual(['download', 'preparing', 'support']);
  });

  it('polls only while an invoice is being prepared', () => {
    expect(invoicesPending(rows)).toBe(true);
    expect(invoicesPending(rows.filter(r => r.state !== 'awaiting_address'))).toBe(false);
    expect(invoicesPending(undefined)).toBe(false);
    for (const state of ['queued', 'issued']) expect(invoicesPending([{ ...rows[0]!, state } as Invoice])).toBe(true);
  });

  it('tells "still being prepared" apart from a failed download', () => {
    expect(invoiceDownloadError(new ChatError(classifyChatResponse(409, { error: { message: 'not archived' } })))).toBe(
      'That invoice is still being prepared. Try again in a minute.',
    );
    expect(invoiceDownloadError(new ChatError(networkFailure()))).toBe('We could not open that invoice. Try again in a moment.');
  });

  it('reads the signed download URL', () => {
    expect(parseDownloadUrl({ data: { url: 'https://store.test/i.pdf?sig=1' } })).toBe('https://store.test/i.pdf?sig=1');
    expect(parseDownloadUrl({ data: { url: 'not a url' } })).toBeNull();
  });
});

describe('billing address', () => {
  it('is null when none is on file', () => {
    expect(parseBillingAddress({ data: null })).toBeNull();
    expect(parseBillingAddress({ data: { address: '1 MG Road', state_code: '29', state_name: 'Karnataka' } })).toMatchObject({ state_name: 'Karnataka' });
  });

  it('accepts the names a GST invoice can print', () => {
    for (const ok of ['Ada Lovelace', "D'Souza", 'M/s Sharma & Sons', 'J. R. R. Tolkien', 'Mary-Jane', 'O’Brien']) expect(billingNameError(ok)).toBeNull();
    expect(billingNameError('  ')).toBe('Enter the name to show on your invoice.');
    for (const bad of ['राम', 'Agent 47', 'José']) expect(billingNameError(bad)).toBe("Name can only contain English letters, spaces and . ' - & / _");
  });

  it('accepts an address typed in English, line breaks included', () => {
    expect(billingAddressError('Flat 4, St. John’s Road\nPune 411001')).toBeNull();
    expect(billingAddressError(' 12 ')).toBe('Enter your full billing address.');
    expect(billingAddressError('पुणे 411001 road')).toBe('Please enter your address in English.');
  });

  it('checks the form in the order the web does, the state last', () => {
    expect(billingFormError({ name: '', address: '', stateCode: '' })).toBe('Enter the name to show on your invoice.');
    expect(billingFormError({ name: 'Ada', address: 'x', stateCode: '' })).toBe('Enter your full billing address.');
    expect(billingFormError({ name: 'Ada', address: '1 MG Road, Bengaluru', stateCode: '' })).toBe('Select your state.');
    expect(billingFormError({ name: 'Ada', address: '1 MG Road, Bengaluru', stateCode: '29' })).toBeNull();
  });

  it('finds a state by any part of its name, or by its code', () => {
    const states = parseGstStates({ data: [{ code: '29', name: 'Karnataka' }, { code: '33', name: 'Tamil Nadu' }, { code: '', name: 'x' }] });
    expect(states).toHaveLength(2);
    expect(filterStates(states, 'nadu').map(s => s.code)).toEqual(['33']);
    expect(filterStates(states, '29').map(s => s.name)).toEqual(['Karnataka']);
    expect(filterStates(states, '  ')).toEqual(states);
  });
});

describe('billingErrorMessage', () => {
  it("shows the server's words for a request it refused, and the plain fallback otherwise", () => {
    const refused = new ChatError(classifyChatResponse(400, { error: { code: 'INVALID_STATE', message: 'Choose a state from the list.' } }));
    expect(billingErrorMessage(refused, 'fallback')).toBe('Choose a state from the list.');
    expect(billingErrorMessage(new ChatError(classifyChatResponse(503, { error: { message: 'db down' } })), 'fallback')).toBe('fallback');
    expect(billingErrorMessage(new ChatError(networkFailure()), 'fallback')).toBe('fallback');
    expect(billingErrorMessage(new Error('x'), 'fallback')).toBe('fallback');
  });
});

describe('dates', () => {
  const d = '2026-09-06T12:00:00Z';
  it('writes them as the web billing screens do', () => {
    expect(formatShortDate(d)).toBe('6 Sep 2026');
    expect(formatInvoiceDate(d)).toBe('06 Sep 2026');
    expect(formatLongDate(new Date(d))).toBe('6 September 2026');
  });
  it('writes a dash for a missing or unreadable date', () => {
    expect(formatShortDate(null)).toBe('-');
    expect(formatShortDate('nope')).toBe('-');
    expect(formatInvoiceDate(undefined)).toBe('—');
  });
});
