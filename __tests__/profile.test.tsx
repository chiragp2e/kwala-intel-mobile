import React from 'react';
import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import TestRenderer, { act } from 'react-test-renderer';
import { CONTACT, LEGAL_LINKS, SOCIALS, legalUrl, mailtoHref, telHref } from '../src/lib/company';
import { AboutScreen } from '../src/screens/AboutScreen';
import { ProfileScreen } from '../src/screens/ProfileScreen';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'dismiss' })) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const mockAuth = jest.fn();
jest.mock('../src/auth/AuthContext', () => ({ useAuth: () => mockAuth() }));
const mockEntitlements = jest.fn();
const mockProfile = jest.fn();
const mockSaveName = jest.fn();
jest.mock('../src/state/queries', () => ({
  useEntitlements: () => mockEntitlements(),
  useProfile: () => mockProfile(),
  useUpdateDisplayName: () => ({ mutate: mockSaveName, isPending: false, error: null, reset: () => {} }),
}));

describe('company details', () => {
  it('builds policy links on the marketing site, with no doubled slash', () => {
    expect(legalUrl('terms')).toBe('https://kwalaintel.com/legal/terms/');
    expect(legalUrl('privacy', 'https://kwalaintel.com/')).toBe('https://kwalaintel.com/legal/privacy/');
    expect(LEGAL_LINKS.map(l => l.slug)).toEqual(['terms', 'privacy', 'refund-cancellation', 'ai-disclosure']);
  });

  it('writes the phone number as a dialable link and the email as a mailto', () => {
    expect(telHref(CONTACT.support.phone)).toBe('tel:+919761469198');
    expect(mailtoHref(CONTACT.support.email)).toBe('mailto:support@implicitstreams.com');
  });

  it('has a unique, https link for every social network', () => {
    expect(new Set(SOCIALS.map(s => s.name)).size).toBe(SOCIALS.length);
    for (const s of SOCIALS) expect(s.href).toMatch(/^https:\/\//);
  });
});

const texts = (r: TestRenderer.ReactTestRenderer) => JSON.stringify(r.toJSON());
const press = (r: TestRenderer.ReactTestRenderer, label: string) => {
  const node = r.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  act(() => node.props.onPress());
};

describe('AboutScreen', () => {
  const render = () => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<AboutScreen navigation={undefined as never} route={undefined as never} />);
    });
    return r;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  });

  it('shows the four footer sections, the contacts and the disclaimer', () => {
    const t = texts(render());
    for (const s of ['About Kwala Intel', 'Contact us', 'Legal', 'Follow us', 'Mukul Singh', 'Naveen Singh', 'grievance@implicitstreams.com', 'support@implicitstreams.com', '+91 97614 69198', 'Complaints acknowledged within 24 hours.', 'Important information']) {
      expect(t).toContain(s);
    }
    for (const l of LEGAL_LINKS) expect(t).toContain(l.label);
  });

  it('opens policies in the in-app browser, and mail, phone and social links in their own apps', () => {
    const r = render();
    press(r, 'Privacy Policy');
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://kwalaintel.com/legal/privacy/', expect.any(Object));
    press(r, CONTACT.support.phone);
    expect(Linking.openURL).toHaveBeenCalledWith('tel:+919761469198');
    press(r, CONTACT.grievance.email);
    expect(Linking.openURL).toHaveBeenCalledWith('mailto:grievance@implicitstreams.com');
    press(r, 'Kwala on X');
    expect(Linking.openURL).toHaveBeenCalledWith('https://x.com/KWALA_official');
  });
});

describe('ProfileScreen', () => {
  const navigation = { navigate: jest.fn(), popTo: jest.fn() };
  const signOut = jest.fn(async () => {});
  const render = () => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<ProfileScreen navigation={navigation as never} route={undefined as never} />);
    });
    return r;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockReturnValue({
      status: 'signedIn',
      user: { id: 'u1', email: 'ada@example.com', phone: null, emailConfirmed: true, phoneConfirmed: false },
      signOut,
    });
    mockProfile.mockReturnValue({ data: { id: 'u1', display_name: 'Ada Lovelace' }, isLoading: false, isFetching: false });
    mockEntitlements.mockReturnValue({ data: { plan: 'free', quota: { unlimited: false, limit: 3, used: 1, remaining: 2, resetAt: null } } });
  });

  it("shows the signed-in person's details, not the company page", () => {
    const t = texts(render());
    for (const s of ['Ada Lovelace', 'AL', 'ada@example.com', 'Confirmed', 'Mobile number', 'Not added', 'Free plan', 'questions used today', 'Display name']) {
      expect(t).toContain(s);
    }
    expect(t).not.toContain('Mukul Singh');
  });

  it('saves a changed display name, trimmed', () => {
    const r = render();
    const input = r.root.find(n => n.props.accessibilityLabel === 'Display name' && typeof n.props.onChangeText === 'function');
    act(() => input.props.onChangeText('  Ada King  '));
    press(r, 'Save changes');
    expect(mockSaveName).toHaveBeenCalledWith('Ada King', expect.any(Object));
  });

  it('asks before signing out', () => {
    const r = render();
    press(r, 'Sign out');
    expect(signOut).not.toHaveBeenCalled();
    expect(texts(r)).toContain("You'll need to sign in again to get back to your chats.");
    const confirm = r.root.findAll(n => n.props.accessibilityLabel === 'Sign out' && typeof n.props.onPress === 'function');
    act(() => confirm[confirm.length - 1]?.props.onPress());
    expect(signOut).toHaveBeenCalled();
  });

  it('asks a guest to sign in', () => {
    mockAuth.mockReturnValue({ status: 'signedOut', user: null, signOut });
    expect(texts(render())).toContain('Sign in to see your profile');
  });
});
