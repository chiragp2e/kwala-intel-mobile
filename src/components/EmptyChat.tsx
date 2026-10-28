import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii, spacing, type } from '../theme/tokens';

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
  return (
    <ScrollView
      contentContainerStyle={styles.wrap}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag">
      <Image source={icon} style={styles.icon} accessibilityIgnoresInvertColors accessibilityLabel="Kwala" />
      <Text style={styles.title} accessibilityRole="header">
        What are we tracking <Text style={styles.italic}>today?</Text>
      </Text>
      <Text style={styles.sub}>
        Your research partner — live market signals, real analysis, your watchlist and portfolio briefed in seconds. Ask
        anything.
      </Text>
      <View style={styles.list}>
        {SUGGESTIONS.map((q, i) => (
          <Pressable
            key={q}
            disabled={disabled}
            onPress={() => onPick(q)}
            accessibilityRole="button"
            accessibilityLabel={q}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceHover }]}>
            <Text style={styles.num}>{String(i + 1).padStart(2, '0')}</Text>
            <Text style={styles.q}>{q}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.lg },
  icon: { width: 52, height: 36, resizeMode: 'contain' },
  title: { ...type.heroSerif, textAlign: 'center' },
  italic: { fontStyle: 'italic' },
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
    backgroundColor: colors.background,
  },
  num: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary, letterSpacing: 1 },
  q: { ...type.small, flex: 1, color: colors.textPrimary, fontSize: 15 },
});
