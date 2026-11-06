import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  PanResponder,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChatSession } from '../api/schemas';
import { useAuth } from '../auth/AuthContext';
import { displayName, initials, relativeTime } from '../lib/identity';
import { groupSessions } from '../lib/groupSessions';
import { useDeleteSession, useProfile, useSessions } from '../state/queries';
import { MIN_TOUCH, colors, fonts, radii, spacing, type } from '../theme/tokens';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';
import { useReduceMotion } from './motion';

const mark = require('../../assets/kwala-icon-white.png');

/** The web drawer's curve, cubic-bezier(0.22, 1, 0.36, 1), over 300ms. */
const EASE = Easing.bezier(0.22, 1, 0.36, 1);
const DURATION = 300;

interface Props {
  open: boolean;
  onClose: () => void;
  /** The chat on screen, highlighted in the list. */
  activeSessionId: string | null;
  onOpenSession: (id: string) => void;
  onNewChat: () => void;
  /** A chat was deleted; the screen starts a new one if it was the open chat. */
  onDeleted: (id: string) => void;
  onProfile: () => void;
  onPricing: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

/**
 * Chat history, in a drawer that slides in from the left as the web app's
 * mobile drawer does (kwala-intel-fe/src/components/HomeDrawer.tsx): New chat,
 * the past chats, and the account at the bottom. Deleting a chat and signing
 * out both ask first. Swipe left or tap outside to close.
 */
export function HistoryDrawer({ open, onClose, activeSessionId, onOpenSession, onNewChat, onDeleted, onProfile, onPricing, onSignIn, onSignOut }: Props) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const { width: screen } = useWindowDimensions();
  const width = Math.min(360, Math.round(screen * 0.86));
  const { status, user } = useAuth();
  const signedIn = status === 'signedIn';
  const { data: profile } = useProfile();
  const sessionsQuery = useSessions();
  const sessions = sessionsQuery.data ?? null;
  const { mutate: deleteSession } = useDeleteSession();
  const sections = useMemo(() => groupSessions(sessions ?? []), [sessions]);

  const [mounted, setMounted] = useState(open);
  const [confirm, setConfirm] = useState<{ kind: 'delete'; session: ChatSession } | { kind: 'signOut' } | null>(null);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const x = useSharedValue(-width);

  useEffect(() => {
    if (open) {
      setMounted(true);
      if (signedIn) void sessionsQuery.refetch();
      x.value = withTiming(0, { duration: reduce ? 0 : DURATION, easing: EASE });
    } else if (mounted) {
      x.value = withTiming(-width, { duration: reduce ? 0 : DURATION, easing: EASE }, done => {
        if (done) runOnJS(setMounted)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Swipe left on the panel to close it.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dx < -12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_e, g) => {
        x.value = Math.min(0, g.dx);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dx < -width * 0.3 || g.vx < -0.5) onCloseRef.current();
        else x.value = withTiming(0, { duration: 180, easing: EASE });
      },
      onPanResponderTerminate: () => {
        x.value = withTiming(0, { duration: 180, easing: EASE });
      },
    }),
  ).current;

  const panel = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const scrim = useAnimatedStyle(() => ({ opacity: 1 + x.value / width }));

  const go = (fn: () => void) => () => {
    onClose();
    fn();
  };

  const name = displayName(profile, user);

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrim]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close chat history" />
        </Animated.View>
        <Animated.View
          {...pan.panHandlers}
          style={[styles.panel, { width, paddingTop: insets.top, paddingBottom: insets.bottom }, panel]}
          accessibilityViewIsModal>
          <View style={styles.head}>
            <View style={styles.brand}>
              <Image source={mark} style={styles.mark} accessibilityIgnoresInvertColors />
              <Text style={styles.brandText}>Kwala</Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" hitSlop={4} style={styles.close}>
              <Icon name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.body}>
            <Pressable
              onPress={go(onNewChat)}
              accessibilityRole="button"
              accessibilityLabel="New chat"
              style={({ pressed }) => [styles.newChat, pressed && { backgroundColor: colors.surfaceHover }]}>
              <Icon name="square-pen" size={18} color={colors.primaryNeon} />
              <Text style={styles.newChatText}>New chat</Text>
            </Pressable>

            <View style={styles.label}>
              <Icon name="history" size={13} color={colors.textTertiary} />
              <Text style={styles.labelText}>Chat history</Text>
            </View>

            {!signedIn ? (
              <View style={styles.center}>
                <Text style={styles.emptyTitle}>Sign in to keep your chats</Text>
                <Text style={styles.muted}>Your questions and answers are saved to your account.</Text>
              </View>
            ) : sessions === null && !sessionsQuery.isError ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : sessions === null ? (
              <View style={styles.center}>
                <Text style={styles.muted}>Couldn't load your chats.</Text>
                <Pressable onPress={() => void sessionsQuery.refetch()} accessibilityRole="button" style={styles.retry}>
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            ) : (
              <SectionList
                sections={sections}
                keyExtractor={s => s.id}
                stickySectionHeadersEnabled={false}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                ListHeaderComponent={
                  deleteFailed ? <Text style={styles.warn}>Couldn't delete the chat. Check your connection and try again.</Text> : null
                }
                ListEmptyComponent={
                  <View style={styles.center}>
                    <Text style={styles.emptyTitle}>No chat history yet</Text>
                    <Text style={styles.muted}>Start a conversation to see it here</Text>
                  </View>
                }
                renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
                renderItem={({ item }) => {
                  const active = item.id === activeSessionId;
                  const title = item.title || 'Untitled chat';
                  return (
                    <View style={[styles.row, active && styles.rowActive]}>
                      <Pressable
                        onPress={go(() => onOpenSession(item.id))}
                        accessibilityRole="button"
                        accessibilityLabel={title}
                        accessibilityState={{ selected: active }}
                        style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.7 }]}>
                        <View style={styles.tile}>
                          <Icon name="message-square" size={15} color={colors.primaryNeon} />
                        </View>
                        <View style={styles.flex}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {title}
                          </Text>
                          <Text style={styles.rowWhen}>{relativeTime(item.updated_at ?? item.created_at)}</Text>
                        </View>
                      </Pressable>
                      <Pressable
                        onPress={() => setConfirm({ kind: 'delete', session: item })}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete chat: ${title}`}
                        hitSlop={4}
                        style={({ pressed }) => [styles.trash, pressed && { backgroundColor: colors.surfaceHover }]}>
                        <Icon name="trash" size={17} color={colors.textTertiary} />
                      </Pressable>
                    </View>
                  );
                }}
              />
            )}
          </View>

          <View style={styles.foot}>
            <Pressable
              onPress={go(onPricing)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.footLink, pressed && { backgroundColor: colors.surfaceHover }]}>
              <Icon name="tag" size={17} color={colors.textSecondary} />
              <Text style={styles.footLinkText}>Pricing</Text>
            </Pressable>
            {signedIn ? (
              <View style={styles.account}>
                <Pressable
                  onPress={go(onProfile)}
                  accessibilityRole="button"
                  accessibilityLabel={`${name}, view profile`}
                  style={({ pressed }) => [styles.who, pressed && { opacity: 0.7 }]}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(name)}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.name} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={styles.viewProfile}>View profile</Text>
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => setConfirm({ kind: 'signOut' })}
                  accessibilityRole="button"
                  accessibilityLabel="Sign out"
                  hitSlop={4}
                  style={({ pressed }) => [styles.trash, pressed && { backgroundColor: colors.surfaceHover }]}>
                  <Icon name="log-out" size={19} color={colors.textSecondary} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.authRow}>
                <Pressable onPress={go(onSignIn)} accessibilityRole="button" style={[styles.authBtn, styles.authOutline]}>
                  <Text style={styles.authOutlineText}>Log in</Text>
                </Pressable>
                <Pressable onPress={go(onSignIn)} accessibilityRole="button" style={[styles.authBtn, styles.authPrimary]}>
                  <Text style={styles.authPrimaryText}>Sign up</Text>
                </Pressable>
              </View>
            )}
          </View>
        </Animated.View>
      </View>

      <ConfirmDialog
        visible={confirm?.kind === 'delete'}
        title="Delete this chat?"
        body="This action cannot be undone."
        confirmLabel="Delete"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind !== 'delete') return;
          const id = confirm.session.id;
          setConfirm(null);
          setDeleteFailed(false);
          deleteSession(id, { onSuccess: () => onDeleted(id), onError: () => setDeleteFailed(true) });
        }}
      />
      <ConfirmDialog
        visible={confirm?.kind === 'signOut'}
        title="Sign out?"
        body="You'll need to sign in again to get back to your chats."
        confirmLabel="Sign out"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          onClose();
          onSignOut();
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrim: { backgroundColor: 'rgba(0,0,0,0.5)' },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 8, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 24,
  },
  head: {
    height: 60,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mark: { width: 29, height: 20, resizeMode: 'contain' },
  brandText: { ...type.body, fontFamily: fonts.semibold, fontSize: 17 },
  close: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md },
  body: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  newChat: {
    minHeight: MIN_TOUCH + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  newChatText: { ...type.body, fontFamily: fonts.medium, fontSize: 15 },
  label: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xl, marginBottom: spacing.xs, paddingHorizontal: spacing.xs },
  labelText: { ...type.eyebrow, fontSize: 10 },
  list: { flex: 1 },
  listContent: { paddingBottom: spacing.lg },
  section: { ...type.eyebrow, fontSize: 10, color: colors.textTertiary, marginTop: spacing.md, marginBottom: spacing.xs, paddingHorizontal: spacing.xs, opacity: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: radii.md, borderWidth: 1, borderColor: 'transparent', marginBottom: 2 },
  rowActive: { borderColor: 'rgba(0,127,71,0.3)', backgroundColor: 'rgba(0,127,71,0.05)' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingLeft: spacing.sm },
  tile: { width: 32, height: 32, borderRadius: radii.sm, backgroundColor: 'rgba(0,127,71,0.08)', alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  rowTitle: { ...type.small, fontSize: 14, fontFamily: fonts.medium, color: colors.textPrimary },
  rowWhen: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.textTertiary, marginTop: 2 },
  trash: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md },
  center: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyTitle: { ...type.small, fontFamily: fonts.semibold, color: colors.textPrimary, textAlign: 'center' },
  muted: { ...type.small, fontSize: 13, color: colors.textTertiary, textAlign: 'center' },
  warn: { ...type.small, fontSize: 13, color: colors.danger, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm },
  retry: { minHeight: MIN_TOUCH, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  retryText: { ...type.small, fontFamily: fonts.semibold, color: colors.primaryNeon },
  foot: { borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.md, gap: spacing.sm },
  footLink: { minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.sm, borderRadius: radii.md },
  footLinkText: { ...type.small, fontSize: 15, color: colors.textPrimary },
  account: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.xs },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.webPrimary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.bold, fontSize: 13, color: colors.onPrimary },
  name: { ...type.small, fontFamily: fonts.semibold, color: colors.textPrimary },
  viewProfile: { ...type.small, fontSize: 12, color: colors.textTertiary },
  authRow: { flexDirection: 'row', gap: spacing.sm },
  authBtn: { flex: 1, minHeight: MIN_TOUCH, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  authOutline: { borderWidth: 1, borderColor: colors.borderStrong },
  authOutlineText: { ...type.small, fontFamily: fonts.semibold, color: colors.textPrimary },
  authPrimary: { backgroundColor: colors.primary },
  authPrimaryText: { ...type.small, fontFamily: fonts.semibold, color: colors.onPrimary },
});
