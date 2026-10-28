import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { setAuthBridge } from '../api/http';
import { env, missingBackendConfig } from '../config/env';
import { getSupabase } from './supabase';

export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
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
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

const MOCK_USER: AuthUser = { id: 'dev-mock-user', email: 'dev@mock.local', phone: null };

function toUser(session: Session | null): AuthUser | null {
  const u = session?.user;
  return u ? { id: u.id, email: u.email ?? null, phone: u.phone ?? null } : null;
}

/** Plain-language errors; never the raw provider message. */
function friendly(error: { message?: string; status?: number } | null | undefined): string | null {
  if (!error) return null;
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
    return { error: friendly(error) };
  }, []);

  const verifyEmailCode = useCallback(async (email: string, code: string): Promise<Result> => {
    const { error } = await getSupabase().auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: 'email',
    });
    return { error: friendly(error) };
  }, []);

  const sendPhoneCode = useCallback(async (e164: string): Promise<Result> => {
    const { error } = await getSupabase().auth.signInWithOtp({
      phone: e164,
      options: { shouldCreateUser: true },
    });
    return { error: friendly(error) };
  }, []);

  const verifyPhoneCode = useCallback(async (e164: string, code: string): Promise<Result> => {
    const { error } = await getSupabase().auth.verifyOtp({ phone: e164, token: code.trim(), type: 'sms' });
    return { error: friendly(error) };
  }, []);

  const signOut = useCallback(async () => {
    if (mock) return;
    await getSupabase().auth.signOut({ scope: 'local' });
  }, [mock]);

  const value = useMemo<AuthValue>(
    () => ({ status, user, missingConfig, sendEmailCode, verifyEmailCode, sendPhoneCode, verifyPhoneCode, signOut }),
    [status, user, missingConfig, sendEmailCode, verifyEmailCode, sendPhoneCode, verifyPhoneCode, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
