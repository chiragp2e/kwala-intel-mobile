import React from 'react';
import TestRenderer, { act as rtrAct } from 'react-test-renderer';

// React 19 asks test code to say it runs in an act environment.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export const act = rtrAct as unknown as (cb: () => void | Promise<void>) => Promise<void>;

/**
 * Minimal renderHook: mounts a component that runs the hook and exposes its latest return value.
 * `wrapper` supplies providers the hook needs, e.g. a QueryClientProvider.
 */
export async function renderHook<T>(hook: () => T, wrapper?: React.ComponentType<{ children: React.ReactNode }>) {
  const result = { current: undefined as unknown as T };
  function Harness() {
    result.current = hook();
    return null;
  }
  const Wrapper = wrapper ?? React.Fragment;
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <Wrapper>
        <Harness />
      </Wrapper>,
    );
  });
  return { result, unmount: () => act(async () => renderer.unmount()) };
}

export async function waitFor(assertion: () => void, timeoutMs = 1000) {
  const start = Date.now();
  for (;;) {
    try {
      assertion();
      return;
    } catch (e) {
      if (Date.now() - start > timeoutMs) throw e;
      await act(async () => {
        await new Promise<void>(r => setTimeout(() => r(), 10));
      });
    }
  }
}
