import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

/** Sign in with Apple is offered on Apple devices only, and only where the OS supports it. */
export async function isAppleSignInAvailable(os: string = Platform.OS): Promise<boolean> {
  if (os !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export type AppleCredential =
  | { kind: 'token'; identityToken: string; nonce: string; fullName: string | null }
  | { kind: 'cancelled' }
  | { kind: 'error' };

/**
 * Shows Apple's native sign-in sheet. Apple is given the SHA-256 of a one-time
 * nonce and signs it into the identity token; Supabase is given the raw nonce
 * and checks that the two match, so a captured token cannot be replayed.
 */
export async function requestAppleCredential(): Promise<AppleCredential> {
  try {
    const nonce = Crypto.randomUUID();
    const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashed,
    });
    if (!credential.identityToken) return { kind: 'error' };
    return {
      kind: 'token',
      identityToken: credential.identityToken,
      nonce,
      fullName: formatAppleName(credential.fullName),
    };
  } catch (e) {
    if ((e as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED') return { kind: 'cancelled' };
    return { kind: 'error' };
  }
}

/** Apple sends the name on the first sign-in only, and never again, so it is saved then or lost. */
export function formatAppleName(name: AppleAuthentication.AppleAuthenticationFullName | null): string | null {
  const parts = [name?.givenName, name?.middleName, name?.familyName]
    .map(p => p?.trim())
    .filter((p): p is string => !!p);
  return parts.length ? parts.join(' ') : null;
}
