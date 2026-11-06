import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceError, transcribe } from '../api/transcribe';

export type VoiceState = 'idle' | 'requesting' | 'recording' | 'transcribing';

/** The server refuses clips over 60s; stop just before. */
export const MAX_RECORDING_MS = 58_000;
/** Shorter than this is a slip of the finger, never uploaded. */
const MIN_CLIP_MS = 700;
/** A press shorter than this (from when recording started) is a tap: recording carries on until a second tap. */
const TAP_MAX_MS = 250;
const LEVEL_MS = 80;
const LEVELS = 32;

/** Mono AAC at 32 kbps, as the transcription service asks for. */
const OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16_000,
  numberOfChannels: 1,
  bitRate: 32_000,
  isMeteringEnabled: true,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM },
  web: {},
};

/** Metering is in dBFS (about -60 for room noise, 0 at clipping); the waveform wants 0..1. */
export function levelFromDb(db: number | undefined): number {
  if (typeof db !== 'number' || !Number.isFinite(db)) return 0;
  return Math.min(1, Math.max(0, (db + 55) / 50));
}

interface Options {
  /** A transcript is ready. `autoSend` when the user held the mic and let go (the web's hold-to-talk). */
  onTranscript: (text: string, autoSend: boolean) => void;
}

/**
 * Voice input for the composer, as the web app does it (kwala-intel-fe/src/hooks/useVoiceInput.ts):
 * hold the mic to talk and let go to send, or tap once to start and again to stop
 * and edit the text first. The clip is transcribed by the AI service.
 */
export function useVoiceInput({ onTranscript }: Options) {
  const recorder = useAudioRecorder(OPTIONS);
  const [state, setState] = useState<VoiceState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const stateRef = useRef<VoiceState>('idle');
  const startedAtRef = useRef(0);
  /** The finger is still down from the press that started this recording. */
  const holdingRef = useRef(false);
  /** This press began while already recording: it is the second tap that stops it. */
  const stopOnReleaseRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const transcriptRef = useRef(onTranscript);
  transcriptRef.current = onTranscript;

  const go = useCallback((next: VoiceState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const release = useCallback(async () => {
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
  }, []);

  const stop = useCallback(
    async (autoSend: boolean) => {
      if (stateRef.current !== 'recording') return;
      const duration = Date.now() - startedAtRef.current;
      go('transcribing');
      try {
        await recorder.stop();
      } catch {
        // Already stopped (an interruption): the file is what was recorded.
      }
      void release();
      const uri = recorder.uri;
      if (duration < MIN_CLIP_MS || !uri) {
        go('idle');
        setError('Hold to talk, or tap to record.');
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const { text } = await transcribe(uri, controller.signal);
        if (controller.signal.aborted) return;
        go('idle');
        transcriptRef.current(text, autoSend);
      } catch (e) {
        if (controller.signal.aborted) return;
        go('idle');
        setError(e instanceof VoiceError ? e.message : 'Voice input failed. Try again.');
      }
    },
    [go, recorder, release],
  );

  const start = useCallback(async () => {
    setError(null);
    go('requesting');
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        go('idle');
        setError(
          permission.canAskAgain
            ? 'Mic access was denied. Allow the microphone to use voice input.'
            : 'Mic access is blocked. Enable the microphone for Kwala Intel in Settings.',
        );
        return;
      }
      if (stateRef.current !== 'requesting') return; // cancelled while the prompt was up
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setLevels([]);
      go('recording');
    } catch {
      go('idle');
      void release();
      setError('No microphone found.');
    }
  }, [go, recorder, release]);

  /** Mic pressed down. */
  const pressIn = useCallback(() => {
    if (stateRef.current === 'recording') {
      stopOnReleaseRef.current = true;
      return;
    }
    if (stateRef.current !== 'idle') return;
    stopOnReleaseRef.current = false;
    holdingRef.current = true;
    void start();
  }, [start]);

  /** Mic released: a second tap stops for editing; letting go after a hold sends. */
  const pressOut = useCallback(() => {
    const wasHolding = holdingRef.current;
    holdingRef.current = false;
    if (stopOnReleaseRef.current) {
      stopOnReleaseRef.current = false;
      void stop(false);
      return;
    }
    // Released while the permission prompt was up, or a quick tap: keep recording until the next tap.
    if (wasHolding && stateRef.current === 'recording' && Date.now() - startedAtRef.current >= TAP_MAX_MS) {
      void stop(true);
    }
  }, [stop]);

  /** Throws the clip away, or abandons a transcription in flight. */
  const cancel = useCallback(() => {
    const was = stateRef.current;
    holdingRef.current = false;
    stopOnReleaseRef.current = false;
    abortRef.current?.abort();
    go('idle');
    if (was === 'recording') {
      void recorder.stop().catch(() => {});
      void release();
    }
  }, [go, recorder, release]);

  // While recording: the timer, the waveform, and the stop at the length cap.
  useEffect(() => {
    if (state !== 'recording') return;
    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      setElapsedMs(elapsed);
      let db: number | undefined;
      try {
        db = recorder.getStatus().metering;
      } catch {
        db = undefined;
      }
      setLevels(prev => [...prev.slice(-(LEVELS - 1)), levelFromDb(db)]);
      if (elapsed >= MAX_RECORDING_MS) void stop(holdingRef.current);
    }, LEVEL_MS);
    return () => clearInterval(tick);
  }, [state, recorder, stop]);

  // Leaving the screen releases the mic.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (stateRef.current === 'recording') void recorder.stop().catch(() => {});
    },
    [recorder],
  );

  return { state, elapsedMs, levels, error, clearError: () => setError(null), pressIn, pressOut, cancel };
}

export type VoiceInput = ReturnType<typeof useVoiceInput>;
