import { ChatError, classifyChatResponse, networkFailure } from './errors';

/**
 * What the HTTP layer needs from authentication, injected by AuthContext so
 * this module knows nothing about Supabase.
 */
export interface AuthBridge {
  getAccessToken(): Promise<string | null>;
  /** Returns a fresh token, or null when the session can no longer be refreshed. */
  refresh(): Promise<string | null>;
  /** Called once when a signed-in request is refused and refresh failed. */
  onSessionExpired(): void;
}

let bridge: AuthBridge = {
  getAccessToken: async () => null,
  refresh: async () => null,
  onSessionExpired: () => {},
};

export function setAuthBridge(next: AuthBridge) {
  bridge = next;
}
export function getAuthBridge(): AuthBridge {
  return bridge;
}

const DEFAULT_TIMEOUT_MS = 20_000;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Combines the caller's signal with a timeout. */
export function withTimeout(signal: AbortSignal | undefined, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', onAbort);
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

async function once(url: string, token: string | null, opts: RequestOptions): Promise<Response> {
  const t = withTimeout(opts.signal, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: opts.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: t.signal,
    });
  } finally {
    t.done();
  }
}

/** JSON request with bearer auth, one token refresh on 401, and typed errors. */
export async function requestJson(url: string, opts: RequestOptions = {}): Promise<unknown> {
  let token = await bridge.getAccessToken();
  let res: Response;
  try {
    res = await once(url, token, opts);
    if (res.status === 401 && token) {
      token = await bridge.refresh();
      if (!token) {
        bridge.onSessionExpired();
      } else {
        res = await once(url, token, opts);
      }
    }
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    throw new ChatError(networkFailure());
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ChatError(classifyChatResponse(res.status, body));
  return body;
}
