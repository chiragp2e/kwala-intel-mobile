import { requireOptionalNativeModule } from 'expo-modules-core';

interface KwalaBackground {
  begin(name: string): number;
  end(handle: number): void;
}

// modules/kwala-background: on iOS a background task (about 30 seconds), on
// Android a short foreground service, since Android cuts a backgrounded app's
// network almost at once. Absent in tests, where this is a no-op.
const native = requireOptionalNativeModule<KwalaBackground>('KwalaBackground');

/**
 * Asks the OS for running time after the app leaves the foreground, for as long
 * as the returned function has not been called. Safe to call when unavailable.
 */
export function keepAliveInBackground(name: string): () => void {
  let handle = -1;
  try {
    handle = native?.begin(name) ?? -1;
  } catch {
    handle = -1;
  }
  return () => {
    if (handle >= 0) native?.end(handle);
    handle = -1;
  };
}
