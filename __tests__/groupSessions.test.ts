import { groupSessions } from '../src/lib/groupSessions';

const at = (id: string, iso: string) => ({ id, title: id, created_at: iso, updated_at: iso });

describe('groupSessions', () => {
  // Local noon on 28 Oct 2026.
  const now = new Date(2026, 9, 28, 12, 0, 0).getTime();
  const iso = (d: number, h = 10) => new Date(2026, 9, d, h).toISOString();

  it('buckets by day, newest first, and drops empty sections', () => {
    const out = groupSessions(
      [at('old', iso(1)), at('today-early', iso(28, 8)), at('today-late', iso(28, 11)), at('yday', iso(27)), at('week', iso(23))],
      now,
    );
    expect(out.map(s => [s.title, s.data.map(d => d.id)])).toEqual([
      ['Today', ['today-late', 'today-early']],
      ['Yesterday', ['yday']],
      ['Previous 7 days', ['week']],
      ['Earlier', ['old']],
    ]);
  });

  it('puts rows with no usable date under Earlier and returns nothing for no sessions', () => {
    expect(groupSessions([{ id: 'x', title: '', created_at: null, updated_at: null }], now)[0]?.title).toBe('Earlier');
    expect(groupSessions([], now)).toEqual([]);
  });
});
