/**
 * Custom renderHook utility for Preact
 *
 * @testing-library/preact-hooks has compatibility issues with current Preact versions.
 * This is a simple implementation that works with Preact + Vitest + happy-dom.
 */

import { h, render as preactRender } from 'preact';

interface RenderHookResult<T> {
  result: { current: T };
  rerender: (props?: any) => void;
  unmount: () => void;
}

export function renderHook<T>(hook: (props?: any) => T, options?: { initialProps?: any }): RenderHookResult<T> {
  const result: { current: T } = { current: undefined as any };
  let container: HTMLElement | null = null;

  function TestComponent({ hookProps }: { hookProps?: any }) {
    result.current = hook(hookProps);
    return null;
  }

  // Create a container for the component
  container = document.createElement('div');
  document.body.appendChild(container);

  // Render the test component
  preactRender(h(TestComponent, { hookProps: options?.initialProps }), container);

  const rerender = (props?: any) => {
    if (container) {
      preactRender(h(TestComponent, { hookProps: props }), container);
    }
  };

  const unmount = () => {
    if (container) {
      preactRender(null, container);
      document.body.removeChild(container);
      container = null;
    }
  };

  return {
    result,
    rerender,
    unmount,
  };
}

/**
 * Act utility for Preact - flushes updates synchronously
 */
export async function act(callback: () => void | Promise<void>): Promise<void> {
  const result = callback();

  // Wait for the callback to complete
  if (result && typeof result.then === 'function') {
    await result;
  }

  // Force flush Preact updates - multiple ticks to ensure all updates propagate
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}
