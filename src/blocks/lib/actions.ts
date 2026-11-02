// Registry for the app actions an answer can offer — "set an alert at $300",
// "add to watchlist".
//
// The point of these chips is to end a thread in a product action instead of
// another chat turn, which only works if the chip actually does something. The
// model will suggest actions this build has never implemented, so registration
// is the contract: a chip whose action nobody registered renders disabled and
// visible rather than silently doing nothing when tapped.

type Handler = (params?: Record<string, unknown>) => void | Promise<void>;

const handlers = new Map<string, Handler>();

/** Returns an unregister function, so a screen can offer an action only while
 *  it is mounted. */
export function registerAppAction(name: string, fn: Handler): () => void {
  handlers.set(name, fn);
  return () => {
    if (handlers.get(name) === fn) handlers.delete(name);
  };
}

export function hasAppAction(name: string): boolean {
  return handlers.has(name);
}

export function runAppAction(name: string, params?: Record<string, unknown>): void {
  const fn = handlers.get(name);
  if (!fn) return;
  // A handler that throws must not take the message down with it.
  try {
    void fn(params);
  } catch {
    /* the chip stays; the action simply didn't happen */
  }
}
