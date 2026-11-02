import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

/** Left to right: sky blue, indigo-violet, magenta. The "Ultra" gradient. */
export const ULTRA_GRADIENT = ['#38a8f0', '#6f63f8', '#d63df6'] as const;

const hex = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));

/** The colour at position t (0..1) along evenly spaced stops. */
function at(stops: readonly string[], t: number): string {
  const x = Math.min(0.9999, Math.max(0, t)) * (stops.length - 1);
  const i = Math.floor(x);
  const a = hex(stops[i]);
  const b = hex(stops[i + 1]);
  const f = x - i;
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`;
}

interface Props {
  colors?: readonly string[];
  radius?: number;
  /** More strips is smoother; 48 is indistinguishable from a true gradient at button size. */
  steps?: number;
}

/**
 * A horizontal gradient that fills its parent, drawn as thin colour strips so
 * the app needs no gradient or SVG package (and no native rebuild). Clips to
 * `radius` and never intercepts touches.
 */
export function Gradient({ colors = ULTRA_GRADIENT, radius = 0, steps = 48 }: Props) {
  const strips = useMemo(() => Array.from({ length: steps }, (_, i) => at(colors, (i + 0.5) / steps)), [colors, steps]);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.row, { borderRadius: radius }]}>
      {strips.map((c, i) => (
        <View key={i} style={[styles.strip, { backgroundColor: c }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', overflow: 'hidden' },
  strip: { flex: 1 },
});
