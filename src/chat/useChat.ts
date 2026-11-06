import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { ChatBackend } from '../api/backend';
import {
  ChatError,
  abortedFailure,
  interruptedFailure,
  networkFailure,
  streamFailure,
  type ChatFailure,
  type QuotaInfo,
} from '../api/errors';
import type { ChatEvent } from '../api/sse';
import { keepAliveInBackground } from '../lib/backgroundTask';
import { newId } from '../lib/uuid';
import { applyActivity, settleActivity, type ActivityItem } from './activity';
import { fromStored, messagesReducer, type ChatMessage, type MessageAction } from './messages';
import { createSessionProvisioner } from './sessionProvisioner';

/** How long, once back in the foreground, to look for an answer that finished while the app was away. */
const RECOVER_FOR_MS = 120_000;
const RECOVER_POLL_MS = 3_000;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done);
  });
}

/** In the background or on its way there (iOS reports `inactive` first). */
const isAway = (state: string | null | undefined) => state === 'background' || state === 'inactive';

/** Resolves once the app is in the foreground (or the wait is cancelled). */
function untilActive(signal: AbortSignal): Promise<void> {
  if (!isAway(AppState.currentState) || signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const sub = AppState.addEventListener('change', s => s === 'active' && done());
    function done() {
      sub.remove();
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done);
  });
}

/** The server has this turn's answer: as many questions as on screen, and an answer after the last. */
export function hasAnswerFor(stored: ChatMessage[], local: ChatMessage[]): boolean {
  const last = stored[stored.length - 1];
  const asked = (list: ChatMessage[]) => list.filter(m => m.role === 'user').length;
  return !!last && last.role === 'assistant' && (!!last.content.trim() || !!last.blocks?.length) && asked(stored) >= asked(local);
}

export type SendResult =
  | { ok: true }
  | { ok: false; failure?: ChatFailure; /** Text to put back in the composer. */ restoreText?: string };

interface Options {
  backend: ChatBackend;
  /** Called with the server's title for a session, so a history list can follow. */
  onSessionTitle?: (sessionId: string, title: string) => void;
}

/**
 * One conversation. Owns the transcript, the optimistic send, the streamed
 * answer, retry, and reconciliation with the server's history.
 *
 *  - A send is guarded by a ref, so a double tap can't send twice.
 *  - Every state update after an `await` checks a generation counter, so a send
 *    that finished after the user opened another chat paints nothing there.
 *  - Local message ids are replaced by the server's once the turn is stored.
 */
export function useChat({ backend, onSessionTitle }: Options) {
  // The transcript lives in a ref as well as in state: the ref is what async code
  // reads (it is current the instant an action is applied, not after the next
  // render), and state is what re-renders the screen.
  const messagesRef = useRef<ChatMessage[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const dispatch = useCallback((action: MessageAction) => {
    messagesRef.current = messagesReducer(messagesRef.current, action);
    setMessages(messagesRef.current);
  }, []);
  const [isSending, setIsSending] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [historyState, setHistoryState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  // The agent's work on the latest turn, shown above its answer (see components/ActivityFeed).
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [thinking, setThinking] = useState('');
  /** The stream dropped while the app was away; the finished answer is being fetched. */
  const [reconnecting, setReconnecting] = useState(false);
  /** The app left the foreground at some point during the current send. */
  const awayRef = useRef(false);

  const provisioner = useMemo(
    () => createSessionProvisioner(id => backend.createSession(id), newId),
    [backend],
  );
  const sendingRef = useRef(false);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  /** Stop listening to whatever is running, without stopping it. */
  const detach = useCallback(() => {
    generationRef.current += 1;
    sendingRef.current = false;
    setIsSending(false);
    setStatusText(null);
    setReconnecting(false);
    setActivity([]);
    setThinking('');
  }, []);

  /** Replace the transcript with the server's, when the server has at least as much. */
  const reconcile = useCallback(
    async (id: string, gen: number) => {
      try {
        const stored = fromStored(await backend.getMessages(id));
        if (gen !== generationRef.current || !mountedRef.current || sendingRef.current) return;
        if (stored.length >= messagesRef.current.length) dispatch({ type: 'replace', messages: stored });
      } catch {
        // Keep what is on screen; the next foreground or open tries again.
      }
    },
    [backend, dispatch],
  );

  const openSession = useCallback(
    async (id: string) => {
      abortRef.current?.abort();
      detach();
      provisioner.set(id);
      setSessionId(id);
      setQuota(null);
      dispatch({ type: 'replace', messages: [] });
      setHistoryState('loading');
      const gen = generationRef.current;
      try {
        const stored = fromStored(await backend.getMessages(id));
        if (gen !== generationRef.current) return;
        dispatch({ type: 'replace', messages: stored });
        setHistoryState('idle');
      } catch {
        if (gen === generationRef.current) setHistoryState('error');
      }
    },
    [backend, detach, dispatch, provisioner],
  );

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    detach();
    provisioner.set(null);
    setSessionId(null);
    setQuota(null);
    setHistoryState('idle');
    dispatch({ type: 'replace', messages: [] });
  }, [detach, dispatch, provisioner]);

  /**
   * After the stream dropped while the app was in the background: once the app
   * is back, look for the answer on the server (it may have finished without
   * us) and show it. False when there is none after RECOVER_FOR_MS, or when the
   * user stopped, left the chat or the screen went away.
   */
  const recoverAnswer = useCallback(
    async (id: string, gen: number, signal: AbortSignal): Promise<boolean> => {
      await untilActive(signal);
      const until = Date.now() + RECOVER_FOR_MS;
      const live = () => !signal.aborted && gen === generationRef.current && mountedRef.current;
      while (live() && Date.now() < until) {
        try {
          const stored = fromStored(await backend.getMessages(id));
          if (live() && hasAnswerFor(stored, messagesRef.current)) {
            dispatch({ type: 'replace', messages: stored });
            return true;
          }
        } catch {
          // Still offline or a blip: try again on the next beat.
        }
        await sleep(RECOVER_POLL_MS, signal);
      }
      return false;
    },
    [backend, dispatch],
  );

  const send = useCallback(
    async (raw: string): Promise<SendResult> => {
      const content = raw.trim();
      if (!content || sendingRef.current) return { ok: false };
      sendingRef.current = true;
      setQuota(null);

      const userId = newId();
      const assistantId = newId();
      const gen = generationRef.current;
      const current = () => gen === generationRef.current && mountedRef.current;
      const controller = new AbortController();
      abortRef.current = controller;

      dispatch({ type: 'user_sent', id: userId, content, now: Date.now() });
      dispatch({ type: 'assistant_started', id: assistantId, replyTo: userId, now: Date.now() });
      setIsSending(true);
      setStatusText(null);
      setActivity([]);
      setThinking('');
      setReconnecting(false);
      awayRef.current = isAway(AppState.currentState);
      // On iOS, keeps the connection up for the ~30s the OS allows after switching away.
      const releaseBackground = keepAliveInBackground('kwala-chat-answer');

      let ensuredId: string | null = null;
      try {
        const ensured = await provisioner.ensure();
        ensuredId = ensured.id;
        if (current()) setSessionId(ensured.id);
        if (controller.signal.aborted) throw new ChatError(abortedFailure());

        const onEvent = (e: ChatEvent) => {
          if (!current()) return;
          switch (e.type) {
            case 'status':
              setStatusText(e.content);
              break;
            case 'token':
              dispatch({ type: 'token', id: assistantId, text: e.content });
              break;
            case 'block':
              dispatch({ type: 'block', id: assistantId, block: e.content as { type: string } });
              break;
            case 'blocks_reset':
              dispatch({ type: 'blocks_reset', id: assistantId });
              break;
            case 'activity': {
              const step = e.content;
              setActivity(prev => applyActivity(prev, step, Date.now()));
              break;
            }
            case 'thinking': {
              const prose = e.content.trim();
              if (prose) setThinking(prev => (prev ? `${prev} ${prose}` : prose));
              break;
            }
            case 'session_title':
              if (ensuredId && e.content.trim()) onSessionTitle?.(ensuredId, e.content.trim());
              break;
            case 'error':
              throw new ChatError(streamFailure(e.content));
            case 'done':
              setStatusText(null);
              break;
          }
        };

        await backend.streamChat({ sessionId: ensured.id, message: content, signal: controller.signal, onEvent });
        if (current()) {
          dispatch({ type: 'assistant_done', id: assistantId });
          void reconcile(ensured.id, gen);
        }
        return { ok: true };
      } catch (err) {
        let failure: ChatFailure =
          err instanceof ChatError
            ? err.failure
            : controller.signal.aborted
              ? abortedFailure()
              : networkFailure();

        // The OS cut the connection while the app was away. The server may well
        // have finished the answer: fetch it instead of showing an error.
        if (failure.code === 'NETWORK' && awayRef.current && ensuredId && !controller.signal.aborted) {
          if (current()) setReconnecting(true);
          const recovered = await recoverAnswer(ensuredId, gen, controller.signal);
          if (current()) setReconnecting(false);
          if (recovered) return { ok: true };
          failure = controller.signal.aborted ? abortedFailure() : interruptedFailure();
        }

        if (failure.code === 'ABORTED') {
          // The user pressed stop: keep the partial answer if there is one.
          if (current()) {
            const partial = messagesRef.current.find(m => m.id === assistantId);
            if (partial && (partial.content || partial.blocks?.length)) {
              dispatch({ type: 'assistant_done', id: assistantId });
            } else {
              dispatch({ type: 'remove', ids: [assistantId] });
            }
          }
          return { ok: false, failure };
        }

        // A refusal the user can't act on by retrying (quota, signed out) is
        // not a reply: drop both bubbles and give the text back to the composer.
        if (!failure.retryable) {
          if (current()) {
            dispatch({ type: 'remove', ids: [userId, assistantId] });
            if (failure.code === 'QUOTA_EXCEEDED' && failure.quota) setQuota(failure.quota);
          }
          return { ok: false, failure, restoreText: content };
        }

        if (current()) dispatch({ type: 'assistant_failed', id: assistantId, failure });
        return { ok: false, failure };
      } finally {
        releaseBackground();
        if (current()) {
          sendingRef.current = false;
          setIsSending(false);
          setStatusText(null);
          setActivity(prev => settleActivity(prev, Date.now()));
        }
      }
    },
    [backend, dispatch, onSessionTitle, provisioner, reconcile, recoverAnswer],
  );

  /** Retry a failed turn: drop the failed reply and its question, then send the question again. */
  const retry = useCallback(
    (assistantId: string) => {
      const failed = messagesRef.current.find(m => m.id === assistantId && m.status === 'failed');
      const question = failed?.replyTo ? messagesRef.current.find(m => m.id === failed.replyTo) : undefined;
      if (!failed || !question || sendingRef.current) return Promise.resolve<SendResult>({ ok: false });
      dispatch({ type: 'remove', ids: [failed.id, question.id] });
      return send(question.content);
    },
    [dispatch, send],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  // Back from the background: pick up an answer that finished while we were away.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (isAway(state) && sendingRef.current) awayRef.current = true;
      const id = provisioner.current;
      if (state === 'active' && id && !sendingRef.current) void reconcile(id, generationRef.current);
    });
    return () => sub.remove();
  }, [provisioner, reconcile]);

  return {
    messages,
    sessionId,
    isSending,
    statusText,
    quota,
    historyState,
    activity,
    thinking,
    reconnecting,
    send,
    retry,
    stop,
    openSession,
    newChat,
    /** Forget everything held for the signed-in user (logout, account switch). */
    clear: newChat,
  };
}
