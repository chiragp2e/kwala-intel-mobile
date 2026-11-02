import { missingBackendConfig, readEnv } from '../src/config/env';

describe('env', () => {
  it('never enables the mock backend outside development', () => {
    expect(readEnv({ APP_ENV: 'development', USE_MOCK_BACKEND: 'true' }).useMockBackend).toBe(true);
    expect(readEnv({ APP_ENV: 'staging', USE_MOCK_BACKEND: 'true' }).useMockBackend).toBe(false);
    expect(readEnv({ APP_ENV: 'production', USE_MOCK_BACKEND: 'true' }).useMockBackend).toBe(false);
    expect(readEnv({ USE_MOCK_BACKEND: 'true' }).appEnv).toBe('development');
  });

  it('never ships a Razorpay test key in a production build', () => {
    expect(readEnv({ APP_ENV: 'staging', RAZORPAY_KEY_ID: ' rzp_test_abc ' }).razorpayKeyId).toBe('rzp_test_abc');
    expect(readEnv({ APP_ENV: 'development', RAZORPAY_KEY_ID: 'rzp_test_abc' }).razorpayKeyId).toBe('rzp_test_abc');
    expect(readEnv({ APP_ENV: 'production', RAZORPAY_KEY_ID: 'rzp_test_abc' }).razorpayKeyId).toBe('');
    expect(readEnv({ APP_ENV: 'production', RAZORPAY_KEY_ID: 'rzp_live_abc' }).razorpayKeyId).toBe('rzp_live_abc');
    expect(readEnv({}).razorpayKeyId).toBe('');
  });

  it('strips trailing slashes from base URLs', () => {
    expect(readEnv({ API_BASE_URL: 'https://api.example.com//' }).apiBaseUrl).toBe('https://api.example.com');
  });

  it('lists what a real backend still needs', () => {
    expect(missingBackendConfig(readEnv({ APP_ENV: 'production' }))).toEqual([
      'API_BASE_URL',
      'AI_API_BASE_URL',
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
    ]);
    expect(
      missingBackendConfig(
        readEnv({ API_BASE_URL: 'a', AI_API_BASE_URL: 'b', SUPABASE_URL: 'c', SUPABASE_ANON_KEY: 'd' }),
      ),
    ).toEqual([]);
  });
});
