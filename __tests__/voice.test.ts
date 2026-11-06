import { voiceErrorFor } from '../src/api/transcribe';
import { levelFromDb } from '../src/chat/useVoiceInput';

describe('voice input', () => {
  it('maps transcription failures to the web copy', () => {
    expect(voiceErrorFor(422, null).message).toBe("Didn't catch that. Try again.");
    expect(voiceErrorFor(413, { detail: 'Clip is 61s; the limit is 60s.' }).message).toBe('Clip is 61s; the limit is 60s.');
    expect(voiceErrorFor(413, null).message).toBe('That was too long — keep it under a minute.');
    expect(voiceErrorFor(400, { detail: 'x'.repeat(200) }).message).toBe("That audio format isn't supported.");
    expect(voiceErrorFor(429, null)).toMatchObject({ message: "You've hit the voice limit. Try again shortly.", toast: true });
    expect(voiceErrorFor(503, null)).toMatchObject({ message: 'Voice input is unavailable right now.', toast: true });
    expect(voiceErrorFor(401, null).message).toBe("Couldn't reach the server.");
  });

  it('turns metering dB into a 0..1 level', () => {
    expect(levelFromDb(undefined)).toBe(0);
    expect(levelFromDb(-160)).toBe(0);
    expect(levelFromDb(0)).toBe(1);
    expect(levelFromDb(-30)).toBeCloseTo(0.5);
  });
});
