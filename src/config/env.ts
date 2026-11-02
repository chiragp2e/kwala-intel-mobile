import { GENERATED_ENV } from './env.generated';

export type AppEnv = 'development' | 'staging' | 'production';

export interface Env {
  appEnv: AppEnv;
  apiBaseUrl: string;
  aiApiBaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  webBaseUrl: string;
  useMockBackend: boolean;
  /** Razorpay publishable key id for the in-app checkout. Empty means "use the key the server sends". */
  razorpayKeyId: string;
}

function appEnv(raw: string | undefined): AppEnv {
  return raw === 'staging' || raw === 'production' ? raw : 'development';
}

const trimSlash = (v: string | undefined) => (v ?? '').replace(/\/+$/, '');

export function readEnv(source: Record<string, string | undefined>): Env {
  const env = appEnv(source.APP_ENV);
  return {
    appEnv: env,
    apiBaseUrl: trimSlash(source.API_BASE_URL),
    aiApiBaseUrl: trimSlash(source.AI_API_BASE_URL),
    supabaseUrl: trimSlash(source.SUPABASE_URL),
    supabaseAnonKey: source.SUPABASE_ANON_KEY ?? '',
    webBaseUrl: trimSlash(source.WEB_BASE_URL) || 'https://app.kwalaintel.com',
    // The mock is for development only. Staging and production never get it,
    // whatever the env file says, so a release can't silently run on fake data.
    useMockBackend: env === 'development' && source.USE_MOCK_BACKEND === 'true',
    razorpayKeyId: razorpayKeyId(env, source.RAZORPAY_KEY_ID),
  };
}

/** A production build never uses a test key: it would open a test-mode checkout for real customers. */
function razorpayKeyId(env: AppEnv, raw: string | undefined): string {
  const key = (raw ?? '').trim();
  return env === 'production' && key.startsWith('rzp_test_') ? '' : key;
}

export const env: Env = readEnv(GENERATED_ENV);

/** Names of the settings a real backend needs and this build lacks. */
export function missingBackendConfig(e: Env = env): string[] {
  const missing: string[] = [];
  if (!e.apiBaseUrl) missing.push('API_BASE_URL');
  if (!e.aiApiBaseUrl) missing.push('AI_API_BASE_URL');
  if (!e.supabaseUrl) missing.push('SUPABASE_URL');
  if (!e.supabaseAnonKey) missing.push('SUPABASE_ANON_KEY');
  return missing;
}
