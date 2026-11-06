import React from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components/Icon';
import { SocialIcon } from '../components/SocialIcon';
import {
  ABOUT_TEXT,
  CONTACT,
  IMPORTANT_INFO,
  LEGAL_LINKS,
  SOCIALS,
  TAGLINE,
  legalUrl,
  mailtoHref,
  telHref,
} from '../lib/company';
import type { ScreenProps } from '../navigation/types';
import { MIN_TOUCH, colors, fonts, radii, spacing, type } from '../theme/tokens';

const cantOpen = () => Alert.alert("Couldn't open that link", 'Please try again in a moment.');

/** Mail, phone and social links belong to other apps; a device with none installed just says so. */
const openExternal = (url: string) => void Linking.openURL(url).catch(cantOpen);

/** The policies open in an in-app browser tab, so people stay in the app. */
const openPolicy = (url: string) =>
  void WebBrowser.openBrowserAsync(url, {
    toolbarColor: colors.background,
    controlsColor: colors.primaryNeon,
    dismissButtonStyle: 'close',
    createTask: false,
    showTitle: true,
  }).catch(() => Linking.openURL(url).catch(cantOpen));

/** What the web footer says about the company: About, Contact us, Legal and Follow us. Reached from Profile. */
export function AboutScreen(_props: ScreenProps<'About'>) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      showsVerticalScrollIndicator={false}>
      <Section title="About Kwala Intel">
        <Text style={styles.about}>{ABOUT_TEXT}</Text>
      </Section>

      <Section title="Contact us">
        <View style={styles.card}>
          <Person name={CONTACT.grievance.name} />
          <ContactRow icon="mail" label={CONTACT.grievance.email} hint="Email the grievance officer" onPress={() => openExternal(mailtoHref(CONTACT.grievance.email))} />
          <View style={styles.divider} />
          <Text style={styles.eyebrow}>Support</Text>
          <Person name={CONTACT.support.name} />
          <ContactRow icon="mail" label={CONTACT.support.email} hint="Email support" onPress={() => openExternal(mailtoHref(CONTACT.support.email))} />
          <ContactRow icon="phone" label={CONTACT.support.phone} hint="Call support" onPress={() => openExternal(telHref(CONTACT.support.phone))} />
          <Text style={styles.note}>{CONTACT.note}</Text>
        </View>
      </Section>

      <Section title="Legal">
        <View style={styles.list}>
          {LEGAL_LINKS.map(({ slug, label }, i) => (
            <Pressable
              key={slug}
              onPress={() => openPolicy(legalUrl(slug))}
              accessibilityRole="link"
              accessibilityLabel={label}
              style={({ pressed }) => [styles.legalRow, i > 0 && styles.legalRowDivider, pressed && { backgroundColor: colors.surfaceHover }]}>
              <Text style={styles.legalText}>{label}</Text>
              <Icon name="chevron" size={20} color={colors.textTertiary} />
            </Pressable>
          ))}
        </View>
      </Section>

      <Section title="Follow us">
        <View style={styles.socials}>
          {SOCIALS.map(({ name, label, href }) => (
            <Pressable
              key={name}
              onPress={() => openExternal(href)}
              accessibilityRole="link"
              accessibilityLabel={label}
              hitSlop={4}
              style={({ pressed }) => [styles.social, pressed && { backgroundColor: colors.surfaceHover }]}>
              <SocialIcon name={name} size={22} color={colors.textSecondary} />
            </Pressable>
          ))}
        </View>
      </Section>

      <View style={styles.fine}>
        <Text style={styles.eyebrow}>Important information</Text>
        <Text style={styles.fineText}>{IMPORTANT_INFO}</Text>
        <Text style={styles.copyright}>
          © {new Date().getFullYear()} Kwala Intel · {TAGLINE}
        </Text>
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Person({ name }: { name: string }) {
  return <Text style={styles.person}>{name}</Text>;
}

function ContactRow({ icon, label, hint, onPress }: { icon: IconName; label: string; hint: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.contactRow, pressed && { opacity: 0.7 }]}>
      <Icon name={icon} size={18} color={colors.textTertiary} />
      <Text style={styles.contactText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.xl },
  section: { gap: spacing.md },
  sectionTitle: { fontFamily: fonts.bold, fontSize: 13, letterSpacing: 2.4, textTransform: 'uppercase', color: colors.textPrimary },
  about: { ...type.small, fontSize: 15, lineHeight: 23 },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.xs },
  eyebrow: { ...type.eyebrow },
  person: { ...type.body, fontFamily: fonts.semibold },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.md },
  contactRow: { minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  contactText: { ...type.small, fontSize: 15, color: colors.textPrimary, flexShrink: 1 },
  note: { ...type.small, fontSize: 12, color: colors.textTertiary, marginTop: spacing.xs },
  list: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  legalRow: { minHeight: MIN_TOUCH + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  legalRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  legalText: { ...type.body, fontSize: 15, flexShrink: 1 },
  socials: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  social: { width: MIN_TOUCH + 4, height: MIN_TOUCH + 4, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  fine: { gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.xl },
  fineText: { ...type.small, fontSize: 12, lineHeight: 18, color: colors.textTertiary },
  copyright: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary, marginTop: spacing.sm },
});
