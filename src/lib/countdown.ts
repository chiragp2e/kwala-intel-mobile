/** "6h 12m", "42m", "less than a minute": how long until the free questions come back. */
export function formatRemaining(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'now';
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 1) return 'less than a minute';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Milliseconds until `iso`, or null when it is missing or not a date. */
export function msUntil(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t - now : null;
}
