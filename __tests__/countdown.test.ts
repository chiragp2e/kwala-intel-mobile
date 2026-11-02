import { formatRemaining, msUntil } from '../src/lib/countdown';

const MIN = 60000;

describe('countdown', () => {
  it('reads hours and minutes, rounding a partial minute up', () => {
    expect(formatRemaining(6 * 60 * MIN + 12 * MIN)).toBe('6h 12m');
    expect(formatRemaining(2 * 60 * MIN)).toBe('2h');
    expect(formatRemaining(42 * MIN)).toBe('42m');
    expect(formatRemaining(30 * 1000)).toBe('1m');
  });

  it('says now once the time has passed or is unusable', () => {
    expect(formatRemaining(0)).toBe('now');
    expect(formatRemaining(-5000)).toBe('now');
    expect(formatRemaining(NaN)).toBe('now');
  });

  it('measures against a reset time and tolerates a missing one', () => {
    const now = Date.parse('2026-10-30T10:00:00Z');
    expect(msUntil('2026-10-30T12:30:00Z', now)).toBe(150 * MIN);
    expect(msUntil(null, now)).toBeNull();
    expect(msUntil('not a date', now)).toBeNull();
  });
});
