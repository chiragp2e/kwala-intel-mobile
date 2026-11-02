import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getBackend } from '../api';
import type { ChatSession } from '../api/schemas';
import { useAuth } from '../auth/AuthContext';

/** Account data is keyed by user, so one account's cache can never be shown to another. */
export const queryKeys = {
  entitlements: (userId: string | null) => ['entitlements', userId] as const,
  sessions: (userId: string | null) => ['sessions', userId] as const,
  plans: ['plans'] as const,
};

function useAccount() {
  const { status, user } = useAuth();
  return { signedIn: status === 'signedIn', userId: user?.id ?? null };
}

/**
 * The signed-in account's plan and today's message allowance. One copy shared
 * by the chat header, usage chip, account sheet, limit modal and pricing.
 */
export function useEntitlements() {
  const { signedIn, userId } = useAccount();
  return useQuery({
    queryKey: queryKeys.entitlements(userId),
    queryFn: () => getBackend().getEntitlements(),
    enabled: signedIn,
  });
}

/** The plans on sale. The same for everyone and rarely changes. */
export function usePlans() {
  return useQuery({
    queryKey: queryKeys.plans,
    queryFn: () => getBackend().getPlans(),
    staleTime: 10 * 60_000,
  });
}

/** Past chats, newest first. Shown from cache at once, then re-read every time History opens. */
export function useSessions() {
  const { signedIn, userId } = useAccount();
  return useQuery({
    queryKey: queryKeys.sessions(userId),
    queryFn: () => getBackend().listSessions(),
    enabled: signedIn,
    refetchOnMount: 'always',
  });
}

/** Deletes a chat. It leaves the list at once and comes back if the server refuses. */
export function useDeleteSession() {
  const client = useQueryClient();
  const { userId } = useAccount();
  const key = queryKeys.sessions(userId);
  return useMutation({
    mutationFn: (id: string) => getBackend().deleteSession(id),
    onMutate: async id => {
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueryData<ChatSession[]>(key);
      client.setQueryData<ChatSession[]>(key, prev => prev?.filter(s => s.id !== id));
      return { before };
    },
    onError: (_error, _id, context) => client.setQueryData(key, context?.before),
  });
}

/** Marks account data as changed on the server, so every screen showing it re-reads it. */
export function useInvalidate() {
  const client = useQueryClient();
  return useMemo(
    () => ({
      /** After a message (uses one up), a purchase (changes the plan) or a daily reset. */
      entitlements: () => client.invalidateQueries({ queryKey: ['entitlements'] }),
      /** After a message (creates or moves a chat). */
      sessions: () => client.invalidateQueries({ queryKey: ['sessions'] }),
    }),
    [client],
  );
}
