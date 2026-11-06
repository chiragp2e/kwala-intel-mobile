import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/** True when the OS asks for less motion. Everything here falls back to a plain, instant state. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(v => alive && setReduce(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

interface FadeInProps {
  children: React.ReactNode;
  /** Wait before starting; use index * 60 to stagger a list. */
  delay?: number;
  /** Start this far below the resting position. */
  rise?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}

/** Fades and lifts its children into place once, on mount. Runs on the UI thread. */
export function FadeIn({ children, delay = 0, rise = 10, duration = 320, style }: FadeInProps) {
  const reduce = useReduceMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduce) {
      t.value = 1;
      return;
    }
    t.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) }));
    return () => cancelAnimation(t);
  }, [t, reduce, delay, duration]);
  const animated = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: (1 - t.value) * rise }],
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

interface PressScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Scale while held. Subtle: 0.97 for cards and rows, 0.94 for small buttons. */
  to?: number;
}

/** A Pressable that sinks slightly under the finger and springs back. */
export function PressScale({ style, to = 0.97, onPressIn, onPressOut, children, ...rest }: PressScaleProps) {
  const reduce = useReduceMotion();
  const s = useSharedValue(1);
  const go = (v: number, damping: number) => {
    if (reduce) return;
    s.value = withSpring(v, { damping, stiffness: 520, mass: 0.6 });
  };
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      {...rest}
      onPressIn={e => {
        go(to, 30);
        onPressIn?.(e);
      }}
      onPressOut={e => {
        go(1, 14);
        onPressOut?.(e);
      }}>
      {state => (
        <Animated.View style={[style, animated]}>
          {typeof children === 'function' ? children(state) : children}
        </Animated.View>
      )}
    </Pressable>
  );
}

/**
 * One dot of the web's `typing-dot` keyframes (kwala-intel-fe/src/index.css):
 * over 1.4s it rises 4px and brightens from 0.3 to 1 at 30%, back down by 60%,
 * then rests. The three dots start 0.2s apart.
 */
function Dot({ index, color, animate }: { index: number; color: string; animate: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!animate) return;
    t.value = withDelay(index * 200, withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), -1));
    return () => cancelAnimation(t);
  }, [t, index, animate]);
  const animated = useAnimatedStyle(() => {
    // 0 at rest, 1 at the peak (30%), eased on each side like CSS `ease`.
    const p = t.value;
    const up = p < 0.3 ? p / 0.3 : p < 0.6 ? 1 - (p - 0.3) / 0.3 : 0;
    const k = up * up * (3 - 2 * up);
    return { opacity: 0.3 + 0.7 * k, transform: [{ translateY: -4 * k }] };
  });
  return <Animated.View style={[styles.dot, { backgroundColor: color }, animated]} />;
}

/** Three dots that rise in turn: the web's "Kwala is thinking" dots. Static under reduced motion. */
export function TypingDots({ color = 'rgba(0,127,71,0.4)' }: { color?: string }) {
  const reduce = useReduceMotion();
  return (
    <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no">
      {[0, 1, 2].map(i => (
        <Dot key={i} index={i} color={color} animate={!reduce} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 16 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
