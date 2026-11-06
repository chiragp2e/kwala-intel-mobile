import { applyInboxChange, unreadCount } from '../src/state/queries';

jest.mock('../src/auth/AuthContext', () => ({ useAuth: () => ({ status: 'signedOut', user: null }) }));
jest.mock('../src/api', () => ({ getBackend: () => ({}) }));

const items = [
  { id: 'a', message: 'one', created_at: '2026-11-06T10:00:00Z', read_at: null },
  { id: 'b', message: 'two', created_at: '2026-11-06T09:00:00Z', read_at: '2026-11-06T09:30:00Z' },
];

describe('notification inbox', () => {
  it('counts unread', () => {
    expect(unreadCount(items)).toBe(1);
    expect(unreadCount(undefined)).toBe(0);
  });

  it('applies each change the way the server will', () => {
    const now = '2026-11-06T12:00:00Z';
    expect(applyInboxChange(items, { kind: 'read', id: 'a' }, now)[0]?.read_at).toBe(now);
    expect(applyInboxChange(items, { kind: 'readAll' }, now).map(n => n.read_at)).toEqual([now, '2026-11-06T09:30:00Z']);
    expect(applyInboxChange(items, { kind: 'dismiss', id: 'a' }, now).map(n => n.id)).toEqual(['b']);
    expect(applyInboxChange(items, { kind: 'clear' }, now)).toEqual([]);
  });
});
