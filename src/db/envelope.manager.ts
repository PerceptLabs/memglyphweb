/**
 * EnvelopeManager - Manages Envelope database lifecycle
 *
 * Handles:
 * - Creating/loading envelope DBs in OPFS
 * - Linking envelope to Core capsule
 * - Schema initialization
 * - Export/import for remint tooling
 */

import envelopeSchema from './envelope.schema.sql?raw';
import { EnvelopeWriter, generateEnvelopeId } from './envelope.writer';

export type Modality = 'static' | 'dynamic';

export interface EnvelopeStats {
  retrievalCount: number;
  embeddingCount: number;
  feedbackCount: number;
  summaryCount: number;
  chainLength: number;
  firstActivity: string | null;
  lastActivity: string | null;
}

export interface EnvelopeMeta {
  gcaseId: string;
  createdAt: string;
  formatVersion: string;
  lastHash: string;
}

/**
 * Compute SHA-256 hash of capsule file for linking
 */
async function computeCapsuleHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * EnvelopeManager - Lifecycle management for Envelope DBs
 */
export class EnvelopeManager {
  private db: any | null = null;
  private writer: EnvelopeWriter | null = null;
  private gcaseId: string | null = null;
  private opfsPath: string | null = null;

  /**
   * Check if an envelope exists for a given capsule
   */
  static async exists(capsuleFile: File): Promise<boolean> {
    try {
      const gcaseId = await computeCapsuleHash(capsuleFile);
      const opfsPath = `/envelopes/${gcaseId}.db`;

      const opfsRoot = await navigator.storage.getDirectory();
      const envelopesDir = await opfsRoot.getDirectoryHandle('envelopes', { create: false });
      await envelopesDir.getFileHandle(`${gcaseId}.db`, { create: false });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a new envelope for a capsule
   */
  async create(capsuleFile: File, sqlite3: any): Promise<void> {
    this.gcaseId = await computeCapsuleHash(capsuleFile);
    this.opfsPath = `/envelopes/${this.gcaseId}.db`;

    // Create OPFS directory if needed
    const opfsRoot = await navigator.storage.getDirectory();
    const envelopesDir = await opfsRoot.getDirectoryHandle('envelopes', { create: true });

    // Create new SQLite database in OPFS
    this.db = new sqlite3.oo1.OpfsDb(this.opfsPath, 'c');

    // Initialize schema
    this.db.exec(envelopeSchema);

    // Set metadata
    const now = new Date().toISOString();
    const genesis = '0'.repeat(64);

    const stmt = this.db.prepare(`
      INSERT INTO _envelope_meta (key, value) VALUES
      ('gcase_id', ?),
      ('created_at', ?),
      ('format_version', '1.1'),
      ('last_hash', ?)
    `);

    try {
      stmt.bind([this.gcaseId, now, genesis]);
      stmt.step();
    } finally {
      stmt.finalize();
    }

    // Initialize writer
    this.writer = new EnvelopeWriter(this.db, genesis);

    console.log(`[Envelope] Created new envelope for ${this.gcaseId}`);
  }

  /**
   * Load an existing envelope for a capsule
   */
  async load(capsuleFile: File, sqlite3: any): Promise<void> {
    this.gcaseId = await computeCapsuleHash(capsuleFile);
    this.opfsPath = `/envelopes/${this.gcaseId}.db`;

    // Open existing database
    this.db = new sqlite3.oo1.OpfsDb(this.opfsPath, 'w');

    // Get last hash from metadata
    const stmt = this.db.prepare(`
      SELECT value FROM _envelope_meta WHERE key = 'last_hash'
    `);

    let lastHash = '0'.repeat(64);
    try {
      if (stmt.step()) {
        lastHash = stmt.get([])[0];
      }
    } finally {
      stmt.finalize();
    }

    // Initialize writer with existing hash
    this.writer = new EnvelopeWriter(this.db, lastHash);

    console.log(`[Envelope] Loaded existing envelope for ${this.gcaseId}`);
  }

  /**
   * Open envelope (create if doesn't exist, load if exists)
   */
  async open(capsuleFile: File, sqlite3: any): Promise<void> {
    const exists = await EnvelopeManager.exists(capsuleFile);

    if (exists) {
      await this.load(capsuleFile, sqlite3);
    } else {
      await this.create(capsuleFile, sqlite3);
    }
  }

  /**
   * Close the envelope database
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.writer = null;
      this.gcaseId = null;
      console.log('[Envelope] Closed envelope database');
    }
  }

  /**
   * Get the envelope writer
   */
  getWriter(): EnvelopeWriter | null {
    return this.writer;
  }

  /**
   * Get envelope statistics
   */
  getStats(): EnvelopeStats | null {
    if (!this.db) return null;

    const stmt = this.db.prepare('SELECT * FROM v_envelope_stats');

    try {
      if (stmt.step()) {
        const row = stmt.get([]);
        return {
          retrievalCount: row[0] || 0,
          embeddingCount: row[1] || 0,
          feedbackCount: row[2] || 0,
          summaryCount: row[3] || 0,
          chainLength: row[4] || 0,
          firstActivity: row[5] || null,
          lastActivity: row[6] || null
        };
      }
    } finally {
      stmt.finalize();
    }

    return null;
  }

  /**
   * Get envelope metadata
   */
  getMeta(): EnvelopeMeta | null {
    if (!this.db) return null;

    const stmt = this.db.prepare('SELECT key, value FROM _envelope_meta');
    const meta: any = {};

    try {
      while (stmt.step()) {
        const row = stmt.get([]);
        meta[row[0]] = row[1];
      }
    } finally {
      stmt.finalize();
    }

    return {
      gcaseId: meta.gcase_id || '',
      createdAt: meta.created_at || '',
      formatVersion: meta.format_version || '1.1',
      lastHash: meta.last_hash || ''
    };
  }

  /**
   * Clear all envelope data (but keep structure)
   */
  async clear(): Promise<void> {
    if (!this.db) return;

    // Delete all data from tables
    this.db.exec(`
      DELETE FROM env_retrieval_log;
      DELETE FROM env_embeddings;
      DELETE FROM env_feedback;
      DELETE FROM env_context_summaries;
      DELETE FROM _env_chain;
    `);

    // Reset metadata
    const genesis = '0'.repeat(64);
    const stmt = this.db.prepare(`
      UPDATE _envelope_meta SET value = ? WHERE key = 'last_hash'
    `);

    try {
      stmt.bind([genesis]);
      stmt.step();
    } finally {
      stmt.finalize();
    }

    // Reset writer
    this.writer = new EnvelopeWriter(this.db, genesis);

    console.log('[Envelope] Cleared all envelope data');
  }

  /**
   * Export envelope as SQLite file for remint tooling
   */
  async export(): Promise<Blob> {
    if (!this.db || !this.opfsPath) {
      throw new Error('No envelope database open');
    }

    // Read the OPFS file
    const opfsRoot = await navigator.storage.getDirectory();
    const envelopesDir = await opfsRoot.getDirectoryHandle('envelopes');
    const fileHandle = await envelopesDir.getFileHandle(`${this.gcaseId}.db`);
    const file = await fileHandle.getFile();

    return file;
  }

  /**
   * Get recent activity from envelope
   */
  getRecentActivity(limit: number = 20): Array<{
    eventType: string;
    id: string;
    timestamp: string;
    description: string;
    value: number | null;
  }> {
    if (!this.db) return [];

    const stmt = this.db.prepare(`
      SELECT event_type, id, timestamp, description, value
      FROM v_recent_activity
      LIMIT ?
    `);

    const results: any[] = [];
    try {
      stmt.bind([limit]);
      while (stmt.step()) {
        const row = stmt.get([]);
        results.push({
          eventType: row[0],
          id: row[1],
          timestamp: row[2],
          description: row[3],
          value: row[4]
        });
      }
    } finally {
      stmt.finalize();
    }

    return results;
  }

  /**
   * Verify envelope integrity
   */
  async verify(): Promise<{ valid: boolean; errors: string[] }> {
    if (!this.writer) {
      return { valid: false, errors: ['No envelope writer available'] };
    }

    return this.writer.verifyChain();
  }

  /**
   * Get the underlying database instance (for direct queries)
   */
  getDatabase(): any | null {
    return this.db;
  }

  /**
   * Check if envelope is open
   */
  isOpen(): boolean {
    return this.db !== null;
  }

  /**
   * Get the OPFS path for this envelope
   */
  getOpfsPath(): string | null {
    return this.opfsPath;
  }

  /**
   * Get the GCase ID this envelope is linked to
   */
  getGCaseId(): string | null {
    return this.gcaseId;
  }
}

/**
 * Singleton envelope manager instance
 */
export const envelopeManager = new EnvelopeManager();
