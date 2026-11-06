import { setAuthBridge } from '../src/api/http';

jest.mock('../src/config/env', () => ({
  env: { aiApiBaseUrl: 'https://ai.test', apiBaseUrl: 'https://api.test', useMockBackend: false },
}));
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

import { createRealBackend } from '../src/api/realBackend';

const jsonResponse = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
const fetchMock = () => (globalThis as unknown as { fetch: jest.Mock }).fetch;
const call = (i = 0) => {
  const [url, init] = fetchMock().mock.calls[i] as [string, { method: string; body?: string; headers: Record<string, string> }];
  return { url, method: init.method, body: init.body === undefined ? undefined : JSON.parse(init.body), auth: init.headers.Authorization };
};

const view = { status: 'active', plan: 'pro', plan_code: 'pro_in_monthly_v2', cancel_at_period_end: true, can_resume: true, payment_issue: false };

beforeEach(() => {
  (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn();
  setAuthBridge({ getAccessToken: async () => 'tok', refresh: async () => null, onSessionExpired: () => {} });
});

describe('billing screen calls (the web Billing page endpoints)', () => {
  it('cancels and resumes on the caller’s own subscription, signed in', async () => {
    fetchMock().mockResolvedValue(jsonResponse(200, { data: view }));
    const backend = createRealBackend();
    await expect(backend.cancelSubscription()).resolves.toMatchObject({ cancel_at_period_end: true, can_resume: true });
    await backend.resumeSubscription();
    expect(call(0)).toMatchObject({ url: 'https://api.test/billing/subscription/cancel', method: 'POST', body: undefined, auth: 'Bearer tok' });
    expect(call(1)).toMatchObject({ url: 'https://api.test/billing/subscription/resume', method: 'POST' });
  });

  it('reads the billing address, and none on file as null', async () => {
    fetchMock().mockResolvedValueOnce(jsonResponse(200, { data: null }));
    await expect(createRealBackend().getBillingAddress()).resolves.toBeNull();
    expect(call()).toMatchObject({ url: 'https://api.test/billing/address', method: 'GET' });
  });

  it('saves the address with PUT, sending only the form fields', async () => {
    const saved = { address: '1 MG Road', state_code: '29', state_name: 'Karnataka', billing_name: 'Ada', updated_at: '2026-11-06T00:00:00Z' };
    fetchMock().mockResolvedValueOnce(jsonResponse(200, { data: saved }));
    const input = { address: '1 MG Road', state_code: '29', billing_name: 'Ada' };
    await expect(createRealBackend().saveBillingAddress(input)).resolves.toMatchObject({ state_name: 'Karnataka' });
    expect(call()).toEqual({ url: 'https://api.test/billing/address', method: 'PUT', body: input, auth: 'Bearer tok' });
  });

  it('reads the state list and the first page of invoices', async () => {
    fetchMock()
      .mockResolvedValueOnce(jsonResponse(200, { data: [{ code: '29', name: 'Karnataka' }] }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [{ id: 'inv1', total_minor: 19900, state: 'emailed', downloadable: true }], meta: { total: 1 } }));
    const backend = createRealBackend();
    await expect(backend.listGstStates()).resolves.toEqual([{ code: '29', name: 'Karnataka' }]);
    await expect(backend.listInvoices()).resolves.toMatchObject([{ id: 'inv1', downloadable: true }]);
    expect(call(0).url).toBe('https://api.test/billing/states');
    expect(call(1).url).toBe('https://api.test/billing/invoices?page=1&per_page=20');
  });

  it('fetches a signed URL for an invoice, and surfaces "not archived yet" as a 409', async () => {
    fetchMock()
      .mockResolvedValueOnce(jsonResponse(200, { data: { url: 'https://store.test/inv1.pdf?sig=1' } }))
      .mockResolvedValueOnce(jsonResponse(409, { error: { code: 'INVOICE_NOT_READY', message: 'not archived' } }));
    const backend = createRealBackend();
    await expect(backend.getInvoiceDownloadUrl('inv/1')).resolves.toBe('https://store.test/inv1.pdf?sig=1');
    expect(call(0).url).toBe('https://api.test/billing/invoices/inv%2F1/download');
    await expect(backend.getInvoiceDownloadUrl('inv1')).rejects.toMatchObject({ failure: { status: 409 } });
  });

  it('refuses a download answer without a usable URL', async () => {
    fetchMock().mockResolvedValueOnce(jsonResponse(200, { data: {} }));
    await expect(createRealBackend().getInvoiceDownloadUrl('inv1')).rejects.toMatchObject({
      failure: { message: 'We could not open that invoice. Try again in a moment.' },
    });
  });

  it('re-sends an invoice to the address on it', async () => {
    fetchMock().mockResolvedValueOnce(jsonResponse(200, { data: { sent: true } }));
    await createRealBackend().emailInvoice('inv1');
    expect(call()).toMatchObject({ url: 'https://api.test/billing/invoices/inv1/email', method: 'POST', body: {} });
  });
});
