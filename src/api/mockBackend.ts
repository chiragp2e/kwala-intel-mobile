import type { ChatBackend } from './backend';
import { ChatError, abortedFailure } from './errors';
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
    async streamChat({ sessionId, message, signal, onEvent }) {
      const list = messages.get(sessionId) ?? [];
      const now = new Date().toISOString();
      list.push({ id: `mock-u-${++n}`, role: 'user', content: message, created_at: now });
      onEvent({ type: 'status', content: 'Reading the market…' });
      await wait(400, signal);
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
