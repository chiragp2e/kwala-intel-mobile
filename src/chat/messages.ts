import type { ChatFailure } from '../api/errors';
import type { Block, StoredMessage } from '../api/schemas';

export type MessageStatus = 'sent' | 'streaming' | 'failed';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  status: MessageStatus;
  blocks?: Block[];
  failure?: ChatFailure;
  /** For a failed assistant turn: the user message it answers, so Retry resends that text. */
  replyTo?: string;
}

export type MessageAction =
  | { type: 'replace'; messages: ChatMessage[] }
  | { type: 'user_sent'; id: string; content: string; now: number }
  | { type: 'assistant_started'; id: string; replyTo: string; now: number }
  | { type: 'token'; id: string; text: string }
  | { type: 'block'; id: string; block: Block }
  | { type: 'blocks_reset'; id: string }
  | { type: 'assistant_done'; id: string }
  | { type: 'assistant_failed'; id: string; failure: ChatFailure }
  | { type: 'remove'; ids: string[] };

/** Messages are keyed by id: a duplicate event or a re-delivered turn can never double a bubble. */
function upsert(list: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  return list.some(m => m.id === msg.id) ? list.map(m => (m.id === msg.id ? msg : m)) : [...list, msg];
}

function patch(list: ChatMessage[], id: string, fn: (m: ChatMessage) => ChatMessage): ChatMessage[] {
  return list.map(m => (m.id === id ? fn(m) : m));
}

export function messagesReducer(state: ChatMessage[], action: MessageAction): ChatMessage[] {
  switch (action.type) {
    case 'replace': {
      const seen = new Set<string>();
      return action.messages.filter(m => (seen.has(m.id) ? false : (seen.add(m.id), true)));
    }
    case 'user_sent':
      return upsert(state, { id: action.id, role: 'user', content: action.content, createdAt: action.now, status: 'sent' });
    case 'assistant_started':
      return upsert(state, {
        id: action.id,
        role: 'assistant',
        content: '',
        createdAt: action.now,
        status: 'streaming',
        replyTo: action.replyTo,
      });
    case 'token':
      return patch(state, action.id, m => ({ ...m, content: m.content + action.text }));
    case 'block':
      return patch(state, action.id, m => ({ ...m, blocks: [...(m.blocks ?? []), action.block] }));
    case 'blocks_reset':
      return patch(state, action.id, m => ({ ...m, blocks: [] }));
    case 'assistant_done':
      return patch(state, action.id, m => ({ ...m, status: 'sent' }));
    case 'assistant_failed':
      return patch(state, action.id, m => ({
        ...m,
        status: 'failed',
        failure: action.failure,
        // Keep what streamed in before the failure; fall back to the reason.
        content: m.content || action.failure.message,
      }));
    case 'remove': {
      const drop = new Set(action.ids);
      return state.filter(m => !drop.has(m.id));
    }
  }
}

/** Server history to local messages, oldest first, in a stable order. */
export function fromStored(stored: StoredMessage[]): ChatMessage[] {
  return stored
    .map((m, index) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.created_at ? Date.parse(m.created_at) || 0 : 0,
      status: 'sent' as const,
      blocks: m.blocks && m.blocks.length > 0 ? m.blocks : undefined,
      index,
    }))
    // Stable: equal timestamps keep the server's order.
    .sort((a, b) => a.createdAt - b.createdAt || a.index - b.index)
    .map(({ index: _index, ...rest }) => rest);
}
