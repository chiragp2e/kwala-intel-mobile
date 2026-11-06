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
  /** Unread notifications, for the bell's badge. */
  unread: number;
  onMenu: () => void;
  onNewChat: () => void;
  onLogIn: () => void;
  onPricing: () => void;
  onNotifications: () => void;
}

function IconButton({ icon, label, onPress, badge }: { icon: IconName; label: string; onPress: () => void; badge?: number }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} unread` : label}
      hitSlop={4}
      style={({ pressed }) => [styles.icon, pressed && { backgroundColor: colors.surfaceHover }]}>
      <Icon name={icon} size={22} color={colors.textSecondary} />
      {badge ? (
        <View style={styles.badge} accessibilityElementsHidden importantForAccessibility="no">
          <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Top bar, laid out as the web app's mobile header: the chat-history toggle at
 * the top left, then the logo; on the right the plan (an "Upgrade" pill for free
 * accounts, the plan badge for paid ones), the notification bell and New chat.
 * Guests get New chat and a "Log in" link instead.
 */
export function Header({ signedIn, plan, unread, onMenu, onNewChat, onLogIn, onPricing, onNotifications }: Props) {
  const paid = plan === 'pro' || plan === 'ultra';
  return (
    <View style={styles.bar}>
      <View style={styles.left}>
        <IconButton icon="panel-left" label="Open chat history" onPress={onMenu} />
        <Pressable onPress={onNewChat} accessibilityRole="button" accessibilityLabel="Kwala Intel, start a new chat" hitSlop={4}>
          <Logo width={84} />
        </Pressable>
      </View>
      <View style={styles.right}>
        {signedIn ? (
          <>
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
            <IconButton icon="bell" label="Notifications" onPress={onNotifications} badge={unread} />
            <IconButton icon="square-pen" label="New chat" onPress={onNewChat} />
          </>
        ) : (
          <>
            <IconButton icon="square-pen" label="New chat" onPress={onNewChat} />
            <Pressable onPress={onLogIn} accessibilityRole="button" accessibilityLabel="Log in" style={styles.link}>
              <Text style={styles.linkText}>Log in</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 56,
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  icon: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 6,
    right: 5,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: colors.error,
    borderWidth: 1.5,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 9, lineHeight: 11, color: colors.onPrimary },
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
  link: { minHeight: MIN_TOUCH, paddingHorizontal: spacing.md, justifyContent: 'center' },
  linkText: { ...type.small, color: colors.textSecondary, fontSize: 15 },
});
