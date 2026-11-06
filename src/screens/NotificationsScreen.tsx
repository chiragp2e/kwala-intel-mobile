import React, { useLayoutEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { relativeTime } from '../lib/identity';
import type { ScreenProps } from '../navigation/types';
import { unreadCount, useInboxChange, useNotifications } from '../state/queries';
import { MIN_TOUCH, colors, fonts, radii, spacing, type } from '../theme/tokens';

/**
 * The bell's inbox: messages the Kwala Intel team sends to this account, newest
 * first (the server keeps the 50 most recent). As on the web, opening it marks
 * nothing; tapping a message marks it read, the cross dismisses it.
 */
export function NotificationsScreen({ navigation }: ScreenProps<'Notifications'>) {
  const insets = useSafeAreaInsets();
  const query = useNotifications();
  const items = query.data ?? null;
  const unread = unreadCount(items ?? undefined);
  const { mutate: change } = useInboxChange();
  const [refreshing, setRefreshing] = useState(false);

  const hasItems = !!items && items.length > 0;
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: hasItems
        ? () => <InboxActions unread={unread} onReadAll={() => change({ kind: 'readAll' })} onClear={() => change({ kind: 'clear' })} />
        : undefined,
    });
  }, [navigation, hasItems, unread, change]);

  if (items === null) {
    return (
      <View style={styles.center}>
        {query.isError ? (
          <>
            <Text style={styles.muted}>Couldn't load your notifications.</Text>
            <Button label="Try again" variant="secondary" onPress={() => void query.refetch()} />
          </>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>
    );
  }

  return (
    <FlatList
      style={styles.root}
      data={items}
      keyExtractor={n => n.id}
      contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.primary}
          colors={[colors.primary]}
          onRefresh={async () => {
            setRefreshing(true);
            await query.refetch();
            setRefreshing(false);
          }}
        />
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Icon name="bell" size={28} color={colors.textTertiary} />
          <Text style={styles.muted}>No notifications yet.</Text>
        </View>
      }
      renderItem={({ item }) => {
        const isUnread = !item.read_at;
        return (
          <View style={styles.row}>
            <Pressable
              onPress={() => isUnread && change({ kind: 'read', id: item.id })}
              accessibilityRole="button"
              accessibilityLabel={`${isUnread ? 'Unread. ' : ''}${item.message}`}
              accessibilityHint={isUnread ? 'Marks it read' : undefined}
              style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.7 }]}>
              <View style={[styles.dot, isUnread && { backgroundColor: colors.primaryNeon }]} />
              <View style={styles.flex}>
                <Text style={[styles.message, !isUnread && styles.messageRead]}>{item.message}</Text>
                <Text style={styles.when}>{relativeTime(item.created_at)}</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => change({ kind: 'dismiss', id: item.id })}
              accessibilityRole="button"
              accessibilityLabel="Dismiss notification"
              hitSlop={4}
              style={styles.dismiss}>
              <Icon name="close" size={16} color={colors.textTertiary} />
            </Pressable>
          </View>
        );
      }}
    />
  );
}

/** "Mark all read" (only with something unread) and "Clear all", in the header. */
function InboxActions({ unread, onReadAll, onClear }: { unread: number; onReadAll: () => void; onClear: () => void }) {
  return (
    <View style={styles.headerActions}>
      {unread > 0 ? (
        <Pressable onPress={onReadAll} accessibilityRole="button" hitSlop={8} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>Mark all read</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={onClear} accessibilityRole="button" hitSlop={8} style={styles.headerBtn}>
        <Text style={[styles.headerBtnText, styles.clear]}>Clear all</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.background, padding: spacing.xl },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingTop: spacing.xxl * 2 },
  muted: { ...type.small, color: colors.textTertiary, textAlign: 'center' },
  headerActions: { flexDirection: 'row', gap: spacing.md },
  headerBtn: { minHeight: MIN_TOUCH, justifyContent: 'center' },
  headerBtnText: { ...type.small, fontFamily: fonts.semibold, color: colors.primaryNeon },
  clear: { color: colors.textTertiary },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowMain: { flex: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.lg, paddingRight: 0 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7, backgroundColor: 'transparent' },
  flex: { flex: 1, gap: 4 },
  message: { ...type.small, fontSize: 15, lineHeight: 21, fontFamily: fonts.semibold, color: colors.textPrimary },
  messageRead: { fontFamily: fonts.regular, color: colors.textTertiary },
  when: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary },
  dismiss: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
});
