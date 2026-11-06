import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getBackend } from '../api';
import type { BillingAddress, GstState, Invoice } from '../api/schemas';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import {
  billingErrorMessage,
  billingFormError,
  billingView,
  filterStates,
  freeQuotaLimit,
  invoiceAction,
  invoiceDownloadError,
  showsBillingDetails,
} from '../lib/billing';
import { formatInvoiceDate, formatShortDate } from '../lib/dates';
import { formatInr } from '../lib/money';
import { PLAN_NAME } from '../lib/plans';
import type { ScreenProps } from '../navigation/types';
import {
  useBillingAddress,
  useEntitlements,
  useGstStates,
  useInvoices,
  useSaveBillingAddress,
  useSubscription,
  useSubscriptionChange,
} from '../state/queries';
import { MIN_TOUCH, colors, fonts, radii, spacing, type } from '../theme/tokens';

/**
 * Billing settings, as the web app's Billing page (kwala-intel-fe/src/pages/Billing.tsx):
 * the plan and its status, the amount, the renewal or end date, cancel and
 * resume, the address printed on GST invoices, and the payment history with
 * invoice download and re-send.
 *
 * Cancellation is available here without contacting support: a published
 * commitment, and the honest thing to offer.
 */
export function BillingScreen({ navigation }: ScreenProps<'Billing'>) {
  const insets = useSafeAreaInsets();
  const { status } = useAuth();
  const subQuery = useSubscription();
  const addressQuery = useBillingAddress();
  const invoicesQuery = useInvoices();
  const { data: entitlements } = useEntitlements();
  const change = useSubscriptionChange();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingAddress, setEditingAddress] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  if (status !== 'signedIn') {
    return (
      <View style={styles.center}>
        <Text style={styles.h}>Sign in to see your billing</Text>
        <Button label="Sign in" onPress={() => navigation.navigate('SignIn')} />
      </View>
    );
  }

  if (subQuery.data === undefined) {
    return (
      <View style={styles.center} accessibilityLiveRegion="polite">
        {subQuery.isError ? (
          <>
            <Text style={styles.muted}>{billingErrorMessage(subQuery.error, 'Could not load your subscription.')}</Text>
            <Button label="Try again" variant="secondary" onPress={() => void subQuery.refetch()} />
          </>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>
    );
  }

  const view = billingView(subQuery.data);
  const address = addressQuery.data ?? null;
  const working = change.isPending ? (change.variables ?? null) : null;

  const act = (which: 'cancel' | 'resume') => {
    setActionError(null);
    change.mutate(which, {
      onSuccess: () => setConfirmCancel(false),
      onError: e => setActionError(billingErrorMessage(e, 'That did not go through. Please try again.')),
    });
  };

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([subQuery.refetch(), addressQuery.refetch(), invoicesQuery.refetch()]);
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} colors={[colors.primary]} />}>
      <Text style={styles.intro}>Your plan, renewal date, and cancellation.</Text>

      {actionError ? <Notice text={actionError} /> : null}

      {/* A failed debit keeps access while retries run, so this warns without implying the account is closed. */}
      {view.paymentIssue ? (
        <Notice text="The last payment did not go through. Your access continues while we retry - update your payment method with your bank or UPI app if it keeps failing." />
      ) : null}

      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.flex}>
            <Text style={styles.label}>Current plan</Text>
            <Text style={styles.planName}>{view.paidPlan ? `Kwala Intel ${PLAN_NAME[view.paidPlan]}` : 'Free plan'}</Text>
            {!view.isPaid ? (
              <Text style={styles.small}>{`${freeQuotaLimit(entitlements)} AI research questions a day, resetting at midnight IST.`}</Text>
            ) : null}
          </View>
          {view.isPaid ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{view.cancelling ? 'Ending' : 'Active'}</Text>
            </View>
          ) : null}
        </View>

        {view.isPaid ? (
          <View style={styles.facts}>
            {view.amount ? (
              <Fact
                label="Amount"
                value={formatInr(view.amount.totalMinor)}
                note={`(${formatInr(view.amount.baseMinor)} + ${formatInr(view.amount.taxMinor)} GST)`}
              />
            ) : null}
            <Fact label={view.dateLabel} value={formatShortDate(view.dateIso)} />
            {/* For a customer who switched monthly to annual, access runs past the next charge; both dates are shown. */}
            {view.separateAccessUntil && view.paidPlan ? (
              <Fact label={`${PLAN_NAME[view.paidPlan]} access until`} value={formatShortDate(view.separateAccessUntil)} />
            ) : null}
          </View>
        ) : null}

        <View style={styles.actions}>
          {!view.isPaid ? <Button label="Get Pro" onPress={() => navigation.navigate('Pricing')} /> : null}

          {/* Resume only while it is genuinely possible: the same mandate, no re-authorisation. */}
          {view.isPaid && view.cancelling && view.canResume ? (
            <Button label="Resume subscription" onPress={() => act('resume')} loading={working === 'resume'} disabled={working !== null} />
          ) : null}

          {view.isPaid && view.cancelling && !view.canResume ? (
            <Button label="Subscribe again" onPress={() => navigation.navigate('Pricing')} />
          ) : null}

          {/* Cancel stays a text button: one primary action per screen, and a filled destructive button invites a misclick. */}
          {view.isPaid && !view.cancelling ? (
            confirmCancel ? (
              <View style={styles.confirm}>
                <Text style={styles.small}>{`Cancel and keep access until ${formatShortDate(view.periodEnd)}?`}</Text>
                <View style={styles.confirmRow}>
                  <Pressable
                    onPress={() => act('cancel')}
                    disabled={working !== null}
                    accessibilityRole="button"
                    accessibilityLabel="Yes, cancel"
                    accessibilityState={{ disabled: working !== null, busy: working === 'cancel' }}
                    style={({ pressed }) => [styles.dangerButton, (pressed || working !== null) && { opacity: 0.6 }]}>
                    {working === 'cancel' ? <ActivityIndicator size="small" color={colors.danger} /> : null}
                    <Text style={styles.dangerText}>Yes, cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setConfirmCancel(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Keep it"
                    style={({ pressed }) => [styles.textButton, pressed && { opacity: 0.6 }]}>
                    <Text style={styles.small}>Keep it</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setConfirmCancel(true)}
                accessibilityRole="button"
                accessibilityLabel="Cancel subscription"
                style={({ pressed }) => [styles.textButton, pressed && { opacity: 0.6 }]}>
                <Text style={styles.linkText}>Cancel subscription</Text>
              </Pressable>
            )
          ) : null}
        </View>

        {view.isPaid && !view.cancelling ? (
          <Text style={styles.footnote}>
            Cancelling stops auto-renewal. You keep access to the end of the period you have already paid for - no cancellation charge, no
            lock-in.
          </Text>
        ) : null}
      </View>

      {showsBillingDetails(view.isPaid, address) ? (
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={[styles.label, styles.flex]}>Billing details</Text>
            {address && !editingAddress ? (
              <Pressable onPress={() => setEditingAddress(true)} accessibilityRole="button" accessibilityLabel="Edit billing details" hitSlop={12}>
                <Text style={styles.linkTextSmall}>Edit</Text>
              </Pressable>
            ) : null}
          </View>
          {addressQuery.isPending ? (
            <ActivityIndicator color={colors.primary} />
          ) : address && !editingAddress ? (
            <View style={styles.addressBlock}>
              {address.billing_name ? <Text style={styles.addressName}>{address.billing_name}</Text> : null}
              <Text style={styles.small}>{address.address}</Text>
              <Text style={styles.mono}>{`${address.state_name} (${address.state_code})`}</Text>
            </View>
          ) : (
            <AddressForm initial={address} mode={address ? 'edit' : 'capture'} onSaved={() => setEditingAddress(false)} />
          )}
        </View>
      ) : null}

      <PaymentHistory />
    </ScrollView>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <View style={styles.alert} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Icon name="alert-triangle" size={16} color={colors.danger} />
      <Text style={styles.alertText}>{text}</Text>
    </View>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}${note ? ` ${note}` : ''}`}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>
        {value}
        {note ? <Text style={styles.factNote}> {note}</Text> : null}
      </Text>
    </View>
  );
}

/**
 * The two-field address form plus the state, as the web's BillingAddressForm.
 * The state is chosen from the server's own list, never typed: it sets the
 * place of supply, and so whether the invoice shows CGST and SGST or IGST.
 */
function AddressForm({ initial, mode, onSaved }: { initial: BillingAddress | null; mode: 'capture' | 'edit'; onSaved: () => void }) {
  const statesQuery = useGstStates(true);
  const states = useMemo(() => statesQuery.data ?? [], [statesQuery.data]);
  const save = useSaveBillingAddress();
  const [name, setName] = useState(initial?.billing_name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [stateCode, setStateCode] = useState(initial?.state_code ?? '');
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const stateName = states.find(s => s.code === stateCode)?.name ?? (stateCode && stateCode === initial?.state_code ? initial.state_name : '');
  const shownError = error ?? (statesQuery.isError ? 'Could not load the state list. Refresh and try again.' : null);

  const submit = () => {
    const problem = billingFormError({ name, address, stateCode });
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    save.mutate(
      { address: address.trim(), state_code: stateCode, billing_name: name.trim() },
      {
        onSuccess: () => onSaved(),
        onError: e => setError(billingErrorMessage(e, 'We could not save that. Check your connection and try again.')),
      },
    );
  };

  return (
    <View style={styles.form}>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Name on invoice</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your full name"
          placeholderTextColor={colors.textTertiary}
          maxLength={120}
          autoCapitalize="words"
          autoComplete="name"
          accessibilityLabel="Name on invoice"
          style={styles.input}
          selectionColor={colors.primaryNeon}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Billing address</Text>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="Flat / building, street, area, city, PIN"
          placeholderTextColor={colors.textTertiary}
          maxLength={500}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          accessibilityLabel="Billing address"
          style={[styles.input, styles.inputMulti]}
          selectionColor={colors.primaryNeon}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>State</Text>
        <Pressable
          // A list that failed to load is fetched again from here.
          onPress={() => (states.length === 0 ? void statesQuery.refetch() : setPicking(true))}
          disabled={states.length === 0 && !statesQuery.isError}
          accessibilityRole="button"
          accessibilityLabel={stateName ? `State, ${stateName}` : 'State, search your state'}
          style={[styles.input, styles.select]}>
          <Text style={[styles.selectText, !stateName && { color: colors.textTertiary }]} numberOfLines={1}>
            {stateName || 'Search your state'}
          </Text>
          {statesQuery.isPending ? <ActivityIndicator size="small" color={colors.textTertiary} /> : <View style={styles.chevronDown}><Icon name="chevron" size={16} color={colors.textTertiary} /></View>}
        </Pressable>
      </View>

      {shownError ? (
        <Text style={styles.error} accessibilityRole="alert">
          {shownError}
        </Text>
      ) : null}

      {mode === 'edit' ? <Text style={styles.note}>Changes apply to future invoices. Invoices already issued cannot be changed.</Text> : null}

      <Button
        label={mode === 'capture' ? 'Save and continue' : 'Save changes'}
        onPress={submit}
        loading={save.isPending}
        disabled={save.isPending || states.length === 0}
      />

      <StatePicker
        visible={picking}
        states={states}
        selected={stateCode}
        onPick={s => {
          setStateCode(s.code);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </View>
  );
}

/** The state list in a sheet, filtered as you type by name or code. */
function StatePicker({
  visible,
  states,
  selected,
  onPick,
  onClose,
}: {
  visible: boolean;
  states: GstState[];
  selected: string;
  onPick: (s: GstState) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);
  const matches = useMemo(() => filterStates(states, query), [states, query]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.sheetRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]} accessibilityViewIsModal>
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, styles.flex]}>State</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
              <Icon name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search your state"
            placeholderTextColor={colors.textTertiary}
            autoCorrect={false}
            autoFocus
            accessibilityLabel="Search your state"
            style={styles.input}
            selectionColor={colors.primaryNeon}
          />
          <FlatList
            data={matches}
            keyExtractor={s => s.code}
            keyboardShouldPersistTaps="handled"
            style={styles.stateList}
            ListEmptyComponent={<Text style={[styles.small, styles.emptyStates]}>No matching state</Text>}
            renderItem={({ item }) => {
              const on = item.code === selected;
              return (
                <Pressable
                  onPress={() => onPick(item)}
                  accessibilityRole="button"
                  accessibilityLabel={item.name}
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => [styles.stateRow, (on || pressed) && { backgroundColor: colors.surfaceHover }]}>
                  <Text style={[styles.stateName, on && { color: colors.textPrimary }]}>{item.name}</Text>
                  <Text style={styles.mono}>{item.code}</Text>
                </Pressable>
              );
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Payment history with invoice download, as the web's InvoiceTable. A customer
 * who has never paid gets nothing here, not an empty list.
 */
function PaymentHistory() {
  const query = useInvoices();
  const backend = useMemo(() => getBackend(), []);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => setSent(null), 4000);
    return () => clearTimeout(t);
  }, [sent]);

  const download = async (id: string) => {
    setDownloading(id);
    setError(null);
    let url: string;
    try {
      // Opened at once: the signed URL expires in about a minute.
      url = await backend.getInvoiceDownloadUrl(id);
    } catch (e) {
      setError(invoiceDownloadError(e));
      return;
    } finally {
      setDownloading(null);
    }
    await WebBrowser.openBrowserAsync(url, {
      toolbarColor: colors.background,
      controlsColor: colors.primaryNeon,
      dismissButtonStyle: 'close',
      createTask: false,
      showTitle: true,
    }).catch(() => Linking.openURL(url).catch(() => setError('We could not open that invoice. Try again in a moment.')));
  };

  const resend = async (id: string) => {
    setSending(id);
    setError(null);
    try {
      await backend.emailInvoice(id);
      setSent(id);
    } catch {
      setError('We could not send that invoice. Try again in a moment.');
    } finally {
      setSending(null);
    }
  };

  const rows = query.data;
  if (rows === undefined) {
    return query.isError ? (
      <View style={styles.loadingRow}>
        <Text style={styles.muted}>Could not load your invoices.</Text>
        <Pressable onPress={() => void query.refetch()} accessibilityRole="button" accessibilityLabel="Try again" hitSlop={8}>
          <Text style={styles.linkTextSmall}>Try again</Text>
        </Pressable>
      </View>
    ) : (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={colors.textTertiary} />
        <Text style={styles.muted}>Loading invoices…</Text>
      </View>
    );
  }
  if (rows.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Payment history</Text>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View>
        {rows.map((r, i) => (
          <InvoiceRow
            key={r.id}
            row={r}
            last={i === rows.length - 1}
            downloading={downloading === r.id}
            sending={sending === r.id}
            sent={sent === r.id}
            onDownload={() => void download(r.id)}
            onEmail={() => void resend(r.id)}
          />
        ))}
      </View>
    </View>
  );
}

function InvoiceRow({
  row,
  last,
  downloading,
  sending,
  sent,
  onDownload,
  onEmail,
}: {
  row: Invoice;
  last: boolean;
  downloading: boolean;
  sending: boolean;
  sent: boolean;
  onDownload: () => void;
  onEmail: () => void;
}) {
  const action = invoiceAction(row);
  return (
    <View style={[styles.invoice, !last && styles.invoiceDivider]}>
      <View style={styles.flex}>
        <Text style={styles.invoiceDate}>{formatInvoiceDate(row.invoice_date ?? row.created_at)}</Text>
        {row.line_description ? <Text style={styles.invoiceDesc}>{row.line_description}</Text> : null}
        <Text style={styles.invoiceNumber}>{`Invoice no. ${row.invoice_number ?? '—'}`}</Text>
      </View>
      <View style={styles.invoiceRight}>
        <Text style={styles.invoiceAmount}>{formatInr(row.total_minor)}</Text>
        {action === 'download' ? (
          <View style={styles.invoiceActions}>
            <Pressable
              onPress={onDownload}
              disabled={downloading}
              accessibilityRole="button"
              accessibilityLabel={`Download invoice ${row.invoice_number ?? ''}`.trim()}
              accessibilityState={{ busy: downloading, disabled: downloading }}
              style={({ pressed }) => [styles.smallButton, (pressed || downloading) && { opacity: 0.6 }]}>
              {downloading ? <ActivityIndicator size="small" color={colors.textPrimary} /> : <Icon name="download" size={14} color={colors.textPrimary} />}
              <Text style={styles.smallButtonText}>Download</Text>
            </Pressable>
            <Pressable
              onPress={onEmail}
              disabled={sending}
              accessibilityRole="button"
              accessibilityLabel={sent ? 'Invoice sent' : 'Email this invoice'}
              accessibilityState={{ busy: sending, disabled: sending }}
              style={({ pressed }) => [styles.smallButton, styles.iconButton, (pressed || sending) && { opacity: 0.6 }]}>
              {sending ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : sent ? (
                <Icon name="check" size={14} color={colors.primaryNeon} />
              ) : (
                <Icon name="mail" size={14} color={colors.textSecondary} />
              )}
            </Pressable>
          </View>
        ) : (
          <Text style={styles.invoiceState}>{action === 'preparing' ? 'Preparing…' : 'Contact support'}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.background },
  h: { ...type.body, fontFamily: fonts.bold },
  flex: { flex: 1 },
  intro: { ...type.small, color: colors.textSecondary },
  muted: { ...type.small, color: colors.textTertiary, textAlign: 'center' },
  small: { ...type.small, color: colors.textSecondary },
  mono: { fontFamily: fonts.mono, fontSize: 12, color: colors.textTertiary },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  label: { ...type.eyebrow, fontSize: 10 },
  planName: { ...type.body, fontFamily: fonts.semibold, fontSize: 18, lineHeight: 26, marginTop: 2 },
  badge: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(74,166,100,0.3)',
    backgroundColor: 'rgba(74,166,100,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: colors.primaryNeon },
  facts: { gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.md },
  factLabel: { ...type.small, fontSize: 12, color: colors.textTertiary },
  factValue: { fontFamily: fonts.mono, fontSize: 14, lineHeight: 20, color: colors.textPrimary, marginTop: 2 },
  factNote: { color: colors.textTertiary },
  actions: { gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.md },
  confirm: { gap: spacing.sm },
  confirmRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md },
  dangerButton: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  dangerText: { ...type.small, fontFamily: fonts.semibold, color: colors.danger },
  textButton: { minHeight: MIN_TOUCH, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { ...type.small, fontFamily: fonts.medium, color: colors.textSecondary, textDecorationLine: 'underline' },
  linkTextSmall: { ...type.small, fontSize: 12, fontFamily: fonts.medium, color: colors.textSecondary, textDecorationLine: 'underline' },
  footnote: { ...type.small, fontSize: 12, lineHeight: 18, color: colors.textTertiary },
  alert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
    backgroundColor: colors.dangerBg,
  },
  alertText: { ...type.small, flex: 1, color: colors.danger },
  addressBlock: { gap: 2 },
  addressName: { ...type.small, fontFamily: fonts.medium, color: colors.textPrimary },
  form: { gap: spacing.md },
  field: { gap: 6 },
  fieldLabel: { ...type.small, fontSize: 12, fontFamily: fonts.medium, color: colors.textSecondary },
  input: {
    ...type.body,
    fontSize: 15,
    minHeight: MIN_TOUCH + 4,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
  },
  inputMulti: { minHeight: 92, paddingTop: spacing.md, paddingBottom: spacing.md },
  select: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  selectText: { ...type.body, fontSize: 15, flex: 1 },
  chevronDown: { transform: [{ rotate: '90deg' }] },
  error: { ...type.small, color: colors.danger },
  note: { ...type.small, fontSize: 12, lineHeight: 18, color: colors.textTertiary },
  sheetRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    maxHeight: '80%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center' },
  sheetTitle: { ...type.heading, fontSize: 17 },
  stateList: { flexGrow: 0 },
  stateRow: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
  },
  stateName: { ...type.body, fontSize: 15, color: colors.textSecondary, flex: 1 },
  emptyStates: { padding: spacing.md, color: colors.textTertiary },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs },
  invoice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md },
  invoiceDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  invoiceDate: { ...type.small, color: colors.textSecondary },
  invoiceDesc: { ...type.small, fontSize: 12, lineHeight: 17, color: colors.textTertiary },
  invoiceNumber: { fontFamily: fonts.mono, fontSize: 11, lineHeight: 17, color: colors.textPrimary, marginTop: 2 },
  invoiceRight: { alignItems: 'flex-end', gap: spacing.sm },
  invoiceAmount: { fontFamily: fonts.mono, fontSize: 14, color: colors.textPrimary },
  invoiceActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  invoiceState: { ...type.small, fontSize: 12, color: colors.textTertiary },
  smallButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconButton: { minWidth: 36, justifyContent: 'center', paddingHorizontal: 8 },
  smallButtonText: { ...type.small, fontSize: 12, fontFamily: fonts.medium, color: colors.textPrimary },
});
