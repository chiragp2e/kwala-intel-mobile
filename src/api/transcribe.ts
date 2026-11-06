import { env } from '../config/env';
import { getAuthBridge, withTimeout } from './http';

/**
 * Speech to text for the composer's mic: the recorded clip goes to the AI
 * service's POST /api/transcribe, as the web app sends it
 * (kwala-intel-fe/src/lib/api.ts, transcribeAudio). The server reads the
 * container from the bytes, auto-detects the language, and refuses clips over
 * 60 seconds.
 */

export interface Transcript {
  text: string;
  durationSeconds: number;
}

/** A failed transcription with the copy the web app shows for it. `toast` failures are about the service, not the clip. */
export class VoiceError extends Error {
  readonly status: number | null;
  readonly toast: boolean;
  constructor(message: string, status: number | null, toast = false) {
    super(message);
    this.name = 'VoiceError';
    this.status = status;
    this.toast = toast;
  }
}

const TIMEOUT_MS = 60_000;

/** The server's own wording, when it is short enough to show. */
function detail(body: unknown): string | null {
  const d = body && typeof body === 'object' ? (body as { detail?: unknown }).detail : null;
  return typeof d === 'string' && d.length <= 140 ? d : null;
}

export function voiceErrorFor(status: number, body: unknown): VoiceError {
  if (status === 400) return new VoiceError(detail(body) ?? "That audio format isn't supported.", status);
  if (status === 413) return new VoiceError(detail(body) ?? 'That was too long — keep it under a minute.', status);
  if (status === 422) return new VoiceError("Didn't catch that. Try again.", status);
  if (status === 429) return new VoiceError("You've hit the voice limit. Try again shortly.", status, true);
  if (status >= 502 && status <= 504) return new VoiceError('Voice input is unavailable right now.', status, true);
  return new VoiceError("Couldn't reach the server.", status);
}

export async function transcribe(uri: string, signal?: AbortSignal): Promise<Transcript> {
  if (env.useMockBackend) return { text: 'What moved the market today?', durationSeconds: 2 };
  const bridge = getAuthBridge();
  const post = async (token: string | null) => {
    const form = new FormData();
    // React Native's FormData uploads a local file from its uri. The content type
    // is left to fetch, which adds the multipart boundary.
    form.append('file', { uri, name: 'audio.m4a', type: 'audio/mp4' } as unknown as Blob);
    const t = withTimeout(signal, TIMEOUT_MS);
    try {
      return await fetch(`${env.aiApiBaseUrl}/api/transcribe`, {
        method: 'POST',
        headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: form,
        signal: t.signal,
      });
    } finally {
      t.done();
    }
  };

  let res: Response;
  try {
    let token = await bridge.getAccessToken();
    if (!token) throw new VoiceError('Voice input failed. Try again.', null);
    res = await post(token);
    if (res.status === 401) {
      token = await bridge.refresh();
      if (!token) bridge.onSessionExpired();
      else res = await post(token);
    }
  } catch (e) {
    if (e instanceof VoiceError || signal?.aborted) throw e;
    throw new VoiceError("Couldn't reach the server.", null);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw voiceErrorFor(res.status, body);
  const text = body && typeof body === 'object' ? (body as { text?: unknown }).text : null;
  const seconds = body && typeof body === 'object' ? (body as { duration_seconds?: unknown }).duration_seconds : null;
  if (typeof text !== 'string' || !text.trim()) throw new VoiceError("Didn't catch that. Try again.", res.status);
  return { text: text.trim(), durationSeconds: typeof seconds === 'number' ? seconds : 0 };
}
