import * as SecureStore from 'expo-secure-store';
import { secureSessionStorage as s } from '../src/auth/secureStorage';

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

beforeEach(() => store.clear());

describe('secureSessionStorage', () => {
  it('round-trips a value larger than one chunk', async () => {
    const big = 'x'.repeat(5000) + 'END';
    await s.setItem('sb-abc-auth-token', big);
    expect(store.size).toBeGreaterThan(2);
    expect(await s.getItem('sb-abc-auth-token')).toBe(big);
  });

  it('removes every chunk, and shrinking leaves no stale chunks', async () => {
    await s.setItem('k', 'y'.repeat(4000));
    await s.setItem('k', 'short');
    expect([...store.keys()].sort()).toEqual(['k.0', 'k.count']);
    await s.removeItem('k');
    expect(store.size).toBe(0);
    expect(await s.getItem('k')).toBeNull();
  });

  it('treats a torn write (missing chunk) as no session', async () => {
    await s.setItem('k', 'z'.repeat(4000));
    store.delete('k.1');
    expect(await s.getItem('k')).toBeNull();
  });

  it('sanitises keys SecureStore would reject', async () => {
    await s.setItem('sb:weird key/1', 'v');
    expect([...store.keys()].every(k => /^[A-Za-z0-9._-]+$/.test(k))).toBe(true);
    expect(await s.getItem('sb:weird key/1')).toBe('v');
  });
});
