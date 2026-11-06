import { z } from 'zod';

/**
 * Every response is parsed at the boundary. A shape the app does not
 * understand is dropped or rejected here instead of crashing a screen later.
 * The shapes are the ones the Kwala web app reads today.
 */

export const ChatSessionSchema = z.object({
  id: z.string().min(1),
  title: z.string().nullish().transform(v => v ?? ''),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});
export type ChatSession = z.infer<typeof ChatSessionSchema>;

// Blocks are rich visual answers. Version one renders the prose ones and shows
// a pointer to the web app for the rest, so only the discriminator is typed.
export const BlockSchema = z.object({ type: z.string() }).catchall(z.unknown());
export type Block = z.infer<typeof BlockSchema>;

export const StoredMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant']),
  content: z.string().default(''),
  created_at: z.string().nullish(),
  blocks: z.array(BlockSchema).nullish(),
});
export type StoredMessage = z.infer<typeof StoredMessageSchema>;

/** Lists are parsed item by item: one malformed row must not hide the rest. */
export function parseList<T>(schema: z.ZodType<T>, raw: unknown): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const item of raw) {
    const r = schema.safeParse(item);
    if (r.success) out.push(r.data);
  }
  return out;
}

const QuotaSchema = z
  .object({
    unlimited: z.boolean().nullish(),
    limit: z.number().nullish(),
    used: z.number().nullish(),
    remaining: z.number().nullish(),
    resets_at: z.string().nullish(),
  })
  .nullish();

const ContextSchema = z.object({
  // Beyond `plan`, the billing fields are read one by one (see heldBilling):
  // an odd value in one of them must not cost the user their plan.
  billing: z
    .object({
      plan: z.string().nullish(),
      plan_code: z.unknown().optional(),
      amount_minor: z.unknown().optional(),
      access_until: z.unknown().optional(),
      cancel_at_period_end: z.unknown().optional(),
      payment_issue: z.unknown().optional(),
      upgrade_refund_minor: z.unknown().optional(),
      upgrade_refund_days: z.unknown().optional(),
    })
    .nullish(),
  quota: QuotaSchema,
});

/**
 * The subscription behind the plan, from the me/context billing block: the
 * same fields the web app's entitlement reads (kwala-intel-fe
 * src/lib/billing/entitlements.ts). `planCode` is what names the billing
 * cycle the customer holds.
 */
export interface EntitlementBilling {
  /** The code held, current or superseded (e.g. pro_in_monthly_v2). */
  planCode: string;
  /** What this customer is actually billed, in paise. Not necessarily the list price. */
  amountMinor: number | null;
  accessUntil: string | null;
  cancelAtPeriodEnd: boolean;
  paymentIssue: boolean;
  /** What moving up to Ultra would refund now, in paise, as the server works it out. */
  upgradeRefundMinor: number | null;
  upgradeRefundDays: number | null;
}

export interface Entitlements {
  plan: 'free' | 'pro' | 'ultra';
  quota: { unlimited: boolean; limit: number; used: number; remaining: number; resetAt: string | null } | null;
  /** Present once the account has a subscription (paid now, or lapsed). */
  billing?: EntitlementBilling;
}

const asString = (v: unknown) => (typeof v === 'string' && v ? v : null);
const asNumber = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function heldBilling(b: z.infer<typeof ContextSchema>['billing']): EntitlementBilling | undefined {
  const planCode = asString(b?.plan_code);
  if (!planCode) return undefined;
  return {
    planCode,
    amountMinor: asNumber(b?.amount_minor),
    accessUntil: asString(b?.access_until),
    cancelAtPeriodEnd: b?.cancel_at_period_end === true,
    paymentIssue: b?.payment_issue === true,
    upgradeRefundMinor: asNumber(b?.upgrade_refund_minor),
    upgradeRefundDays: asNumber(b?.upgrade_refund_days),
  };
}

/** GET /auth/me/context. An unknown plan is treated as free: the only safe
 *  direction for a client to be wrong in. */
export function parseEntitlements(raw: unknown): Entitlements | null {
  const root = raw && typeof raw === 'object' && 'data' in raw ? (raw as { data: unknown }).data : raw;
  const r = ContextSchema.safeParse(root);
  if (!r.success) return null;
  const plan = r.data.billing?.plan === 'pro' || r.data.billing?.plan === 'ultra' ? r.data.billing.plan : 'free';
  const q = r.data.quota;
  const unlimited = plan !== 'free' || q?.unlimited === true;
  const hasNumbers = typeof q?.limit === 'number' && typeof q?.used === 'number';
  const billing = heldBilling(r.data.billing);
  return {
    plan,
    ...(billing ? { billing } : {}),
    quota:
      unlimited || !hasNumbers
        ? unlimited
          ? { unlimited: true, limit: 0, used: 0, remaining: 0, resetAt: null }
          : null
        : {
            unlimited: false,
            limit: q.limit as number,
            used: q.used as number,
            remaining: q.remaining ?? Math.max(0, (q.limit as number) - (q.used as number)),
            resetAt: q.resets_at ?? null,
          },
  };
}

const TaxSchema = z.object({
  total_minor: z.number(),
  base_minor: z.number(),
  tax_minor: z.number(),
  rate_bp: z.number(),
});

/** One purchasable plan from GET /billing/plans. Amounts are integer paise. */
export const PlanViewSchema = z.object({
  plan_code: z.string().min(1),
  plan: z.enum(['pro', 'ultra']).nullish().transform(v => v ?? undefined),
  billing_interval: z.enum(['monthly', 'annual']),
  currency: z.string().default('INR'),
  amount_minor: z.number().int().nonnegative(),
  display_name: z.string().default(''),
  tax: TaxSchema.nullish().transform(v => v ?? undefined),
});
export type PlanView = z.infer<typeof PlanViewSchema>;

const unwrapData = (raw: unknown) => (raw && typeof raw === 'object' && 'data' in raw ? (raw as { data: unknown }).data : raw);

/** POST /billing/checkout-intents and POST /billing/subscriptions both answer with this. */
export const CheckoutIntentSchema = z.object({
  intent_id: z.string().min(1),
  /** The backend's Razorpay key id (publishable). Never the secret. */
  provider_key_id: z.string().nullish(),
  provider_subscription_id: z.string().nullish(),
  short_url: z.string().url().nullish(),
});
export type CheckoutIntent = z.infer<typeof CheckoutIntentSchema>;

/**
 * GET /billing/subscription: the caller's own subscription. Also the answer to
 * checkout/verify and to subscription/cancel and /resume. The fields after
 * `short_url` are the billing screen's; each falls back to empty on an odd
 * value, so one of them can never sink the checkout watcher that reads the rest.
 */
export const SubscriptionSchema = z.object({
  status: z.string().default('none'), // activating | active | failed | none
  plan: z.string().default('free'),
  plan_code: z.string().nullish(),
  provider_subscription_id: z.string().nullish(),
  short_url: z.string().nullish(),
  /** The amount of the plan held, split for display. */
  tax: TaxSchema.nullish().catch(undefined),
  provider_status: z.string().nullish().catch(undefined),
  state: z.string().nullish().catch(undefined),
  /** When the provider next charges. */
  current_period_end: z.string().nullish().catch(undefined),
  /** When access ends. Later than the period end after a monthly-to-annual switch. */
  access_until: z.string().nullish().catch(undefined),
  cancel_at_period_end: z.boolean().nullish().catch(undefined),
  /** A cancellation can still be reversed on the same mandate. */
  can_resume: z.boolean().nullish().catch(undefined),
  /** The last debit failed; access continues while it is retried. */
  payment_issue: z.boolean().nullish().catch(undefined),
});
export type Subscription = z.infer<typeof SubscriptionSchema>;

export function parseCheckoutIntent(raw: unknown): CheckoutIntent | null {
  const r = CheckoutIntentSchema.safeParse(unwrapData(raw));
  return r.success ? r.data : null;
}
export function parseSubscription(raw: unknown): Subscription | null {
  const r = SubscriptionSchema.safeParse(unwrapData(raw));
  return r.success ? r.data : null;
}

/** GET/PUT /billing/address: what is printed on the customer's GST invoices. */
export const BillingAddressSchema = z.object({
  address: z.string(),
  state_code: z.string(),
  state_name: z.string().default(''),
  billing_name: z.string().nullish(),
  gstin: z.string().nullish(),
  updated_at: z.string().nullish(),
});
export type BillingAddress = z.infer<typeof BillingAddressSchema>;

/** The fields PUT /billing/address takes. */
export interface BillingAddressInput {
  address: string;
  state_code: string;
  billing_name: string;
}

/** Null when none is on file, which the server sends as `{ data: null }`. */
export function parseBillingAddress(raw: unknown): BillingAddress | null {
  const r = BillingAddressSchema.safeParse(unwrapData(raw));
  return r.success ? r.data : null;
}

/** One entry of GET /billing/states, the server's own GST state list. */
export const GstStateSchema = z.object({ code: z.string().min(1), name: z.string().min(1) });
export type GstState = z.infer<typeof GstStateSchema>;

/** One row of GET /billing/invoices: a payment and its GST invoice. */
export const InvoiceSchema = z.object({
  id: z.string().min(1),
  payment_id: z.string().nullish(),
  invoice_number: z.string().nullish(),
  invoice_date: z.string().nullish(),
  currency: z.string().default('INR'),
  total_minor: z.number(),
  base_minor: z.number().nullish(),
  tax_minor: z.number().nullish(),
  line_description: z.string().default(''),
  period_start: z.string().nullish(),
  period_end: z.string().nullish(),
  /** awaiting_address | queued | issued | archived | emailed | blocked */
  state: z.string().default(''),
  created_at: z.string().nullish(),
  /** Server-derived: only an archived row has a PDF behind it. */
  downloadable: z.boolean().default(false),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export function parseInvoices(raw: unknown): Invoice[] {
  return parseList(InvoiceSchema, unwrapData(raw));
}
export function parseGstStates(raw: unknown): GstState[] {
  return parseList(GstStateSchema, unwrapData(raw));
}

/** GET /billing/invoices/:id/download: a signed URL that expires in about a minute. */
export function parseDownloadUrl(raw: unknown): string | null {
  const r = z.object({ url: z.string().url() }).safeParse(unwrapData(raw));
  return r.success ? r.data.url : null;
}
