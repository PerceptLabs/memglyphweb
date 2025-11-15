/**
 * Panda CSS Context
 *
 * Provides Panda CSS state and helpers to components via React Context.
 */

import { createContext } from 'preact';
import type { PandaTokens } from './types';

export interface PandaCssContextValue {
  /** Design tokens (null if not loaded) */
  tokens: PandaTokens | null;

  /** Get a token value by path (e.g., 'colors.primary') */
  getToken: (path: string) => string | number | undefined;

  /** Check if Panda CSS is loaded */
  isLoaded: boolean;

  /** Loading state */
  loading: boolean;

  /** Error message (if any) */
  error: string | null;
}

/**
 * Panda CSS Context
 *
 * Provides access to Panda CSS design tokens and utilities.
 */
export const PandaContext = createContext<PandaCssContextValue | null>(null);
