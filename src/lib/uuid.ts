import * as Crypto from 'expo-crypto';

/** A random v4 id. Used for client-generated session ids and message ids, so a
 *  retried create is idempotent. */
export function newId(): string {
  return Crypto.randomUUID();
}
