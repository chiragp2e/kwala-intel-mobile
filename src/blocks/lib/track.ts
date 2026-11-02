// Geometry for the track widget — the one primitive behind the meter, bullet,
// range/dumbbell, level rail and risk-reward bar.
//
// Kept separate from the component because this is where a track can actually
// be wrong: a value that overflows its bar, a negative width, labels stacked on
// top of each other. All of it is arithmetic, so all of it is testable without
// a DOM.

/** Position of `value` along `min → max`, as a percentage of the track.
 *  Clamped: a value outside the scale pins to the edge rather than drawing
 *  outside the bar. An inverted scale (min > max) is read in the given order,
 *  which is how a track for "distance below the high" is expressed. */
export function valuePct(value: number, min: number, max: number): number {
  const span = max - min;
  if (!Number.isFinite(span) || span === 0) return 0;
  const raw = ((value - min) / span) * 100;
  return Math.min(100, Math.max(0, raw));
}

/** Left edge and width of a span, in percent. Reversed inputs are normalized
 *  instead of producing a negative width that CSS would silently drop. */
export function spanPct(
  from: number,
  to: number,
  min: number,
  max: number,
): { left: number; width: number } {
  const a = valuePct(from, min, max);
  const b = valuePct(to, min, max);
  const left = Math.min(a, b);
  return { left, width: Math.abs(b - a) };
}

/** Reward over risk. Derived rather than passed in, so the printed "3R" can
 *  never contradict the bar it sits on. Undefined when there is no risk to
 *  divide by — an R multiple over zero risk is infinite, not impressive. */
export function rMultiple(
  entry?: number,
  stop?: number,
  target?: number,
): number | undefined {
  if (![entry, stop, target].every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return undefined;
  }
  const risk = Math.abs((entry as number) - (stop as number));
  if (risk === 0) return undefined;
  const reward = Math.abs((target as number) - (entry as number));
  return Math.round((reward / risk) * 100) / 100;
}

export interface LabelBox {
  /** Where the label wants to sit, in px from the track's left edge. */
  center: number;
  /** Its measured width in px. */
  width: number;
}

/** Lay rail labels out along a track so that none overlap and none hang off
 *  either end.
 *
 *  This works in pixels against measured widths, which is the whole point: the
 *  first version separated labels by a fixed percentage of the track, and a
 *  percentage cannot know that "Resistance $316.85" needs three times the room
 *  of "Now". On a six-marker price map that produced labels stacked on top of
 *  each other and two more hanging outside the card.
 *
 *  Returns centers in input order, or `null` when the labels simply cannot fit
 *  — the caller then shows them as a wrapped legend instead of pretending.
 *  Positions are nudged, never reordered: a label that crossed its neighbour
 *  would point at the wrong level, which is worse than being slightly off. */
export function layoutRailLabels(
  boxes: LabelBox[],
  trackWidth: number,
  gap = 8,
): number[] | null {
  const n = boxes.length;
  if (!n || !(trackWidth > 0)) return null;

  const total = boxes.reduce((sum, b) => sum + b.width, 0) + gap * (n - 1);
  if (total > trackWidth) return null;

  const order = boxes
    .map((b, i) => ({ ...b, i, c: b.center }))
    .sort((a, b) => a.c - b.c);

  const clamp = (c: number, w: number) =>
    Math.min(trackWidth - w / 2, Math.max(w / 2, c));

  for (const o of order) o.c = clamp(o.c, o.width);

  // Left to right: nothing may sit closer to its neighbour than half of each
  // width plus the gap.
  for (let k = 1; k < n; k++) {
    const need = order[k - 1].width / 2 + order[k].width / 2 + gap;
    if (order[k].c - order[k - 1].c < need) order[k].c = order[k - 1].c + need;
  }
  // That pass can push the tail past the end; pull the run back from the right.
  // The feasibility check above guarantees this terminates inside the track.
  const last = order[n - 1];
  if (last.c + last.width / 2 > trackWidth) {
    last.c = trackWidth - last.width / 2;
    for (let k = n - 2; k >= 0; k--) {
      const need = order[k].width / 2 + order[k + 1].width / 2 + gap;
      if (order[k + 1].c - order[k].c < need) order[k].c = order[k + 1].c - need;
    }
  }

  const out = new Array<number>(n);
  for (const o of order) out[o.i] = o.c;
  return out;
}
