import type { ChatBackend } from '../api/backend';
import type { Subscription } from '../api/schemas';
import type { Cycle, PaidPlan } from '../lib/plans';

/**
 * Paying from the app.
 *
 * The backend registers a subscription on the signed-in account and the
 * customer authorises it in Razorpay's native checkout sheet, the same
 * subscription checkout the web app runs. The checkout's success callback goes
 * to /billing/checkout/verify so the plan activates at once; the webhook stays
 * the source of truth and the app watches the subscription until it lands.
 *
 * Builds without the native module (an over-the-air update reaching an older
 * binary) or without a usable key fall back to Razorpay's hosted page for the
 * same subscription (`short_url`), and failing that to the web pricing page.
 */
export type CheckoutTarget =
  | { kind: 'native'; keyId: string; subscriptionId: string; intentId: string }
  | { kind: 'hosted'; url: string }
  | { kind: 'web'; url: string };

/** The web pricing page, preselected. It reads `plan=pro|ultra` and `cycle=monthly|annual`. */
export function webPricingUrl(webBaseUrl: string, plan: PaidPlan, cycle: Cycle): string {
  return `${webBaseUrl}/pricing?plan=${plan}&cycle=${cycle}`;
}

/**
 * The key the native checkout opens with: the build's own (RAZORPAY_KEY_ID),
 * else the one the server sent with the intent. A build key that differs from
 * the server's belongs to another Razorpay account or mode, where this
 * subscription does not exist, so no key is returned and the caller falls back
 * to the hosted page.
 */
export function checkoutKeyId(buildKey: string | null | undefined, serverKey: string | null | undefined): string | null {
  const build = buildKey?.trim() || null;
  const server = serverKey?.trim() || null;
  if (build && server && build !== server) return null;
  return build ?? server;
}

/**
 * Where to send the customer for this plan code. Throws ChatError when the
 * backend refuses (e.g. already subscribed), so the caller can show its message.
 */
export async function resolveCheckout(
  backend: ChatBackend,
  args: { planCode: string; plan: PaidPlan; cycle: Cycle; webBaseUrl: string; buildKeyId?: string; nativeAvailable?: boolean },
): Promise<CheckoutTarget> {
  const intent = await backend.createCheckoutIntent(args.planCode);
  const started = await backend.startSubscription(intent.intent_id);

  const keyId = checkoutKeyId(args.buildKeyId, started.provider_key_id ?? intent.provider_key_id);
  if (args.nativeAvailable && keyId && started.provider_subscription_id) {
    return { kind: 'native', keyId, subscriptionId: started.provider_subscription_id, intentId: started.intent_id };
  }

  let url = started.short_url ?? null;
  if (!url) {
    // Older servers keep the URL on the subscription row only.
    const sub = await backend.getSubscription().catch(() => null);
    if (sub?.short_url && (!started.provider_subscription_id || sub.provider_subscription_id === started.provider_subscription_id)) {
      url = sub.short_url;
    }
  }
  return url ? { kind: 'hosted', url } : { kind: 'web', url: webPricingUrl(args.webBaseUrl, args.plan, args.cycle) };
}

/** Whether the subscription now grants the plan just bought. */
export function hasLanded(sub: Subscription | null, planCode: string, plan: PaidPlan): boolean {
  if (!sub || sub.status !== 'active') return false;
  return sub.plan_code ? sub.plan_code === planCode : sub.plan === plan;
}

/** What react-native-razorpay's `open` takes for a subscription checkout. */
export interface NativeCheckoutOptions {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  theme: { color: string };
  notes?: Record<string, string>;
  prefill?: { email?: string; contact?: string };
}

/**
 * Options for the native sheet. Pure, so the rule that matters most is
 * testable: a subscription checkout carries `subscription_id` and never an
 * `amount` or `order_id`, which would be a client-chosen price.
 */
export function buildCheckoutOptions(input: {
  target: Extract<CheckoutTarget, { kind: 'native' }>;
  name: string;
  description: string;
  themeColor: string;
  email?: string | null;
  phone?: string | null;
}): NativeCheckoutOptions {
  const options: NativeCheckoutOptions = {
    key: input.target.keyId,
    subscription_id: input.target.subscriptionId,
    name: input.name,
    description: input.description,
    theme: { color: input.themeColor },
    // Internal identifier only: notes are visible in the Razorpay dashboard.
    notes: { intent_id: input.target.intentId },
  };
  // Omitted rather than empty: the sheet renders an empty field for an empty value.
  const prefill: NonNullable<NativeCheckoutOptions['prefill']> = {};
  if (input.email) prefill.email = input.email;
  const digits = input.phone?.replace(/[^\d]/g, '');
  if (digits) prefill.contact = `+${digits}`; // Supabase stores phones without the plus
  if (Object.keys(prefill).length > 0) options.prefill = prefill;
  return options;
}

export type NativeCheckoutOutcome =
  /** Paid. The three ids are what /billing/checkout/verify needs; missing ones mean "wait for the webhook". */
  | { kind: 'paid'; paymentId: string | null; subscriptionId: string; signature: string | null }
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string };

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Reads the sheet's success payload. */
export function readCheckoutSuccess(raw: unknown, subscriptionId: string): NativeCheckoutOutcome {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    kind: 'paid',
    paymentId: str(d.razorpay_payment_id),
    subscriptionId: str(d.razorpay_subscription_id) ?? subscriptionId,
    signature: str(d.razorpay_signature),
  };
}

/** The SDK's "cancelled by user" code: Checkout.PAYMENT_CANCELED on Android, 2 on iOS. */
const CANCEL_CODE: Record<string, number> = { android: 0, ios: 2 };

/**
 * Reads the sheet's error payload. Android often sends the gateway's JSON
 * error as the description, so that is unpacked before anything is shown.
 */
export function readCheckoutError(raw: unknown, os: string): Extract<NativeCheckoutOutcome, { kind: 'cancelled' | 'failed' }> {
  const e = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  let description = str(e.description) ?? '';
  let reason = str(e.reason) ?? '';
  if (description.startsWith('{')) {
    try {
      const parsed = JSON.parse(description) as { error?: Record<string, unknown> } & Record<string, unknown>;
      const inner = parsed.error ?? parsed;
      description = str(inner.description) ?? '';
      reason = str(inner.reason) ?? reason;
    } catch {
      description = '';
    }
  }
  if (Number(e.code) === CANCEL_CODE[os] || /cancel/i.test(reason) || /cancel/i.test(description)) return { kind: 'cancelled' };
  return {
    kind: 'failed',
    message: description ? `Payment didn't go through: ${description}` : "Payment didn't go through. Please try again.",
  };
}
