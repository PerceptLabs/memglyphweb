/**
 * Keyboard Shortcuts Hook
 *
 * Provides global keyboard shortcuts for the app.
 */

import { useEffect } from 'preact/hooks';

export interface KeyboardShortcutsConfig {
  onFocusSearch?: () => void;
  onToggleLlm?: () => void;
  onEscape?: () => void;
}

export function useKeyboardShortcuts(config: KeyboardShortcutsConfig) {
  const { onFocusSearch, onToggleLlm, onEscape } = config;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Check if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      const isInputFocused =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // "/" - Focus search (only when not in input)
      if (e.key === '/' && !isInputFocused) {
        e.preventDefault();
        onFocusSearch?.();
        return;
      }

      // Ctrl+L or Cmd+L - Toggle LLM
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        onToggleLlm?.();
        return;
      }

      // Escape - Call escape handler
      if (e.key === 'Escape') {
        onEscape?.();
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onFocusSearch, onToggleLlm, onEscape]);
}
