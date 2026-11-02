// Hermes has no ReadableStream, and Expo's fetch builds `response.body` from one.
// Expo expects Metro to inject it, which a bare React Native build doesn't do,
// so without this the chat answer fails the moment it starts streaming.
import { ReadableStream } from 'web-streams-polyfill';

const g = globalThis as { ReadableStream?: unknown };
if (typeof g.ReadableStream === 'undefined') g.ReadableStream = ReadableStream;
