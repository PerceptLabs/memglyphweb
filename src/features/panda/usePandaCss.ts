/**
 * usePandaCss Hook
 *
 * Provides access to Panda CSS design tokens and helpers.
 *
 * Returns null if Panda CSS is not available for the current GlyphCase.
 * This enables graceful degradation to base component styles.
 *
 * @example
 * ```tsx
 * import { usePandaCss } from '@/features/panda/usePandaCss';
 * import { cn } from '@/lib/classnames';
 *
 * function MyComponent() {
 *   const panda = usePandaCss();
 *
 *   return (
 *     <div className={cn(
 *       'my-base-class',           // Always applied
 *       panda?.getToken('colors.primary')  // Optional enhancement
 *     )}>
 *       Content
 *     </div>
 *   );
 * }
 * ```
 */

import { useContext } from 'preact/hooks';
import { PandaContext } from './PandaContext';
import type { PandaCssContextValue } from './PandaContext';

export function usePandaCss(): PandaCssContextValue | null {
  const context = useContext(PandaContext);

  // Return null if Panda CSS not available (graceful degradation)
  if (!context || !context.isLoaded) {
    return null;
  }

  return context;
}
