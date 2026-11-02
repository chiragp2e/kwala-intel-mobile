import { appScheme, oauthRedirectUri, parseOAuthCallback } from '../src/auth/oauth';

describe('oauth', () => {
  it('uses a different scheme for production and non-production builds', () => {
    expect(appScheme('production')).toBe('kwalaintel');
    expect(appScheme('staging')).toBe('kwalaintelstaging');
    expect(appScheme('development')).toBe('kwalaintelstaging');
    expect(oauthRedirectUri('production')).toBe('kwalaintel://auth-callback');
  });

  it('reads the PKCE code', () => {
    expect(parseOAuthCallback('kwalaintel://auth-callback?code=abc123')).toEqual({ kind: 'code', code: 'abc123' });
  });

  it('reads a refusal from the query or the fragment', () => {
    expect(parseOAuthCallback('kwalaintel://auth-callback?error=access_denied&error_description=User+denied')).toEqual({
      kind: 'error',
      message: 'User denied',
    });
    expect(parseOAuthCallback('kwalaintel://auth-callback#error=access_denied')).toEqual({ kind: 'error', message: 'access_denied' });
  });

  it('reports nothing usable when there is neither', () => {
    expect(parseOAuthCallback('kwalaintel://auth-callback')).toEqual({ kind: 'none' });
  });
});
