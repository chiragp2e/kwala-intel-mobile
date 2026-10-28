import { createSessionProvisioner } from '../src/chat/sessionProvisioner';

const row = (id: string) => ({ id, title: '', created_at: null, updated_at: null });

describe('session provisioner', () => {
  it('shares one creation between concurrent callers', async () => {
    const create = jest.fn(async (id: string) => row(id));
    const p = createSessionProvisioner(create, () => 'client-1');
    const [a, b] = await Promise.all([p.ensure(), p.ensure()]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(a.id).toBe('client-1');
    expect(b.id).toBe('client-1');
    expect(p.current).toBe('client-1');
  });

  it('reuses the same client id when a creation fails, so a retry is idempotent', async () => {
    const ids: string[] = [];
    let fail = true;
    const create = jest.fn(async (id: string) => {
      ids.push(id);
      if (fail) throw new Error('offline');
      return row(id);
    });
    let n = 0;
    const p = createSessionProvisioner(create, () => `c${++n}`);
    await expect(p.ensure()).rejects.toThrow('offline');
    fail = false;
    await p.ensure();
    expect(ids).toEqual(['c1', 'c1']);
  });

  it('prefers the id the server answers with', async () => {
    const p = createSessionProvisioner(async () => row('server-id'), () => 'client-1');
    expect((await p.ensure()).id).toBe('server-id');
    expect(p.current).toBe('server-id');
  });

  it('does not attach a creation to a chat opened while it was in flight', async () => {
    let release: (v: ReturnType<typeof row>) => void = () => {};
    const p = createSessionProvisioner(() => new Promise(r => (release = r)), () => 'client-1');
    const pending = p.ensure();
    // create() runs on the next microtask; let it start so `release` is wired up.
    await new Promise<void>(r => setTimeout(() => r(), 0));
    p.set('other');
    release(row('client-1'));
    await pending;
    expect(p.current).toBe('other');
  });
});
