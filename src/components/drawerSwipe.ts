import { useMemo, useRef, useState } from 'react';
import { Keyboard, PanResponder, useWindowDimensions, type GestureResponderEvent, type GestureResponderHandlers } from 'react-native';
import { Easing, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useReduceMotion } from './motion';

/** The web drawer's curve, cubic-bezier(0.22, 1, 0.36, 1), over 300ms. */
export const DRAWER_EASE = Easing.bezier(0.22, 1, 0.36, 1);
export const DRAWER_MS = 300;
/** The rest of the way after the finger lifts. */
const SETTLE_MS = 200;

/** How far a finger moves before a swipe is the drawer's, and how much more sideways than up or down it must be. */
const SLOP = 12;
const SIDEWAYS = 1.5;
/** A release this fast (px per ms) decides by its direction alone. */
const FLICK = 0.5;
/** Otherwise the drawer changes state once dragged this share of its width. */
const COMMIT = 0.3;

export function drawerWidth(screen: number): number {
  return Math.min(360, Math.round(screen * 0.86));
}

/** A drag is the drawer's once it is clearly sideways: rightward (1) to open, leftward (-1) to close. */
export function claimsSwipe(dx: number, dy: number, dir: 1 | -1): boolean {
  return dx * dir > SLOP && Math.abs(dx) > Math.abs(dy) * SIDEWAYS;
}

/** Where the panel sits during a drag: -width is hidden, 0 is fully open. */
export function panelOffset(wasOpen: boolean, dx: number, width: number): number {
  return Math.max(-width, Math.min(0, (wasOpen ? 0 : -width) + dx));
}

/** Whether the drawer ends up open when the finger lifts. */
export function endsOpen(wasOpen: boolean, dx: number, vx: number, width: number): boolean {
  if (vx > FLICK) return true;
  if (vx < -FLICK) return false;
  const moved = wasOpen ? -dx : dx;
  return moved > width * COMMIT ? !wasOpen : wasOpen;
}

export interface DrawerSwipe {
  width: number;
  /** The panel's offset, -width (hidden) to 0 (open). A finger drives it during a swipe, the drawer otherwise. */
  x: SharedValue<number>;
  /** A finger is moving the drawer: the lists under it stop scrolling so they cannot take the touch. */
  dragging: boolean;
  /** Read by the drawer as it opens: a swipe already has the panel under the finger, so it does not slide it in. */
  isDragging(): boolean;
  /** For the chat: swipe right to pull the drawer open. */
  openHandlers: GestureResponderHandlers;
  /** For the open drawer: swipe left to push it closed. */
  closeHandlers: GestureResponderHandlers;
}

/**
 * The history drawer follows the finger both ways, as the web drawer and most chat apps do. A drag only
 * becomes the drawer's once it is clearly sideways, so the chat still scrolls, and charts and tables
 * that claim a sideways drag first keep it.
 */
export function useDrawerSwipe({ onOpen, onClose }: { onOpen: () => void; onClose: () => void }): DrawerSwipe {
  const { width: screen } = useWindowDimensions();
  const width = drawerWidth(screen);
  const reduce = useReduceMotion();
  const x = useSharedValue(-width);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const live = useRef({ width, reduce, onOpen, onClose });
  live.current = { width, reduce, onOpen, onClose };

  const handlers = useMemo(() => {
    const finish = (open: boolean) => {
      draggingRef.current = false;
      setDragging(false);
      if (open) x.value = withTiming(0, { duration: live.current.reduce ? 0 : SETTLE_MS, easing: DRAWER_EASE });
      // The drawer slides itself out from wherever the finger left it.
      else live.current.onClose();
    };
    const make = (wasOpen: boolean) => {
      const dir = wasOpen ? -1 : 1;
      // Each touch starts 'watching'; it becomes 'dragging' once clearly sideways, or 'passed' once it is a
      // scroll, a pinch or the other way, and then stays that way until the finger lifts.
      let phase: 'watching' | 'dragging' | 'passed' = 'passed';
      // Distances are measured from where the finger landed, not from PanResponder's gesture state: that
      // restarts at zero when this takes a touch over from a button, and carries over from touches it never got.
      let start = { x: 0, y: 0 };
      let lastDx = 0;
      const moved = (e: GestureResponderEvent) => ({ dx: e.nativeEvent.pageX - start.x, dy: e.nativeEvent.pageY - start.y });
      const begin = () => {
        phase = 'dragging';
        draggingRef.current = true;
        setDragging(true);
        if (!wasOpen) {
          Keyboard.dismiss();
          live.current.onOpen();
        }
      };
      const watch = (e: GestureResponderEvent) => {
        if (phase !== 'watching') return;
        if (e.nativeEvent.touches.length > 1) {
          phase = 'passed';
          return;
        }
        const { dx, dy } = moved(e);
        if (claimsSwipe(dx, dy, dir)) begin();
        else if (Math.abs(dy) > SLOP || dx * dir < -SLOP) phase = 'passed';
      };
      return PanResponder.create({
        // Every touch in the area passes here first, whoever ends up with it.
        onStartShouldSetPanResponderCapture: e => {
          if (phase === 'dragging') {
            // A second finger during a swipe does not end it, or the lists would stay frozen.
            if (e.nativeEvent.touches.length > 1) return false;
            // A first finger while still dragging: the last one's lift never arrived. Settle that swipe first.
            finish(endsOpen(wasOpen, lastDx, 0, live.current.width));
          }
          start = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
          phase = e.nativeEvent.touches.length > 1 ? 'passed' : 'watching';
          return false;
        },
        // Android only sends a touch's moves to JS once something has taken the touch, so the area takes
        // it as it starts (buttons, charts and lists inside it are asked first and keep theirs).
        onStartShouldSetPanResponder: () => true,
        // A drag that started on a button is taken over once it is clearly a swipe. A chart that is already
        // scrubbing refuses to let go.
        onMoveShouldSetPanResponder: e => {
          if (phase !== 'watching') return false;
          const { dx, dy } = moved(e);
          if (claimsSwipe(dx, dy, dir)) return true;
          if (Math.abs(dy) > SLOP || dx * dir < -SLOP) phase = 'passed';
          return false;
        },
        onShouldBlockNativeResponder: () => false,
        onPanResponderTerminationRequest: () => phase !== 'dragging',
        onPanResponderGrant: e => {
          lastDx = 0;
          watch(e);
        },
        onPanResponderMove: e => {
          watch(e);
          if (phase !== 'dragging') return;
          lastDx = moved(e).dx;
          x.value = panelOffset(wasOpen, lastDx, live.current.width);
        },
        onPanResponderRelease: (e, g) => {
          if (phase === 'dragging') finish(endsOpen(wasOpen, moved(e).dx, g.vx, live.current.width));
          phase = 'passed';
        },
        // Taken away (by the system, or a native scroll): back to where it started.
        onPanResponderTerminate: () => {
          if (phase === 'dragging') finish(wasOpen);
          phase = 'passed';
        },
      }).panHandlers;
    };
    return { open: make(false), close: make(true) };
  }, [x]);

  return useMemo(
    () => ({
      width,
      x,
      dragging,
      isDragging: () => draggingRef.current,
      openHandlers: handlers.open,
      closeHandlers: handlers.close,
    }),
    [width, x, dragging, handlers],
  );
}
