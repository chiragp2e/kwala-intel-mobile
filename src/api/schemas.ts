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
  billing: z.object({ plan: z.string().nullish() }).nullish(),
  quota: QuotaSchema,
});

export interface Entitlements {
  plan: 'free' | 'pro' | 'ultra';
  quota: { unlimited: boolean; limit: number; used: number; remaining: number; resetAt: string | null } | null;
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
  return {
    plan,
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

/** GET /billing/subscription: the caller's own subscription. */
export const SubscriptionSchema = z.object({
  status: z.string().default('none'), // activating | active | failed | none
  plan: z.string().default('free'),
  plan_code: z.string().nullish(),
  provider_subscription_id: z.string().nullish(),
  short_url: z.string().nullish(),
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
