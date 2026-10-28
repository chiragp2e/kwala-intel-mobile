import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getBackend } from '../api';
import type { Entitlements } from '../api/schemas';
import { useAuth } from '../auth/AuthContext';
import { useChat } from '../chat/useChat';
import { Button } from '../components/Button';
import { GuestBanner, OfflineBanner, QuotaCard, useIsOffline } from '../components/Banners';
import { Composer } from '../components/Composer';
import { EmptyChat } from '../components/EmptyChat';
import { Header } from '../components/Header';
import { MessageItem } from '../components/MessageItem';
import type { ScreenProps } from '../navigation/types';
import { colors, spacing, type } from '../theme/tokens';

export function ChatScreen({ navigation, route }: ScreenProps<'Chat'>) {
  const insets = useSafeAreaInsets();
  const { status, user, signOut, missingConfig } = useAuth();
  const backend = useMemo(() => getBackend(), []);
  const chat = useChat({ backend });
  const offline = useIsOffline();
  const [draft, setDraft] = useState('');
  const [guestBannerHidden, setGuestBannerHidden] = useState(false);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const listRef = useRef<FlatList>(null);
  const signedIn = status === 'signedIn';

  // Open a chat picked in History, or start a fresh one.
  const { sessionId: routeSession, fresh } = route.params ?? {};
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
      setEntitlements(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const refreshEntitlements = useCallback(() => {
    if (!signedIn) return;
    backend
      .getEntitlements()
      .then(setEntitlements)
      .catch(() => {});
  }, [backend, signedIn]);
  useEffect(refreshEntitlements, [refreshEntitlements]);

  const submit = useCallback(
    async (text: string) => {
      if (!signedIn) {
        // Guests browse; sending needs an account. The draft stays in the box.
        navigation.navigate('SignIn');
        return;
      }
      setDraft('');
      const result = await chat.send(text);
      if (!result.ok && result.restoreText) setDraft(result.restoreText);
      if (!result.ok && result.failure?.code === 'UNAUTHENTICATED') navigation.navigate('SignIn');
      refreshEntitlements();
    },
    [chat, navigation, refreshEntitlements, signedIn],
  );

  const onSend = useCallback(() => void submit(draft), [draft, submit]);

  const confirmSignOut = useCallback(() => {
    Alert.alert(user?.email ?? user?.phone ?? 'Account', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          chat.clear();
          void signOut();
        },
      },
    ]);
  }, [chat, signOut, user]);

  // Newest first, so an inverted list keeps the latest at the bottom and leaves
  // the reader where they are when older text is being read.
  const data = useMemo(() => [...chat.messages].reverse(), [chat.messages]);
  const lastId = chat.messages[chat.messages.length - 1]?.id;
  useEffect(() => {
    // A new turn from this user scrolls to the latest. Streaming growth alone does not.
    if (chat.messages[chat.messages.length - 1]?.role === 'user') {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [lastId, chat.messages]);

  const caption = !signedIn
    ? 'FREE FOREVER · SIGN UP TO SEND'
    : entitlements?.quota && !entitlements.quota.unlimited
      ? `${entitlements.quota.remaining} FREE MESSAGE${entitlements.quota.remaining === 1 ? '' : 'S'} LEFT TODAY`
      : undefined;

  const empty = chat.messages.length === 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header
        signedIn={signedIn}
        onHistory={() => navigation.navigate('History')}
        onNewChat={() => navigation.setParams({ sessionId: undefined, fresh: Date.now() })}
        onLogIn={() => navigation.navigate('SignIn')}
        onSignUp={() => navigation.navigate('SignIn')}
        onAccount={confirmSignOut}
      />
      {offline ? <OfflineBanner /> : null}
      {!signedIn && !guestBannerHidden ? (
        <GuestBanner onSignUp={() => navigation.navigate('SignIn')} onDismiss={() => setGuestBannerHidden(true)} />
      ) : null}
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
        <View style={styles.flex}>
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
            <EmptyChat onPick={q => void submit(q)} disabled={chat.isSending} />
          ) : (
            <FlatList
              ref={listRef}
              inverted
              data={data}
              keyExtractor={m => m.id}
              renderItem={({ item }) => (
                <MessageItem message={item} statusText={chat.statusText} onRetry={id => void chat.retry(id)} />
              )}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              initialNumToRender={12}
              windowSize={9}
              removeClippedSubviews={Platform.OS === 'android'}
            />
          )}
        </View>

        {chat.quota ? <QuotaCard quota={chat.quota} /> : null}
        <View style={{ paddingBottom: Math.max(insets.bottom, spacing.sm) }}>
          <Composer
            value={draft}
            onChangeText={setDraft}
            onSend={onSend}
            onStop={chat.stop}
            isSending={chat.isSending}
            caption={caption}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  muted: { ...type.small, color: colors.textTertiary },
  config: { margin: spacing.lg, padding: spacing.md, borderRadius: 12, backgroundColor: colors.dangerBg, gap: 4 },
  configTitle: { ...type.small, color: colors.danger, fontWeight: '700' },
  configBody: { ...type.small, color: colors.danger },
});
