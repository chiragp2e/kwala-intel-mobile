import { requireOptionalNativeModule } from 'expo-modules-core';
import { PermissionsAndroid, Platform } from 'react-native';

interface Notifier {
  /** iOS only: the system prompt (shown once; later calls return the saved choice). */
  requestNotifications?(): Promise<boolean>;
  notify(title: string, body: string): void;
}

// modules/kwala-background. Absent in tests and on binaries from before notify() existed: then a no-op.
const native = requireOptionalNativeModule<Notifier>('KwalaBackground');

let asked = false;

/**
 * Asks whether Kwala Intel may tell the user when an answer is ready. Called
 * when a question is sent, at most once per launch; the OS itself shows the
 * prompt only once on iOS and at most twice on Android.
 */
export async function askForAnswerNotifications(os: string = Platform.OS, version: number | string = Platform.Version): Promise<void> {
  if (asked || typeof native?.notify !== 'function') return;
  asked = true;
  try {
    if (os === 'ios') {
      await native.requestNotifications?.();
    } else if (os === 'android' && Number(version) >= 33) {
      const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
      if (!(await PermissionsAndroid.check(permission))) await PermissionsAndroid.request(permission);
    }
  } catch {
    // No prompt is no notification; the answer itself is unaffected.
  }
}

const MAX_BODY = 90;

/** The notification's text: a fixed title, and the question (shortened) so the user knows which answer. */
export function answerReadyText(question: string): { title: string; body: string } {
  const q = question.replace(/\s+/g, ' ').trim();
  return { title: 'Your answer is ready', body: q.length > MAX_BODY ? `${q.slice(0, MAX_BODY - 1).trimEnd()}…` : q };
}

/** Posts "Your answer is ready". The native side does nothing if notifications are not allowed. */
export function notifyAnswerReady(question: string): void {
  const { title, body } = answerReadyText(question);
  try {
    native?.notify(title, body);
  } catch {
    // Best effort.
  }
}

/** Tests only. */
export function resetAnswerNotificationsForTest(): void {
  asked = false;
}
