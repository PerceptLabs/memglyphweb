/**
 * Panda CSS Manager
 *
 * Handles loading and managing Panda CSS resources from GlyphCase:
 * - Design tokens from /gc/ui/tokens.json
 * - Static CSS from /gc/ui/panda/styles.css
 * - Recipes from /gc/ui/panda/recipes/*.json (Session 3)
 * - Themes from /gc/ui/panda/themes/*.json (Session 4)
 *
 * Session 2 Scope: Foundation - tokens and global CSS injection only
 */

import { getLogger } from '@logtape/logtape';
import type { DbClient } from '../../db/client';
import type { PandaTokens, PandaCssState } from './types';

const logger = getLogger(['panda-css']);

export class PandaCssManager {
  private state: PandaCssState = {
    tokens: null,
    recipes: new Map(),
    themes: new Map(),
    activeTheme: null,
    cssLoaded: false,
    loading: false,
    error: null
  };

  private dbClient: DbClient | null = null;
  private styleElement: HTMLStyleElement | null = null;

  /**
   * Initialize Panda CSS with a database client
   */
  async init(dbClient: DbClient): Promise<boolean> {
    this.dbClient = dbClient;
    this.state.loading = true;
    this.state.error = null;

    try {
      // Load tokens
      await this.loadTokens();

      // Load global CSS
      await this.loadCss();

      logger.info('Panda CSS initialized', {
        hasTokens: this.state.tokens !== null,
        cssLoaded: this.state.cssLoaded
      });

      this.state.loading = false;
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.state.error = errorMsg;
      this.state.loading = false;

      logger.error('Failed to initialize Panda CSS', {
        error: errorMsg
      });

      return false;
    }
  }

  /**
   * Load design tokens from /gc/ui/tokens.json
   */
  private async loadTokens(): Promise<void> {
    if (!this.dbClient) {
      throw new Error('DbClient not initialized');
    }

    try {
      // Read tokens file from sqlar
      const blob = await this.dbClient.getPageBlob('gc/ui/tokens.json');
      const text = await blob.text();
      const tokens = JSON.parse(text) as PandaTokens;

      // Validate version (informational only)
      if (tokens.version) {
        logger.info('Panda CSS tokens loaded', {
          version: tokens.version,
          categories: Object.keys(tokens).filter(k => k !== 'version')
        });
      }

      this.state.tokens = tokens;
    } catch (err) {
      // Check if file simply doesn't exist (expected for Cases without Panda CSS)
      if (err instanceof Error && err.message.includes('not found')) {
        logger.debug('No Panda CSS tokens found', {
          path: '/gc/ui/tokens.json',
          note: 'Expected for Cases without Panda CSS'
        });
        this.state.tokens = null;
        return;
      }

      // Parsing or other errors
      logger.warn('Failed to load Panda CSS tokens', {
        error: err instanceof Error ? err.message : String(err),
        fallback: 'Continuing without design tokens'
      });

      this.state.tokens = null;
    }
  }

  /**
   * Load static CSS from /gc/ui/panda/styles.css and inject globally
   */
  private async loadCss(): Promise<void> {
    if (!this.dbClient) {
      throw new Error('DbClient not initialized');
    }

    try {
      // Read CSS file from sqlar
      const blob = await this.dbClient.getPageBlob('gc/ui/panda/styles.css');
      const css = await blob.text();

      // Inject into document
      this.injectCss(css);

      logger.info('Panda CSS styles injected', {
        length: css.length,
        method: 'global <style> tag'
      });

      this.state.cssLoaded = true;
    } catch (err) {
      // Check if file simply doesn't exist
      if (err instanceof Error && err.message.includes('not found')) {
        logger.debug('No Panda CSS styles found', {
          path: '/gc/ui/panda/styles.css',
          note: 'Expected for Cases without Panda CSS'
        });
        this.state.cssLoaded = false;
        return;
      }

      // Other errors
      logger.warn('Failed to load Panda CSS styles', {
        error: err instanceof Error ? err.message : String(err),
        fallback: 'Continuing without global styles'
      });

      this.state.cssLoaded = false;
    }
  }

  /**
   * Inject CSS into the document
   */
  private injectCss(css: string): void {
    // Remove existing Panda CSS if present
    if (this.styleElement) {
      this.styleElement.remove();
    }

    // Create new style element
    this.styleElement = document.createElement('style');
    this.styleElement.setAttribute('data-panda-css', 'true');
    this.styleElement.textContent = css;

    // Append to head
    document.head.appendChild(this.styleElement);

    logger.debug('CSS injected into document', {
      element: 'style[data-panda-css]'
    });
  }

  /**
   * Get current state
   */
  getState(): PandaCssState {
    return { ...this.state };
  }

  /**
   * Get design tokens
   */
  getTokens(): PandaTokens | null {
    return this.state.tokens;
  }

  /**
   * Check if Panda CSS is loaded
   */
  isLoaded(): boolean {
    return this.state.tokens !== null || this.state.cssLoaded;
  }

  /**
   * Get a specific token value by path
   *
   * @example
   * getToken('colors.primary') → '#6366f1'
   * getToken('spacing.md') → '16px'
   */
  getToken(path: string): string | number | undefined {
    if (!this.state.tokens) {
      return undefined;
    }

    const parts = path.split('.');
    let current: any = this.state.tokens;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Remove injected CSS
    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    }

    // Reset state
    this.state = {
      tokens: null,
      recipes: new Map(),
      themes: new Map(),
      activeTheme: null,
      cssLoaded: false,
      loading: false,
      error: null
    };

    this.dbClient = null;

    logger.info('Panda CSS cleaned up');
  }
}

/**
 * Singleton instance (optional - can also be created per-case)
 */
export const pandaCssManager = new PandaCssManager();
