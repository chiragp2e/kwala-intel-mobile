/**
 * Release diagnostics.
 *
 * Reports only the error name, a short stack and where it happened. Message
 * content, tokens, phone numbers and emails are never attached: errors thrown
 * by the API layer carry typed codes, not response bodies.
 *
 * No crash-reporting vendor is wired up yet (choosing one is a release
 * decision, see docs/RELEASE_CHECKLIST.md). `setReporter` is the single place
 * to plug one in; source maps are produced by `npm run sourcemaps:*`.
 */
type Reporter = (payload: { name: string; stack?: string; where: string }) => void;

let reporter: Reporter | null = null;

export function setReporter(r: Reporter | null) {
  reporter = r;
}

export function reportError(error: unknown, where: string) {
  const e = error instanceof Error ? error : new Error('non-error thrown');
  const payload = {
    name: e.name,
    // First frames only; the message is dropped because it may echo user input.
    stack: e.stack?.split('\n').slice(0, 8).join('\n'),
    where,
  };
  try {
    reporter?.(payload);
  } catch {
    // Diagnostics must never throw.
  }
  if (__DEV__) console.warn(`[error:${where}] ${payload.name}`);
}
