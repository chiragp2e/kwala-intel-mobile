import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MIN_TOUCH, colors, fonts, radii, spacing, type } from '../theme/tokens';

interface Props {
  value: string;
  onChangeText: (t: string) => void;
  onSend: () => void;
  onStop: () => void;
  isSending: boolean;
  placeholder?: string;
  caption?: string;
}

export function Composer({ value, onChangeText, onSend, onStop, isSending, placeholder, caption }: Props) {
  const canSend = value.trim().length > 0 && !isSending;
  return (
    <View style={styles.wrap}>
      <View style={styles.box}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? 'Ask anything about markets…'}
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={4000}
          accessibilityLabel="Message"
          // Allow OS text scaling; the box grows with the text up to a cap.
          allowFontScaling
          underlineColorAndroid="transparent"
          selectionColor={colors.primaryNeon}
          returnKeyType="default"
        />
        {isSending ? (
          <Pressable
            onPress={onStop}
            accessibilityRole="button"
            accessibilityLabel="Stop generating"
            style={[styles.btn, styles.stop]}>
            <View style={styles.stopSquare} />
          </Pressable>
        ) : (
          <Pressable
            onPress={onSend}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: !canSend }}
            style={[styles.btn, canSend ? styles.sendOn : styles.sendOff]}>
            <Text style={styles.arrow}>↑</Text>
          </Pressable>
        )}
      </View>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.sm },
  box: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    ...type.body,
    minHeight: MIN_TOUCH - 4,
    maxHeight: 140,
    paddingTop: 8,
    paddingBottom: 8,
    color: colors.textPrimary,
  },
  btn: { width: MIN_TOUCH - 4, height: MIN_TOUCH - 4, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  sendOn: { backgroundColor: colors.primary },
  sendOff: { backgroundColor: '#17301f' },
  stop: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderStrong },
  stopSquare: { width: 14, height: 14, borderRadius: 3, backgroundColor: colors.textPrimary },
  arrow: { color: colors.onPrimary, fontSize: 22, fontWeight: '700', lineHeight: 26 },
  caption: { ...type.eyebrow, fontFamily: fonts.mono, textAlign: 'center' },
});
