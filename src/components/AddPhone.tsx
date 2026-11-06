import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { syncContact } from '../api/account';
import { useAuth } from '../auth/AuthContext';
import { normalizeIndianMobile } from '../lib/phone';
import { MIN_TOUCH, colors, spacing, type } from '../theme/tokens';
import { Button } from './Button';
import { OtpInput } from './OtpInput';

const RESEND_SECONDS = 30;

interface Props {
  /** The unverified number already on the account, if any: the field starts from it. */
  current: string | null;
  /** The number is verified and stored. */
  onDone: () => void;
  onCancel: () => void;
}

/**
 * Adding (or verifying) the account's mobile number, from Profile, as the web's PhoneVerifyFlow does: the
 * number, then the 6-digit code texted to it. Nothing here stores a number. Supabase does once the code
 * checks out, and the refreshed session brings it back to the screen as Verified.
 */
export function AddPhone({ current, onDone, onCancel }: Props) {
  const { startPhoneChange, confirmPhoneChange } = useAuth();
  const [value, setValue] = useState(current ? current.replace(/^\+?91/, '') : '');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const numberRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  // They asked to add a number, so the field gets the keyboard.
  useEffect(() => {
    const t = setTimeout(() => numberRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, []);

  const send = async (to: string | null = normalizeIndianMobile(value)) => {
    if (!to) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await startPhoneChange(to);
    setBusy(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setSentTo(to);
    setCode('');
    setCooldown(RESEND_SECONDS);
    setTimeout(() => codeRef.current?.focus(), 100);
  };

  const verify = async (entered: string = code) => {
    if (!sentTo || entered.length < 6 || busy) return;
    setBusy(true);
    setError(null);
    const r = await confirmPhoneChange(sentTo, entered);
    if (r.error) {
      setBusy(false);
      setCode('');
      setError(r.error);
      return;
    }
    setFinishing(true);
    // Best effort, as on the web: the number is already verified and stored; this only lets the server
    // notice sooner, so a failure is not worth an error over a success.
    await syncContact().catch(() => {});
    onDone();
  };

  if (!sentTo) {
    return (
      <View style={styles.wrap}>
        <View style={styles.inputRow}>
          <Text style={styles.prefix}>+91</Text>
          <TextInput
            ref={numberRef}
            style={styles.input}
            value={value}
            onChangeText={t => {
              setValue(t);
              setError(null);
            }}
            placeholder="98765 43210"
            placeholderTextColor={colors.textTertiary}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            accessibilityLabel="Mobile number"
            onSubmitEditing={() => void send()}
            editable={!busy}
            selectionColor={colors.primaryNeon}
          />
        </View>
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <View style={styles.buttons}>
          <Button label="Cancel" variant="secondary" onPress={onCancel} disabled={busy} style={styles.flex} />
          <Button label={current ? 'Verify number' : 'Add & send code'} onPress={() => void send()} loading={busy} disabled={!value.trim()} style={styles.flex} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.note}>Enter the 6-digit code sent to {sentTo}</Text>
      <OtpInput
        inputRef={codeRef}
        value={code}
        invalid={!!error}
        editable={!busy}
        onChangeText={digits => {
          setCode(digits);
          setError(null);
          // The sixth digit (typed, pasted or autofilled) verifies, as on the sign-in screen.
          if (digits.length === 6) void verify(digits);
        }}
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {finishing ? (
        <Text style={styles.note} accessibilityLiveRegion="polite">
          Number verified — saving…
        </Text>
      ) : null}
      <Button label="Verify" onPress={() => void verify()} loading={busy} disabled={code.length < 6} />
      <View style={styles.links}>
        <Pressable
          onPress={() => {
            setSentTo(null);
            setError(null);
          }}
          disabled={busy}
          accessibilityRole="button"
          style={styles.link}>
          <Text style={styles.linkText}>Change number</Text>
        </Pressable>
        <Pressable
          onPress={() => void send(sentTo)}
          disabled={cooldown > 0 || busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: cooldown > 0 || busy }}
          style={styles.link}>
          <Text style={[styles.linkText, cooldown > 0 && styles.linkWaiting]}>{cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  flex: { flex: 1 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH + 4,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
  },
  prefix: { ...type.body, color: colors.textSecondary, marginRight: spacing.sm },
  input: { flex: 1, ...type.body, minHeight: MIN_TOUCH + 4, color: colors.textPrimary },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  note: { ...type.small, color: colors.textSecondary },
  error: { ...type.small, color: colors.danger },
  links: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { minHeight: MIN_TOUCH, justifyContent: 'center' },
  linkText: { ...type.small, color: colors.primaryNeon },
  linkWaiting: { color: colors.textTertiary },
});
