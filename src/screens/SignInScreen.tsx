import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isAppleSignInAvailable } from '../auth/apple';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { GOOGLE_PNG } from '../components/iconImages';
import { Logo } from '../components/Logo';
import { OtpInput } from '../components/OtpInput';
import { env } from '../config/env';
import { isValidEmail, normalizeIndianMobile } from '../lib/phone';
import type { ScreenProps } from '../navigation/types';
import { MIN_TOUCH, colors, fonts, radii, spacing, type } from '../theme/tokens';

type Method = 'email' | 'phone';
type Mode = 'login' | 'signup';
const RESEND_SECONDS = 30;

export function SignInScreen({ navigation, route }: ScreenProps<'SignIn'>) {
  const prompt = route.params?.prompt?.trim() || undefined;
  const insets = useSafeAreaInsets();
  // On iOS this screen is a modal sheet that already starts below the status bar, yet the hook still
  // reports the device's full top inset, so using it would leave a ~60pt gap. Android shows it full-screen.
  const topInset = Platform.OS === 'ios' ? 0 : insets.top;
  const auth = useAuth();
  // Log in and create-account are the same passwordless flow (a code to a phone or email, an account made
  // on first use); the mode only changes the wording, so a newcomer knows they are in the right place.
  const [mode, setMode] = useState<Mode>('login');
  const [method, setMethod] = useState<Method>('phone');
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null); // the normalised email / E.164 the code went to
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const codeRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  // Apple devices only: always false on Android, and on iOS versions without Sign in with Apple.
  useEffect(() => {
    let alive = true;
    void isAppleSignInAvailable().then(v => alive && setAppleAvailable(v));
    return () => {
      alive = false;
    };
  }, []);

  // Signed in: leave this screen.
  useEffect(() => {
    // Back to the chat, carrying the question that brought them here so it is answered at once.
    // With no question pending, return to wherever they came from (e.g. Pricing).
    if (auth.status !== 'signedIn') return;
    if (prompt) navigation.popTo('Chat', { send: prompt });
    else if (navigation.canGoBack()) navigation.goBack();
    else navigation.popTo('Chat');
  }, [auth.status, navigation, prompt]);

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

  const verify = useCallback(async (entered: string = code) => {
    if (!sentTo || busy) return;
    if (entered.trim().length < 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = method === 'email' ? await auth.verifyEmailCode(sentTo, entered) : await auth.verifyPhoneCode(sentTo, entered);
    setBusy(false);
    if (r.error) setError(r.error);
    // On success the auth listener flips status and the effect above navigates away.
  }, [auth, busy, code, method, sentTo]);

  const google = useCallback(async () => {
    setGoogleBusy(true);
    setError(null);
    const r = await auth.signInWithGoogle();
    setGoogleBusy(false);
    if (r.error) setError(r.error);
    // On success the auth listener flips status and the effect above navigates away.
  }, [auth]);

  const apple = useCallback(async () => {
    if (appleBusy) return;
    setAppleBusy(true);
    setError(null);
    const r = await auth.signInWithApple();
    setAppleBusy(false);
    if (r.error) setError(r.error);
    // On success the auth listener flips status and the effect above navigates away.
  }, [auth, appleBusy]);

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
        contentContainerStyle={[styles.scroll, { paddingTop: topInset + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <View style={styles.head}>
          <Logo width={120} />
          <Text style={styles.title} accessibilityRole="header">
            {prompt ? 'One step to your answer' : mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </Text>
          <Text style={styles.sub}>
            {prompt
              ? "Sign in free and we'll answer it right away. No password needed."
              : mode === 'signup'
                ? 'Free forever, no card needed. No password to remember.'
                : 'Log in to pick up where you left off. No password needed.'}
          </Text>
          {prompt ? (
            <View style={styles.promptCard} accessibilityLabel={`Your question: ${prompt}`}>
              <Text style={styles.promptLabel}>YOUR QUESTION</Text>
              <Text style={styles.promptText} numberOfLines={3}>
                {prompt}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          {unavailable ? (
            <Text style={styles.error} accessibilityRole="alert">
              Sign-in is not available in this build: {auth.missingConfig.join(', ')} not set.
            </Text>
          ) : null}

          {appleAvailable ? (
            // Apple's own button, as App Review requires. It cannot show a spinner, so it dims while busy.
            <View
              pointerEvents={unavailable || appleBusy ? 'none' : 'auto'}
              style={(unavailable || appleBusy) && styles.dimmed}>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={radii.md}
                style={styles.apple}
                onPress={apple}
              />
            </View>
          ) : null}
          <Pressable
            onPress={google}
            disabled={unavailable || googleBusy}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            accessibilityState={{ disabled: unavailable || googleBusy, busy: googleBusy }}
            style={({ pressed }) => [styles.google, (unavailable || googleBusy) && { opacity: 0.6 }, pressed && { opacity: 0.85 }]}>
            {googleBusy ? (
              <ActivityIndicator color="#1f1f1f" />
            ) : (
              <>
                <Image source={GOOGLE_PNG} style={styles.googleG} accessibilityIgnoresInvertColors />
                <Text style={styles.googleText}>Continue with Google</Text>
              </>
            )}
          </Pressable>
          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.or}>OR</Text>
            <View style={styles.line} />
          </View>

          <View style={styles.tabs} accessibilityRole="tablist">
            {(['phone', 'email'] as const).map(m => (
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
                  autoFocus={!unavailable}
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
              <OtpInput
                inputRef={codeRef}
                value={code}
                invalid={!!error}
                editable={!busy}
                onChangeText={digits => {
                  setCode(digits);
                  setError(null);
                  // No extra tap: the sixth digit (typed, pasted or autofilled) signs them in.
                  if (digits.length === 6) void verify(digits);
                }}
              />
              {error ? (
                <Text style={styles.error} accessibilityRole="alert">
                  {error}
                </Text>
              ) : null}
              <Button label="Verify and continue" onPress={() => void verify()} loading={busy} disabled={code.length < 6} />
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

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>{mode === 'signup' ? 'Already have an account?' : 'New to Kwala?'}</Text>
          <Pressable
            onPress={() => setMode(m => (m === 'signup' ? 'login' : 'signup'))}
            accessibilityRole="button"
            hitSlop={8}
            style={styles.switchLink}>
            <Text style={styles.switchLinkText}>{mode === 'signup' ? 'Log in' : 'Create an account'}</Text>
          </Pressable>
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
  promptCard: {
    alignSelf: 'stretch',
    marginTop: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#2c6b3f',
    backgroundColor: 'rgba(74,166,100,0.08)',
    gap: 4,
  },
  promptLabel: { ...type.eyebrow, color: colors.primary, fontSize: 10 },
  promptText: { ...type.body, fontFamily: fonts.medium },
  title: { ...type.hero, fontSize: 30, textAlign: 'center' },
  sub: { ...type.small, textAlign: 'center', color: colors.textTertiary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
  },
  apple: { height: MIN_TOUCH + 4 },
  dimmed: { opacity: 0.6 },
  google: {
    minHeight: MIN_TOUCH + 4,
    borderRadius: radii.md,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  googleG: { width: 20, height: 20 },
  googleText: { ...type.body, fontFamily: fonts.semibold, color: '#1f1f1f' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  or: { ...type.eyebrow },
  tabs: { flexDirection: 'row', backgroundColor: colors.background, borderRadius: radii.md, padding: 4 },
  tab: { flex: 1, minHeight: MIN_TOUCH - 4, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.surfaceElevated },
  tabText: { ...type.small, fontFamily: fonts.semibold, color: colors.textTertiary },
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
  error: { ...type.small, color: colors.danger },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  switchText: { ...type.small, color: colors.textTertiary },
  switchLink: { minHeight: MIN_TOUCH, justifyContent: 'center' },
  switchLinkText: { ...type.small, fontFamily: fonts.semibold, color: colors.primaryNeon },
  links: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { minHeight: MIN_TOUCH, justifyContent: 'center' },
  linkText: { ...type.small, color: colors.primaryNeon },
  terms: { ...type.small, textAlign: 'center', color: colors.textTertiary, fontSize: 13 },
  termsLink: { color: colors.textSecondary, textDecorationLine: 'underline' },
  env: { ...type.eyebrow, textAlign: 'center' },
});
