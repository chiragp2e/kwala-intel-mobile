import { classifyChatResponse, networkFailure } from '../src/api/errors';

describe('classifyChatResponse', () => {
  it('treats 402 as a quota wall that is never retryable, with the numbers', () => {
    const f = classifyChatResponse(402, { detail: { code: 'QUOTA_EXCEEDED', used: 2, limit: 2, reset_at: '2026-10-29T00:00:00Z' } });
    expect(f.code).toBe('QUOTA_EXCEEDED');
    expect(f.retryable).toBe(false);
    expect(f.quota).toEqual({ used: 2, limit: 2, resetAt: '2026-10-29T00:00:00Z' });
  });

  it('recognises the quota code even when the status is not 402', () => {
    expect(classifyChatResponse(400, { error: { code: 'QUOTA_EXCEEDED' } }).code).toBe('QUOTA_EXCEEDED');
  });

  it('treats 429 as a throttle: retryable, no quota card', () => {
    const f = classifyChatResponse(429, {});
    expect(f).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
    expect(f.quota).toBeUndefined();
  });

  it('treats 401 and 403 as unauthenticated and not retryable', () => {
    expect(classifyChatResponse(401, null)).toMatchObject({ code: 'UNAUTHENTICATED', retryable: false });
    expect(classifyChatResponse(403, null).code).toBe('UNAUTHENTICATED');
  });

  it('hides server detail behind a generic message for 5xx and keeps it retryable', () => {
    const f = classifyChatResponse(500, { detail: 'panic: nil pointer at db.go:12' });
    expect(f.message).not.toContain('panic');
    expect(f.retryable).toBe(true);
  });

  it('never returns a raw JSON body as the message', () => {
    expect(classifyChatResponse(400, { weird: { nested: true } }).message).not.toContain('{');
  });

  it('describes a transport failure as retryable', () => {
    expect(networkFailure()).toMatchObject({ code: 'NETWORK', retryable: true, status: null });
  });
});
