/**
 * The agent's work while it answers, as a list the reader can watch. A port of
 * the web app's kwala-intel-fe/src/lib/chat/activity.ts: the backend sends each
 * unit of work twice (`running`, then `done`) under one stable id.
 */

export type ActivityState = 'running' | 'done' | 'error';

/** One `activity` event off the wire. `group` is open-ended: an unknown group still gets a row. */
export interface ActivityEvent {
  id: string;
  state: ActivityState;
  label: string;
  group: string;
  /** Server-measured duration, on `done` only. */
  ms?: number;
}

export interface ActivityItem extends ActivityEvent {
  /** When this client saw the item open, so the ticking counter measures the wait the reader sits through. */
  startedAt: number;
}

export function isActivityEvent(v: unknown): v is ActivityEvent {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    e.id.length > 0 &&
    typeof e.label === 'string' &&
    (e.state === 'running' || e.state === 'done' || e.state === 'error')
  );
}

/**
 * Merges one event into the feed, keyed on `id`: a `done` replaces its row in
 * place. Order is arrival order and never changes. A late `running` after the
 * item finished is ignored, so a finished spinner never restarts.
 */
export function applyActivity(items: ActivityItem[], event: ActivityEvent, now: number): ActivityItem[] {
  const at = items.findIndex(i => i.id === event.id);
  if (at === -1) return [...items, { ...event, group: typeof event.group === 'string' ? event.group : '', startedAt: now }];
  const current = items[at] as ActivityItem;
  if (event.state === 'running' && current.state !== 'running') return items;
  const next = items.slice();
  next[at] = { ...current, ...event };
  return next;
}

/** Closes anything still open, so a stream that died mid-flight leaves no spinner turning. */
export function settleActivity(items: ActivityItem[], now: number): ActivityItem[] {
  if (!items.some(i => i.state === 'running')) return items;
  return items.map(i => (i.state === 'running' ? { ...i, state: 'done' as const, ms: i.ms ?? now - i.startedAt } : i));
}

/** "1.4s" under ten seconds, "12s" under a minute, then "1m 5s". */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 60_000) {
    const s = ms / 1000;
    return `${s < 10 ? parseFloat(s.toFixed(1)) : Math.round(s)}s`;
  }
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

/** Phase rows (`think:1`, `answer`) are narration, not work; only real calls count as sources. */
export function isPhaseItem(id: string): boolean {
  return id === 'answer' || id.startsWith('think:');
}

/** The one line the feed folds to once the answer starts. */
export function summarize(items: ActivityItem[], now: number): string {
  const sources = items.filter(i => !isPhaseItem(i.id)).length;
  const first = items.length ? Math.min(...items.map(i => i.startedAt)) : now;
  const elapsed = formatMs(now - first);
  const noun = sources === 1 ? 'source' : 'sources';
  if (!sources) return elapsed ? `Worked for ${elapsed}` : 'Working';
  return elapsed ? `Checked ${sources} ${noun} · ${elapsed}` : `Checked ${sources} ${noun}`;
}

const FOLLOWUPS_MARK = '§§FOLLOWUPS§§';

/** Drops the model's follow-up block (and a marker still arriving mid-stream) from the answer text. */
export function stripFollowups(text: string): string {
  const i = text.indexOf(FOLLOWUPS_MARK);
  if (i !== -1) return text.slice(0, i).replace(/\s+$/, '');
  for (let n = FOLLOWUPS_MARK.length - 1; n >= 2; n--) {
    if (text.endsWith(FOLLOWUPS_MARK.slice(0, n))) return text.slice(0, text.length - n).replace(/\s+$/, '');
  }
  return text;
}
