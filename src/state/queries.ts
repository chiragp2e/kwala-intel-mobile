import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getBackend } from '../api';
import {
  clearNotifications,
  dismissNotification,
  getProfile,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateDisplayName,
  type UserNotification,
} from '../api/account';
import type { ChatSession } from '../api/schemas';
import { useAuth } from '../auth/AuthContext';

/** Account data is keyed by user, so one account's cache can never be shown to another. */
export const queryKeys = {
  entitlements: (userId: string | null) => ['entitlements', userId] as const,
  sessions: (userId: string | null) => ['sessions', userId] as const,
  plans: ['plans'] as const,
  profile: (userId: string | null) => ['profile', userId] as const,
  notifications: (userId: string | null) => ['notifications', userId] as const,
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

/** The account's profile row (display name, role), GET /auth/me. */
export function useProfile() {
  const { signedIn, userId } = useAccount();
  return useQuery({ queryKey: queryKeys.profile(userId), queryFn: getProfile, enabled: signedIn });
}

/** Saves a new display name, then re-reads the profile. */
export function useUpdateDisplayName() {
  const client = useQueryClient();
  const { userId } = useAccount();
  return useMutation({
    mutationFn: (name: string) => updateDisplayName(name),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.profile(userId) }),
  });
}

/**
 * The in-app inbox behind the bell, read as the web app reads it: at once, on
 * every return to the foreground (at most every 15 seconds), and every five
 * minutes as a safety net. There is no unread-count endpoint; it is counted here.
 */
export function useNotifications() {
  const { signedIn, userId } = useAccount();
  return useQuery({
    queryKey: queryKeys.notifications(userId),
    queryFn: listNotifications,
    enabled: signedIn,
    staleTime: 15_000,
    refetchInterval: 5 * 60_000,
  });
}

export const unreadCount = (items: UserNotification[] | undefined) => (items ?? []).filter(n => !n.read_at).length;

type InboxChange =
  | { kind: 'read'; id: string }
  | { kind: 'readAll' }
  | { kind: 'dismiss'; id: string }
  | { kind: 'clear' };

export function applyInboxChange(items: UserNotification[], change: InboxChange, now: string): UserNotification[] {
  switch (change.kind) {
    case 'read':
      return items.map(n => (n.id === change.id && !n.read_at ? { ...n, read_at: now } : n));
    case 'readAll':
      return items.map(n => (n.read_at ? n : { ...n, read_at: now }));
    case 'dismiss':
      return items.filter(n => n.id !== change.id);
    case 'clear':
      return [];
  }
}

/** Every inbox change shows at once and is put back if the server refuses it. */
export function useInboxChange() {
  const client = useQueryClient();
  const { userId } = useAccount();
  const key = queryKeys.notifications(userId);
  return useMutation({
    mutationFn: (change: InboxChange) => {
      switch (change.kind) {
        case 'read':
          return markNotificationRead(change.id);
        case 'readAll':
          return markAllNotificationsRead();
        case 'dismiss':
          return dismissNotification(change.id);
        case 'clear':
          return clearNotifications();
      }
    },
    onMutate: async change => {
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueryData<UserNotification[]>(key);
      client.setQueryData<UserNotification[]>(key, prev => applyInboxChange(prev ?? [], change, new Date().toISOString()));
      return { before };
    },
    onError: (_error, _change, context) => client.setQueryData(key, context?.before),
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
