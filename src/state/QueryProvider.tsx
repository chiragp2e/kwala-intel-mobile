import NetInfo from '@react-native-community/netinfo';
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthContext';

/**
 * The shared cache for server data: entitlements, plans and chat history (see
 * ./queries). Who is signed in stays in AuthContext; one conversation's
 * messages stay in useChat.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // Long enough that moving between screens reuses what was just fetched.
      queries: { staleTime: 30_000, retry: 1 },
      mutations: { retry: 0 },
    },
  });
}

/**
 * React Native has no window focus or online events, so the cache is told
 * directly: coming back to the foreground re-reads stale data, and requests
 * wait out an offline spell instead of failing.
 */
function useAppLifecycle() {
  useEffect(() => {
    const app = AppState.addEventListener('change', s => focusManager.setFocused(s === 'active'));
    onlineManager.setEventListener(setOnline =>
      NetInfo.addEventListener(s => setOnline(s.isConnected !== false && s.isInternetReachable !== false)),
    );
    return () => app.remove();
  }, []);
}

/** Must sit inside AuthProvider: everything cached for one account is dropped when the account changes. */
export function QueryProvider({ children, client: given }: { children: React.ReactNode; client?: QueryClient }) {
  const [client] = useState(() => given ?? createQueryClient());
  useAppLifecycle();

  const userId = useAuth().user?.id ?? null;
  const lastUser = useRef(userId);
  useEffect(() => {
    if (lastUser.current === userId) return;
    lastUser.current = userId;
    client.clear();
  }, [client, userId]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
