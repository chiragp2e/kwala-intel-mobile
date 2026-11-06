/**
 * How an account is named on screen, as the web app does it
 * (kwala-intel-fe/src/lib/identity.ts and pages/Profile.tsx).
 */

/** Phone-only accounts carry this stand-in address; it is never shown as theirs. */
export const PLACEHOLDER_EMAIL = 'example@kwala.network';

export function realEmail(email: string | null | undefined): string | null {
  const e = email?.trim();
  return e && e.toLowerCase() !== PLACEHOLDER_EMAIL ? e : null;
}

/** The display name, else the email's local part, else the phone number, else a neutral label. */
export function displayName(
  profile: { display_name?: string | null } | null | undefined,
  user: { email: string | null; phone: string | null } | null | undefined,
): string {
  const name = profile?.display_name?.trim();
  if (name) return name;
  const email = realEmail(user?.email);
  if (email) return email.split('@')[0] as string;
  if (user?.phone) return formatPhone(user.phone);
  return 'Your account';
}

/** "Ada Lovelace" -> "AL", "ada" -> "AD". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'K';
  if (words.length === 1) return (words[0] as string).slice(0, 2).toUpperCase();
  return `${(words[0] as string)[0]}${(words[words.length - 1] as string)[0]}`.toUpperCase();
}

/** Supabase stores phones without the plus; show them as E.164. */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  return digits ? `+${digits}` : phone;
}

/** "Just now", "5m ago", "3h ago", "2d ago", then "Nov 3", as the web's history list and bell show it. */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
