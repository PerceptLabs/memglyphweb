/**
 * Panda CSS Types
 *
 * Type definitions for Panda CSS design tokens, recipes, and themes.
 */

/**
 * Design Tokens - Core styling primitives
 *
 * Loaded from /gc/ui/tokens.json in the GlyphCase.
 * Provides colors, spacing, typography, and other design system values.
 */
export interface PandaTokens {
  version?: string;
  colors?: Record<string, string>;
  spacing?: Record<string, string>;
  typography?: {
    fontFamily?: Record<string, string>;
    fontSize?: Record<string, string>;
    fontWeight?: Record<string, number>;
    lineHeight?: Record<string, string | number>;
    letterSpacing?: Record<string, string>;
  };
  radii?: Record<string, string>;
  shadows?: Record<string, string>;
  zIndex?: Record<string, number>;
  breakpoints?: Record<string, string>;
  transitions?: Record<string, string>;
  animations?: Record<string, string>;
  // Allow arbitrary additional token categories
  [key: string]: any;
}

/**
 * Recipe - Component styling pattern with variants
 *
 * Loaded from /gc/ui/panda/recipes/*.json
 * Example: badge.json defines variants like success/warning/critical
 */
export interface PandaRecipe {
  name: string;
  description?: string;
  base?: Record<string, string | number>; // Base styles (always applied)
  variants?: Record<string, Record<string, Record<string, string | number>>>; // Variant styles
  defaultVariants?: Record<string, string>; // Default variant selections
}

/**
 * Theme - Semantic token overrides for color schemes
 *
 * Loaded from /gc/ui/panda/themes/*.json
 * Example: dark.json overrides semantic colors for dark mode
 */
export interface PandaTheme {
  name: string;
  description?: string;
  colors?: Record<string, string>;
  shadows?: Record<string, string>;
  // Allow arbitrary token overrides
  [key: string]: any;
}

/**
 * Panda CSS Manager State
 *
 * Tracks loaded tokens, recipes, themes, and provides helper methods.
 */
export interface PandaCssState {
  /** Design tokens loaded from /gc/ui/tokens.json */
  tokens: PandaTokens | null;

  /** Recipes loaded from /gc/ui/panda/recipes/*.json */
  recipes: Map<string, PandaRecipe>;

  /** Themes loaded from /gc/ui/panda/themes/*.json */
  themes: Map<string, PandaTheme>;

  /** Currently active theme (if any) */
  activeTheme: string | null;

  /** Static CSS loaded from /gc/ui/panda/styles.css */
  cssLoaded: boolean;

  /** Loading state */
  loading: boolean;

  /** Error state */
  error: string | null;
}

/**
 * Recipe variant selection
 *
 * Used when applying recipes to components.
 * Example: { style: 'success' } for badge recipe
 */
export type RecipeVariants = Record<string, string | undefined>;
