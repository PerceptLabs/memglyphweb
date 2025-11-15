/**
 * Merge class names, filtering out nullish values
 *
 * Useful for combining base styles with optional enhancements (e.g., Panda CSS recipes).
 *
 * @example
 * // Basic usage
 * cn('base-class', 'extra-class')
 * // → "base-class extra-class"
 *
 * @example
 * // With optional Panda CSS recipe
 * cn('entity-card', panda?.recipe('card'))
 * // → "entity-card panda-card-recipe" (if panda available)
 * // → "entity-card" (if panda is null/undefined)
 *
 * @example
 * // Conditional classes
 * cn('button', isActive && 'active', isDisabled && 'disabled')
 * // → "button active" (if isActive=true, isDisabled=false)
 *
 * @param classes - Class names, nullish values, or booleans
 * @returns Merged class name string
 */
export function cn(...classes: (string | null | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
