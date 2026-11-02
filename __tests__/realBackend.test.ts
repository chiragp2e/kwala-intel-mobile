import { setAuthBridge } from '../src/api/http';

jest.mock('../src/config/env', () => ({
  env: { aiApiBaseUrl: 'https://ai.test', apiBaseUrl: 'https://api.test', useMockBackend: false },
}));

const mockStreamingFetch = jest.fn();
jest.mock('expo/fetch', () => ({ fetch: (...a: unknown[]) => mockStreamingFetch(...a) }));

import { createRealBackend } from '../src/api/realBackend';
import type { ChatEvent } from '../src/api/sse';

const enc = new TextEncoder();

function sseResponse(chunks: string[], init: { status?: number } = {}) {
  let i = 0;
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    json: async () => ({}),
    body: {
      getReader: () => ({
        read: async () => (i < chunks.length ? { done: false, value: enc.encode(chunks[i++]) } : { done: true, value: undefined }),
      }),
    },
  };
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body };
}

const signal = () => new AbortController().signal;
let token: string | null;
const refresh = jest.fn();
const expired = jest.fn();

beforeEach(() => {
  token = 'tok-1';
  refresh.mockReset();
  expired.mockReset();
  mockStreamingFetch.mockReset();
  (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn();
  setAuthBridge({ getAccessToken: async () => token, refresh, onSessionExpired: expired });
});

const fetchMock = () => (globalThis as unknown as { fetch: jest.Mock }).fetch;

describe('REST calls', () => {
  it('sends the bearer token and validates the shape', async () => {
    fetchMock().mockResolvedValue(jsonResponse(200, [{ id: 's1', title: 'A' }, { bad: 1 }]));
    const list = await createRealBackend().listSessions();
    expect(list).toEqual([{ id: 's1', title: 'A' }]);
    expect(fetchMock().mock.calls[0][0]).toBe('https://ai.test/api/sessions');
    expect(fetchMock().mock.calls[0][1].headers.Authorization).toBe('Bearer tok-1');
  });

  it('refreshes the token once on 401 and retries with the new one', async () => {
    refresh.mockResolvedValue('tok-2');
    fetchMock().mockResolvedValueOnce(jsonResponse(401, {})).mockResolvedValueOnce(jsonResponse(200, []));
    await createRealBackend().listSessions();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock().mock.calls[1][1].headers.Authorization).toBe('Bearer tok-2');
    expect(expired).not.toHaveBeenCalled();
  });

  it('ends the session when refresh fails', async () => {
    refresh.mockResolvedValue(null);
    fetchMock().mockResolvedValue(jsonResponse(401, {}));
    await expect(createRealBackend().listSessions()).rejects.toMatchObject({ failure: { code: 'UNAUTHENTICATED' } });
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('does not try to refresh a signed-out request', async () => {
    token = null;
    fetchMock().mockResolvedValue(jsonResponse(401, {}));
    await expect(createRealBackend().listSessions()).rejects.toBeDefined();
    expect(refresh).not.toHaveBeenCalled();
    expect(fetchMock().mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('maps a transport failure to a retryable NETWORK error', async () => {
    fetchMock().mockRejectedValue(new TypeError('Network request failed'));
    await expect(createRealBackend().getMessages('s1')).rejects.toMatchObject({ failure: { code: 'NETWORK', retryable: true } });
  });

  it('url-encodes ids', async () => {
    fetchMock().mockResolvedValue(jsonResponse(200, []));
    await createRealBackend().getMessages('a/b c');
    expect(fetchMock().mock.calls[0][0]).toBe('https://ai.test/api/sessions/a%2Fb%20c/messages');
  });

  it("verifies an in-app checkout with the server's field names", async () => {
    fetchMock().mockResolvedValue(jsonResponse(200, { data: { status: 'active', plan: 'ultra', plan_code: 'ultra_in_annual_v1' } }));
    const sub = await createRealBackend().verifyCheckout({ paymentId: 'pay_1', subscriptionId: 'sub_1', signature: 'sig' });
    expect(sub).toMatchObject({ status: 'active', plan: 'ultra', plan_code: 'ultra_in_annual_v1' });
    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe('https://api.test/billing/checkout/verify');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ provider_payment_id: 'pay_1', provider_subscription_id: 'sub_1', signature: 'sig' });
  });
});

describe('streamChat', () => {
  const run = async (chunks: string[]) => {
    mockStreamingFetch.mockResolvedValue(sseResponse(chunks));
    const events: ChatEvent[] = [];
    await createRealBackend().streamChat({ sessionId: 's1', message: 'hi', signal: signal(), onEvent: e => events.push(e) });
    return events;
  };

  it('posts the message with the token and parses events split across chunks', async () => {
    const events = await run([
      'data: {"type":"status","content":"Rea',
      'ding"}\ndata: {"type":"token","content":"Hi"}\n',
      'data: {"type":"done"}', // no trailing newline: flushed at the end
    ]);
    expect(events).toEqual([
      { type: 'status', content: 'Reading' },
      { type: 'token', content: 'Hi' },
      { type: 'done' },
    ]);
    const [url, init] = mockStreamingFetch.mock.calls[0];
    expect(url).toBe('https://ai.test/api/chat/s1');
    expect(JSON.parse(init.body)).toEqual({ message: 'hi' });
    expect(init.headers.Authorization).toBe('Bearer tok-1');
  });

  it('classifies a quota refusal before any streaming', async () => {
    mockStreamingFetch.mockResolvedValue({ ...sseResponse([], { status: 402 }), json: async () => ({ code: 'QUOTA_EXCEEDED', used: 2, limit: 2 }) });
    await expect(
      createRealBackend().streamChat({ sessionId: 's1', message: 'hi', signal: signal(), onEvent: () => {} }),
    ).rejects.toMatchObject({ failure: { code: 'QUOTA_EXCEEDED', retryable: false } });
  });

  it('refreshes once on 401 and re-posts', async () => {
    refresh.mockResolvedValue('tok-2');
    mockStreamingFetch.mockResolvedValueOnce(sseResponse([], { status: 401 })).mockResolvedValueOnce(sseResponse(['data: {"type":"done"}\n']));
    await createRealBackend().streamChat({ sessionId: 's1', message: 'hi', signal: signal(), onEvent: () => {} });
    expect(mockStreamingFetch).toHaveBeenCalledTimes(2);
    expect(mockStreamingFetch.mock.calls[1][1].headers.Authorization).toBe('Bearer tok-2');
  });

  it('reports a connection that drops mid-answer as a retryable NETWORK error, after delivering what arrived', async () => {
    let i = 0;
    mockStreamingFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => {
            if (i++ === 0) return { done: false, value: enc.encode('data: {"type":"token","content":"A"}\n') };
            throw new Error('connection reset');
          },
        }),
      },
    });
    const events: ChatEvent[] = [];
    await expect(
      createRealBackend().streamChat({ sessionId: 's1', message: 'hi', signal: signal(), onEvent: e => events.push(e) }),
    ).rejects.toMatchObject({ failure: { code: 'NETWORK', retryable: true } });
    expect(events).toEqual([{ type: 'token', content: 'A' }]);
  });

  it('lets an abort through unchanged', async () => {
    const c = new AbortController();
    mockStreamingFetch.mockImplementation(async () => {
      c.abort();
      throw new Error('aborted');
    });
    await expect(
      createRealBackend().streamChat({ sessionId: 's1', message: 'hi', signal: c.signal, onEvent: () => {} }),
    ).rejects.toThrow('aborted');
  });
});
