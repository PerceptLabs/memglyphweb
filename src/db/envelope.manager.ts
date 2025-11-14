/**
 * EnvelopeManager - Manages Envelope runtime sidecar
 *
 * CANONICAL FORMAT: A .gcase+ file is ALWAYS one self-contained SQLite file
 * containing both Core and Envelope tables in a single database.
 *
 * RUNTIME IMPLEMENTATION: For browser performance and SQLite concurrency,
 * this manager uses an OPFS sidecar as a write buffer for Envelope tables.
 * The sidecar is an invisible implementation detail that gets merged back
 * into the canonical .gcase+ file on export.
 *
 * Handles:
 * - Creating/loading envelope sidecar in OPFS (runtime write buffer)
 * - Linking sidecar to Core capsule via SHA-256 hash
 * - Schema initialization in sidecar
 * - Merging sidecar back to canonical format on export
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
 * EnvelopeManager - Lifecycle management for Envelope runtime sidecar
 *
 * The sidecar is a temporary OPFS write buffer. The canonical .gcase+ file
 * is always a single SQLite file with Core + Envelope tables merged together.
 */
export class EnvelopeManager {
  private db: any | null = null; // OPFS sidecar database (runtime write buffer)
  private writer: EnvelopeWriter | null = null;
  private gcaseId: string | null = null; // SHA-256 hash of Core capsule
  private opfsPath: string | null = null; // Path to sidecar in OPFS
  private sqlite3: any | null = null; // SQLite3 instance (for merge operations)

  /**
   * Check if a runtime sidecar exists for a given capsule
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
   * Create a new runtime sidecar for a capsule
   *
   * NOTE: This creates a temporary OPFS write buffer, not the canonical format.
   * Use exportGlyphCase() to get the canonical single-file .gcase+ format.
   */
  async create(capsuleFile: File, sqlite3: any): Promise<void> {
    this.sqlite3 = sqlite3; // Store for later use
    this.gcaseId = await computeCapsuleHash(capsuleFile);
    this.opfsPath = `/envelopes/${this.gcaseId}.db`;

    // Create OPFS directory for sidecar if needed
    const opfsRoot = await navigator.storage.getDirectory();
    const envelopesDir = await opfsRoot.getDirectoryHandle('envelopes', { create: true });

    // Create new SQLite sidecar database in OPFS (runtime write buffer)
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
    this.sqlite3 = sqlite3; // Store for later use
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
   * Export sidecar as standalone SQLite file (for debugging/inspection)
   *
   * NOTE: This exports the runtime sidecar, NOT the canonical .gcase+ format.
   * For canonical export, use GlyphCaseManager.exportGlyphCase() which merges
   * Core + Envelope into a single self-contained file.
   *
   * This method is useful for debugging or feeding to remint tooling.
   */
  async exportSidecar(): Promise<Blob> {
    if (!this.db || !this.opfsPath) {
      throw new Error('No envelope sidecar open');
    }

    // Read the OPFS sidecar file
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

  /**
   * Merge Core database with Envelope sidecar into canonical .gcase+ format
   *
   * Creates a single self-contained SQLite file with both Core and Envelope tables.
   * This is the CANONICAL export format per the GlyphCase specification.
   *
   * @param coreBytes - Raw bytes of the Core SQLite database
   * @returns Blob containing the merged .gcase+ database
   */
  async mergeWithCore(coreBytes: Uint8Array): Promise<Blob> {
    if (!this.db || !this.opfsPath || !this.sqlite3) {
      throw new Error('No envelope sidecar open or sqlite3 not available');
    }

    console.log(`[Envelope] Merging Core (${coreBytes.byteLength} bytes) with Envelope sidecar...`);

    // Create a new in-memory database for the merged result
    const mergedDb = new this.sqlite3.oo1.DB(':memory:');

    try {
      // Import Core database into the merged DB
      const rc = this.sqlite3.capi.sqlite3_deserialize(
        mergedDb.pointer,
        'main',
        coreBytes,
        coreBytes.byteLength,
        coreBytes.byteLength,
        this.sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
        this.sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE
      );

      if (rc !== 0) {
        throw new Error(`Failed to deserialize Core database: ${rc}`);
      }

      console.log('[Envelope] Core database loaded into memory');

      // ATTACH the envelope sidecar
      mergedDb.exec(`ATTACH DATABASE '${this.opfsPath}' AS envelope`);
      console.log('[Envelope] Attached sidecar database');

      // Copy all envelope tables from sidecar to merged DB
      const envelopeTables = [
        '_envelope_meta',
        '_env_chain',
        'env_retrieval_log',
        'env_embeddings',
        'env_feedback',
        'env_context_summaries'
      ];

      for (const table of envelopeTables) {
        // Get CREATE statement
        const createStmt = mergedDb.prepare(`
          SELECT sql FROM envelope.sqlite_master
          WHERE type='table' AND name=?
        `);

        try {
          createStmt.bind([table]);
          if (createStmt.step()) {
            const createSql = createStmt.get([])[0];
            if (createSql) {
              // Create table in main DB
              mergedDb.exec(createSql);
              console.log(`[Envelope] Created table: ${table}`);

              // Copy data
              mergedDb.exec(`INSERT INTO main.${table} SELECT * FROM envelope.${table}`);
              const countStmt = mergedDb.prepare(`SELECT COUNT(*) FROM main.${table}`);
              try {
                countStmt.step();
                const count = countStmt.get([])[0];
                console.log(`[Envelope] Copied ${count} rows to ${table}`);
              } finally {
                countStmt.finalize();
              }
            }
          }
        } finally {
          createStmt.finalize();
        }
      }

      // Copy envelope views
      const views = ['v_recent_activity', 'v_envelope_stats', 'v_search_analytics', 'v_zero_result_queries'];
      for (const view of views) {
        const viewStmt = mergedDb.prepare(`
          SELECT sql FROM envelope.sqlite_master
          WHERE type='view' AND name=?
        `);

        try {
          viewStmt.bind([view]);
          if (viewStmt.step()) {
            const viewSql = viewStmt.get([])[0];
            if (viewSql) {
              mergedDb.exec(viewSql);
              console.log(`[Envelope] Created view: ${view}`);
            }
          }
        } finally {
          viewStmt.finalize();
        }
      }

      // Copy indexes
      const indexStmt = mergedDb.prepare(`
        SELECT sql FROM envelope.sqlite_master
        WHERE type='index' AND sql IS NOT NULL
      `);

      try {
        while (indexStmt.step()) {
          const indexSql = indexStmt.get([])[0];
          if (indexSql) {
            try {
              mergedDb.exec(indexSql);
            } catch (err) {
              console.warn(`[Envelope] Index already exists or failed:`, err);
            }
          }
        }
      } finally {
        indexStmt.finalize();
      }

      // DETACH sidecar
      mergedDb.exec('DETACH DATABASE envelope');
      console.log('[Envelope] Detached sidecar');

      // Export merged database as bytes
      const exportedBytes = this.sqlite3.capi.sqlite3_js_db_export(mergedDb.pointer);

      if (!exportedBytes) {
        throw new Error('Failed to export merged database');
      }

      console.log(`[Envelope] Merged database exported: ${exportedBytes.byteLength} bytes`);

      // Return as Blob
      return new Blob([exportedBytes], { type: 'application/x-sqlite3' });

    } finally {
      // Close merged DB
      mergedDb.close();
    }
  }
}

/**
 * Singleton envelope manager instance
 */
export const envelopeManager = new EnvelopeManager();
