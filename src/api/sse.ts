/**
 * Server-sent events from the chat service: lines of `data: {json}`, where the
 * JSON is `{ type, content }`. Unknown types are ignored so the backend can add
 * event kinds without breaking an installed app.
 */
export type ChatEvent =
  | { type: 'status'; content: string }
  | { type: 'token'; content: string }
  | { type: 'block'; content: Record<string, unknown> }
  | { type: 'blocks_reset' }
  | { type: 'session_title'; content: string }
  | { type: 'error'; content: string }
  | { type: 'done' };

const STRING_EVENTS = new Set(['status', 'token', 'session_title', 'error']);

export function parseEventLine(line: string): ChatEvent | null {
  if (!line.startsWith('data: ')) return null;
  const raw = line.slice(6).trim();
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const { type, content } = parsed as { type?: unknown; content?: unknown };
  if (typeof type !== 'string') return null;
  if (STRING_EVENTS.has(type)) {
    return typeof content === 'string' ? ({ type, content } as ChatEvent) : null;
  }
  if (type === 'block') {
    return content && typeof content === 'object' ? { type, content: content as Record<string, unknown> } : null;
  }
  if (type === 'blocks_reset' || type === 'done') return { type } as ChatEvent;
  return null;
}

/** Splits a byte stream's text into complete lines, keeping the partial tail. */
export class LineBuffer {
  private tail = '';
  push(chunk: string): string[] {
    const lines = (this.tail + chunk).split('\n');
    this.tail = lines.pop() ?? '';
    return lines.map(l => l.replace(/\r$/, ''));
  }
  /** Whatever is left once the stream ends (a final line with no newline). */
  flush(): string[] {
    const rest = this.tail;
    this.tail = '';
    return rest ? [rest.replace(/\r$/, '')] : [];
  }
}
