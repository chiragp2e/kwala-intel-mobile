import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

interface Props {
  radius: number;
  /** Turn the sweep off (e.g. a disabled button). The static gloss stays. */
  still?: boolean;
  /** Time between sweeps. */
  period?: number;
}

/**
 * The "shine" on every green button: a glossy top half, a bright top edge, and
 * a diagonal highlight that sweeps across every few seconds. Drawn as an
 * overlay inside the button, so it clips to the button's corners and never
 * intercepts touches. No gradient library: the sweep is stacked translucent
 * bands. With "reduce motion" on, only the static gloss is drawn.
 */
export function Shine({ radius, still, period = 4200 }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(v => alive && setReduceMotion(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!width || still || reduceMotion) return;
    // A random head start so several buttons on screen do not flash in unison.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 950, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(period),
      ]),
    );
    const start = setTimeout(() => loop.start(), Math.random() * 1800);
    return () => {
      clearTimeout(start);
      loop.stop();
      progress.setValue(0);
    };
  }, [width, still, reduceMotion, period, progress]);

  const band = Math.max(width * 0.34, 28);
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-band * 1.6, width + band] });

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.gloss} />
      <View style={styles.edge} />
      {!still && !reduceMotion && width > 0 ? (
        <Animated.View style={[styles.sweep, { width: band, transform: [{ translateX }, { rotate: '18deg' }] }]}>
          <View style={[styles.band, { flex: 1, backgroundColor: 'rgba(255,255,255,0.10)' }]} />
          <View style={[styles.band, { flex: 1.2, backgroundColor: 'rgba(255,255,255,0.26)' }]} />
          <View style={[styles.band, { flex: 1, backgroundColor: 'rgba(255,255,255,0.10)' }]} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '52%', backgroundColor: 'rgba(255,255,255,0.10)' },
  edge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.38)' },
  sweep: { position: 'absolute', top: -24, bottom: -24, left: 0, flexDirection: 'row' },
  band: {},
});

/** Soft green glow under a shiny button. Spread onto the button's own style. */
export const shineGlow = {
  shadowColor: '#4aa664',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.35,
  shadowRadius: 10,
  elevation: 4,
} as const;
