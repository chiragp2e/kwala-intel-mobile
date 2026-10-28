import { env } from '../config/env';
import type { ChatBackend } from './backend';
import { createMockBackend } from './mockBackend';
import { createRealBackend } from './realBackend';

let backend: ChatBackend | null = null;

/** The one backend for this build: the mock only when env.useMockBackend, which is development only. */
export function getBackend(): ChatBackend {
  if (!backend) backend = env.useMockBackend ? createMockBackend() : createRealBackend();
  return backend;
}

export type { ChatBackend } from './backend';
