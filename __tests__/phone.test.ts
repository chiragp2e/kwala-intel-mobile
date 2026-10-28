import { isValidEmail, normalizeIndianMobile } from '../src/lib/phone';

describe('normalizeIndianMobile', () => {
  it.each([
    ['98765 43210', '+919876543210'],
    ['+91 98765-43210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['(98765) 43210', '+919876543210'],
  ])('%s -> %s', (input, out) => expect(normalizeIndianMobile(input)).toBe(out));

  it.each(['12345', '5876543210', '98765432101', 'abcdefghij', ''])('rejects %s', input =>
    expect(normalizeIndianMobile(input)).toBeNull(),
  );
});

describe('isValidEmail', () => {
  it('accepts normal addresses and rejects obvious typos', () => {
    expect(isValidEmail(' a@b.co ')).toBe(true);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@c.com')).toBe(false);
  });
});
