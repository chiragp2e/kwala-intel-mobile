import * as Clipboard from 'expo-clipboard';
import React, { memo, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Block } from '../api/schemas';
import { stripFollowups, type ActivityItem } from '../chat/activity';
import type { ChatMessage } from '../chat/messages';
import { MIN_TOUCH, colors, radii, spacing, type, fonts } from '../theme/tokens';
import { BlockList } from '../blocks/BlockList';
import { normalizeBlocks } from '../blocks/lib/normalize';
import type { Block as RichBlock } from '../blocks/types';
import { ActivityFeed } from './ActivityFeed';
import { Gradient } from './Gradient';
import { Icon } from './Icon';
import { Markdown } from './markdown';
import { FadeIn, TypingDots } from './motion';
import { env } from '../config/env';

const mark = require('../../assets/kwala-icon-white.png');

/** The web user bubble's gradient, from `--color-primary` to `--color-primary-hover`. */
const USER_GRADIENT = [colors.webPrimary, colors.webPrimaryHover] as const;

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

/** What Copy puts on the clipboard: the answer's text as markdown, without the follow-up block. */
export function copyText(message: Pick<ChatMessage, 'content' | 'blocks'>): string {
  const fromBlocks = message.blocks?.length ? summariseBlocks(message.blocks).markdown : '';
  return stripFollowups(fromBlocks.trim() ? fromBlocks : message.content).trim();
}

/** The web's copy button under an answer: copy icon, then a tick for two seconds. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <Pressable
      onPress={() => {
        void Clipboard.setStringAsync(text)
          .then(() => setCopied(true))
          .catch(() => {});
      }}
      accessibilityRole="button"
      accessibilityLabel={copied ? 'Copied' : 'Copy message'}
      hitSlop={8}
      style={({ pressed }) => [styles.copy, pressed && { backgroundColor: colors.surfaceHover }]}>
      <Icon name={copied ? 'check' : 'copy'} size={15} color={copied ? colors.primaryNeon : colors.textTertiary} />
    </Pressable>
  );
}

interface Props {
  message: ChatMessage;
  statusText: string | null;
  onRetry: (assistantId: string) => void;
  /** A follow-up chip in an answer was tapped: send it as the next message. */
  onPrompt?: (text: string) => void;
  /** The agent's work on this turn; given to the latest answer only. */
  activity?: ActivityItem[];
  thinking?: string;
  /** The stream dropped while the app was away and the finished answer is being fetched. */
  reconnecting?: boolean;
}

function MessageItemBase({ message, statusText, onRetry, onPrompt, activity, thinking, reconnecting }: Props) {
  if (message.role === 'user') {
    return (
      <FadeIn rise={8} duration={220} style={styles.userRow}>
        <View style={styles.userBubble} accessible accessibilityLabel={`You said: ${message.content}`}>
          <Gradient colors={USER_GRADIENT} radius={radii.lg} steps={6} />
          <Text style={styles.userText} selectable>
            {message.content}
          </Text>
        </View>
      </FadeIn>
    );
  }

  // Blocks, when present, are the whole answer (as in the web app); otherwise the streamed text.
  const rich: RichBlock[] = message.blocks?.length ? normalizeBlocks({ blocks: message.blocks as unknown as RichBlock[] }) : [];
  const fromBlocks = summariseBlocks(message.blocks);
  const markdown = stripFollowups(rich.length ? '' : message.blocks?.length ? fromBlocks.markdown : message.content);
  const waiting = message.status === 'streaming' && !markdown && !rich.length;
  const failed = message.status === 'failed';
  const steps = activity ?? [];
  const copyable = message.status === 'sent' ? copyText(message) : '';
  // As on the web: the status line shows in the bubble only until the activity feed has rows.
  const bubbleStatus = reconnecting ? 'Reconnecting…' : steps.length ? null : statusText;

  return (
    <View style={styles.assistant} accessibilityLabel="Kwala answer">
      {steps.length || thinking?.trim() ? <ActivityFeed items={steps} thinking={thinking ?? ''} collapsed={!waiting} /> : null}
      <View style={styles.assistantRow}>
        <Image source={mark} style={styles.mark} accessibilityIgnoresInvertColors accessibilityElementsHidden importantForAccessibility="no" />
        <View style={styles.assistantBody}>
          {waiting ? (
            <View style={styles.typing} accessibilityLiveRegion="polite" accessibilityLabel={bubbleStatus ?? 'Thinking'}>
              <TypingDots />
              {bubbleStatus ? <Text style={styles.typingStatus}>{bubbleStatus}</Text> : null}
            </View>
          ) : failed && !message.content.length ? null : (
            <View style={failed ? styles.failedBody : undefined}>
              {rich.length ? <BlockList blocks={rich} onPrompt={onPrompt} /> : <Markdown source={markdown} />}
            </View>
          )}
          {!waiting && reconnecting ? <Text style={styles.status}>Reconnecting…</Text> : null}
          {!rich.length && fromBlocks.visuals > 0 ? (
            <View style={styles.visualNote}>
              <Text style={styles.visualText}>
                This answer includes {fromBlocks.visuals} chart{fromBlocks.visuals === 1 ? '' : 's'} or visual
                {fromBlocks.visuals === 1 ? '' : 's'}. Open the same chat on {env.webBaseUrl.replace(/^https?:\/\//, '')} to see them.
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
          {copyable ? <CopyButton text={copyable} /> : null}
        </View>
      </View>
    </View>
  );
}

export const MessageItem = memo(MessageItemBase);

const styles = StyleSheet.create({
  userRow: { alignItems: 'flex-end', paddingVertical: spacing.xs },
  userBubble: {
    maxWidth: '82%',
    borderRadius: radii.lg,
    borderBottomRightRadius: 6,
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  userText: { ...type.body, fontSize: 15.2, lineHeight: 24.7, color: colors.onPrimary },
  assistant: { paddingVertical: spacing.sm, gap: spacing.sm },
  // The web's answer row: the bare Kwala mark in a gutter, 10px from the text, nudged down 4px.
  assistantRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  mark: { width: 29, height: 20, marginTop: 4, resizeMode: 'contain' },
  assistantBody: { flex: 1, minWidth: 0, gap: spacing.sm },
  // The web's TypingIndicator bubble: surface-secondary, 16px corners with a 6px tail at the bottom left.
  typing: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.lg,
    borderBottomLeftRadius: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  typingStatus: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.textTertiary, marginLeft: 4, flexShrink: 1 },
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
  retryText: { ...type.small, color: colors.danger, fontFamily: fonts.semibold },
  visualNote: { borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  visualText: { ...type.small, color: colors.textTertiary },
  copy: { alignSelf: 'flex-start', width: 30, height: 30, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
});
