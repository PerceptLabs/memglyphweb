/**
 * EnvelopeWriter - Append-only hash-chained writes to Envelope DB
 *
 * Manages the integrity chain for all Envelope appends:
 * - Computes SHA-256 hash of each append
 * - Links to parent hash (Merkle chain)
 * - Updates _env_chain table
 * - Provides verification methods
 */

export type EnvelopeTable = 'retrieval_log' | 'embeddings' | 'feedback' | 'summaries';

export interface EnvelopeAppend {
  table: EnvelopeTable;
  data: RetrievalLogData | EmbeddingData | FeedbackData | SummaryData;
}

export interface RetrievalLogData {
  id: string;
  query_text: string;
  query_type: 'fts' | 'vector' | 'hybrid' | 'graph';
  top_docs?: Array<{ gid: string; score: number; snippet?: string }>;
  hit_count: number;
}

export interface EmbeddingData {
  id: string;
  source: 'user_query' | 'llm_response' | 'context_window' | 'feedback_cluster';
  vector: Float32Array;
  metadata?: Record<string, any>;
}

export interface FeedbackData {
  id: string;
  retrieval_id?: string;
  rating: -1 | 0 | 1;
  notes?: string;
}

export interface SummaryData {
  id: string;
  summary: string;
  relevance: number;
  source_retrievals?: string[];
}

export interface ChainBlock {
  seq: number;
  block_hash: string;
  parent_hash: string;
  block_type: string;
  row_count: number;
  created_at: string;
}

/**
 * Hash computation for envelope entries
 */
async function computeHash(data: {
  table: string;
  rowId: string;
  data: any;
  parentHash: string;
  timestamp: string;
}): Promise<string> {
  // Serialize data deterministically
  const payload = JSON.stringify({
    table: data.table,
    id: data.rowId,
    data: serializeForHash(data.data),
    parent: data.parentHash,
    ts: data.timestamp
  });

  // Compute SHA-256
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Serialize data for hashing (handles special types)
 */
function serializeForHash(data: any): any {
  if (data instanceof Float32Array) {
    return { __type: 'Float32Array', values: Array.from(data) };
  }
  if (Array.isArray(data)) {
    return data.map(serializeForHash);
  }
  if (data && typeof data === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = serializeForHash(value);
    }
    return result;
  }
  return data;
}

/**
 * EnvelopeWriter - manages append-only writes with hash chain
 */
export class EnvelopeWriter {
  private lastHash: string;
  private db: any; // SQLite database instance
  private genesis = '0'.repeat(64); // Genesis hash for first append

  constructor(db: any, initialHash?: string) {
    this.db = db;
    this.lastHash = initialHash || this.genesis;
  }

  /**
   * Get current chain head hash
   */
  getCurrentHash(): string {
    return this.lastHash;
  }

  /**
   * Append a retrieval log entry
   */
  async appendRetrieval(data: RetrievalLogData): Promise<string> {
    const timestamp = new Date().toISOString();
    const hash = await computeHash({
      table: 'retrieval_log',
      rowId: data.id,
      data,
      parentHash: this.lastHash,
      timestamp
    });

    // Insert into retrieval log
    const stmt = this.db.prepare(`
      INSERT INTO env_retrieval_log
      (id, query_text, query_type, top_docs, hit_count, parent_hash, ts)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.bind([
        data.id,
        data.query_text,
        data.query_type,
        data.top_docs ? JSON.stringify(data.top_docs) : null,
        data.hit_count,
        this.lastHash,
        timestamp
      ]);
      stmt.step();
    } finally {
      stmt.finalize();
    }

    // Record in chain
    await this.recordChainBlock(hash, 'retrieval', 1);

    this.lastHash = hash;
    return hash;
  }

  /**
   * Append an embedding entry
   */
  async appendEmbedding(data: EmbeddingData): Promise<string> {
    const timestamp = new Date().toISOString();
    const hash = await computeHash({
      table: 'embeddings',
      rowId: data.id,
      data,
      parentHash: this.lastHash,
      timestamp
    });

    // Convert Float32Array to Blob
    const vectorBlob = new Uint8Array(data.vector.buffer);

    // Insert into embeddings
    const stmt = this.db.prepare(`
      INSERT INTO env_embeddings
      (id, source, vector, metadata, parent_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.bind([
        data.id,
        data.source,
        vectorBlob,
        data.metadata ? JSON.stringify(data.metadata) : null,
        this.lastHash,
        timestamp
      ]);
      stmt.step();
    } finally {
      stmt.finalize();
    }

    // Record in chain
    await this.recordChainBlock(hash, 'embedding', 1);

    this.lastHash = hash;
    return hash;
  }

  /**
   * Append a feedback entry
   */
  async appendFeedback(data: FeedbackData): Promise<string> {
    const timestamp = new Date().toISOString();
    const hash = await computeHash({
      table: 'feedback',
      rowId: data.id,
      data,
      parentHash: this.lastHash,
      timestamp
    });

    // Insert into feedback
    const stmt = this.db.prepare(`
      INSERT INTO env_feedback
      (id, retrieval_id, rating, notes, parent_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.bind([
        data.id,
        data.retrieval_id || null,
        data.rating,
        data.notes || null,
        this.lastHash,
        timestamp
      ]);
      stmt.step();
    } finally {
      stmt.finalize();
    }

    // Record in chain
    await this.recordChainBlock(hash, 'feedback', 1);

    this.lastHash = hash;
    return hash;
  }

  /**
   * Append a context summary entry
   */
  async appendSummary(data: SummaryData): Promise<string> {
    const timestamp = new Date().toISOString();
    const hash = await computeHash({
      table: 'summaries',
      rowId: data.id,
      data,
      parentHash: this.lastHash,
      timestamp
    });

    // Insert into summaries
    const stmt = this.db.prepare(`
      INSERT INTO env_context_summaries
      (id, summary, relevance, source_retrievals, parent_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.bind([
        data.id,
        data.summary,
        data.relevance,
        data.source_retrievals ? JSON.stringify(data.source_retrievals) : null,
        this.lastHash,
        timestamp
      ]);
      stmt.step();
    } finally {
      stmt.finalize();
    }

    // Record in chain
    await this.recordChainBlock(hash, 'summary', 1);

    this.lastHash = hash;
    return hash;
  }

  /**
   * Record a block in the hash chain
   */
  private async recordChainBlock(
    blockHash: string,
    blockType: string,
    rowCount: number
  ): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO _env_chain (block_hash, parent_hash, block_type, row_count)
      VALUES (?, ?, ?, ?)
    `);

    try {
      stmt.bind([blockHash, this.lastHash, blockType, rowCount]);
      stmt.step();

      // Get the sequence number that was just inserted
      const seqStmt = this.db.prepare('SELECT last_insert_rowid()');
      try {
        seqStmt.step();
        const seq = seqStmt.get([])[0];

        // Update the last record with the sequence number
        const updateStmt = this.db.prepare(`
          UPDATE env_${blockType === 'retrieval' ? 'retrieval_log' :
                        blockType === 'embedding' ? 'embeddings' :
                        blockType === 'feedback' ? 'feedback' : 'context_summaries'}
          SET seq = ?
          WHERE parent_hash = ?
        `);
        try {
          updateStmt.bind([seq, this.lastHash]);
          updateStmt.step();
        } finally {
          updateStmt.finalize();
        }
      } finally {
        seqStmt.finalize();
      }
    } finally {
      stmt.finalize();
    }

    // Update last_hash in metadata
    const metaStmt = this.db.prepare(`
      INSERT OR REPLACE INTO _envelope_meta (key, value) VALUES ('last_hash', ?)
    `);
    try {
      metaStmt.bind([blockHash]);
      metaStmt.step();
    } finally {
      metaStmt.finalize();
    }
  }

  /**
   * Verify the integrity of the hash chain
   */
  async verifyChain(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Get all chain blocks
    const stmt = this.db.prepare(`
      SELECT seq, block_hash, parent_hash, block_type
      FROM _env_chain
      ORDER BY seq ASC
    `);

    const blocks: ChainBlock[] = [];
    try {
      while (stmt.step()) {
        const row = stmt.get([]);
        blocks.push({
          seq: row[0],
          block_hash: row[1],
          parent_hash: row[2],
          block_type: row[3],
          row_count: 0,
          created_at: ''
        });
      }
    } finally {
      stmt.finalize();
    }

    // Verify chain linkage
    for (let i = 1; i < blocks.length; i++) {
      const current = blocks[i];
      const previous = blocks[i - 1];

      if (current.parent_hash !== previous.block_hash) {
        errors.push(
          `Chain break at seq ${current.seq}: parent_hash ${current.parent_hash} ` +
          `does not match previous block_hash ${previous.block_hash}`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get chain statistics
   */
  getChainStats(): {
    length: number;
    currentHash: string;
    types: Record<string, number>;
  } {
    const stmt = this.db.prepare(`
      SELECT block_type, COUNT(*) as count
      FROM _env_chain
      GROUP BY block_type
    `);

    const types: Record<string, number> = {};
    try {
      while (stmt.step()) {
        const row = stmt.get([]);
        types[row[0]] = row[1];
      }
    } finally {
      stmt.finalize();
    }

    const lengthStmt = this.db.prepare('SELECT COUNT(*) FROM _env_chain');
    let length = 0;
    try {
      lengthStmt.step();
      length = lengthStmt.get([])[0];
    } finally {
      lengthStmt.finalize();
    }

    return {
      length,
      currentHash: this.lastHash,
      types
    };
  }
}

/**
 * Generate a unique ID for envelope entries
 */
export function generateEnvelopeId(prefix: string = 'env'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `${prefix}_${timestamp}_${random}`;
}
