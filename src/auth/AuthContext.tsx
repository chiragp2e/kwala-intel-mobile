import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import { setAuthBridge } from '../api/http';
import { env, missingBackendConfig } from '../config/env';
import { requestAppleCredential } from './apple';
import { requestGoogleCredential } from './google';
import { parseOAuthCallback, oauthRedirectUri } from './oauth';
import { getSupabase } from './supabase';

export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  /** Supabase has confirmed the address / number (email_confirmed_at, phone_confirmed_at). */
  emailConfirmed?: boolean;
  phoneConfirmed?: boolean;
}

type Status = 'loading' | 'signedOut' | 'signedIn';
type Result = { error: string | null };

interface AuthValue {
  status: Status;
  user: AuthUser | null;
  /** Settings a real backend needs that this build does not have. Empty in mock mode. */
  missingConfig: string[];
  sendEmailCode(email: string): Promise<Result>;
  verifyEmailCode(email: string, code: string): Promise<Result>;
  sendPhoneCode(e164: string): Promise<Result>;
  verifyPhoneCode(e164: string, code: string): Promise<Result>;
  /** Opens Google in the system browser. `error` is null when the user simply closes it. */
  signInWithGoogle(): Promise<Result>;
  /** Apple's native sign-in sheet; iOS only. `error` is null when the user cancels it. */
  signInWithApple(): Promise<Result>;
  /**
   * Adds (or verifies) a mobile number on the signed-in account, as the web's Profile page does: Supabase
   * texts a code to `e164`, and the number is only stored once that code is confirmed.
   */
  startPhoneChange(e164: string): Promise<Result>;
  confirmPhoneChange(e164: string, code: string): Promise<Result>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

const MOCK_USER: AuthUser = { id: 'dev-mock-user', email: 'dev@mock.local', phone: null, emailConfirmed: true };

function toUser(session: Session | null): AuthUser | null {
  const u = session?.user;
  return u
    ? {
        id: u.id,
        email: u.email || null,
        phone: u.phone || null,
        emailConfirmed: !!u.email_confirmed_at,
        phoneConfirmed: !!u.phone_confirmed_at,
      }
    : null;
}

/** Plain-language errors; never the raw provider message. */
function friendly(
  error: { message?: string; status?: number; name?: string } | null | undefined,
  where: string,
): string | null {
  if (!error) return null;
  // Diagnostic only — never user-facing. Lets a release-build failure be
  // read back via `adb logcat` instead of leaving no trace at all, since
  // reportError() deliberately drops the message (see lib/diagnostics.ts)
  // and no crash-reporting vendor is wired up yet.
  console.error(`[auth:${where}]`, { name: error.name, status: error.status, message: error.message });
  const msg = (error.message ?? '').toLowerCase();
  if (error.status === 429 || msg.includes('rate limit') || msg.includes('too many')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (msg.includes('expired') || msg.includes('invalid') || msg.includes('token')) {
    return 'That code is wrong or has expired. Request a new one.';
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) {
    return "Couldn't reach Kwala. Check your connection and try again.";
  }
  return 'Something went wrong. Please try again.';
}

/**
 * The web's mapPhoneChangeError (kwala-intel-fe/src/lib/phone.ts). A number already confirmed on another
 * account is refused before any SMS is sent, in words that read like a bug; say what the user can do.
 */
function friendlyPhoneChange(error: { message?: string; status?: number; name?: string; code?: string } | null): string | null {
  if (!error) return null;
  const msg = error.message ?? '';
  if (error.code === 'phone_exists' || /already\s+(been\s+)?registered/i.test(msg)) {
    return 'This number is already linked to another Kwala Intel account. Sign in with that account, or use a different number.';
  }
  if (/\ballowlist\b/i.test(msg)) {
    return 'This number is not approved for access on this environment. Ask an admin to add it to the allowlist first.';
  }
  // friendly() would read "Invalid phone number" as a wrong code.
  if (/phone/i.test(msg) && /invalid|format/i.test(msg)) return 'Enter a valid 10-digit Indian mobile number.';
  return friendly(error, 'startPhoneChange');
}

/** The Supabase session id inside an access token, or null. */
function sessionIdOf(accessToken: string | undefined | null): string | null {
  if (!accessToken) return null;
  try {
    const part = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(globalThis.atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')));
    return typeof payload.session_id === 'string' ? payload.session_id : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const mock = env.useMockBackend;
  const missingConfig = useMemo(() => (mock ? [] : missingBackendConfig()), [mock]);
  const [status, setStatus] = useState<Status>(mock ? 'signedIn' : missingConfig.length ? 'signedOut' : 'loading');
  const [user, setUser] = useState<AuthUser | null>(mock ? MOCK_USER : null);

  useEffect(() => {
    if (mock || missingConfig.length) return;
    const supabase = getSupabase();
    let cancelled = false;

    setAuthBridge({
      getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
      refresh: async () => {
        const { data, error } = await supabase.auth.refreshSession();
        return error ? null : (data.session?.access_token ?? null);
      },
      onSessionExpired: () => {
        // Local only: the token is already dead, and a network sign-out that
        // fails would leave the session in place and loop.
        void supabase.auth.signOut({ scope: 'local' });
      },
    });

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUser(toUser(data.session));
      setStatus(data.session ? 'signedIn' : 'signedOut');
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toUser(session));
      setStatus(session ? 'signedIn' : 'signedOut');
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [mock, missingConfig]);

  const sendEmailCode = useCallback(async (email: string): Promise<Result> => {
    const { error } = await getSupabase().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    return { error: friendly(error, 'sendEmailCode') };
  }, []);

  const verifyEmailCode = useCallback(async (email: string, code: string): Promise<Result> => {
    const { error } = await getSupabase().auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: 'email',
    });
    return { error: friendly(error, 'verifyEmailCode') };
  }, []);

  const sendPhoneCode = useCallback(async (e164: string): Promise<Result> => {
    const { error } = await getSupabase().auth.signInWithOtp({
      phone: e164,
      options: { shouldCreateUser: true },
    });
    return { error: friendly(error, 'sendPhoneCode') };
  }, []);

  const verifyPhoneCode = useCallback(async (e164: string, code: string): Promise<Result> => {
    const { error } = await getSupabase().auth.verifyOtp({ phone: e164, token: code.trim(), type: 'sms' });
    return { error: friendly(error, 'verifyPhoneCode') };
  }, []);

  const signInWithGoogleInBrowser = useCallback(async (): Promise<Result> => {
    const supabase = getSupabase();
    const redirectTo = oauthRedirectUri();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) return { error: 'Could not start Google sign-in. Please try again.' };

    let result: WebBrowser.WebBrowserAuthSessionResult;
    try {
      result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    } catch {
      return { error: 'Could not open the browser. Please try again.' };
    }
    // Closing the browser is a choice, not a failure.
    if (result.type !== 'success') return { error: null };

    const callback = parseOAuthCallback(result.url);
    if (callback.kind === 'error') return { error: 'Google sign-in was not completed. Please try again.' };
    if (callback.kind === 'none') return { error: 'Google sign-in did not return to the app. Please try again.' };
    const exchanged = await supabase.auth.exchangeCodeForSession(callback.code);
    return { error: exchanged.error ? 'Google sign-in failed. Please try again.' : null };
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<Result> => {
    const google = await requestGoogleCredential();
    // Cancelling the sheet is a choice, not a failure.
    if (google.kind === 'cancelled') return { error: null };
    if (google.kind === 'error') return { error: 'Could not start Google sign-in. Please try again.' };
    // Not set up for the native sheet, or this device can't show it: the browser flow still works.
    if (google.kind === 'unavailable') return signInWithGoogleInBrowser();

    const { error } = await getSupabase().auth.signInWithIdToken({ provider: 'google', token: google.idToken, nonce: google.nonce });
    if (error) {
      // Diagnostic only, as in signInWithApple: most likely the Web client id is not in Supabase's Google Client IDs.
      console.error('[auth:signInWithGoogle]', { name: error.name, status: error.status, message: error.message });
      return { error: 'Google sign-in failed. Please try again.' };
    }
    return { error: null };
  }, [signInWithGoogleInBrowser]);

  const signInWithApple = useCallback(async (): Promise<Result> => {
    const apple = await requestAppleCredential();
    // Cancelling the sheet is a choice, not a failure.
    if (apple.kind === 'cancelled') return { error: null };
    if (apple.kind === 'error') return { error: 'Could not start Apple sign-in. Please try again.' };

    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: apple.identityToken,
      nonce: apple.nonce,
    });
    if (error) {
      // Diagnostic only, as in friendly(): most likely the Apple provider or this bundle ID is not set up in Supabase.
      console.error('[auth:signInWithApple]', { name: error.name, status: error.status, message: error.message });
      return { error: 'Apple sign-in failed. Please try again.' };
    }
    // Best effort: a failed save must not undo a good sign-in.
    if (apple.fullName) {
      void supabase.auth.updateUser({ data: { full_name: apple.fullName } }).catch(() => {});
    }
    return { error: null };
  }, []);

  const startPhoneChange = useCallback(
    async (e164: string): Promise<Result> => {
      if (mock) return { error: null };
      const { error } = await getSupabase().auth.updateUser({ phone: e164 });
      return { error: friendlyPhoneChange(error) };
    },
    [mock],
  );

  const confirmPhoneChange = useCallback(
    async (e164: string, code: string): Promise<Result> => {
      if (mock) {
        setUser(u => (u ? { ...u, phone: e164, phoneConfirmed: true } : u));
        return { error: null };
      }
      const supabase = getSupabase();
      const before = sessionIdOf((await supabase.auth.getSession()).data.session?.access_token);
      const { error } = await supabase.auth.verifyOtp({ phone: e164, token: code.trim(), type: 'phone_change' });
      if (error) return { error: friendly(error, 'confirmPhoneChange') };
      // The new number is on the user from here; a fresh session carries it to the rest of the app.
      await supabase.auth.refreshSession();
      // As on the web: if Supabase issued a new session, end the old one so it does not linger as a second device.
      const after = sessionIdOf((await supabase.auth.getSession()).data.session?.access_token);
      if (before && after && before !== after) {
        try {
          await supabase.rpc('revoke_session', { target_session_id: before });
        } catch {
          // Best effort: it expires on its own.
        }
      }
      return { error: null };
    },
    [mock],
  );

  const signOut = useCallback(async () => {
    if (mock) return;
    await getSupabase().auth.signOut({ scope: 'local' });
  }, [mock]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      missingConfig,
      sendEmailCode,
      verifyEmailCode,
      sendPhoneCode,
      verifyPhoneCode,
      signInWithGoogle,
      signInWithApple,
      startPhoneChange,
      confirmPhoneChange,
      signOut,
    }),
    [status, user, missingConfig, sendEmailCode, verifyEmailCode, sendPhoneCode, verifyPhoneCode, signInWithGoogle, signInWithApple, startPhoneChange, confirmPhoneChange, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
