import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MIN_TOUCH, colors, fonts, radii, spacing, type } from '../theme/tokens';
import { Icon } from './Icon';

interface Props {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The web app's ConfirmDialog (kwala-intel-fe/src/components/ConfirmDialog.tsx):
 * a warning tile, title and body, then Cancel and a destructive confirm. It is
 * a bottom sheet, as the web shows it on phones. Destructive is amber, never
 * red: red is kept for price-down (BRAND_GUIDELINES.md).
 */
export function ConfirmDialog({ visible, title, body, confirmLabel, onConfirm, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Cancel" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} accessibilityRole="alert" accessibilityViewIsModal>
          <View style={styles.head}>
            <View style={styles.tile}>
              <Icon name="alert-triangle" size={18} color={colors.danger} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.body}>{body}</Text>
            </View>
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              style={({ pressed }) => [styles.button, styles.cancel, pressed && { backgroundColor: colors.surfaceHover }]}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              style={({ pressed }) => [styles.button, styles.confirm, pressed && { opacity: 0.85 }]}>
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    gap: spacing.xl,
  },
  head: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  tile: { width: 36, height: 36, borderRadius: radii.md, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 4 },
  title: { ...type.body, fontFamily: fonts.bold },
  body: { ...type.small, color: colors.textSecondary },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  button: { minHeight: MIN_TOUCH, paddingHorizontal: spacing.xl, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  cancel: { borderWidth: 1, borderColor: colors.border },
  cancelText: { ...type.small, fontFamily: fonts.semibold, color: colors.textPrimary },
  confirm: { backgroundColor: colors.danger },
  // Dark text: white on amber is too faint to read.
  confirmText: { ...type.small, fontFamily: fonts.semibold, color: colors.background },
});
