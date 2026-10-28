import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MIN_TOUCH, colors, radii, spacing, type } from '../theme/tokens';
import { Logo } from './Logo';

interface Props {
  signedIn: boolean;
  onHistory: () => void;
  onNewChat: () => void;
  onLogIn: () => void;
  onSignUp: () => void;
  onAccount: () => void;
}

function IconButton({ glyph, label, onPress }: { glyph: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [styles.icon, pressed && { backgroundColor: colors.surfaceHover }]}>
      <Text style={styles.glyph}>{glyph}</Text>
    </Pressable>
  );
}

export function Header({ signedIn, onHistory, onNewChat, onLogIn, onSignUp, onAccount }: Props) {
  return (
    <View style={styles.bar}>
      <View style={styles.left}>
        <Logo width={96} />
      </View>
      {signedIn ? (
        <View style={styles.right}>
          <IconButton glyph="≡" label="Chat history" onPress={onHistory} />
          <IconButton glyph="+" label="New chat" onPress={onNewChat} />
          <IconButton glyph="⋯" label="Account" onPress={onAccount} />
        </View>
      ) : (
        <View style={styles.right}>
          <Pressable onPress={onLogIn} accessibilityRole="button" accessibilityLabel="Log in" style={styles.login}>
            <Text style={styles.loginText}>Log in</Text>
          </Pressable>
          <Pressable onPress={onSignUp} accessibilityRole="button" accessibilityLabel="Sign up" style={styles.signup}>
            <Text style={styles.signupText}>Sign up</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  left: { flexDirection: 'row', alignItems: 'center' },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  icon: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  glyph: { color: colors.textSecondary, fontSize: 24, lineHeight: 28 },
  login: { minHeight: MIN_TOUCH, paddingHorizontal: spacing.md, justifyContent: 'center' },
  loginText: { ...type.small, color: colors.textSecondary, fontSize: 15 },
  signup: {
    minHeight: MIN_TOUCH - 4,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    justifyContent: 'center',
  },
  signupText: { ...type.small, color: colors.onPrimary, fontWeight: '700', fontSize: 15 },
});
