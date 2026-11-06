import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { isNativeGoogleConfigured, requestGoogleCredential } from '../src/auth/google';
import { readEnv } from '../src/config/env';

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(),
    signOut: jest.fn(),
    signIn: jest.fn(),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
  isErrorWithCode: (e: unknown) => typeof (e as { code?: unknown } | null)?.code === 'string',
}));

const native = GoogleSignin as jest.Mocked<typeof GoogleSignin>;
const configured = readEnv({ APP_ENV: 'staging', GOOGLE_WEB_CLIENT_ID: 'web.apps', GOOGLE_IOS_CLIENT_ID: 'ios.apps' });
const noIds = readEnv({ APP_ENV: 'staging' });

describe('google sign-in', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    native.signOut.mockResolvedValue(null);
    native.hasPlayServices.mockResolvedValue(true);
  });

  it('is only native when the Web client id is set, and on iOS also the iOS one', () => {
    expect(isNativeGoogleConfigured('android', noIds)).toBe(false);
    expect(isNativeGoogleConfigured('android', configured)).toBe(true);
    expect(isNativeGoogleConfigured('ios', configured)).toBe(true);
    expect(isNativeGoogleConfigured('ios', readEnv({ GOOGLE_WEB_CLIENT_ID: 'web.apps' }))).toBe(false);
    expect(isNativeGoogleConfigured('web', configured)).toBe(false);
  });

  it('asks for the browser flow, without touching the native module, when not configured', async () => {
    expect(await requestGoogleCredential('android', noIds)).toEqual({ kind: 'unavailable' });
    expect(native.configure).not.toHaveBeenCalled();
  });

  it('returns the ID token, asking for it on the Web client', async () => {
    native.signIn.mockResolvedValueOnce({ type: 'success', data: { idToken: 'jwt' } } as never);
    expect(await requestGoogleCredential('android', configured)).toEqual({ kind: 'token', idToken: 'jwt' });
    expect(native.configure).toHaveBeenCalledWith({ webClientId: 'web.apps' });
    expect(native.hasPlayServices).toHaveBeenCalled();
  });

  it('also passes the iOS client id on iOS, and does not check Play services', async () => {
    native.signIn.mockResolvedValueOnce({ type: 'success', data: { idToken: 'jwt' } } as never);
    await requestGoogleCredential('ios', configured);
    expect(native.configure).toHaveBeenCalledWith({ webClientId: 'web.apps', iosClientId: 'ios.apps' });
    expect(native.hasPlayServices).not.toHaveBeenCalled();
  });

  it('reports a dismissed sheet apart from a failure, and a missing token as a failure', async () => {
    native.signIn.mockResolvedValueOnce({ type: 'cancelled', data: null } as never);
    expect(await requestGoogleCredential('android', configured)).toEqual({ kind: 'cancelled' });
    native.signIn.mockRejectedValueOnce(Object.assign(new Error('x'), { code: statusCodes.SIGN_IN_CANCELLED }));
    expect(await requestGoogleCredential('android', configured)).toEqual({ kind: 'cancelled' });
    native.signIn.mockRejectedValueOnce(new Error('boom'));
    expect(await requestGoogleCredential('android', configured)).toEqual({ kind: 'error' });
    native.signIn.mockResolvedValueOnce({ type: 'success', data: { idToken: null } } as never);
    expect(await requestGoogleCredential('android', configured)).toEqual({ kind: 'error' });
  });

  it('falls back to the browser when Google Play services are missing', async () => {
    native.hasPlayServices.mockRejectedValueOnce(Object.assign(new Error('x'), { code: statusCodes.PLAY_SERVICES_NOT_AVAILABLE }));
    expect(await requestGoogleCredential('android', configured)).toEqual({ kind: 'unavailable' });
  });
});
