import { displayName, formatPhone, initials, realEmail, relativeTime } from '../src/lib/identity';

describe('identity', () => {
  it('names an account by display name, then email, then phone', () => {
    expect(displayName({ display_name: ' Ada ' }, { email: 'ada@x.com', phone: null })).toBe('Ada');
    expect(displayName(null, { email: 'ada@x.com', phone: null })).toBe('ada');
    expect(displayName(null, { email: 'example@kwala.network', phone: '919761469198' })).toBe('+919761469198');
    expect(displayName(null, null)).toBe('Your account');
  });

  it('never shows the phone-only placeholder address', () => {
    expect(realEmail('Example@Kwala.network')).toBeNull();
    expect(realEmail('a@b.co')).toBe('a@b.co');
  });

  it('makes initials from one or more words', () => {
    expect(initials('Ada Byron Lovelace')).toBe('AL');
    expect(initials('ada')).toBe('AD');
    expect(initials('  ')).toBe('K');
  });

  it('formats phones and relative times', () => {
    expect(formatPhone('91 97614 69198')).toBe('+919761469198');
    const now = Date.parse('2026-11-06T12:00:00Z');
    expect(relativeTime('2026-11-06T11:59:30Z', now)).toBe('Just now');
    expect(relativeTime('2026-11-06T11:15:00Z', now)).toBe('45m ago');
    expect(relativeTime('2026-11-06T07:00:00Z', now)).toBe('5h ago');
    expect(relativeTime('2026-11-03T12:00:00Z', now)).toBe('3d ago');
    expect(relativeTime('2026-10-01T12:00:00Z', now)).toBe('Oct 1');
    expect(relativeTime(null, now)).toBe('');
  });
});
