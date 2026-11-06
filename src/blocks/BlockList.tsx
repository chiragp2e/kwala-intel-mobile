import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../components/Icon';
import { Markdown } from '../components/markdown';
import { colors, fonts, radii, spacing } from '../theme/tokens';
import { ChartView } from './charts/ChartView';
import { BlockHostContext, useBlockHost } from './host';
import { describeBlock, researchPrompt } from './lib/describe';
import type { Block, GroupBlock } from './types';
import { WidgetView } from './widgets';

/** Small widgets that sit two to a row on a phone; everything else takes the full width. */
const HALF = new Set(['stat', 'sparkline', 'position']);
/** Widgets that flow inline instead of being a card. */
const INLINE = new Set(['pill', 'chip', 'actions']);

const isHalf = (b: Block) => b.type === 'widget' && HALF.has(b.widget.kind);
const isInline = (b: Block) => b.type === 'widget' && INLINE.has(b.widget.kind);

function Group({ block }: { block: GroupBlock }) {
  const kids = block.blocks;
  // Side-by-side layouts collapse to a stack on a phone, except runs of small
  // tiles, which sit two to a row so a dashboard stays compact.
  const tiles = block.layout !== 'split' && kids.filter(isHalf).length > 1;
  const inline = kids.every(isInline);
  return (
    <View style={{ gap: 8 }}>
      {block.title ? <Text style={s.groupTitle}>{block.title.toUpperCase()}</Text> : null}
      <View style={[s.groupBody, (tiles || inline) && s.wrap, inline && { alignItems: 'center' }]}>
        {kids.map((child, i) => (
          <View key={i} style={tiles && isHalf(child) ? s.half : inline ? undefined : s.full}>
            <One block={child} />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Whether a block is a research subject, as on the web (BlockList's isSubject). Groups are not: their
 * children each carry their own button. Inline pills, chips and actions are not either.
 */
function isSubject(block: Block): boolean {
  if (block.type === 'group' || isInline(block)) return false;
  return describeBlock(block) !== null;
}

/**
 * The web's corner button on every block that is a subject in its own right (ResearchButton.tsx): it sends
 * the block back as the reader's next message, "Research this further — …". Always shown, as on the web's
 * touch layout, which has no hover to reveal it.
 */
function ResearchButton({ block }: { block: Block }) {
  const { onPrompt } = useBlockHost();
  const prompt = onPrompt ? researchPrompt(block) : null;
  if (!prompt) return null;
  return (
    <Pressable
      onPress={() => onPrompt?.(prompt)}
      accessibilityRole="button"
      accessibilityLabel="Research this further"
      hitSlop={8}
      style={({ pressed }) => [s.research, pressed && s.researchPressed]}>
      {({ pressed }) => <Icon name="microscope" size={14} color={pressed ? colors.primaryNeon : colors.textTertiary} />}
    </Pressable>
  );
}

/** A block, plus its research button in the bottom right corner when it is a subject. */
function One({ block }: { block: Block }) {
  const body = <Body block={block} />;
  if (!isSubject(block)) return body;
  // Prose has no card padding for the button to sit in, so it keeps a gutter on the right instead.
  return (
    <View style={block.type === 'prose' ? s.proseGutter : undefined}>
      {body}
      <ResearchButton block={block} />
    </View>
  );
}

function Body({ block }: { block: Block }) {
  switch (block.type) {
    case 'prose':
      return <Markdown source={block.markdown} />;
    case 'chart':
      return <ChartView spec={block.spec} />;
    case 'widget':
      return <WidgetView widget={block.widget} />;
    case 'group':
      return <Group block={block} />;
  }
}

/** An answer as an ordered list of prose, charts and widgets. */
export function BlockList({ blocks, onPrompt }: { blocks: Block[]; onPrompt?: (text: string) => void }) {
  if (!blocks.length) return null;
  return (
    <BlockHostContext.Provider value={{ onPrompt }}>
      <View style={s.list}>
        {blocks.map((b, i) => (
          <One key={i} block={b} />
        ))}
      </View>
    </BlockHostContext.Provider>
  );
}

const s = StyleSheet.create({
  list: { gap: spacing.md },
  groupTitle: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.6, color: colors.textTertiary },
  groupBody: { gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  half: { width: '48.5%' },
  full: { width: '100%' },
  proseGutter: { paddingRight: 34 },
  research: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  researchPressed: { borderColor: colors.primaryNeon },
});
