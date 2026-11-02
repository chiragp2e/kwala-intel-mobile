import type { ChatSession } from '../api/schemas';

const DAY = 86_400_000;

function stamp(s: ChatSession): number {
  const t = Date.parse(s.updated_at ?? s.created_at ?? '');
  return Number.isNaN(t) ? 0 : t;
}

/** History sections in the order people scan them: Today, Yesterday, Previous 7 days, Earlier. Newest first. */
export function groupSessions(sessions: ChatSession[], now = Date.now()): { title: string; data: ChatSession[] }[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const today = start.getTime();
  const order = ['Today', 'Yesterday', 'Previous 7 days', 'Earlier'] as const;
  const buckets = new Map<string, ChatSession[]>(order.map(k => [k, []]));
  for (const s of [...sessions].sort((a, b) => stamp(b) - stamp(a))) {
    const t = stamp(s);
    const key = t >= today ? 'Today' : t >= today - DAY ? 'Yesterday' : t >= today - 7 * DAY ? 'Previous 7 days' : 'Earlier';
    buckets.get(key)?.push(s);
  }
  return order.map(title => ({ title, data: buckets.get(title) ?? [] })).filter(s => s.data.length > 0);
}
