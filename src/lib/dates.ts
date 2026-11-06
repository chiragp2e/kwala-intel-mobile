/**
 * Calendar dates as the web app's billing screens write them, in the device's
 * own time zone. Written by hand, like formatInr, so every device prints the
 * same thing whatever its Intl support.
 */

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `6 Nov 2026`: the billing page's renewal and access dates. `-` when there is none. */
export function formatShortDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? `${d.getDate()} ${SHORT[d.getMonth()]} ${d.getFullYear()}` : '-';
}

/** `06 Nov 2026`: a payment-history row. Never a numeric date, which reads differently by country. `—` when there is none. */
export function formatInvoiceDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? `${String(d.getDate()).padStart(2, '0')} ${SHORT[d.getMonth()]} ${d.getFullYear()}` : '—';
}

/** `10 September 2027`: the date an upgrade offer promises. */
export function formatLongDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? `${d.getDate()} ${LONG[d.getMonth()]} ${d.getFullYear()}` : '-';
}
