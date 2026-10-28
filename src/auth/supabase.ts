import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { env } from '../config/env';
import { secureSessionStorage } from './secureStorage';

let client: SupabaseClient | null = null;

/**
 * The Supabase client, created on first use so an unconfigured build (no
 * SUPABASE_URL yet) can still render its "not configured" screen instead of
 * crashing at import time.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      storage: secureSessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  // Token refresh timers must not run while the app is suspended.
  AppState.addEventListener('change', state => {
    if (!client) return;
    if (state === 'active') client.auth.startAutoRefresh();
    else client.auth.stopAutoRefresh();
  });
  return client;
}
