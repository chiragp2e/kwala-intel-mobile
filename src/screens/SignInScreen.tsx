import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { env } from '../config/env';
import { isValidEmail, normalizeIndianMobile } from '../lib/phone';
import type { ScreenProps } from '../navigation/types';
import { MIN_TOUCH, colors, fonts, radii, spacing, type } from '../theme/tokens';

type Method = 'email' | 'phone';
const RESEND_SECONDS = 30;

export function SignInScreen({ navigation }: ScreenProps<'SignIn'>) {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const [method, setMethod] = useState<Method>('email');
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null); // the normalised email / E.164 the code went to
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  // Signed in: leave this screen.
  useEffect(() => {
    if (auth.status === 'signedIn') navigation.popTo('Chat');
  }, [auth.status, navigation]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const target = useCallback((): string | null => {
    if (method === 'email') return isValidEmail(value) ? value.trim().toLowerCase() : null;
    return normalizeIndianMobile(value);
  }, [method, value]);

  const send = useCallback(async () => {
    const to = target();
    if (!to) {
      setError(method === 'email' ? 'Enter a valid email address.' : 'Enter a valid 10-digit mobile number.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = method === 'email' ? await auth.sendEmailCode(to) : await auth.sendPhoneCode(to);
    setBusy(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setSentTo(to);
    setCode('');
    setCooldown(RESEND_SECONDS);
    setTimeout(() => codeRef.current?.focus(), 100);
  }, [auth, method, target]);

  const verify = useCallback(async () => {
    if (!sentTo) return;
    if (code.trim().length < 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = method === 'email' ? await auth.verifyEmailCode(sentTo, code) : await auth.verifyPhoneCode(sentTo, code);
    setBusy(false);
    if (r.error) setError(r.error);
    // On success the auth listener flips status and the effect above navigates away.
  }, [auth, code, method, sentTo]);

  const switchMethod = (m: Method) => {
    setMethod(m);
    setValue('');
    setCode('');
    setSentTo(null);
    setError(null);
  };

  const unavailable = auth.missingConfig.length > 0;

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <View style={styles.head}>
          <Logo width={120} />
          <Text style={styles.title} accessibilityRole="header">
            Welcome to Kwala
          </Text>
          <Text style={styles.sub}>Sign in or create an account. No password needed.</Text>
        </View>

        <View style={styles.card}>
          {unavailable ? (
            <Text style={styles.error} accessibilityRole="alert">
              Sign-in is not available in this build: {auth.missingConfig.join(', ')} not set.
            </Text>
          ) : null}

          <View style={styles.tabs} accessibilityRole="tablist">
            {(['email', 'phone'] as const).map(m => (
              <Pressable
                key={m}
                onPress={() => switchMethod(m)}
                accessibilityRole="tab"
                accessibilityState={{ selected: method === m }}
                style={[styles.tab, method === m && styles.tabOn]}>
                <Text style={[styles.tabText, method === m && { color: colors.textPrimary }]}>
                  {m === 'email' ? 'Email' : 'Mobile'}
                </Text>
              </Pressable>
            ))}
          </View>

          {!sentTo ? (
            <>
              <Text style={styles.label}>{method === 'email' ? 'Email address' : 'Mobile number'}</Text>
              <View style={styles.inputRow}>
                {method === 'phone' ? <Text style={styles.prefix}>+91</Text> : null}
                <TextInput
                  style={styles.input}
                  value={value}
                  onChangeText={t => {
                    setValue(t);
                    setError(null);
                  }}
                  placeholder={method === 'email' ? 'you@example.com' : '98765 43210'}
                  placeholderTextColor={colors.textTertiary}
                  keyboardType={method === 'email' ? 'email-address' : 'phone-pad'}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete={method === 'email' ? 'email' : 'tel'}
                  textContentType={method === 'email' ? 'emailAddress' : 'telephoneNumber'}
                  accessibilityLabel={method === 'email' ? 'Email address' : 'Mobile number'}
                  onSubmitEditing={send}
                  editable={!unavailable}
                />
              </View>
              {error ? (
                <Text style={styles.error} accessibilityRole="alert">
                  {error}
                </Text>
              ) : null}
              <Button label="Send code" onPress={send} loading={busy} disabled={unavailable || !value.trim()} />
            </>
          ) : (
            <>
              <Text style={styles.label}>Enter the 6-digit code sent to {method === 'phone' ? sentTo : sentTo}</Text>
              <TextInput
                ref={codeRef}
                style={[styles.input, styles.codeInput]}
                value={code}
                onChangeText={t => {
                  setCode(t.replace(/\D/g, '').slice(0, 6));
                  setError(null);
                }}
                placeholder="••••••"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                accessibilityLabel="Verification code"
                onSubmitEditing={verify}
              />
              {error ? (
                <Text style={styles.error} accessibilityRole="alert">
                  {error}
                </Text>
              ) : null}
              <Button label="Verify and continue" onPress={verify} loading={busy} disabled={code.length < 6} />
              <View style={styles.links}>
                <Pressable
                  onPress={() => {
                    setSentTo(null);
                    setError(null);
                  }}
                  accessibilityRole="button"
                  style={styles.link}>
                  <Text style={styles.linkText}>Change {method === 'email' ? 'email' : 'number'}</Text>
                </Pressable>
                <Pressable
                  onPress={send}
                  disabled={cooldown > 0 || busy}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: cooldown > 0 || busy }}
                  style={styles.link}>
                  <Text style={[styles.linkText, cooldown > 0 && { color: colors.textTertiary }]}>
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>

        <Text style={styles.terms}>
          By continuing you agree to the{' '}
          <Text style={styles.termsLink} onPress={() => void Linking.openURL('https://kwalaintel.com/legal/terms/')}>
            Terms
          </Text>{' '}
          and{' '}
          <Text style={styles.termsLink} onPress={() => void Linking.openURL('https://kwalaintel.com/legal/privacy/')}>
            Privacy Policy
          </Text>
          .
        </Text>
        {env.appEnv !== 'production' ? <Text style={styles.env}>{env.appEnv.toUpperCase()} BUILD</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xl, gap: spacing.xl },
  back: { minHeight: MIN_TOUCH, justifyContent: 'center', alignSelf: 'flex-start' },
  backText: { ...type.small, color: colors.textSecondary, fontSize: 15 },
  head: { alignItems: 'center', gap: spacing.md },
  title: { ...type.heroSerif, fontSize: 30, textAlign: 'center' },
  sub: { ...type.small, textAlign: 'center', color: colors.textTertiary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
  },
  tabs: { flexDirection: 'row', backgroundColor: colors.background, borderRadius: radii.md, padding: 4 },
  tab: { flex: 1, minHeight: MIN_TOUCH - 4, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.surfaceElevated },
  tabText: { ...type.small, fontWeight: '600', color: colors.textTertiary },
  label: { ...type.small, color: colors.textSecondary },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  prefix: { ...type.body, color: colors.textSecondary, marginRight: spacing.sm },
  input: { flex: 1, ...type.body, minHeight: MIN_TOUCH + 4, color: colors.textPrimary },
  codeInput: {
    flex: 0,
    textAlign: 'center',
    letterSpacing: 8,
    fontFamily: fonts.mono,
    fontSize: 24,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    backgroundColor: colors.background,
  },
  error: { ...type.small, color: colors.danger },
  links: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { minHeight: MIN_TOUCH, justifyContent: 'center' },
  linkText: { ...type.small, color: colors.primaryNeon },
  terms: { ...type.small, textAlign: 'center', color: colors.textTertiary, fontSize: 13 },
  termsLink: { color: colors.textSecondary, textDecorationLine: 'underline' },
  env: { ...type.eyebrow, textAlign: 'center' },
});
