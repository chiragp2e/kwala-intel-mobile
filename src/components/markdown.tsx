import React from 'react';
import { Linking, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { colors, fonts, spacing, type } from '../theme/tokens';

/**
 * A deliberately small Markdown renderer for chat answers: headings, bullet and
 * numbered lists, paragraphs, **bold**, *italic*, `code` and [links](url).
 * Tables and images are shown as plain text; rich visual answers are blocks,
 * which version one points at the web app for.
 */

export type Inline = { text: string; bold?: boolean; italic?: boolean; code?: boolean; href?: string };

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*)/g;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of src.matchAll(INLINE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: src.slice(last, i) });
    const tok = m[0];
    if (tok.startsWith('**')) out.push({ text: tok.slice(2, -2), bold: true });
    else if (tok.startsWith('`')) out.push({ text: tok.slice(1, -1), code: true });
    else if (tok.startsWith('[')) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      out.push({ text: mm?.[1] ?? tok, href: mm?.[2] });
    } else out.push({ text: tok.slice(1, -1), italic: true });
    last = i + tok.length;
  }
  if (last < src.length) out.push({ text: src.slice(last) });
  return out;
}

export type MdBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'number'; n: string; text: string }
  | { kind: 'paragraph'; text: string };

export function parseBlocks(src: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: 'paragraph', text: para.join(' ') });
    para = [];
  };
  for (const raw of src.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const b = /^\s*[-*•]\s+(.*)$/.exec(line);
    const n = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) flush();
    else if (h) {
      flush();
      blocks.push({ kind: 'heading', level: (h[1] as string).length, text: h[2] as string });
    } else if (b) {
      flush();
      blocks.push({ kind: 'bullet', text: b[1] as string });
    } else if (n) {
      flush();
      blocks.push({ kind: 'number', n: n[1] as string, text: n[2] as string });
    } else para.push(line.trim());
  }
  flush();
  return blocks;
}

function InlineText({ text, style }: { text: string; style?: TextStyle }) {
  return (
    <Text style={style}>
      {parseInline(text).map((p, i) => (
        <Text
          key={i}
          style={[
            p.bold && styles.bold,
            p.italic && styles.italic,
            p.code && styles.code,
            p.href ? styles.link : null,
          ]}
          onPress={p.href ? () => void Linking.openURL(p.href as string).catch(() => {}) : undefined}
          accessibilityRole={p.href ? 'link' : undefined}>
          {p.text}
        </Text>
      ))}
    </Text>
  );
}

export function Markdown({ source }: { source: string }) {
  const blocks = parseBlocks(source);
  return (
    <View style={styles.root}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'heading':
            return <InlineText key={i} text={b.text} style={b.level <= 2 ? styles.h1 : styles.h2} />;
          case 'bullet':
            return (
              <View key={i} style={styles.row}>
                <Text style={styles.marker}>•</Text>
                <View style={styles.flex}>
                  <InlineText text={b.text} style={styles.body} />
                </View>
              </View>
            );
          case 'number':
            return (
              <View key={i} style={styles.row}>
                <Text style={styles.marker}>{b.n}.</Text>
                <View style={styles.flex}>
                  <InlineText text={b.text} style={styles.body} />
                </View>
              </View>
            );
          default:
            return <InlineText key={i} text={b.text} style={styles.body} />;
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  body: { ...type.body, fontSize: 16, lineHeight: 24 },
  h1: { ...type.body, fontSize: 19, lineHeight: 26, fontWeight: '700', marginTop: spacing.xs },
  h2: { ...type.body, fontWeight: '700', marginTop: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  marker: { ...type.body, color: colors.textTertiary, minWidth: 18 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  code: { fontFamily: fonts.mono, fontSize: 14, backgroundColor: colors.surfaceElevated, color: colors.primaryNeon },
  link: { color: colors.primaryNeon, textDecorationLine: 'underline' },
});
