import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, fonts, radii, spacing } from '../theme/tokens';

interface Props {
  value: string;
  onChangeText: (digits: string) => void;
  inputRef?: React.Ref<TextInput>;
  length?: number;
  /** Draws every box in the error colour. */
  invalid?: boolean;
  editable?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * One-time code entry as separate boxes. A single transparent TextInput lies
 * over the row and does the real work, so typing, backspace, paste and the
 * SMS / email autofill suggestion all behave like an ordinary field; the boxes
 * only draw what it holds. The box about to receive a digit is highlighted.
 */
export function OtpInput({ value, onChangeText, inputRef, length = 6, invalid, editable = true, style }: Props) {
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, length - 1);

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.row} pointerEvents="none">
        {Array.from({ length }, (_, i) => {
          const char = value[i];
          const on = focused && i === active;
          return (
            <View
              key={i}
              style={[
                styles.box,
                char ? styles.filled : null,
                on && styles.active,
                invalid && styles.invalid,
              ]}>
              <Text style={styles.digit}>{char ?? ''}</Text>
              {on && !char ? <View style={styles.caret} /> : null}
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={t => onChangeText(t.replace(/\D/g, '').slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={editable}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={length}
        caretHidden
        selectionColor="transparent"
        accessibilityLabel="Verification code"
        accessibilityHint={`Enter the ${length}-digit code`}
        style={styles.hidden}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 56 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  box: {
    flex: 1,
    height: 56,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.backgroundDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filled: { borderColor: colors.textTertiary },
  active: { borderColor: colors.primary, backgroundColor: 'rgba(74, 166, 100, 0.08)' },
  invalid: { borderColor: colors.error },
  digit: { fontFamily: fonts.semibold, fontSize: 24, lineHeight: 30, color: colors.textPrimary },
  caret: { position: 'absolute', width: 2, height: 24, borderRadius: 1, backgroundColor: colors.primaryNeon },
  // Invisible but full-size, so a tap anywhere on the row focuses it.
  hidden: { ...StyleSheet.absoluteFillObject, opacity: 0.02, color: 'transparent' },
});
