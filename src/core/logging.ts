/**
 * Logging Configuration - LogTape setup for structured logging
 *
 * Configures LogTape with multiple sinks:
 * - Console: For development and debugging
 * - Envelope: For persistent audit trails (dynamic mode only)
 *
 * Usage:
 *   import { getLogger } from '@logtape/logtape';
 *
 *   const logger = getLogger(['search']);
 *   logger.info('Search completed', { query, hits, duration_ms });
 */

import { configure, getConsoleSink } from '@logtape/logtape';
import { EnvelopeSink } from './logtape-sink';

/**
 * Initialize LogTape with console and envelope sinks
 */
export function initLogging(): void {
  configure({
    sinks: {
      console: getConsoleSink(),
      envelope: new EnvelopeSink()
    },
    loggers: [
      // Search logging (info+ to both sinks)
      {
        category: ['search'],
        level: 'info',
        sinks: ['console', 'envelope']
      },

      // LLM logging (info+ to both sinks)
      {
        category: ['llm'],
        level: 'info',
        sinks: ['console', 'envelope']
      },

      // Envelope logging (info+ to both sinks)
      {
        category: ['envelope'],
        level: 'info',
        sinks: ['console', 'envelope']
      },

      // GlyphCase management (info+ to both sinks)
      {
        category: ['glyphcase'],
        level: 'info',
        sinks: ['console', 'envelope']
      },

      // Debug logs (console only - too noisy for envelope)
      {
        category: ['debug'],
        level: 'debug',
        sinks: ['console']
      },

      // Catch-all for errors (always log errors to both)
      {
        category: [],
        level: 'error',
        sinks: ['console', 'envelope']
      }
    ]
  });

  console.log('[Logging] LogTape initialized with console and envelope sinks');
}
