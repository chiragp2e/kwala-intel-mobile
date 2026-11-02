/** Small numeric helpers for the charts: ticks, scales and date labels. */

/** "Nice" tick values covering [min, max]: round steps (1, 2, 2.5, 5 x 10^n). */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const first = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = first; v <= max + step * 1e-6; v += step) out.push(parseFloat(v.toPrecision(12)));
  return out;
}

export const linear = (d0: number, d1: number, r0: number, r1: number) => (v: number) =>
  d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

/** Epoch ms from the backend's ms / ISO / space-separated timestamps. */
export function toMs(t: unknown): number {
  return typeof t === 'number' ? t : Date.parse(String(t).replace(' ', 'T'));
}

/** A date label sized to the span it sits on: times inside two days, dates otherwise. */
export function dateLabel(ms: number, spanMs: number): string {
  const d = new Date(ms);
  if (!Number.isFinite(ms)) return '';
  if (spanMs <= 2 * 86400000) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (spanMs > 400 * 86400000) return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
