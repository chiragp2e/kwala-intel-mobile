import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { act, renderHook, waitFor } from './renderHook.helper';
import { queryKeys, useDeleteSession, useEntitlements, useSessions } from '../src/state/queries';
import { QueryProvider } from '../src/state/QueryProvider';

const mockAuth: { status: string; user: { id: string } | null } = { status: 'signedOut', user: null };
jest.mock('../src/auth/AuthContext', () => ({ useAuth: () => mockAuth }));

const mockBackend = {
  getEntitlements: jest.fn(),
  listSessions: jest.fn(),
  deleteSession: jest.fn(),
  getPlans: jest.fn(),
};
jest.mock('../src/api', () => ({ getBackend: () => mockBackend }));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

const chat = (id: string) => ({ id, title: id, created_at: null, updated_at: null });

describe('shared server state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.status = 'signedOut';
    mockAuth.user = null;
  });

  it('does not ask for entitlements while signed out', async () => {
    const { wrapper } = setup();
    const { result } = await renderHook(() => useEntitlements(), wrapper);
    expect(mockBackend.getEntitlements).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it("keeps each account's entitlements apart", async () => {
    mockAuth.status = 'signedIn';
    mockAuth.user = { id: 'u1' };
    mockBackend.getEntitlements.mockResolvedValue({ plan: 'pro' });
    const { client, wrapper } = setup();
    const { result } = await renderHook(() => useEntitlements(), wrapper);
    await waitFor(() => expect(result.current.data).toEqual({ plan: 'pro' }));
    expect(client.getQueryData(queryKeys.entitlements('u1'))).toEqual({ plan: 'pro' });
    expect(client.getQueryData(queryKeys.entitlements('u2'))).toBeUndefined();
  });

  it('drops a deleted chat at once, and puts it back if the server refuses', async () => {
    mockAuth.status = 'signedIn';
    mockAuth.user = { id: 'u1' };
    mockBackend.listSessions.mockResolvedValue([chat('a'), chat('b')]);
    let refuse!: (e: Error) => void;
    mockBackend.deleteSession.mockReturnValue(new Promise((_resolve, reject) => (refuse = reject)));
    const { wrapper } = setup();
    const { result } = await renderHook(() => ({ sessions: useSessions(), remove: useDeleteSession() }), wrapper);
    await waitFor(() => expect(result.current.sessions.data?.map(s => s.id)).toEqual(['a', 'b']));

    await act(async () => result.current.remove.mutate('a'));
    await waitFor(() => expect(result.current.sessions.data?.map(s => s.id)).toEqual(['b']));

    await act(async () => refuse(new Error('offline')));
    await waitFor(() => expect(result.current.sessions.data?.map(s => s.id)).toEqual(['a', 'b']));
  });

  it("forgets everything cached when the account changes, so no one sees the last person's data", async () => {
    mockAuth.status = 'signedIn';
    mockAuth.user = { id: 'u1' };
    const { client } = setup();
    client.setQueryData(queryKeys.entitlements('u1'), { plan: 'ultra' });
    // A fresh element each time, so React re-renders the provider as an auth context change would.
    const tree = () => (
      <QueryProvider client={client}>
        <></>
      </QueryProvider>
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(tree());
    });
    expect(client.getQueryData(queryKeys.entitlements('u1'))).toEqual({ plan: 'ultra' });

    mockAuth.user = { id: 'u2' };
    await act(async () => renderer.update(tree()));
    expect(client.getQueryData(queryKeys.entitlements('u1'))).toBeUndefined();
    await act(async () => renderer.unmount());
  });
});
