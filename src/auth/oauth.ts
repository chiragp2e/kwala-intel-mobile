import { env } from '../config/env';

/** Custom URL scheme this build is registered for (see AndroidManifest and Info.plist). */
export function appScheme(appEnv: string = env.appEnv): string {
  return appEnv === 'production' ? 'kwalaintel' : 'kwalaintelstaging';
}

/** Where Google sign-in returns to. Must be on Supabase's Redirect URLs allow-list. */
export function oauthRedirectUri(appEnv: string = env.appEnv): string {
  return `${appScheme(appEnv)}://auth-callback`;
}

export type OAuthCallback =
  | { kind: 'code'; code: string }
  | { kind: 'error'; message: string }
  | { kind: 'none' };

/**
 * Reads the URL the browser handed back. With PKCE the result is `?code=...`;
 * a refusal arrives as `?error=...&error_description=...` (query or fragment).
 */
export function parseOAuthCallback(url: string): OAuthCallback {
  const parts = url.split('#');
  const query = (parts[0] ?? '').split('?')[1] ?? '';
  const values: Record<string, string> = {};
  for (const pair of `${query}&${parts[1] ?? ''}`.split('&')) {
    const [k, v = ''] = pair.split('=');
    if (!k) continue;
    try {
      values[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    } catch {
      // A malformed escape is ignored rather than failing the whole callback.
    }
  }
  const code = values.code;
  if (code) return { kind: 'code', code };
  const error = values.error_description ?? values.error;
  if (error) return { kind: 'error', message: error };
  return { kind: 'none' };
}
