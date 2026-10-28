import * as SecureStore from 'expo-secure-store';

/**
 * Supabase session storage backed by the platform keychain / Keystore.
 *
 * A Supabase session (access token, refresh token, user) is larger than the
 * ~2 KB SecureStore recommends per value, so it is split across keys:
 *   <key>.count = number of chunks, <key>.0 ... <key>.n = the chunks.
 * SecureStore keys may only contain letters, digits, ".", "-" and "_".
 */
const CHUNK = 1800;

const safe = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');
const opts: SecureStore.SecureStoreOptions = {
  // Readable after first unlock so a background token refresh can run, but
  // never restored to another device from a backup.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const k = safe(key);
    const countRaw = await SecureStore.getItemAsync(`${k}.count`, opts);
    if (!countRaw) return null;
    const count = Number(countRaw);
    if (!Number.isInteger(count) || count < 1) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${k}.${i}`, opts);
      // A missing chunk means a torn write; treat the session as absent
      // rather than handing Supabase a truncated JSON document.
      if (part == null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const k = safe(key);
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK) chunks.push(value.slice(i, i + CHUNK));
    if (chunks.length === 0) chunks.push('');
    // Write the chunks before the count, so a reader never sees a count that
    // points at chunks that are not there yet.
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(`${k}.${i}`, chunks[i] as string, opts);
    }
    const previous = Number((await SecureStore.getItemAsync(`${k}.count`, opts)) ?? 0);
    await SecureStore.setItemAsync(`${k}.count`, String(chunks.length), opts);
    for (let i = chunks.length; i < previous; i++) {
      await SecureStore.deleteItemAsync(`${k}.${i}`, opts);
    }
  },

  async removeItem(key: string): Promise<void> {
    const k = safe(key);
    const count = Number((await SecureStore.getItemAsync(`${k}.count`, opts)) ?? 0);
    await SecureStore.deleteItemAsync(`${k}.count`, opts);
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${k}.${i}`, opts);
  },
};
