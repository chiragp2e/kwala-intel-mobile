import { GoogleSignin, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import * as Crypto from 'expo-crypto';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import { env, type Env } from '../config/env';

/** modules/kwala-google (iOS only): the Google sheet with a nonce we choose. */
export interface IosGoogleSheet {
  signIn(hashedNonce: string): Promise<{ type: 'success'; idToken: string } | { type: 'cancelled' }>;
}
const iosSheet = requireOptionalNativeModule<IosGoogleSheet>('KwalaGoogle');

/**
 * The native Google account sheet needs the Web client id (the ID token is issued to it, and Supabase checks
 * it), plus the iOS client id on iOS. Without them the app uses the browser sign-in instead.
 */
export function isNativeGoogleConfigured(os: string = Platform.OS, e: Pick<Env, 'googleWebClientId' | 'googleIosClientId'> = env): boolean {
  if (!e.googleWebClientId) return false;
  if (os === 'ios') return !!e.googleIosClientId;
  return os === 'android';
}

export type GoogleCredential =
  /** `nonce` (iOS) is the raw value whose SHA-256 is in the token; Supabase needs it to accept the token. */
  | { kind: 'token'; idToken: string; nonce?: string }
  | { kind: 'cancelled' }
  /** Not set up, or this device cannot show the sheet (e.g. no Google Play services): use the browser. */
  | { kind: 'unavailable' }
  | { kind: 'error' };

/** Shows the native Google account sheet and returns the ID token Supabase exchanges for a session. */
export async function requestGoogleCredential(
  os: string = Platform.OS,
  e: Env = env,
  sheet: IosGoogleSheet | null = iosSheet,
): Promise<GoogleCredential> {
  if (!isNativeGoogleConfigured(os, e)) return { kind: 'unavailable' };
  // A binary from before modules/kwala-google: its tokens would be refused, so use the browser instead.
  if (os === 'ios' && !sheet) return { kind: 'unavailable' };
  try {
    GoogleSignin.configure({
      webClientId: e.googleWebClientId,
      ...(os === 'ios' ? { iosClientId: e.googleIosClientId } : {}),
    });
    if (os === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // Forget the last Google account so the sheet lets the user pick one, rather than silently reusing it.
    await GoogleSignin.signOut().catch(() => {});

    if (os === 'ios' && sheet) {
      // On iOS the token always carries a nonce (GoogleSignIn makes one up if not given one), so choose it:
      // Google gets the SHA-256, Supabase the raw value, as with Apple (see apple.ts).
      const nonce = Crypto.randomUUID();
      const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
      const result = await sheet.signIn(hashed);
      if (result.type !== 'success') return { kind: 'cancelled' };
      return result.idToken ? { kind: 'token', idToken: result.idToken, nonce } : { kind: 'error' };
    }

    const result = await GoogleSignin.signIn();
    if (result.type !== 'success') return { kind: 'cancelled' };
    const idToken = result.data.idToken;
    return idToken ? { kind: 'token', idToken } : { kind: 'error' };
  } catch (err) {
    if (isErrorWithCode(err)) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED || err.code === statusCodes.IN_PROGRESS) return { kind: 'cancelled' };
      if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return { kind: 'unavailable' };
      // Diagnostic only, never the token. Android code "10" (DEVELOPER_ERROR) means the package name or SHA-1 does not match the Android client.
      console.error('[auth:google]', { code: err.code, message: err.message });
    }
    return { kind: 'error' };
  }
}
