// TextDecoder is provided at runtime by Expo's winter runtime (imported by 'expo').
declare class TextDecoder {
  constructor(label?: string);
  decode(input?: Uint8Array, options?: { stream?: boolean }): string;
}

// Test-only: available in Hermes and in Node, but not in React Native's type lib.
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}
