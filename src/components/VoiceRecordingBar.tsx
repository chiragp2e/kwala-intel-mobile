import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MAX_RECORDING_MS } from '../chat/useVoiceInput';
import { MIN_TOUCH, colors, fonts } from '../theme/tokens';
import { Icon } from './Icon';

const BARS = 28;

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Takes the text field's place while recording, as on the web
 * (kwala-intel-fe/src/components/VoiceRecordingBar.tsx): cancel, a live level
 * waveform (newest on the right), and "0:07 / 0:58", amber in the last ten seconds.
 */
export function VoiceRecordingBar({ elapsedMs, levels, onCancel }: { elapsedMs: number; levels: number[]; onCancel: () => void }) {
  const bars = Array.from({ length: BARS }, (_, i) => levels[levels.length - BARS + i] ?? 0);
  const late = elapsedMs > MAX_RECORDING_MS - 10_000;
  return (
    <View style={styles.row} accessibilityLiveRegion="polite" accessibilityLabel={`Recording, ${clock(elapsedMs)}`}>
      <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel recording" hitSlop={6} style={styles.cancel}>
        <Icon name="close" size={18} color={colors.textSecondary} />
      </Pressable>
      <View style={styles.wave} accessibilityElementsHidden importantForAccessibility="no">
        {bars.map((level, i) => (
          <View key={i} style={[styles.bar, { transform: [{ scaleY: 0.08 + level * 0.92 }] }]} />
        ))}
      </View>
      <Text style={styles.timer}>
        <Text style={late ? { color: colors.danger } : undefined}>{clock(elapsedMs)}</Text> / {clock(MAX_RECORDING_MS)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: 10 },
  cancel: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated },
  wave: { flex: 1, height: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, overflow: 'hidden' },
  bar: { width: 2, height: 24, borderRadius: 1, backgroundColor: 'rgba(0,127,71,0.7)' },
  timer: { fontFamily: fonts.mono, fontSize: 12, color: colors.textTertiary },
});
