import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MIN_TOUCH, colors, fonts, radii, spacing, type } from '../theme/tokens';
import { Icon, type IconName } from './Icon';
import { Logo } from './Logo';
import { Shine, shineGlow } from './Shine';

interface Props {
  signedIn: boolean;
  /** The plan held, when signed in and known. */
  plan?: 'free' | 'pro' | 'ultra';
  onHistory: () => void;
  onNewChat: () => void;
  onLogIn: () => void;
  onAccount: () => void;
  onPricing: () => void;
  /** Email or phone, for the avatar initial. */
  identity?: string;
}

function IconButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [styles.icon, pressed && { backgroundColor: colors.surfaceHover }]}>
      <Icon name={icon} size={23} color={colors.textSecondary} />
    </Pressable>
  );
}

/**
 * Top bar. Guests get a single "Log in" link (creating an account is one tap away on
 * that screen), free accounts a shiny "Upgrade" pill, paid accounts their plan badge.
 */
export function Header({ signedIn, plan, onHistory, onNewChat, onLogIn, onAccount, onPricing, identity }: Props) {
  const paid = plan === 'pro' || plan === 'ultra';
  return (
    <View style={styles.bar}>
      <Logo width={92} />
      {signedIn ? (
        <View style={styles.right}>
          {paid ? (
            <Pressable onPress={onPricing} accessibilityRole="button" accessibilityLabel={`${plan} plan`} style={styles.planBadge}>
              {plan === 'ultra' ? <Icon name="sparkles" size={13} color="#a9a8ff" /> : null}
              <Text style={styles.planBadgeText}>{plan === 'ultra' ? 'ULTRA' : 'PRO'}</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={onPricing}
              accessibilityRole="button"
              accessibilityLabel="Upgrade, see plans"
              style={({ pressed }) => [styles.upgrade, shineGlow, pressed && { opacity: 0.85 }]}>
              <Shine radius={radii.pill} />
              <Icon name="sparkles" size={14} color={colors.onPrimary} />
              <Text style={styles.upgradeText}>Upgrade</Text>
            </Pressable>
          )}
          <IconButton icon="panel-left" label="Chat history" onPress={onHistory} />
          <IconButton icon="square-pen" label="New chat" onPress={onNewChat} />
          <Pressable onPress={onAccount} accessibilityRole="button" accessibilityLabel="Account" hitSlop={4} style={styles.icon}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(identity?.trim()[0] ?? 'K').toUpperCase()}</Text>
            </View>
          </Pressable>
        </View>
      ) : (
        <View style={styles.right}>
          <Pressable onPress={onLogIn} accessibilityRole="button" accessibilityLabel="Log in" style={styles.link}>
            <Text style={styles.linkText}>Log in</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 56,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  right: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  icon: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.userBubble, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.bold, fontSize: 14, color: colors.onPrimary },
  upgrade: {
    height: 34,
    paddingHorizontal: spacing.md,
    marginRight: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  upgradeText: { fontFamily: fonts.bold, fontSize: 13, color: colors.onPrimary },
  planBadge: {
    height: 30,
    paddingHorizontal: spacing.md,
    marginRight: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: '#6d6cf0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  planBadgeText: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, color: '#a9a8ff' },
  link: { minHeight: MIN_TOUCH, paddingHorizontal: spacing.sm, justifyContent: 'center' },
  linkText: { ...type.small, color: colors.textSecondary, fontSize: 15 },
});
