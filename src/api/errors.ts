/**
 * A typed description of a failed chat request. `retryable` is decided here,
 * once, from the HTTP status and the machine-readable code, never from the
 * wording of a message. The same rule the Kwala web app uses.
 */
export type ChatFailureCode =
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'UNAUTHENTICATED'
  | 'SERVER'
  | 'NETWORK'
  | 'ABORTED';

export interface QuotaInfo {
  used: number;
  limit: number;
  /** ISO instant, from the server. */
  resetAt: string | null;
}

export interface ChatFailure {
  code: ChatFailureCode;
  status: number | null;
  /** Safe to show. Never a raw response body. */
  message: string;
  retryable: boolean;
  quota?: QuotaInfo;
}

export class ChatError extends Error {
  readonly failure: ChatFailure;
  constructor(failure: ChatFailure) {
    super(failure.message);
    this.name = 'ChatError';
    this.failure = failure;
  }
}

const GENERIC_SERVER = 'Something went wrong on our side. Please try again.';

function candidates(body: unknown): unknown[] {
  if (!body || typeof body !== 'object') return [];
  const o = body as Record<string, unknown>;
  return [o, o.data, o.error, o.detail].filter(Boolean);
}

function readCode(body: unknown): string | undefined {
  for (const c of candidates(body)) {
    if (c && typeof c === 'object' && typeof (c as { code?: unknown }).code === 'string') {
      return (c as { code: string }).code;
    }
  }
  return undefined;
}

function readMessage(body: unknown): string | undefined {
  for (const c of candidates(body)) {
    if (typeof c === 'string' && c) return c;
    if (c && typeof c === 'object') {
      const o = c as Record<string, unknown>;
      for (const key of ['message', 'detail', 'description']) {
        if (typeof o[key] === 'string' && o[key]) return o[key] as string;
      }
    }
  }
  return undefined;
}

function readQuota(body: unknown): QuotaInfo | undefined {
  for (const c of candidates(body)) {
    if (!c || typeof c !== 'object') continue;
    const o = c as Record<string, unknown>;
    if (typeof o.used === 'number' && typeof o.limit === 'number') {
      const reset = o.reset_at ?? o.resets_at;
      return { used: o.used, limit: o.limit, resetAt: typeof reset === 'string' ? reset : null };
    }
  }
  return undefined;
}

export function classifyChatResponse(status: number, body: unknown): ChatFailure {
  const code = readCode(body);
  const message = readMessage(body);

  if (status === 402 || code === 'QUOTA_EXCEEDED') {
    return {
      code: 'QUOTA_EXCEEDED',
      status,
      message: message || 'You have used your free messages for today.',
      // Nothing the user can do until the reset, so no retry button.
      retryable: false,
      quota: readQuota(body),
    };
  }
  if (status === 429) {
    return {
      code: 'RATE_LIMITED',
      status,
      message: message || 'Too many requests. Try again in a moment.',
      retryable: true,
    };
  }
  if (status === 401 || status === 403) {
    return {
      code: 'UNAUTHENTICATED',
      status,
      message: message || 'Please sign in again to continue.',
      retryable: false,
    };
  }
  return {
    code: 'SERVER',
    status,
    message: status >= 500 || !message ? GENERIC_SERVER : message,
    retryable: true,
  };
}

export function networkFailure(): ChatFailure {
  return {
    code: 'NETWORK',
    status: null,
    message: "Couldn't reach the research service. Check your connection and try again.",
    retryable: true,
  };
}

/** The connection dropped while the app was in the background and the server had no finished answer to pick up. */
export function interruptedFailure(): ChatFailure {
  return {
    code: 'NETWORK',
    status: null,
    message: 'The answer was interrupted while Kwala Intel was in the background. Try again.',
    retryable: true,
  };
}

export function streamFailure(detail?: string): ChatFailure {
  return { code: 'SERVER', status: null, message: detail || GENERIC_SERVER, retryable: true };
}

export function abortedFailure(): ChatFailure {
  return { code: 'ABORTED', status: null, message: 'Stopped.', retryable: true };
}
