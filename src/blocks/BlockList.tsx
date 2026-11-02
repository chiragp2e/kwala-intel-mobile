import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Markdown } from '../components/markdown';
import { colors, fonts, spacing } from '../theme/tokens';
import { ChartView } from './charts/ChartView';
import { BlockHostContext } from './host';
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

function One({ block }: { block: Block }) {
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
});
