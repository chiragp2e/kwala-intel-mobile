import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, fonts, radii, spacing, type } from '../theme/tokens';
import { Icon } from './Icon';
import { FadeIn, PressScale } from './motion';

const icon = require('../../assets/kwala-icon-white.png');

// The starter prompts shown in the reference screenshot.
export const SUGGESTIONS = [
  "What's trending right now",
  "Summarise today's biggest movers",
  'Which assets have momentum',
  'Brief me on my portfolio',
  'What changed in the last 24 hours',
] as const;

export function EmptyChat({ onPick, disabled }: { onPick: (q: string) => void; disabled?: boolean }) {
  // Short screens (or a guest banner on top) get a tighter layout so all five prompts fit.
  const compact = useWindowDimensions().height < 820;
  return (
    <ScrollView
      contentContainerStyle={[styles.wrap, compact && styles.wrapCompact]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag">
      <FadeIn style={[styles.head, compact && { gap: spacing.md }]}>
        <View style={[styles.badge, compact && styles.badgeCompact]}>
          {compact ? null : <View style={styles.glow} pointerEvents="none" />}
          <Image source={icon} style={styles.icon} accessibilityIgnoresInvertColors accessibilityLabel="Kwala" />
        </View>
        {/* Two texts in a wrapping row, not a nested span: Android mis-measures a nested
            span in another font when the line wraps, and clipped "today?". */}
        <View style={styles.titleRow} accessible accessibilityRole="header" accessibilityLabel="What are we tracking today?">
          <Text style={[styles.title, compact && styles.titleCompact]}>What are we tracking </Text>
          <Text style={[styles.title, styles.accent, compact && styles.titleCompact]}>today?</Text>
        </View>
        <Text style={[styles.sub, compact && { fontSize: 13, lineHeight: 18 }]}>
          Your research partner — live market signals, real analysis, your watchlist and portfolio briefed in seconds. Ask
          anything.
        </Text>
      </FadeIn>
      <View style={styles.list}>
        {SUGGESTIONS.map((q, i) => (
          <FadeIn key={q} delay={160 + i * 70}>
            <PressScale
              disabled={disabled}
              onPress={() => onPick(q)}
              accessibilityRole="button"
              accessibilityLabel={q}
              style={[styles.row, compact && { minHeight: 46 }, disabled && { opacity: 0.5 }]}>
              <Text style={styles.num}>{String(i + 1).padStart(2, '0')}</Text>
              <Text style={styles.q}>{q}</Text>
              <Icon name="chevron" size={16} color={colors.textTertiary} />
            </PressScale>
          </FadeIn>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.lg },
  wrapCompact: { padding: spacing.lg, gap: spacing.md },
  badgeCompact: { width: 56, height: 56, borderRadius: 18 },
  titleCompact: { fontSize: 26, lineHeight: 31 },
  head: { alignItems: 'center', gap: spacing.lg },
  badge: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  glow: { position: 'absolute', width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(0,255,136,0.035)' },
  icon: { width: 52, height: 36, resizeMode: 'contain' },
  // The web's `.intel-headline is-short`: Newsreader, with the last words in italic secondary.
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  title: { ...type.headline, textAlign: 'center' },
  accent: { fontFamily: fonts.serifItalic, color: colors.textSecondary },
  sub: { ...type.small, textAlign: 'center', maxWidth: 360, color: colors.textTertiary },
  list: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  num: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary, letterSpacing: 1 },
  q: { ...type.small, flex: 1, color: colors.textPrimary, fontSize: 15 },
});
