import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChatSession } from '../api/schemas';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Shine, shineGlow } from '../components/Shine';
import { groupSessions } from '../lib/groupSessions';
import type { ScreenProps } from '../navigation/types';
import { useDeleteSession, useSessions } from '../state/queries';
import { MIN_TOUCH, colors, fonts, radii, spacing, type } from '../theme/tokens';

function when(s: ChatSession, section: string): string {
  const t = Date.parse(s.updated_at ?? s.created_at ?? '');
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  return section === 'Today' || section === 'Yesterday'
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function HistoryScreen({ navigation }: ScreenProps<'History'>) {
  const insets = useSafeAreaInsets();
  const { status } = useAuth();
  const sessionsQuery = useSessions();
  // A failed refresh keeps the list already shown (the cache holds it); it is not an empty history.
  const sessions = sessionsQuery.data ?? null;
  const error = sessionsQuery.isError;
  const load = sessionsQuery.refetch;
  const { mutate: deleteSession } = useDeleteSession();
  const [refreshing, setRefreshing] = useState(false);

  const sections = useMemo(() => groupSessions(sessions ?? []), [sessions]);

  // Delete is a long-press (and an accessibility action), not a button on every
  // row: a destructive action should never be the loudest thing on the screen.
  const remove = useCallback(
    (s: ChatSession) => {
      Alert.alert('Delete this chat?', s.title || 'Untitled chat', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          // Leaves the list at once; useDeleteSession puts it back if the server refuses.
          onPress: () =>
            deleteSession(s.id, {
              onError: () => Alert.alert("Couldn't delete the chat", 'Check your connection and try again.'),
            }),
        },
      ]);
    },
    [deleteSession],
  );

  if (status !== 'signedIn') {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.title}>Sign in to see your chats</Text>
        <Button label="Sign in" onPress={() => navigation.navigate('SignIn')} />
      </View>
    );
  }

  const header = (
    <View style={styles.headerBlock}>
      <Pressable
        onPress={() => navigation.popTo('Chat', { fresh: Date.now() })}
        accessibilityRole="button"
        accessibilityLabel="Start a new chat"
        style={({ pressed }) => [styles.newChat, shineGlow, pressed && { opacity: 0.9 }]}>
        <Shine radius={radii.md} />
        <Icon name="plus" size={20} color={colors.onPrimary} />
        <Text style={styles.newChatText}>New chat</Text>
      </Pressable>
      {error && sessions ? <Text style={styles.warn}>Couldn't refresh. Showing what we have.</Text> : null}
      {sessions && sessions.length > 0 ? <Text style={styles.tip}>Long-press a chat to delete it</Text> : null}
    </View>
  );

  return (
    <View style={styles.root}>
      {sessions === null && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : sessions === null ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Couldn't load your chats.</Text>
          <Button label="Try again" variant="secondary" onPress={() => void load()} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={s => s.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
          ListHeaderComponent={header}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.primary}
              colors={[colors.primary]}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.title}>No chats yet</Text>
              <Text style={styles.muted}>Your questions and answers will be saved here.</Text>
            </View>
          }
          renderItem={({ item, section, index }) => (
            <Pressable
              onPress={() => navigation.popTo('Chat', { sessionId: item.id })}
              onLongPress={() => remove(item)}
              delayLongPress={350}
              accessibilityRole="button"
              accessibilityLabel={item.title || 'Untitled chat'}
              accessibilityHint="Opens the chat. Long-press to delete."
              accessibilityActions={[{ name: 'delete', label: 'Delete chat' }]}
              onAccessibilityAction={e => {
                if (e.nativeEvent.actionName === 'delete') remove(item);
              }}
              style={({ pressed }) => [
                styles.row,
                index === 0 && styles.rowFirst,
                index === section.data.length - 1 && styles.rowLast,
                pressed && styles.rowPressed,
              ]}>
              <View style={styles.dot} />
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.title || 'Untitled chat'}
              </Text>
              <Text style={styles.when}>{when(item, section.title)}</Text>
              <Icon name="chevron" size={16} color={colors.borderStrong} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: spacing.lg, flexGrow: 1 },
  headerBlock: { gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.xs },
  newChat: { minHeight: MIN_TOUCH + 4, borderRadius: radii.md, backgroundColor: colors.primary, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  newChatText: { ...type.body, fontFamily: fonts.bold, color: colors.onPrimary },
  tip: { ...type.eyebrow, fontSize: 10, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.background },
  empty: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xxl },
  title: { ...type.body, fontFamily: fonts.bold },
  muted: { ...type.small, color: colors.textTertiary, textAlign: 'center' },
  warn: { ...type.small, color: colors.danger },
  section: { ...type.eyebrow, marginTop: spacing.xl, marginBottom: spacing.sm, marginLeft: spacing.xs },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: radii.lg, borderBottomRightRadius: radii.lg },
  rowPressed: { backgroundColor: colors.surfaceHover },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  rowTitle: { ...type.body, fontSize: 15, flex: 1 },
  when: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary },
});
