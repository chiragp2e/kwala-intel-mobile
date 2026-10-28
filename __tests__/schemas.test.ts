import { ChatSessionSchema, StoredMessageSchema, parseEntitlements, parseList } from '../src/api/schemas';

describe('parseList', () => {
  it('drops malformed rows and keeps the good ones', () => {
    const out = parseList(ChatSessionSchema, [{ id: 's1', title: 'A' }, { nope: true }, null, { id: 's2', title: null }]);
    expect(out.map(s => s.id)).toEqual(['s1', 's2']);
    expect(out[1]?.title).toBe('');
  });

  it('returns an empty list for a non-array body', () => {
    expect(parseList(StoredMessageSchema, { error: 'x' })).toEqual([]);
  });

  it('rejects a message with an unknown role', () => {
    expect(parseList(StoredMessageSchema, [{ id: '1', role: 'system', content: 'x' }])).toEqual([]);
  });
});

describe('parseEntitlements', () => {
  it('reads a free plan and its quota, wrapped or not', () => {
    const body = { billing: { plan: 'free' }, quota: { limit: 2, used: 1, resets_at: '2026-10-29T00:00:00Z' } };
    const expected = { plan: 'free', quota: { unlimited: false, limit: 2, used: 1, remaining: 1, resetAt: '2026-10-29T00:00:00Z' } };
    expect(parseEntitlements(body)).toEqual(expected);
    expect(parseEntitlements({ data: body })).toEqual(expected);
  });

  it('treats paid plans (pro and ultra) as unlimited', () => {
    expect(parseEntitlements({ billing: { plan: 'ultra' } })?.quota?.unlimited).toBe(true);
    expect(parseEntitlements({ billing: { plan: 'pro' } })?.plan).toBe('pro');
  });

  it('treats an unknown plan as free, never as paid', () => {
    expect(parseEntitlements({ billing: { plan: 'platinum' }, quota: { limit: 2, used: 2 } })?.plan).toBe('free');
  });

  it('returns null for garbage', () => {
    expect(parseEntitlements('nope')).toBeNull();
  });
});
