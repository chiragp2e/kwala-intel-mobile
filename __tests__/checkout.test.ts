import type { ChatBackend } from '../src/api/backend';
import { ChatError, classifyChatResponse } from '../src/api/errors';
import {
  buildCheckoutOptions,
  checkoutKeyId,
  hasLanded,
  readCheckoutError,
  readCheckoutSuccess,
  resolveCheckout,
  webPricingUrl,
} from '../src/billing/checkout';

const args = { planCode: 'ultra_in_annual_v1', plan: 'ultra' as const, cycle: 'annual' as const, webBaseUrl: 'https://web.test' };

function backend(over: Partial<ChatBackend>): ChatBackend {
  return {
    createCheckoutIntent: async () => ({ intent_id: 'ci_1' }),
    startSubscription: async () => ({ intent_id: 'ci_1', provider_subscription_id: 'sub_1' }),
    getSubscription: async () => null,
    ...over,
  } as ChatBackend;
}

describe('resolveCheckout', () => {
  it("opens Razorpay's hosted page when the server returns it", async () => {
    const create = jest.fn(async () => ({ intent_id: 'ci_9' }));
    const start = jest.fn(async () => ({ intent_id: 'ci_9', short_url: 'https://rzp.io/rzp/x' }));
    const out = await resolveCheckout(backend({ createCheckoutIntent: create, startSubscription: start }), args);
    expect(out).toEqual({ kind: 'hosted', url: 'https://rzp.io/rzp/x' });
    expect(create).toHaveBeenCalledWith('ultra_in_annual_v1');
    expect(start).toHaveBeenCalledWith('ci_9');
  });

  it('falls back to the URL on the subscription row when it belongs to this checkout', async () => {
    const out = await resolveCheckout(
      backend({ getSubscription: async () => ({ status: 'activating', plan: 'free', provider_subscription_id: 'sub_1', short_url: 'https://rzp.io/rzp/y' }) }),
      args,
    );
    expect(out).toEqual({ kind: 'hosted', url: 'https://rzp.io/rzp/y' });
  });

  it("does not use another subscription's URL", async () => {
    const out = await resolveCheckout(
      backend({ getSubscription: async () => ({ status: 'active', plan: 'pro', provider_subscription_id: 'sub_OLD', short_url: 'https://rzp.io/rzp/old' }) }),
      args,
    );
    expect(out).toEqual({ kind: 'web', url: 'https://web.test/pricing?plan=ultra&cycle=annual' });
  });

  it('surfaces a refusal (already subscribed) instead of opening anything', async () => {
    const refused = backend({
      startSubscription: async () => {
        throw new ChatError(classifyChatResponse(409, { error: { code: 'ALREADY_SUBSCRIBED', message: 'This account already has an active subscription' } }));
      },
    });
    await expect(resolveCheckout(refused, args)).rejects.toMatchObject({ failure: { message: 'This account already has an active subscription' } });
  });
});

describe('resolveCheckout with the native sheet', () => {
  const started = { intent_id: 'ci_1', provider_subscription_id: 'sub_1', provider_key_id: 'rzp_test_server', short_url: 'https://rzp.io/rzp/x' };
  const native = { ...args, nativeAvailable: true };

  it('opens the native checkout with the build key when the binary has the module', async () => {
    const out = await resolveCheckout(backend({ startSubscription: async () => started }), { ...native, buildKeyId: 'rzp_test_server' });
    expect(out).toEqual({ kind: 'native', keyId: 'rzp_test_server', subscriptionId: 'sub_1', intentId: 'ci_1' });
  });

  it("uses the server's key when the build has none", async () => {
    const out = await resolveCheckout(backend({ startSubscription: async () => started }), native);
    expect(out).toMatchObject({ kind: 'native', keyId: 'rzp_test_server' });
  });

  it('falls back to the hosted page when the build key belongs to another account or mode', async () => {
    const out = await resolveCheckout(backend({ startSubscription: async () => started }), { ...native, buildKeyId: 'rzp_test_other' });
    expect(out).toEqual({ kind: 'hosted', url: 'https://rzp.io/rzp/x' });
  });

  it('falls back to the hosted page on a binary without the native module', async () => {
    const out = await resolveCheckout(backend({ startSubscription: async () => started }), { ...args, buildKeyId: 'rzp_test_server', nativeAvailable: false });
    expect(out).toEqual({ kind: 'hosted', url: 'https://rzp.io/rzp/x' });
  });

  it('needs a subscription id to open the sheet', async () => {
    const out = await resolveCheckout(
      backend({ startSubscription: async () => ({ intent_id: 'ci_1', provider_key_id: 'rzp_test_server', short_url: 'https://rzp.io/rzp/x' }) }),
      native,
    );
    expect(out).toEqual({ kind: 'hosted', url: 'https://rzp.io/rzp/x' });
  });
});

describe('checkoutKeyId', () => {
  it('prefers the build key, falls back to the server key, refuses a mismatch', () => {
    expect(checkoutKeyId('rzp_test_a', null)).toBe('rzp_test_a');
    expect(checkoutKeyId('', 'rzp_test_b')).toBe('rzp_test_b');
    expect(checkoutKeyId(' rzp_test_a ', 'rzp_test_a')).toBe('rzp_test_a');
    expect(checkoutKeyId('rzp_test_a', 'rzp_live_a')).toBeNull();
    expect(checkoutKeyId(undefined, undefined)).toBeNull();
  });
});

describe('buildCheckoutOptions', () => {
  const target = { kind: 'native' as const, keyId: 'rzp_test_k', subscriptionId: 'sub_9', intentId: 'ci_9' };
  const base = { target, name: 'Kwala Intel Ultra', description: '₹10,000 per year · GST included', themeColor: '#4aa664' };

  it('is a subscription checkout: subscription_id, never an amount or order id', () => {
    const o = buildCheckoutOptions(base) as unknown as Record<string, unknown>;
    expect(o).toMatchObject({ key: 'rzp_test_k', subscription_id: 'sub_9', notes: { intent_id: 'ci_9' } });
    expect(o).not.toHaveProperty('amount');
    expect(o).not.toHaveProperty('order_id');
    expect(o).not.toHaveProperty('prefill');
  });

  it('prefills email and a +-prefixed phone, leaving out what is missing', () => {
    expect(buildCheckoutOptions({ ...base, email: 'a@b.co', phone: '919812345678' }).prefill).toEqual({ email: 'a@b.co', contact: '+919812345678' });
    expect(buildCheckoutOptions({ ...base, email: null, phone: '+91 98123 45678' }).prefill).toEqual({ contact: '+919812345678' });
  });
});

describe('reading the sheet result', () => {
  it('reads the ids /billing/checkout/verify needs', () => {
    expect(readCheckoutSuccess({ razorpay_payment_id: 'pay_1', razorpay_subscription_id: 'sub_1', razorpay_signature: 'sig' }, 'sub_1')).toEqual({
      kind: 'paid',
      paymentId: 'pay_1',
      subscriptionId: 'sub_1',
      signature: 'sig',
    });
    expect(readCheckoutSuccess({ razorpay_payment_id: 'pay_1' }, 'sub_1')).toEqual({ kind: 'paid', paymentId: 'pay_1', subscriptionId: 'sub_1', signature: null });
  });

  it('treats closing the sheet as a cancel, not an error', () => {
    expect(readCheckoutError({ code: 0, description: 'Payment Cancelled' }, 'android')).toEqual({ kind: 'cancelled' });
    expect(readCheckoutError({ code: 2, description: 'Payment cancelled by user' }, 'ios')).toEqual({ kind: 'cancelled' });
    const json = JSON.stringify({ error: { code: 'BAD_REQUEST_ERROR', description: 'Payment processing cancelled by user', reason: 'payment_cancelled' } });
    expect(readCheckoutError({ code: 5, description: json }, 'android')).toEqual({ kind: 'cancelled' });
  });

  it("shows the gateway's own reason for a failure", () => {
    const json = JSON.stringify({ error: { code: 'BAD_REQUEST_ERROR', description: 'Your bank declined the mandate', reason: 'payment_failed' } });
    expect(readCheckoutError({ code: 5, description: json }, 'android')).toEqual({
      kind: 'failed',
      message: "Payment didn't go through: Your bank declined the mandate",
    });
    expect(readCheckoutError({ code: 0, description: 'Network error' }, 'ios')).toEqual({ kind: 'failed', message: "Payment didn't go through: Network error" });
    expect(readCheckoutError(undefined, 'android')).toEqual({ kind: 'failed', message: "Payment didn't go through. Please try again." });
  });
});

describe('webPricingUrl', () => {
  it('uses the parameters the web pricing page reads', () => {
    expect(webPricingUrl('https://w', 'pro', 'monthly')).toBe('https://w/pricing?plan=pro&cycle=monthly');
  });
});

describe('hasLanded', () => {
  it('is true only for an active subscription on the bought plan', () => {
    expect(hasLanded({ status: 'active', plan: 'ultra', plan_code: 'ultra_in_annual_v1' }, 'ultra_in_annual_v1', 'ultra')).toBe(true);
    expect(hasLanded({ status: 'activating', plan: 'ultra', plan_code: 'ultra_in_annual_v1' }, 'ultra_in_annual_v1', 'ultra')).toBe(false);
    // Still on the old Pro mandate while an upgrade is in flight.
    expect(hasLanded({ status: 'active', plan: 'pro', plan_code: 'pro_in_monthly_v2' }, 'ultra_in_annual_v1', 'ultra')).toBe(false);
    expect(hasLanded({ status: 'active', plan: 'ultra' }, 'ultra_in_annual_v1', 'ultra')).toBe(true);
    expect(hasLanded(null, 'x', 'pro')).toBe(false);
  });
});
