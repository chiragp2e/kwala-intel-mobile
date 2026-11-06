/**
 * What the web app's footer says about the company: who it is, how to reach it, the policies and the social
 * pages. Kept as data so the Profile screen only lays it out, and so the links can be checked in a test.
 * The policies are served by the marketing site, as on the web app.
 */
export const MARKETING_ORIGIN = 'https://kwalaintel.com';

export type LegalSlug = 'terms' | 'privacy' | 'refund-cancellation' | 'ai-disclosure';

export const LEGAL_LINKS: { slug: LegalSlug; label: string }[] = [
  { slug: 'terms', label: 'Terms & Conditions' },
  { slug: 'privacy', label: 'Privacy Policy' },
  { slug: 'refund-cancellation', label: 'Refund & Cancellation Policy' },
  { slug: 'ai-disclosure', label: 'AI-Generated Content Disclosure' },
];

export function legalUrl(slug: LegalSlug, origin: string = MARKETING_ORIGIN): string {
  return `${origin.replace(/\/+$/, '')}/legal/${slug}/`;
}

export const ABOUT_TEXT =
  'Kwala Intel is an AI-powered research workspace for people who want to understand the market before they act. It turns raw market data, filings, and news into structured research - in your language.';

export const CONTACT = {
  grievance: { name: 'Mukul Singh', email: 'grievance@implicitstreams.com' },
  support: { name: 'Naveen Singh', email: 'support@implicitstreams.com', phone: '+91 97614 69198' },
  note: 'Complaints acknowledged within 24 hours.',
} as const;

export const mailtoHref = (email: string): string => `mailto:${email}`;
/** `tel:` links want digits and a leading plus only, not the spaces used for reading. */
export const telHref = (phone: string): string => `tel:${phone.replace(/[^\d+]/g, '')}`;

export type SocialName = 'x' | 'instagram' | 'youtube' | 'linkedin' | 'facebook' | 'tiktok' | 'moj';

export const SOCIALS: { name: SocialName; label: string; href: string }[] = [
  { name: 'x', label: 'Kwala on X', href: 'https://x.com/KWALA_official' },
  { name: 'instagram', label: 'Kwala on Instagram', href: 'https://www.instagram.com/kwala_network/' },
  { name: 'youtube', label: 'Kwala on YouTube', href: 'https://www.youtube.com/@Kwala-Official' },
  { name: 'linkedin', label: 'Kwala on LinkedIn', href: 'https://www.linkedin.com/company/kwala-official' },
  { name: 'facebook', label: 'Kwala on Facebook', href: 'https://www.facebook.com/kwalaintel' },
  { name: 'tiktok', label: 'Kwala on TikTok', href: 'https://www.tiktok.com/@kwalaintel_official' },
  { name: 'moj', label: 'Kwala on Moj', href: 'https://mojapp.in/@kwalaintel?referrer=VUblDF7-vFt4hF' },
];

export const IMPORTANT_INFO =
  'Kwala Intel is a subscription-based educational and informational research platform. Nothing on this website or the platform is investment, financial, legal, or tax advice, a personal recommendation, or a solicitation to transact. Kwala Intel is not registered with the Securities and Exchange Board of India (SEBI) or the Reserve Bank of India (RBI); it is not a stock broker, research analyst, investment adviser, or portfolio manager; and it does not execute transactions, provide access to any exchange or trading venue, or hold client funds or assets.';

export const TAGLINE = 'Understand before you act';
