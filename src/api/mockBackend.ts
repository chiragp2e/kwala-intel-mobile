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
