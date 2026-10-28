import React, { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Block } from '../api/schemas';
import type { ChatMessage } from '../chat/messages';
import { MIN_TOUCH, colors, radii, spacing, type } from '../theme/tokens';
import { Markdown } from './markdown';

/** Prose from blocks, in order, descending into groups. Charts and widgets are counted, not drawn. */
export function summariseBlocks(blocks: Block[] | undefined): { markdown: string; visuals: number } {
  let visuals = 0;
  const parts: string[] = [];
  const walk = (list: unknown[]) => {
    for (const b of list) {
      if (!b || typeof b !== 'object') continue;
      const block = b as { type?: string; markdown?: unknown; blocks?: unknown };
      if (block.type === 'prose' && typeof block.markdown === 'string') parts.push(block.markdown);
      else if (block.type === 'group' && Array.isArray(block.blocks)) walk(block.blocks);
      else visuals += 1;
    }
  };
  walk(blocks ?? []);
  return { markdown: parts.join('\n\n'), visuals };
}

interface Props {
  message: ChatMessage;
  statusText: string | null;
  onRetry: (assistantId: string) => void;
}

function MessageItemBase({ message, statusText, onRetry }: Props) {
  if (message.role === 'user') {
    return (
      <View style={styles.userRow} accessible accessibilityLabel={`You said: ${message.content}`}>
        <View style={styles.userBubble}>
          <Text style={styles.userText} selectable>
            {message.content}
          </Text>
        </View>
      </View>
    );
  }

  // Blocks, when present, are the whole answer (as in the web app); otherwise the streamed text.
  const fromBlocks = summariseBlocks(message.blocks);
  const markdown = message.blocks?.length ? fromBlocks.markdown : message.content;
  const waiting = message.status === 'streaming' && !markdown;
  const failed = message.status === 'failed';

  return (
    <View style={styles.assistantRow} accessibilityLabel="Kwala answer">
      {waiting ? (
        <View style={styles.waiting} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.status}>{statusText ?? 'Thinking…'}</Text>
        </View>
      ) : failed && !message.content.length ? null : (
        <View style={failed ? styles.failedBody : undefined}>
          <Markdown source={markdown} />
        </View>
      )}
      {message.status === 'streaming' && !waiting && statusText ? <Text style={styles.status}>{statusText}</Text> : null}
      {fromBlocks.visuals > 0 ? (
        <View style={styles.visualNote}>
          <Text style={styles.visualText}>
            This answer includes {fromBlocks.visuals} chart{fromBlocks.visuals === 1 ? '' : 's'} or visual
            {fromBlocks.visuals === 1 ? '' : 's'}. Open the same chat on app.kwalaintel.com to see them.
          </Text>
        </View>
      ) : null}
      {failed ? (
        <View style={styles.failure}>
          <Text style={styles.failureText} accessibilityLiveRegion="polite">
            {message.failure?.message}
          </Text>
          {message.failure?.retryable ? (
            <Pressable
              onPress={() => onRetry(message.id)}
              accessibilityRole="button"
              accessibilityLabel="Retry sending this message"
              style={styles.retry}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export const MessageItem = memo(MessageItemBase);

const styles = StyleSheet.create({
  userRow: { alignItems: 'flex-end', paddingVertical: spacing.xs },
  userBubble: {
    maxWidth: '86%',
    backgroundColor: colors.userBubble,
    borderRadius: radii.lg,
    borderBottomRightRadius: 4,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  userText: { ...type.body, color: colors.onPrimary },
  assistantRow: { paddingVertical: spacing.sm, gap: spacing.sm },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  status: { ...type.eyebrow },
  failedBody: { opacity: 0.85 },
  failure: {
    backgroundColor: colors.dangerBg,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  failureText: { ...type.small, color: colors.danger },
  retry: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  retryText: { ...type.small, color: colors.danger, fontWeight: '600' },
  visualNote: { borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  visualText: { ...type.small, color: colors.textTertiary },
});
