import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { useReduceMotion } from './motion';

import { splashGif, splashStill } from './splashSource';

/** The GIF's own background, so the animation has no visible edge on the screen. */
export const SPLASH_BG = '#060706';

/** The GIF is 960x540. By 3.4s the mark has assembled and "kwala" is typed out. */
const RATIO = 960 / 540;
const PLAY_MS = 3700;
const EXIT_MS = 350;
/** If the GIF never reports it loaded, carry on rather than hold the app back. */
const LOAD_GIVE_UP_MS = 1500;

interface Props {
  /** The app underneath is ready to show (fonts loaded). The splash leaves once this and the animation are both done. */
  ready: boolean;
  onDone: () => void;
}

/**
 * Kwala's animated launch screen: the logo-reveal GIF (retimed to about twice
 * its original speed, see assets/splash.gif), centred on its own background and
 * faded out once the app is ready. With "reduce motion" on it shows the still
 * of the finished logo instead.
 */
export function AnimatedSplash({ ready, onDone }: Props) {
  const reduce = useReduceMotion();
  const exit = useRef(new Animated.Value(0)).current;
  const [played, setPlayed] = useState(false);
  const started = useRef(false);

  // The clock starts when the GIF is on screen, not when this mounts, so a slow
  // decode does not eat into the animation.
  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setTimeout(() => setPlayed(true), reduce ? 700 : PLAY_MS);
  }, [reduce]);

  useEffect(() => {
    const t = setTimeout(start, LOAD_GIVE_UP_MS);
    return () => clearTimeout(t);
  }, [start]);

  useEffect(() => {
    if (!ready || !played) return;
    const out = Animated.timing(exit, {
      toValue: 1,
      duration: EXIT_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    out.start(({ finished }) => finished && onDone());
    return () => out.stop();
  }, [ready, played, exit, onDone]);

  return (
    <Animated.View
      style={[
        styles.root,
        {
          opacity: exit.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0],
          }),
        },
      ]}
      accessible
      accessibilityLabel="Kwala Intel is loading"
    >
      <View style={styles.frame}>
        <Image
          source={reduce ? splashStill : splashGif}
          style={styles.image}
          resizeMode="contain"
          onLoad={start}
          accessibilityIgnoresInvertColors
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SPLASH_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: { width: '100%', aspectRatio: RATIO },
  image: { width: '100%', height: '100%' },
});
