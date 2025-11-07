import type { FtsResult, VectorResult, HybridResult, EntityFacet, PageInfo, Checkpoint, VerificationResult, FusionWeights } from './types';

// Default fusion weights for hybrid search
export const DEFAULT_FUSION_WEIGHTS: FusionWeights = {
  fts: 0.35,
  vector: 0.40,
  entity: 0.15,
  graph: 0.10
};

// SQL Queries
export const QUERIES = {
  // FTS Search with BM25 ranking
  FTS_SEARCH: `
    SELECT
      m.gid,
      m.page_no,
      m.title,
      snippet(meta_fts, 3, '<mark>', '</mark>', '…', 18) AS snippet,
      meta_fts.rank,
      (1.0 / (ABS(meta_fts.rank) + 1.0)) AS score
    FROM meta_fts
    JOIN meta_index m ON m.rowid = meta_fts.rowid
    WHERE meta_fts MATCH ?
    ORDER BY meta_fts.rank
    LIMIT ?
  `,

  // List entity facets
  LIST_ENTITY_FACETS: `
    SELECT
      entity_type,
      normalized_value,
      COUNT(*) AS count
    FROM entities
    WHERE entity_type = COALESCE(?, entity_type)
    GROUP BY entity_type, normalized_value
    ORDER BY count DESC, entity_type, normalized_value
    LIMIT ?
  `,

  // Get all entity types
  LIST_ENTITY_TYPES: `
    SELECT DISTINCT entity_type, COUNT(*) AS count
    FROM entities
    GROUP BY entity_type
    ORDER BY count DESC
  `,

  // Get page list
  GET_PAGE_LIST: `
    SELECT
      gid,
      doc_id,
      page_no,
      title,
      tags,
      updated_ts
    FROM meta_index
    ORDER BY page_no
    LIMIT ? OFFSET ?
  `,

  // Get page blob from SQLAR
  GET_PAGE_BLOB: `
    SELECT data, sz
    FROM sqlar
    WHERE name = ?
    LIMIT 1
  `,

  // Get vector metadata for a page
  GET_VECTOR_META: `
    SELECT gid, model_id, dim
    FROM leann_meta
    WHERE gid = ? AND model_id = ?
    LIMIT 1
  `,

  // Get cached vector
  GET_CACHED_VECTOR: `
    SELECT embedding
    FROM leann_vec
    WHERE gid = ? AND model_id = ?
    LIMIT 1
  `,

  // Get all cached vectors for similarity search
  GET_ALL_VECTORS: `
    SELECT
      lm.gid,
      lm.page_no,
      m.title,
      lv.embedding
    FROM leann_vec lv
    JOIN leann_meta lm ON lm.gid = lv.gid AND lm.model_id = lv.model_id
    JOIN meta_index m ON m.gid = lm.gid
    WHERE lv.model_id = ?
    ORDER BY lm.page_no
  `,

  // Get entities for a specific page
  GET_PAGE_ENTITIES: `
    SELECT
      entity_type,
      entity_text,
      normalized_value,
      confidence
    FROM entities
    WHERE gid = ?
    ORDER BY confidence DESC
  `,

  // Get checkpoints
  GET_CHECKPOINTS: `
    SELECT
      epoch,
      merkle_root,
      pages_count,
      anchors_json,
      created_ts
    FROM checkpoints
    ORDER BY epoch DESC
  `,

  // Verify page
  VERIFY_PAGE: `
    SELECT
      gr.gid,
      gr.content_sha,
      gr.signer,
      gr.sig,
      gr.epoch,
      gr.merkle_root,
      m.full_text
    FROM glyph_receipts gr
    JOIN meta_index m ON m.gid = gr.gid
    WHERE gr.gid = ?
    LIMIT 1
  `,

  // Get graph neighbors (1-hop)
  GET_GRAPH_NEIGHBORS: `
    SELECT
      n2.gid,
      n2.page_no,
      m.title,
      e.pred,
      e.weight
    FROM node_index n1
    JOIN edges e ON e.fromNode = n1.node_id
    JOIN node_index n2 ON n2.node_id = e.toNode
    JOIN meta_index m ON m.gid = n2.gid
    WHERE n1.gid = ?
    ORDER BY e.weight DESC
    LIMIT ?
  `
};

// Helper: Cosine similarity between two float32 arrays
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

// Helper: Normalize scores to 0-1 range
export function normalizeScores(scores: number[]): number[] {
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min;

  if (range === 0) return scores.map(() => 0.5);

  return scores.map(s => (s - min) / range);
}

// Helper: SHA256 hash (simple implementation for verification)
export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Helper: Parse JSON safely
export function parseJsonSafe<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

// Helper: Unpack float32 vector from blob
export function unpackVector(blob: Uint8Array): Float32Array {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}
