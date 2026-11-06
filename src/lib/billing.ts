import { ChatError } from '../api/errors';
import type { Entitlements, GstState, Invoice, Subscription } from '../api/schemas';
import type { PaidPlan } from './plans';

/**
 * The billing screen's reading of the server's answers, kept pure so the rules
 * that decide what a paying customer is told can be tested. Ported from the
 * web app's Billing page (kwala-intel-fe/src/pages/Billing.tsx) and its
 * components/billing/InvoiceTable.tsx and BillingAddressForm.tsx.
 */

export interface BillingView {
  /** The paid plan the subscription grants; null for free. */
  paidPlan: PaidPlan | null;
  isPaid: boolean;
  /** Auto-renewal stopped; access runs to the end of the paid period. */
  cancelling: boolean;
  canResume: boolean;
  paymentIssue: boolean;
  /** The plan's amount, split for display (GST inclusive). */
  amount: { totalMinor: number; baseMinor: number; taxMinor: number } | null;
  /** "Renews on" the next charge, or "Access until" once cancelled. */
  dateLabel: 'Renews on' | 'Access until';
  dateIso: string | null;
  /**
   * Access running past the next charge, shown as its own date. They diverge
   * after a monthly-to-annual switch, which adds the unused monthly days on
   * top; otherwise this is null and only one date is shown.
   */
  separateAccessUntil: string | null;
  /** The date the cancel confirmation promises access to. */
  periodEnd: string | null;
}

/** A day and a half: absorbs the server's one-day access grace, which is not a date to show. */
const SEPARATE_DATE_SLACK_MS = 36 * 60 * 60 * 1000;

function separateAccessDate(sub: Subscription): string | null {
  if (!sub.access_until || !sub.current_period_end) return null;
  const access = Date.parse(sub.access_until);
  const period = Date.parse(sub.current_period_end);
  if (Number.isNaN(access) || Number.isNaN(period)) return null;
  return access - period > SEPARATE_DATE_SLACK_MS ? sub.access_until : null;
}

/** GET /billing/subscription, as the billing screen shows it. */
export function billingView(sub: Subscription | null | undefined): BillingView {
  const paidPlan = sub?.plan === 'pro' || sub?.plan === 'ultra' ? sub.plan : null;
  const isPaid = paidPlan !== null;
  const cancelling = sub?.cancel_at_period_end === true;
  return {
    paidPlan,
    isPaid,
    cancelling,
    canResume: sub?.can_resume === true,
    paymentIssue: sub?.payment_issue === true,
    amount: isPaid && sub?.tax ? { totalMinor: sub.tax.total_minor, baseMinor: sub.tax.base_minor, taxMinor: sub.tax.tax_minor } : null,
    dateLabel: cancelling ? 'Access until' : 'Renews on',
    dateIso: (cancelling ? sub?.access_until : sub?.current_period_end) ?? null,
    separateAccessUntil: isPaid && sub && !cancelling ? separateAccessDate(sub) : null,
    periodEnd: sub?.current_period_end ?? null,
  };
}

/**
 * The billing-details block shows whenever there is an address on file or the
 * customer is paying: a lapsed customer may still need a past invoice
 * corrected. Someone who never paid has nothing billed, so sees nothing.
 */
export function showsBillingDetails(isPaid: boolean, address: unknown): boolean {
  return isPaid || !!address;
}

/** The web's own fallback for the free allowance (VITE_FREE_QUOTA_LIMIT's default). */
const FREE_QUOTA_FALLBACK = 2;

/** The free daily allowance to describe: the account's own limit when the server reported one. */
export function freeQuotaLimit(ent: Entitlements | null | undefined): number {
  const q = ent?.quota;
  return q && !q.unlimited && q.limit > 0 ? q.limit : FREE_QUOTA_FALLBACK;
}

// ── Payment history ─────────────────────────────────────────────────────

/** Rows in these states have no PDF behind them yet. */
const PREPARING = new Set(['awaiting_address', 'queued', 'issued']);

/** Re-read the list this often, only while an invoice is still being prepared. */
export const INVOICE_POLL_MS = 15_000;

export type InvoiceAction = 'download' | 'preparing' | 'support';

/** What a row offers: never a download button that would fail. */
export function invoiceAction(row: Invoice): InvoiceAction {
  if (row.downloadable) return 'download';
  return PREPARING.has(row.state) ? 'preparing' : 'support';
}

/** Whether any row is still on its way to a PDF, which is what keeps the list polling. */
export function invoicesPending(rows: Invoice[] | null | undefined): boolean {
  return (rows ?? []).some(r => PREPARING.has(r.state));
}

/** Why a download did not open. 409 is a row numbered but not yet archived: a real, short-lived state. */
export function invoiceDownloadError(e: unknown): string {
  return e instanceof ChatError && e.failure.status === 409
    ? 'That invoice is still being prepared. Try again in a minute.'
    : 'We could not open that invoice. Try again in a moment.';
}

// ── Billing address ─────────────────────────────────────────────────────

/** Printed verbatim on a GST invoice: English letters and the punctuation real names use. */
const BILLING_NAME = /^[A-Za-z][A-Za-z .'’\-&/_]*$/;
/** Printable ASCII plus line breaks and tabs; ’ because iOS substitutes it for ' as you type. */
const BILLING_ADDRESS = /^[\x20-\x7E\t\r\n’]+$/;
const ADDRESS_MIN_LENGTH = 5;

/** An error for the "Name on invoice" field, or null when it is valid. */
export function billingNameError(name: string): string | null {
  const t = name.trim();
  if (!t) return 'Enter the name to show on your invoice.';
  return BILLING_NAME.test(t) ? null : "Name can only contain English letters, spaces and . ' - & / _";
}

/** An error for the "Billing address" field, or null when it is valid. */
export function billingAddressError(address: string): string | null {
  const t = address.trim();
  if (t.length < ADDRESS_MIN_LENGTH) return 'Enter your full billing address.';
  return BILLING_ADDRESS.test(t) ? null : 'Please enter your address in English.';
}

/** The first problem with the form, in the order the web checks it; null when it can be saved. */
export function billingFormError(form: { name: string; address: string; stateCode: string }): string | null {
  return billingNameError(form.name) ?? billingAddressError(form.address) ?? (form.stateCode ? null : 'Select your state.');
}

/**
 * The state picker's filter: substring rather than prefix (nobody remembers
 * whether it is "Tamil Nadu" or "Nadu, Tamil"), and the code too, because that
 * is what an accountant reads off a previous invoice.
 */
export function filterStates(states: GstState[], query: string): GstState[] {
  const q = query.trim().toLowerCase();
  if (!q) return states;
  return states.filter(s => s.name.toLowerCase().includes(q) || s.code.includes(q));
}

/**
 * The message to show for a failed billing call: the server's own words for a
 * request it refused (they are about the input, and written for the user),
 * otherwise the caller's plain fallback.
 */
export function billingErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof ChatError && e.failure.status !== null && e.failure.status >= 400 && e.failure.status < 500 && e.failure.message) {
    return e.failure.message;
  }
  return fallback;
}
