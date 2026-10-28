import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getBackend } from '../api';
import type { ChatSession } from '../api/schemas';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import type { ScreenProps } from '../navigation/types';
import { MIN_TOUCH, colors, radii, spacing, type } from '../theme/tokens';

function when(iso: string | null | undefined): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function HistoryScreen({ navigation }: ScreenProps<'History'>) {
  const insets = useSafeAreaInsets();
  const { status } = useAuth();
  const backend = useMemo(() => getBackend(), []);
  const [sessions, setSessions] = useState<ChatSession[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const list = await backend.listSessions();
      // Newest first by last activity, then creation.
      list.sort((a, b) => Date.parse(b.updated_at ?? b.created_at ?? '') - Date.parse(a.updated_at ?? a.created_at ?? '') || 0);
      setSessions(list);
    } catch {
      // Keep any list already shown; a failed refresh is not an empty history.
      setError(true);
    }
  }, [backend]);

  useEffect(() => {
    if (status === 'signedIn') void load();
  }, [load, status]);

  const remove = useCallback(
    (s: ChatSession) => {
      Alert.alert('Delete this chat?', s.title || 'Untitled chat', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await backend.deleteSession(s.id);
              setSessions(prev => prev?.filter(x => x.id !== s.id) ?? prev);
            } catch {
              Alert.alert("Couldn't delete the chat", 'Check your connection and try again.');
            }
          },
        },
      ]);
    },
    [backend],
  );

  const open = (id: string) => {
    navigation.navigate('Chat', { sessionId: id });
  };

  if (status !== 'signedIn') {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.title}>Sign in to see your chats</Text>
        <Button label="Sign in" onPress={() => navigation.navigate('SignIn')} />
      </View>
    );
  }

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
        <FlatList
          data={sessions}
          keyExtractor={s => s.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.primary}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          ListHeaderComponent={
            error ? <Text style={styles.warn}>Couldn't refresh. Showing what we have.</Text> : undefined
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.title}>No chat history yet</Text>
              <Text style={styles.muted}>Start a conversation to see it here.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Pressable
                onPress={() => open(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Open chat ${item.title || 'Untitled chat'}`}
                style={({ pressed }) => [styles.main, pressed && { backgroundColor: colors.surfaceHover }]}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {item.title || 'Untitled chat'}
                </Text>
                <Text style={styles.when}>{when(item.updated_at ?? item.created_at)}</Text>
              </Pressable>
              <Pressable
                onPress={() => remove(item)}
                accessibilityRole="button"
                accessibilityLabel={`Delete chat ${item.title || 'Untitled chat'}`}
                style={styles.del}>
                <Text style={styles.delText}>Delete</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.background },
  title: { ...type.body, fontWeight: '700' },
  muted: { ...type.small, color: colors.textTertiary, textAlign: 'center' },
  warn: { ...type.small, color: colors.danger, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  main: { flex: 1, minHeight: 60, padding: spacing.md, gap: 2, justifyContent: 'center' },
  rowTitle: { ...type.body, fontSize: 15, lineHeight: 21 },
  when: { ...type.eyebrow },
  del: { minWidth: MIN_TOUCH + 16, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: colors.border },
  delText: { ...type.small, color: colors.danger },
});
