import type { ChatBackend } from './backend';
import { ChatError, abortedFailure } from './errors';
import { mockChartGallery } from './mockBlocks';
import type { ChatSession, StoredMessage } from './schemas';

/**
 * DEVELOPMENT ONLY. Used when APP_ENV=development and USE_MOCK_BACKEND=true;
 * readEnv() never enables it for staging or production. It answers with canned
 * text so the UI can be built and shown without credentials. It is not a
 * statement about what the real service returns.
 */
export function createMockBackend(): ChatBackend {
  const sessions = new Map<string, ChatSession>();
  const messages = new Map<string, StoredMessage[]>();
  let n = 0;
  const wait = (ms: number, signal?: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new ChatError(abortedFailure()));
      });
    });

  return {
    async createSession(id) {
      const now = new Date().toISOString();
      const s = sessions.get(id) ?? { id, title: '', created_at: now, updated_at: now };
      sessions.set(id, s);
      return s;
    },
    async listSessions() {
      return [...sessions.values()].reverse();
    },
    async getMessages(sessionId) {
      return messages.get(sessionId) ?? [];
    },
    async deleteSession(sessionId) {
      sessions.delete(sessionId);
      messages.delete(sessionId);
    },
    async getEntitlements() {
      return { plan: 'free', quota: { unlimited: false, limit: 2, used: 0, remaining: 2, resetAt: null } };
    },
    async getPlans() {
      // Illustrative development prices (GST 18% included); the real list comes from the server.
      const row = (plan: 'pro' | 'ultra', cycle: 'monthly' | 'annual', total: number) => {
        const base = Math.round(total / 1.18);
        return {
          plan_code: `${plan}_in_${cycle}_dev`,
          plan,
          billing_interval: cycle,
          currency: 'INR',
          amount_minor: total,
          display_name: `${plan} ${cycle}`,
          tax: { total_minor: total, base_minor: base, tax_minor: total - base, rate_bp: 1800 },
        };
      };
      return [
        row('pro', 'monthly', 19900),
        row('pro', 'annual', 199900),
        row('ultra', 'monthly', 100000),
        row('ultra', 'annual', 1000000),
      ];
    },
    async createCheckoutIntent(planCode) {
      return { intent_id: `mock-intent-${planCode}` };
    },
    async startSubscription(intentId) {
      return { intent_id: intentId, provider_subscription_id: 'sub_mock', short_url: null };
    },
    async getSubscription() {
      return { status: 'none', plan: 'free' };
    },
    async verifyCheckout() {
      return { status: 'none', plan: 'free' };
    },
    // The billing screen. Illustrative data: a past Pro subscription with two
    // invoices and an address on file, so every block of the screen renders.
    async cancelSubscription() {
      const end = new Date(Date.now() + 20 * 86_400_000).toISOString();
      return {
        status: 'active',
        plan: 'pro',
        plan_code: 'pro_in_monthly_dev',
        tax: { total_minor: 19900, base_minor: 16864, tax_minor: 3036, rate_bp: 1800 },
        current_period_end: end,
        access_until: end,
        cancel_at_period_end: true,
        can_resume: true,
        payment_issue: false,
      };
    },
    async resumeSubscription() {
      const end = new Date(Date.now() + 20 * 86_400_000).toISOString();
      return {
        status: 'active',
        plan: 'pro',
        plan_code: 'pro_in_monthly_dev',
        tax: { total_minor: 19900, base_minor: 16864, tax_minor: 3036, rate_bp: 1800 },
        current_period_end: end,
        access_until: end,
        cancel_at_period_end: false,
        can_resume: false,
        payment_issue: false,
      };
    },
    async getBillingAddress() {
      return {
        billing_name: 'Dev Mock',
        address: '42, 2nd Cross Road, Indiranagar, Bengaluru 560038',
        state_code: '29',
        state_name: 'Karnataka',
        updated_at: '2026-10-06T10:00:00Z',
      };
    },
    async saveBillingAddress(input) {
      const state = (await this.listGstStates()).find(s => s.code === input.state_code);
      return { ...input, state_name: state?.name ?? '', updated_at: new Date().toISOString() };
    },
    async listGstStates() {
      // A subset of the server's list (GET /billing/states), enough to try the picker.
      return [
        { code: '07', name: 'Delhi' },
        { code: '24', name: 'Gujarat' },
        { code: '06', name: 'Haryana' },
        { code: '29', name: 'Karnataka' },
        { code: '32', name: 'Kerala' },
        { code: '23', name: 'Madhya Pradesh' },
        { code: '27', name: 'Maharashtra' },
        { code: '08', name: 'Rajasthan' },
        { code: '33', name: 'Tamil Nadu' },
        { code: '36', name: 'Telangana' },
        { code: '09', name: 'Uttar Pradesh' },
        { code: '19', name: 'West Bengal' },
      ];
    },
    async listInvoices() {
      const invoice = (seq: number, date: string) => ({
        id: `mock-invoice-${seq}`,
        payment_id: `mock-payment-${seq}`,
        invoice_number: `KI/2026-27/0000${seq}`,
        invoice_date: date,
        currency: 'INR',
        total_minor: 19900,
        base_minor: 16864,
        tax_minor: 3036,
        line_description: 'Kwala Intel Pro Monthly',
        state: 'emailed',
        created_at: date,
        downloadable: true,
      });
      return [invoice(2, '2026-10-06T10:00:00Z'), invoice(1, '2026-09-06T10:00:00Z')];
    },
    async getInvoiceDownloadUrl() {
      return 'https://example.com/mock-invoice.pdf';
    },
    async emailInvoice() {
      await wait(400);
    },
    async streamChat({ sessionId, message, signal, onEvent }) {
      const list = messages.get(sessionId) ?? [];
      const now = new Date().toISOString();
      list.push({ id: `mock-u-${++n}`, role: 'user', content: message, created_at: now });
      onEvent({ type: 'status', content: 'Reading the market…' });
      await wait(400, signal);
      if (/chart/i.test(message)) {
        // A gallery of every chart type (see mockBlocks.ts), streamed block by block as the real service does.
        const blocks = mockChartGallery();
        for (const block of blocks) {
          onEvent({ type: 'block', content: block });
          await wait(60, signal);
        }
        list.push({ id: `mock-a-${++n}`, role: 'assistant', content: '', blocks: blocks as never, created_at: new Date().toISOString() });
        messages.set(sessionId, list);
        onEvent({ type: 'done' });
        return;
      }
      const answer =
        'This is a development mock reply, not market research.\n\n' +
        `You asked: "${message}"\n\n` +
        '- **Levels**: support and resistance would appear here.\n' +
        '- **Plan**: an invalidation level and risk to reward.\n' +
        '- **Why it moved**: what drove the move.';
      for (const word of answer.split(/(\s+)/)) {
        onEvent({ type: 'token', content: word });
        await wait(25, signal);
      }
      const s = sessions.get(sessionId);
      if (s && !s.title) {
        s.title = message.slice(0, 60);
        onEvent({ type: 'session_title', content: s.title });
      }
      list.push({ id: `mock-a-${++n}`, role: 'assistant', content: answer, created_at: new Date().toISOString() });
      messages.set(sessionId, list);
      onEvent({ type: 'done' });
    },
  };
}
