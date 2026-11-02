import { fetch as streamingFetch } from 'expo/fetch';
import { env } from '../config/env';
import type { ChatBackend } from './backend';
import { ChatError, classifyChatResponse, networkFailure, streamFailure } from './errors';
import { getAuthBridge, requestJson } from './http';
import {
  ChatSessionSchema,
  parseCheckoutIntent,
  parseSubscription,
  PlanViewSchema,
  StoredMessageSchema,
  parseEntitlements,
  parseList,
} from './schemas';
import { LineBuffer, parseEventLine } from './sse';

const enc = encodeURIComponent;

/**
 * The real backend:
 *   - sessions and chat: the AI service (AI_API_BASE_URL), as the web app does
 *   - entitlements and quota: the Go API (API_BASE_URL), GET /auth/me/context
 * Both take the Supabase access token as a bearer token.
 */
export function createRealBackend(): ChatBackend {
  const ai = env.aiApiBaseUrl;
  const api = env.apiBaseUrl;

  return {
    async createSession(id) {
      const raw = await requestJson(`${ai}/api/sessions`, { method: 'POST', body: { id } });
      const parsed = ChatSessionSchema.safeParse(raw);
      // A server that ignores the client id answers with its own; that wins.
      return parsed.success ? parsed.data : { id, title: '' };
    },

    async listSessions() {
      return parseList(ChatSessionSchema, await requestJson(`${ai}/api/sessions`));
    },

    async getMessages(sessionId) {
      return parseList(StoredMessageSchema, await requestJson(`${ai}/api/sessions/${enc(sessionId)}/messages`));
    },

    async deleteSession(sessionId) {
      await requestJson(`${ai}/api/sessions/${enc(sessionId)}`, { method: 'DELETE' });
    },

    async getEntitlements() {
      return parseEntitlements(await requestJson(`${api}/auth/me/context`));
    },

    async getPlans() {
      const raw = await requestJson(`${api}/billing/plans`);
      const rows = raw && typeof raw === 'object' && 'data' in raw ? (raw as { data: unknown }).data : raw;
      return parseList(PlanViewSchema, rows);
    },

    async createCheckoutIntent(planCode) {
      const intent = parseCheckoutIntent(
        await requestJson(`${api}/billing/checkout-intents`, { method: 'POST', body: { plan_code: planCode, surface: 'mobile_app' } }),
      );
      if (!intent) throw new ChatError(streamFailure('Checkout could not be started. Please try again.'));
      return intent;
    },

    async startSubscription(intentId) {
      const intent = parseCheckoutIntent(
        await requestJson(`${api}/billing/subscriptions`, { method: 'POST', body: { intent_id: intentId }, timeoutMs: 30_000 }),
      );
      if (!intent) throw new ChatError(streamFailure('Checkout could not be started. Please try again.'));
      return intent;
    },

    async getSubscription() {
      return parseSubscription(await requestJson(`${api}/billing/subscription`));
    },

    async verifyCheckout({ paymentId, subscriptionId, signature }) {
      return parseSubscription(
        await requestJson(`${api}/billing/checkout/verify`, {
          method: 'POST',
          body: { provider_payment_id: paymentId, provider_subscription_id: subscriptionId, signature },
          timeoutMs: 30_000,
        }),
      );
    },

    async streamChat({ sessionId, message, signal, onEvent }) {
      const bridge = getAuthBridge();
      const post = async (token: string | null) =>
        streamingFetch(`${ai}/api/chat/${enc(sessionId)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ message }),
          signal,
        });

      let response: Awaited<ReturnType<typeof post>>;
      try {
        let token = await bridge.getAccessToken();
        response = await post(token);
        if (response.status === 401 && token) {
          token = await bridge.refresh();
          if (!token) bridge.onSessionExpired();
          else response = await post(token);
        }
      } catch (e) {
        if (signal.aborted) throw e;
        throw new ChatError(networkFailure());
      }

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        throw new ChatError(classifyChatResponse(response.status, body));
      }
      if (!response.body) throw new ChatError(streamFailure());

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const lines = new LineBuffer();
      const emit = (chunk: string[]) => {
        for (const line of chunk) {
          const event = parseEventLine(line);
          if (event) onEvent(event);
        }
      };
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          emit(lines.push(decoder.decode(value, { stream: true })));
        }
        emit(lines.push(decoder.decode()));
        emit(lines.flush());
      } catch (e) {
        // An abort, or an `error` event the caller raised from onEvent, is not a dropped connection.
        if (signal.aborted || e instanceof ChatError) throw e;
        // The connection dropped mid-answer: what already arrived stays on
        // screen and the user can retry.
        throw new ChatError(networkFailure());
      }
    },
  };
}
