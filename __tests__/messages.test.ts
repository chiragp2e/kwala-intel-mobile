import { fromStored, messagesReducer, type ChatMessage } from '../src/chat/messages';

const base: ChatMessage[] = [];

describe('messagesReducer', () => {
  it('does not double a message when the same user turn arrives twice', () => {
    let s = messagesReducer(base, { type: 'user_sent', id: 'u1', content: 'hi', now: 1 });
    s = messagesReducer(s, { type: 'user_sent', id: 'u1', content: 'hi', now: 1 });
    expect(s).toHaveLength(1);
  });

  it('streams tokens into the assistant message in order', () => {
    let s = messagesReducer(base, { type: 'assistant_started', id: 'a1', replyTo: 'u1', now: 1 });
    for (const t of ['Hel', 'lo', '!']) s = messagesReducer(s, { type: 'token', id: 'a1', text: t });
    expect(s[0]).toMatchObject({ content: 'Hello!', status: 'streaming' });
    s = messagesReducer(s, { type: 'assistant_done', id: 'a1' });
    expect(s[0]?.status).toBe('sent');
  });

  it('keeps partial text on failure and falls back to the reason when there is none', () => {
    const failure = { code: 'NETWORK', status: null, message: 'offline', retryable: true } as const;
    let s = messagesReducer(base, { type: 'assistant_started', id: 'a1', replyTo: 'u1', now: 1 });
    s = messagesReducer(s, { type: 'token', id: 'a1', text: 'partial' });
    s = messagesReducer(s, { type: 'assistant_failed', id: 'a1', failure });
    expect(s[0]).toMatchObject({ status: 'failed', content: 'partial' });

    let t = messagesReducer(base, { type: 'assistant_started', id: 'a2', replyTo: 'u2', now: 1 });
    t = messagesReducer(t, { type: 'assistant_failed', id: 'a2', failure });
    expect(t[0]?.content).toBe('offline');
  });

  it('replaces blocks on reset and drops duplicates on replace', () => {
    let s = messagesReducer(base, { type: 'assistant_started', id: 'a1', replyTo: 'u1', now: 1 });
    s = messagesReducer(s, { type: 'block', id: 'a1', block: { type: 'prose' } });
    s = messagesReducer(s, { type: 'blocks_reset', id: 'a1' });
    expect(s[0]?.blocks).toEqual([]);
    const dup = { id: 'x', role: 'user', content: 'a', createdAt: 1, status: 'sent' } as ChatMessage;
    expect(messagesReducer(s, { type: 'replace', messages: [dup, dup] })).toHaveLength(1);
  });

  it('removes messages by id', () => {
    let s = messagesReducer(base, { type: 'user_sent', id: 'u1', content: 'q', now: 1 });
    s = messagesReducer(s, { type: 'assistant_started', id: 'a1', replyTo: 'u1', now: 2 });
    expect(messagesReducer(s, { type: 'remove', ids: ['u1', 'a1'] })).toEqual([]);
  });
});

describe('fromStored', () => {
  it('orders by time and keeps the server order for equal timestamps', () => {
    const out = fromStored([
      { id: 'b', role: 'assistant', content: 'B', created_at: '2026-10-28T10:00:00Z' },
      { id: 'a', role: 'user', content: 'A', created_at: '2026-10-28T09:00:00Z' },
      { id: 'c', role: 'user', content: 'C', created_at: '2026-10-28T10:00:00Z' },
    ]);
    expect(out.map(m => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('tolerates a missing or invalid timestamp and empty blocks', () => {
    const [m] = fromStored([{ id: 'a', role: 'user', content: 'A', created_at: 'nope', blocks: [] }]);
    expect(m).toMatchObject({ createdAt: 0, blocks: undefined, status: 'sent' });
  });
});
