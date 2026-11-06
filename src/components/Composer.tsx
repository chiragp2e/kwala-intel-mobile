import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { VoiceInput } from '../chat/useVoiceInput';
import { MIN_TOUCH, colors, fonts, radii, spacing, type } from '../theme/tokens';
import { Icon } from './Icon';
import { Shine, shineGlow } from './Shine';
import { VoiceRecordingBar } from './VoiceRecordingBar';

interface Props {
  value: string;
  onChangeText: (t: string) => void;
  onSend: () => void;
  onStop: () => void;
  isSending: boolean;
  placeholder?: string;
  /** Small status line under the box, e.g. "2 free messages left today". */
  caption?: string;
  /** "warn" turns the chip amber (nearly out of free messages). */
  captionTone?: 'normal' | 'warn';
  /** Makes the chip a button, with this call to action after the text (e.g. "Upgrade"). */
  captionAction?: { label: string; onPress: () => void };
  /** Voice input. Without it (signed out) the mic is still shown and `onMicGated` runs instead. */
  voice?: VoiceInput | null;
  onMicGated?: () => void;
}

const MAX_LENGTH = 4000;
const SHOW_COUNT_AT = 3400;
const BUTTON = 44;

/**
 * The chat input. A rounded card that comes alive on focus (green border plus a
 * soft halo), grows with the text up to six lines, and carries a round send
 * button that wakes up (scales in and picks up the shine) once there is
 * something to send. While an answer is streaming it becomes a stop button.
 */
export function Composer({
  value,
  onChangeText,
  onSend,
  onStop,
  isSending,
  placeholder,
  caption,
  captionTone = 'normal',
  captionAction,
  voice,
  onMicGated,
}: Props) {
  const [focused, setFocused] = useState(false);
  const focus = useRef(new Animated.Value(0)).current;
  const ready = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const canSend = value.trim().length > 0 && !isSending;

  useEffect(() => {
    Animated.timing(focus, { toValue: focused ? 1 : 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [focus, focused]);
  useEffect(() => {
    Animated.spring(ready, { toValue: canSend ? 1 : 0, friction: 6, tension: 140, useNativeDriver: true }).start();
  }, [canSend, ready]);

  const borderColor = focus.interpolate({ inputRange: [0, 1], outputRange: [colors.borderStrong, colors.primary] });
  const haloOpacity = focus.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const scale = ready.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });

  const pressIn = () => Animated.spring(press, { toValue: 0.92, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  const pressOut = () => Animated.spring(press, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();

  const showCount = value.length >= SHOW_COUNT_AT;
  const recording = voice?.state === 'recording';
  const transcribing = voice?.state === 'transcribing';
  const voiceError = voice?.error ?? null;

  return (
    <View style={styles.wrap}>
      <View>
        {/* Halo: a wider, fainter ring behind the card that fades in on focus. */}
        <Animated.View pointerEvents="none" style={[styles.halo, { opacity: haloOpacity }]} />
        <Animated.View style={[styles.card, { borderColor }]}>
          {recording && voice ? (
            <VoiceRecordingBar elapsedMs={voice.elapsedMs} levels={voice.levels} onCancel={voice.cancel} />
          ) : (
          <TextInput
            style={styles.input}
            value={value}
            editable={!transcribing}
            onChangeText={t => {
              if (voiceError) voice?.clearError();
              onChangeText(t);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={transcribing ? 'Transcribing…' : (placeholder ?? 'Ask anything about markets…')}
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={MAX_LENGTH}
            accessibilityLabel="Message"
            allowFontScaling
            underlineColorAndroid="transparent"
            selectionColor={colors.primaryNeon}
            cursorColor={colors.primaryNeon}
            textAlignVertical="center"
          />
          )}
          <View style={styles.action}>
            <MicButton voice={voice} onGated={onMicGated} />
            {recording ? null : isSending ? (
              <Pressable
                onPress={onStop}
                accessibilityRole="button"
                accessibilityLabel="Stop generating"
                style={({ pressed }) => [styles.stop, pressed && { opacity: 0.8 }]}>
                <View style={styles.stopSquare} />
              </Pressable>
            ) : (
              <Animated.View style={{ transform: [{ scale: Animated.multiply(scale, press) }] }}>
                <Pressable
                  onPress={onSend}
                  onPressIn={pressIn}
                  onPressOut={pressOut}
                  disabled={!canSend || transcribing}
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                  accessibilityState={{ disabled: !canSend }}
                  style={[styles.send, canSend ? [styles.sendOn, shineGlow] : styles.sendOff]}>
                  {canSend ? <Shine radius={BUTTON / 2} /> : null}
                  <Icon name="arrow-up" size={22} color={canSend ? colors.onPrimary : 'rgba(255,255,255,0.4)'} />
                </Pressable>
              </Animated.View>
            )}
          </View>
        </Animated.View>
      </View>

      {voiceError ? (
        <Text style={styles.voiceError} accessibilityRole="alert">
          {voiceError}
        </Text>
      ) : null}
      {/* Only takes room when there is something to say: an empty row left a 30dp band above the keyboard. */}
      {caption || showCount ? (
        <View style={styles.meta}>
          {caption ? (
            <Pressable
              onPress={captionAction?.onPress}
              disabled={!captionAction}
              accessibilityRole={captionAction ? 'button' : 'text'}
              accessibilityLabel={captionAction ? `${caption}. ${captionAction.label}` : caption}
              hitSlop={8}
              style={({ pressed }) => [styles.chip, captionTone === 'warn' && styles.chipWarn, pressed && { opacity: 0.75 }]}>
              <View style={[styles.dot, captionTone === 'warn' && { backgroundColor: colors.danger }]} />
              <Text style={[styles.chipText, captionTone === 'warn' && { color: colors.danger }]}>{caption}</Text>
              {captionAction ? <Text style={styles.chipAction}>{captionAction.label} →</Text> : null}
            </Pressable>
          ) : null}
          {showCount ? (
            <Text style={[styles.count, value.length >= MAX_LENGTH && { color: colors.danger }]}>
              {value.length}/{MAX_LENGTH}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The web's MicButton: a mic at rest, a filled square (amber) while recording,
 * a spinner while asking for the mic or transcribing. Hold to talk, or tap.
 */
function MicButton({ voice, onGated }: { voice?: VoiceInput | null; onGated?: () => void }) {
  const state = voice?.state ?? 'idle';
  const recording = state === 'recording';
  const busy = state === 'requesting' || state === 'transcribing';
  return (
    <Pressable
      onPress={voice ? undefined : onGated}
      onPressIn={voice?.pressIn}
      onPressOut={voice?.pressOut}
      disabled={state === 'transcribing'}
      accessibilityRole="button"
      accessibilityLabel={recording ? 'Stop recording' : 'Record a voice message'}
      accessibilityHint={recording ? undefined : 'Hold to talk and let go to send, or tap to start and tap again to stop.'}
      accessibilityState={{ busy, disabled: state === 'transcribing' }}
      hitSlop={4}
      style={({ pressed }) => [styles.mic, recording && styles.micOn, pressed && !recording && { backgroundColor: colors.surfaceHover }]}>
      {busy ? (
        <ActivityIndicator size="small" color={colors.textSecondary} />
      ) : (
        <Icon name={recording ? 'stop' : 'mic'} size={recording ? 16 : 20} color={recording ? colors.danger : colors.textSecondary} />
      )}
    </Pressable>
  );
}

const CARD_RADIUS = 26;

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs, gap: spacing.sm },
  halo: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: CARD_RADIUS + 4,
    borderWidth: 4,
    borderColor: 'rgba(74, 166, 100, 0.18)',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderRadius: CARD_RADIUS,
    borderWidth: 1.5,
    paddingLeft: spacing.lg + 2,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    // Depth: a faint lift so the box floats over the transcript.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  input: {
    flex: 1,
    ...type.body,
    minHeight: BUTTON,
    maxHeight: 144, // about six lines, then it scrolls
    paddingTop: 10,
    paddingBottom: 10,
    color: colors.textPrimary,
  },
  action: { height: BUTTON, flexDirection: 'row', alignItems: 'center', gap: 2 },
  mic: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  micOn: { backgroundColor: 'rgba(245,158,11,0.15)' },
  voiceError: { ...type.small, fontSize: 12, color: colors.danger, paddingHorizontal: spacing.xs },
  send: { width: BUTTON, height: BUTTON, borderRadius: BUTTON / 2, alignItems: 'center', justifyContent: 'center' },
  sendOn: { backgroundColor: colors.primary },
  sendOff: { backgroundColor: '#16281c' },
  stop: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: { width: 14, height: 14, borderRadius: 3, backgroundColor: colors.primaryNeon },
  meta: { alignItems: 'center', justifyContent: 'center', minHeight: MIN_TOUCH / 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primaryNeon },
  chipText: { ...type.eyebrow, fontSize: 10.5 },
  chipWarn: { borderColor: 'rgba(245,158,11,0.45)', backgroundColor: colors.dangerBg },
  chipAction: { fontFamily: fonts.bold, fontSize: 12, color: colors.primaryNeon, marginLeft: 2 },
  count: { position: 'absolute', right: spacing.xs, fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary },
});
