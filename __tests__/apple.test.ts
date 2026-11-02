import * as AppleAuthentication from 'expo-apple-authentication';
import { formatAppleName, isAppleSignInAvailable, requestAppleCredential } from '../src/auth/apple';

jest.mock('expo-crypto', () => ({
  randomUUID: () => 'raw-nonce',
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_alg: string, s: string) => `sha256(${s})`,
}));
jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  isAvailableAsync: jest.fn(),
  signInAsync: jest.fn(),
}));

const native = AppleAuthentication as jest.Mocked<typeof AppleAuthentication>;

describe('apple sign-in', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is never offered off Apple devices, without asking the native module', async () => {
    expect(await isAppleSignInAvailable('android')).toBe(false);
    expect(native.isAvailableAsync).not.toHaveBeenCalled();
  });

  it('on iOS, follows what the OS reports, and treats a failed check as unavailable', async () => {
    native.isAvailableAsync.mockResolvedValueOnce(true);
    expect(await isAppleSignInAvailable('ios')).toBe(true);
    native.isAvailableAsync.mockRejectedValueOnce(new Error('boom'));
    expect(await isAppleSignInAvailable('ios')).toBe(false);
  });

  it('gives Apple the hashed nonce and keeps the raw one for Supabase', async () => {
    native.signInAsync.mockResolvedValueOnce({
      identityToken: 'jwt',
      fullName: { givenName: 'Ada', familyName: 'Lovelace' },
    } as AppleAuthentication.AppleAuthenticationCredential);
    expect(await requestAppleCredential()).toEqual({
      kind: 'token',
      identityToken: 'jwt',
      nonce: 'raw-nonce',
      fullName: 'Ada Lovelace',
    });
    expect(native.signInAsync).toHaveBeenCalledWith(expect.objectContaining({ nonce: 'sha256(raw-nonce)' }));
  });

  it('reports a cancelled sheet apart from a failure', async () => {
    native.signInAsync.mockRejectedValueOnce(Object.assign(new Error('cancelled'), { code: 'ERR_REQUEST_CANCELED' }));
    expect(await requestAppleCredential()).toEqual({ kind: 'cancelled' });
    native.signInAsync.mockRejectedValueOnce(new Error('ERR_REQUEST_FAILED'));
    expect(await requestAppleCredential()).toEqual({ kind: 'error' });
    native.signInAsync.mockResolvedValueOnce({ identityToken: null } as AppleAuthentication.AppleAuthenticationCredential);
    expect(await requestAppleCredential()).toEqual({ kind: 'error' });
  });

  it('joins whatever parts of the name Apple sent, and nothing when it sent none', () => {
    expect(formatAppleName({ givenName: ' Ada ', middleName: null, familyName: 'Lovelace' } as never)).toBe('Ada Lovelace');
    expect(formatAppleName({ givenName: null, familyName: null } as never)).toBeNull();
    expect(formatAppleName(null)).toBeNull();
  });
});
