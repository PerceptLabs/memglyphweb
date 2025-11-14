/**
 * EnvelopeSink - LogTape sink that writes logs to envelope database
 *
 * Persists structured logs to env_logs table when in dynamic mode.
 * Logs are hash-chained for integrity verification.
 *
 * Silent failure: Logging should never break the app, so errors are caught
 * and logged to console instead of throwing.
 */

import type { LogRecord, Sink } from '@logtape/logtape';
import { glyphCaseManager } from '../db/glyphcase.manager';
import { generateEnvelopeId } from '../db/envelope.writer';

export class EnvelopeSink implements Sink {
  /**
   * Write a log record to the envelope database
   */
  async log(record: LogRecord): Promise<void> {
    try {
      // Only write to envelope if in dynamic mode
      if (!glyphCaseManager.isDynamic()) {
        return; // Static mode - no envelope writes
      }

      const envelope = glyphCaseManager.getEnvelope();
      if (!envelope.isOpen()) {
        return; // Envelope not ready
      }

      const writer = envelope.getWriter();
      if (!writer) {
        return; // No writer available
      }

      // Write log to envelope
      await writer.appendLog({
        id: generateEnvelopeId('log'),
        level: record.level as 'debug' | 'info' | 'warn' | 'error' | 'fatal',
        logger: record.category.join('.'),
        message: record.message,
        context: record.properties || undefined
      });
    } catch (err) {
      // Don't throw - logging should never break the app
      // Use plain console.error to avoid infinite loop
      console.error('[LogTape] Failed to write to envelope:', err);
    }
  }
}
