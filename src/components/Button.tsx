import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { MIN_TOUCH, colors, radii, spacing, type, fonts } from '../theme/tokens';
import { Shine, shineGlow } from './Shine';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

export function Button({ label, onPress, variant = 'primary', loading, disabled, style, accessibilityHint }: Props) {
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && [{ backgroundColor: pressed ? colors.primaryPressed : colors.primary }, !inactive && shineGlow],
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        inactive && styles.inactive,
        style,
      ]}>
      {variant === 'primary' ? <Shine radius={radii.md} still={!!inactive} /> : null}
      {loading ? (
        <ActivityIndicator color={colors.onPrimary} />
      ) : (
        <Text style={[styles.label, variant !== 'primary' && { color: colors.textPrimary }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH + 4,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: { borderWidth: 1, borderColor: colors.border, backgroundColor: 'transparent' },
  ghost: { backgroundColor: 'transparent' },
  inactive: { opacity: 0.5 },
  label: { ...type.body, fontFamily: fonts.semibold, color: colors.onPrimary },
});
