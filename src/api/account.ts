import { z } from 'zod';
import { env } from '../config/env';
import { requestJson } from './http';
import { parseList } from './schemas';

/**
 * The signed-in account, on the Go API (API_BASE_URL), with the same calls the
 * web app's Profile page and notification bell make (kwala-intel-fe/src/lib/api.ts).
 * In the development mock there is no server, so these answer locally.
 */

const unwrap = (raw: unknown) => (raw && typeof raw === 'object' && 'data' in raw ? (raw as { data: unknown }).data : raw);

/** GET /auth/me. */
export const ProfileSchema = z.object({
  id: z.string().min(1),
  email: z.string().nullish(),
  display_name: z.string().nullish(),
  avatar_url: z.string().nullish(),
  role: z.string().nullish(),
  created_at: z.string().nullish(),
});
export type Profile = z.infer<typeof ProfileSchema>;

/** One message in the in-app inbox (GET /notifications); the server keeps the 50 most recent. */
export const NotificationSchema = z.object({
  id: z.string().min(1),
  message: z.string().default(''),
  created_at: z.string().nullish(),
  read_at: z.string().nullish(),
});
export type UserNotification = z.infer<typeof NotificationSchema>;

const mock = () => env.useMockBackend;
const api = (path: string) => `${env.apiBaseUrl}${path}`;

export async function getProfile(): Promise<Profile | null> {
  if (mock()) return { id: 'dev-mock-user', email: 'dev@mock.local', display_name: null, role: 'user' };
  const r = ProfileSchema.safeParse(unwrap(await requestJson(api('/auth/me'))));
  return r.success ? r.data : null;
}

/** PUT /auth/me. Only the display name is editable, as on the web. */
export async function updateDisplayName(displayName: string): Promise<void> {
  if (mock()) return;
  await requestJson(api('/auth/me'), { method: 'PUT', body: { display_name: displayName } });
}

export async function listNotifications(): Promise<UserNotification[]> {
  if (mock()) return [];
  return parseList(NotificationSchema, unwrap(await requestJson(api('/notifications'))));
}

export async function markNotificationRead(id: string): Promise<void> {
  if (mock()) return;
  await requestJson(api(`/notifications/${encodeURIComponent(id)}/read`), { method: 'POST' });
}

export async function markAllNotificationsRead(): Promise<void> {
  if (mock()) return;
  await requestJson(api('/notifications/read'), { method: 'POST' });
}

export async function dismissNotification(id: string): Promise<void> {
  if (mock()) return;
  await requestJson(api(`/notifications/${encodeURIComponent(id)}`), { method: 'DELETE' });
}

export async function clearNotifications(): Promise<void> {
  if (mock()) return;
  await requestJson(api('/notifications'), { method: 'DELETE' });
}
