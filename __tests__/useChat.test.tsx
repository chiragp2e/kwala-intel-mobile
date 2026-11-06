import { AppState } from 'react-native';
import { act, renderHook, waitFor } from './renderHook.helper';
import type { ChatBackend } from '../src/api/backend';
import { ChatError, classifyChatResponse, networkFailure } from '../src/api/errors';
import type { ChatEvent } from '../src/api/sse';
import { useChat } from '../src/chat/useChat';

type Stream = (args: { sessionId: string; message: string; signal: AbortSignal; onEvent: (e: ChatEvent) => void }) => Promise<void>;

function fakeBackend(stream: Stream, history: ChatBackend['getMessages'] = async () => []): ChatBackend & { created: string[] } {
  const created: string[] = [];
  return {
    created,
    createSession: async id => {
      created.push(id);
      return { id, title: '', created_at: null, updated_at: null };
    },
    listSessions: async () => [],
    getMessages: history,
    deleteSession: async () => {},
    getEntitlements: async () => null,
    getPlans: async () => [],
    createCheckoutIntent: async () => ({ intent_id: 'i' }),
    startSubscription: async () => ({ intent_id: 'i' }),
    getSubscription: async () => null,
    verifyCheckout: async () => null,
    streamChat: stream,
  };
}

const answer =
  (text: string): Stream =>
  async ({ onEvent }) => {
    onEvent({ type: 'status', content: 'Working' });
    for (const t of text.split(' ')) onEvent({ type: 'token', content: t + ' ' });
    onEvent({ type: 'done' });
  };

describe('useChat', () => {
  it('sends optimistically, streams the answer and finishes as sent', async () => {
    const backend = fakeBackend(answer('hello there'));
    const { result } = await renderHook(() => useChat({ backend }));

    let r: Awaited<ReturnType<typeof result.current.send>> | undefined;
    await act(async () => {
      r = await result.current.send('  What moved?  ');
    });

    expect(r).toEqual({ ok: true });
    expect(result.current.messages.map(m => [m.role, m.content.trim(), m.status])).toEqual([
      ['user', 'What moved?', 'sent'],
      ['assistant', 'hello there', 'sent'],
    ]);
    expect(result.current.isSending).toBe(false);
    expect(backend.created).toHaveLength(1);
    expect(result.current.sessionId).toBe(backend.created[0]);
  });

  it('creates the session once and reuses it for the next turn', async () => {
    const backend = fakeBackend(answer('ok'));
    const { result } = await renderHook(() => useChat({ backend }));
    await act(async () => {
      await result.current.send('one');
    });
    await act(async () => {
      await result.current.send('two');
    });
    expect(backend.created).toHaveLength(1);
  });

  it('refuses a second send while one is in flight (double tap)', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>(r => (release = () => r()));
    const stream = jest.fn<ReturnType<Stream>, Parameters<Stream>>(async ({ onEvent }) => {
      await gate;
      onEvent({ type: 'token', content: 'x' });
    });
    const backend = fakeBackend(stream);
    const { result } = await renderHook(() => useChat({ backend }));

    let first!: Promise<unknown>;
    let second: Awaited<ReturnType<typeof result.current.send>> | undefined;
    await act(async () => {
      first = result.current.send('hi');
      second = await result.current.send('hi');
    });
    expect(second).toEqual({ ok: false });
    release();
    await act(async () => {
      await first;
    });
    expect(stream).toHaveBeenCalledTimes(1);
    expect(result.current.messages.filter(m => m.role === 'user')).toHaveLength(1);
  });

  it('marks a network failure as failed, keeps the question, and retry resends without duplicating it', async () => {
    let calls = 0;
    const backend = fakeBackend(async args => {
      calls += 1;
      if (calls === 1) throw new ChatError(networkFailure());
      return answer('recovered')(args);
    });
    const { result } = await renderHook(() => useChat({ backend }));

    let first: Awaited<ReturnType<typeof result.current.send>> | undefined;
    await act(async () => {
      first = await result.current.send('why is HPCL falling?');
    });
    expect(first).toMatchObject({ ok: false, failure: { code: 'NETWORK' } });
    const failed = result.current.messages.find(m => m.status === 'failed');
    expect(failed?.failure?.retryable).toBe(true);
    expect(result.current.messages.filter(m => m.role === 'user')).toHaveLength(1);

    await act(async () => {
      await result.current.retry(failed!.id);
    });
    expect(result.current.messages.map(m => [m.role, m.content.trim()])).toEqual([
      ['user', 'why is HPCL falling?'],
      ['assistant', 'recovered'],
    ]);
  });

  it('on a quota refusal, removes both bubbles, returns the text for the composer and exposes the quota', async () => {
    const backend = fakeBackend(async () => {
      throw new ChatError(classifyChatResponse(402, { code: 'QUOTA_EXCEEDED', used: 2, limit: 2, reset_at: '2026-10-29T00:00:00Z' }));
    });
    const { result } = await renderHook(() => useChat({ backend }));
    let r: Awaited<ReturnType<typeof result.current.send>> | undefined;
    await act(async () => {
      r = await result.current.send('my question');
    });
    expect(r).toMatchObject({ ok: false, restoreText: 'my question', failure: { code: 'QUOTA_EXCEEDED' } });
    expect(result.current.messages).toEqual([]);
    expect(result.current.quota).toEqual({ used: 2, limit: 2, resetAt: '2026-10-29T00:00:00Z' });
  });

  it('turns a mid-stream error event into a retryable failed answer that keeps partial text', async () => {
    const backend = fakeBackend(async ({ onEvent }) => {
      onEvent({ type: 'token', content: 'partial ' });
      onEvent({ type: 'error', content: 'model overloaded' });
    });
    const { result } = await renderHook(() => useChat({ backend }));
    await act(async () => {
      await result.current.send('q');
    });
    const m = result.current.messages[1];
    expect(m).toMatchObject({ status: 'failed', content: 'partial ' });
    expect(m?.failure?.message).toBe('model overloaded');
  });

  it('stop keeps the partial answer as a finished message', async () => {
    const backend = fakeBackend(({ onEvent, signal }) => {
      onEvent({ type: 'token', content: 'some text' });
      return new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    });
    const { result } = await renderHook(() => useChat({ backend }));
    let p!: Promise<unknown>;
    await act(async () => {
      p = result.current.send('q');
    });
    await waitFor(() => expect(result.current.messages[1]?.content).toBe('some text'));
    await act(async () => {
      result.current.stop();
      await p;
    });
    expect(result.current.messages[1]).toMatchObject({ content: 'some text', status: 'sent' });
    expect(result.current.isSending).toBe(false);
  });

  it('replaces local ids with the server history once a turn is stored', async () => {
    const backend = fakeBackend(answer('done'), async () => [
      { id: 'srv-u', role: 'user', content: 'q', created_at: '2026-10-28T10:00:00Z' },
      { id: 'srv-a', role: 'assistant', content: 'done', created_at: '2026-10-28T10:00:01Z' },
    ]);
    const { result } = await renderHook(() => useChat({ backend }));
    await act(async () => {
      await result.current.send('q');
    });
    await waitFor(() => expect(result.current.messages.map(m => m.id)).toEqual(['srv-u', 'srv-a']));
  });

  it('keeps the local transcript when the server history is shorter (persistence lag)', async () => {
    const backend = fakeBackend(answer('done'), async () => []);
    const { result } = await renderHook(() => useChat({ backend }));
    await act(async () => {
      await result.current.send('q');
    });
    await new Promise<void>(r => setTimeout(() => r(), 20));
    expect(result.current.messages).toHaveLength(2);
  });

  it('a send finishing after New Chat paints nothing into the new chat', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>(r => (release = () => r()));
    const backend = fakeBackend(async ({ onEvent }) => {
      await gate;
      onEvent({ type: 'token', content: 'late' });
    });
    const { result } = await renderHook(() => useChat({ backend }));
    let p!: Promise<unknown>;
    await act(async () => {
      p = result.current.send('old chat question');
    });
    await act(async () => {
      result.current.newChat();
    });
    release();
    await act(async () => {
      await p;
    });
    expect(result.current.messages).toEqual([]);
    expect(result.current.sessionId).toBeNull();
  });

  it('opening a session loads its history; a failed load is an error state, not an empty chat', async () => {
    const ok = fakeBackend(answer('x'), async () => [{ id: 'm1', role: 'user', content: 'hello', created_at: null }]);
    const a = await renderHook(() => useChat({ backend: ok }));
    await act(async () => {
      await a.result.current.openSession('s1');
    });
    expect(a.result.current.messages.map(m => m.content)).toEqual(['hello']);
    expect(a.result.current.historyState).toBe('idle');

    const bad = fakeBackend(answer('x'), async () => {
      throw new ChatError(networkFailure());
    });
    const b = await renderHook(() => useChat({ backend: bad }));
    await act(async () => {
      await b.result.current.openSession('s1');
    });
    expect(b.result.current.historyState).toBe('error');
  });

  describe('when the app went to the background mid-answer', () => {
    const appState = AppState as unknown as { currentState: unknown };
    let before: unknown;
    beforeEach(() => {
      before = appState.currentState;
    });
    afterEach(() => {
      appState.currentState = before;
    });

    it('fetches the finished answer from the server instead of showing a network error', async () => {
      const backend = fakeBackend(
        async ({ onEvent }) => {
          onEvent({ type: 'token', content: 'part' });
          // The OS cut the connection while away; the app is back by the time the error lands.
          appState.currentState = 'active';
          throw new ChatError(networkFailure());
        },
        async () => [
          { id: 'srv-u', role: 'user', content: 'q', created_at: '2026-11-06T10:00:00Z' },
          { id: 'srv-a', role: 'assistant', content: 'the full answer', created_at: '2026-11-06T10:00:30Z' },
        ],
      );
      const { result } = await renderHook(() => useChat({ backend }));
      appState.currentState = 'background';
      let r: Awaited<ReturnType<typeof result.current.send>> | undefined;
      await act(async () => {
        r = await result.current.send('q');
      });
      expect(r).toEqual({ ok: true });
      expect(result.current.messages.map(m => [m.role, m.content, m.status])).toEqual([
        ['user', 'q', 'sent'],
        ['assistant', 'the full answer', 'sent'],
      ]);
      expect(result.current.reconnecting).toBe(false);
    });

    it('stop while reconnecting ends it without a failed bubble', async () => {
      const backend = fakeBackend(
        async () => {
          appState.currentState = 'active';
          throw new ChatError(networkFailure());
        },
        async () => [],
      );
      const { result } = await renderHook(() => useChat({ backend }));
      appState.currentState = 'background';
      let p!: Promise<Awaited<ReturnType<typeof result.current.send>>>;
      await act(async () => {
        p = result.current.send('q');
      });
      await waitFor(() => expect(result.current.reconnecting).toBe(true));
      let r: Awaited<ReturnType<typeof result.current.send>> | undefined;
      await act(async () => {
        result.current.stop();
        r = await p;
      });
      expect(r).toMatchObject({ ok: false, failure: { code: 'ABORTED' } });
      expect(result.current.messages.some(m => m.status === 'failed')).toBe(false);
      expect(result.current.isSending).toBe(false);
    });

    it('a drop with the app in the foreground is still a retryable network error', async () => {
      appState.currentState = 'active';
      const backend = fakeBackend(async () => {
        throw new ChatError(networkFailure());
      });
      const { result } = await renderHook(() => useChat({ backend }));
      await act(async () => {
        await result.current.send('q');
      });
      expect(result.current.messages[1]).toMatchObject({ status: 'failed', failure: { code: 'NETWORK', retryable: true } });
    });
  });

  it("collects the agent's steps and narration for the turn, and settles them when it ends", async () => {
    const backend = fakeBackend(async ({ onEvent }) => {
      onEvent({ type: 'thinking', content: 'Checking prices.' });
      onEvent({ type: 'activity', content: { id: 'a1', state: 'running', label: 'Fetching BTC', group: 'market' } });
      onEvent({ type: 'activity', content: { id: 'a2', state: 'running', label: 'Searching news', group: 'web' } });
      onEvent({ type: 'activity', content: { id: 'a1', state: 'done', label: 'Fetched BTC', group: 'market', ms: 900 } });
      onEvent({ type: 'thinking', content: 'Then news.' });
      onEvent({ type: 'token', content: 'answer' });
    });
    const { result } = await renderHook(() => useChat({ backend }));
    await act(async () => {
      await result.current.send('q');
    });
    expect(result.current.thinking).toBe('Checking prices. Then news.');
    expect(result.current.activity.map(a => [a.id, a.label, a.state])).toEqual([
      ['a1', 'Fetched BTC', 'done'],
      ['a2', 'Searching news', 'done'],
    ]);
    act(() => result.current.newChat());
    await waitFor(() => expect(result.current.activity).toEqual([]));
  });
});
