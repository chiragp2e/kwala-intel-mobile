import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getBackend } from '../api';
import { useAuth } from '../auth/AuthContext';
import { useChat } from '../chat/useChat';
import { useVoiceInput } from '../chat/useVoiceInput';
import { Button } from '../components/Button';
import { OfflineBanner, QuotaCard, useIsOffline } from '../components/Banners';
import { Composer } from '../components/Composer';
import { EmptyChat } from '../components/EmptyChat';
import { Header } from '../components/Header';
import { HistoryDrawer } from '../components/HistoryDrawer';
import { useDrawerSwipe } from '../components/drawerSwipe';
import { UpgradeModal } from '../components/UpgradeModal';
import { MessageItem } from '../components/MessageItem';
import type { ScreenProps } from '../navigation/types';
import { msUntil } from '../lib/countdown';
import { unreadCount, useEntitlements, useInvalidate, useNotifications } from '../state/queries';
import { colors, spacing, type, fonts } from '../theme/tokens';

export function ChatScreen({ navigation, route }: ScreenProps<'Chat'>) {
  const insets = useSafeAreaInsets();
  const { status, user, signOut, missingConfig } = useAuth();
  const backend = useMemo(() => getBackend(), []);
  const chat = useChat({ backend });
  const offline = useIsOffline();
  const [draft, setDraft] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const drawer = useDrawerSwipe({ onOpen: openDrawer, onClose: closeDrawer });
  const [limitOpen, setLimitOpen] = useState(false);
  const listRef = useRef<FlatList>(null);
  const signedIn = status === 'signedIn';
  const { data: entitlements = null } = useEntitlements();
  const { data: notifications } = useNotifications();
  const invalidate = useInvalidate();

  // Open a chat picked in History, or start a fresh one.
  const { sessionId: routeSession, fresh, send: pendingSend } = route.params ?? {};
  useEffect(() => {
    if (routeSession) void chat.openSession(routeSession);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSession]);
  useEffect(() => {
    if (fresh) {
      chat.newChat();
      setDraft('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh]);

  // Everything held for one account is dropped when the account changes or signs out.
  const userId = user?.id ?? null;
  const lastUser = useRef<string | null>(userId);
  useEffect(() => {
    if (lastUser.current !== userId) {
      lastUser.current = userId;
      chat.clear();
      setDraft('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Entitlements are shared (see state/queries); this screen only says when they may have changed.
  const refreshEntitlements = useCallback(() => void invalidate.entitlements(), [invalidate]);
  // Back from Pricing after paying: the header and usage chip pick up the new plan.
  useEffect(() => navigation.addListener('focus', refreshEntitlements), [navigation, refreshEntitlements]);

  const submit = useCallback(
    async (text: string) => {
      if (!signedIn) {
        // Guests browse; sending needs an account. The question travels with them
        // and is sent the moment they are signed in (see the `send` effect below).
        if (text.trim()) navigation.navigate('SignIn', { prompt: text.trim() });
        else navigation.navigate('SignIn');
        return;
      }
      // Already out of free questions for today: say so now, with the question kept, rather than after a round trip.
      const allowance = entitlements?.quota;
      if (allowance && !allowance.unlimited && allowance.remaining <= 0 && (msUntil(allowance.resetAt, Date.now()) ?? 1) > 0) {
        setDraft(text);
        setLimitOpen(true);
        return;
      }
      setDraft('');
      const result = await chat.send(text);
      if (!result.ok && result.restoreText) setDraft(result.restoreText);
      if (!result.ok && result.failure?.code === 'QUOTA_EXCEEDED') setLimitOpen(true);
      if (!result.ok && result.failure?.code === 'UNAUTHENTICATED') navigation.navigate('SignIn');
      // A message uses up allowance and creates or moves a chat in History.
      refreshEntitlements();
      void invalidate.sessions();
    },
    [chat, entitlements, invalidate, navigation, refreshEntitlements, signedIn],
  );

  const onSend = useCallback(() => void submit(draft), [draft, submit]);

  // Dictation is added to whatever is typed, never replaces it. Hold-and-release sends it;
  // a tap-to-stop leaves it in the box to edit. While an answer is streaming it always waits.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const voice = useVoiceInput({
    onTranscript: (text, autoSend) => {
      const typed = draftRef.current.trim();
      const composed = typed ? `${typed} ${text}` : text;
      if (autoSend && !chat.isSending) void submit(composed);
      else setDraft(composed);
    },
  });
  const onPrompt = useCallback((t: string) => void submit(t), [submit]);

  // Back from sign-in with the question a guest asked: answer it now, once.
  // Declared after the account-change effect above, so that one clears first.
  useEffect(() => {
    if (!pendingSend || !signedIn) return;
    navigation.setParams({ send: undefined });
    chat.newChat();
    void submit(pendingSend);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSend, signedIn]);

  const startNewChat = useCallback(() => navigation.setParams({ sessionId: undefined, fresh: Date.now() }), [navigation]);

  const doSignOut = useCallback(() => {
    chat.clear();
    void signOut();
  }, [chat, signOut]);

  // Newest first, so an inverted list keeps the latest at the bottom and leaves
  // the reader where they are when older text is being read.
  const data = useMemo(() => [...chat.messages].reverse(), [chat.messages]);
  // The latest answer carries the turn's live state: status, the agent's steps, a reconnect.
  const lastAnswerId = useMemo(() => [...chat.messages].reverse().find(m => m.role === 'assistant')?.id, [chat.messages]);
  const feedKey = useMemo(
    () => [chat.statusText, chat.activity, chat.thinking, chat.reconnecting],
    [chat.statusText, chat.activity, chat.thinking, chat.reconnecting],
  );
  const lastId = chat.messages[chat.messages.length - 1]?.id;
  useEffect(() => {
    // A new turn from this user scrolls to the latest. Streaming growth alone does not.
    if (chat.messages[chat.messages.length - 1]?.role === 'user') {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [lastId, chat.messages]);

  const q = entitlements?.quota;
  const metered = signedIn && q && !q.unlimited;
  const caption = !signedIn
    ? 'FREE FOREVER · NO CARD'
    : metered
      ? `${q.remaining} OF ${q.limit} FREE LEFT TODAY`
      : undefined;
  const captionTone = metered && q.remaining <= 1 ? 'warn' : 'normal';
  const captionAction = !signedIn
    ? { label: 'Sign up', onPress: () => navigation.navigate('SignIn') }
    : metered
      ? { label: 'Upgrade', onPress: () => navigation.navigate('Pricing') }
      : undefined;

  const empty = chat.messages.length === 0;

  return (
    // The bottom inset lives here, outside the KeyboardAvoidingView, so the KAV ends at the top of the
    // navigation bar and only lifts by however far the keyboard actually rises above it. Padding the
    // composer for it instead counted the bar twice: a 24dp jump on focus with a hardware or floating
    // keyboard, and a matching gap above the soft keyboard.
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Header
        signedIn={signedIn}
        plan={entitlements?.plan}
        unread={signedIn ? unreadCount(notifications) : 0}
        onMenu={openDrawer}
        onNewChat={startNewChat}
        onLogIn={() => navigation.navigate('SignIn')}
        onPricing={() => navigation.navigate('Pricing')}
        onNotifications={() => navigation.navigate('Notifications')}
      />
      {offline ? <OfflineBanner /> : null}
      {missingConfig.length > 0 ? (
        <View style={styles.config} accessibilityRole="alert">
          <Text style={styles.configTitle}>Backend not configured</Text>
          <Text style={styles.configBody}>
            This build has no values for {missingConfig.join(', ')}. See README, "API and environment configuration".
          </Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={0}>
        {/* Swipe right on the conversation to pull the history drawer open. */}
        <View style={styles.flex} {...drawer.openHandlers}>
          {chat.historyState === 'loading' ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.muted}>Loading chat…</Text>
            </View>
          ) : chat.historyState === 'error' ? (
            <View style={styles.center}>
              <Text style={styles.muted}>Couldn't load this chat.</Text>
              <Button label="Try again" variant="secondary" onPress={() => chat.sessionId && void chat.openSession(chat.sessionId)} />
            </View>
          ) : empty ? (
            <EmptyChat onPick={q => void submit(q)} disabled={chat.isSending} scrollEnabled={!drawer.dragging} />
          ) : (
            <FlatList
              ref={listRef}
              inverted
              data={data}
              keyExtractor={m => m.id}
              extraData={feedKey}
              renderItem={({ item }) =>
                item.id === lastAnswerId ? (
                  <MessageItem
                    message={item}
                    statusText={chat.statusText}
                    onRetry={id => void chat.retry(id)}
                    onPrompt={onPrompt}
                    activity={chat.activity}
                    thinking={chat.thinking}
                    reconnecting={chat.reconnecting}
                  />
                ) : (
                  <MessageItem message={item} statusText={null} onRetry={id => void chat.retry(id)} onPrompt={onPrompt} />
                )
              }
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              scrollEnabled={!drawer.dragging}
              initialNumToRender={12}
              windowSize={9}
              removeClippedSubviews={Platform.OS === 'android'}
            />
          )}
        </View>

        {chat.quota ? <QuotaCard quota={chat.quota} onSeePlans={() => navigation.navigate('Pricing')} /> : null}
        <View style={insets.bottom > 0 ? undefined : styles.composerGap}>
          <Composer
            value={draft}
            onChangeText={setDraft}
            onSend={onSend}
            onStop={chat.stop}
            isSending={chat.isSending}
            caption={caption}
            captionTone={captionTone}
            captionAction={captionAction}
            voice={signedIn ? voice : null}
            onMicGated={() => navigation.navigate('SignIn')}
            placeholder={signedIn ? 'Ask anything about markets…' : 'Sign in free to ask anything'}
          />
        </View>
      </KeyboardAvoidingView>

      <UpgradeModal
        visible={limitOpen}
        used={chat.quota?.used ?? q?.used ?? 0}
        limit={chat.quota?.limit ?? q?.limit ?? 0}
        resetAt={chat.quota?.resetAt ?? q?.resetAt ?? null}
        hasDraft={draft.trim().length > 0}
        onClose={() => setLimitOpen(false)}
        onSeePlans={() => {
          setLimitOpen(false);
          navigation.navigate('Pricing');
        }}
        onReset={refreshEntitlements}
      />
      <HistoryDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        swipe={drawer}
        activeSessionId={chat.sessionId}
        onOpenSession={id => navigation.setParams({ sessionId: id, fresh: undefined })}
        onNewChat={startNewChat}
        onDeleted={id => {
          if (id === chat.sessionId) startNewChat();
        }}
        onProfile={() => navigation.navigate('Profile')}
        onPricing={() => navigation.navigate('Pricing')}
        onSignIn={() => navigation.navigate('SignIn')}
        onSignOut={doSignOut}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  /** Breathing room under the composer on devices with no bottom inset (no home indicator or nav bar). */
  composerGap: { paddingBottom: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  muted: { ...type.small, color: colors.textTertiary },
  config: { margin: spacing.lg, padding: spacing.md, borderRadius: 12, backgroundColor: colors.dangerBg, gap: 4 },
  configTitle: { ...type.small, color: colors.danger, fontFamily: fonts.bold },
  configBody: { ...type.small, color: colors.danger },
});
