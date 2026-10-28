import type { ChatSession } from '../api/schemas';

export interface EnsuredSession {
  id: string;
  /** The server's row when this call made the session; null when it already existed. */
  created: ChatSession | null;
}

export interface SessionProvisioner {
  /** The session the visible chat belongs to, or null for a fresh chat. */
  readonly current: string | null;
  /** Point at an existing session (or none). Also orphans a creation in flight. */
  set(id: string | null): void;
  /**
   * The current session, creating it if there is none. Concurrent callers share
   * one creation, and a retry after a failed creation reuses the same
   * client-generated id, so the server sees one request twice, not two sessions.
   */
  ensure(): Promise<EnsuredSession>;
}

export function createSessionProvisioner(
  create: (id: string) => Promise<ChatSession>,
  newId: () => string,
): SessionProvisioner {
  let current: string | null = null;
  let epoch = 0;
  let inflight: { epoch: number; promise: Promise<EnsuredSession> } | null = null;
  let pendingId: string | null = null;

  return {
    get current() {
      return current;
    },
    set(id) {
      current = id;
      epoch += 1;
      inflight = null;
      pendingId = null;
    },
    ensure() {
      if (current) return Promise.resolve({ id: current, created: null });
      if (inflight && inflight.epoch === epoch) return inflight.promise;

      const myEpoch = epoch;
      const clientId = pendingId ?? newId();
      pendingId = clientId;
      const entry: { epoch: number; promise: Promise<EnsuredSession> } = {
        epoch: myEpoch,
        promise: Promise.resolve()
          .then(() => create(clientId))
          .then(
            row => {
              if (inflight === entry) inflight = null;
              // Only becomes current if nothing moved the chat meanwhile.
              if (epoch === myEpoch) {
                current = row.id;
                pendingId = null;
              }
              return { id: row.id, created: row };
            },
            err => {
              if (inflight === entry) inflight = null;
              throw err;
            },
          ),
      };
      inflight = entry;
      return entry.promise;
    },
  };
}
