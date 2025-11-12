-- GlyphCase Envelope Schema v1.1
-- Append-only episodic memory layer for Dynamic GlyphCases
-- This schema represents the mutable, hash-chained memory buffer
-- that sits alongside the immutable Core.

-- ============================================================================
-- METADATA
-- ============================================================================

-- Envelope metadata and configuration
CREATE TABLE IF NOT EXISTS _envelope_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

-- Core metadata values:
-- 'gcase_id' - SHA256 hash of the Core capsule this envelope is linked to
-- 'created_at' - ISO8601 timestamp of envelope creation
-- 'format_version' - Envelope schema version (1.1)
-- 'last_hash' - Most recent hash in the chain

-- ============================================================================
-- HASH CHAIN (Merkle Integrity)
-- ============================================================================

-- Hash chain for append-only integrity verification
-- Each block represents a batch of appends with a Merkle root
CREATE TABLE IF NOT EXISTS _env_chain (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  block_hash TEXT NOT NULL UNIQUE,
  parent_hash TEXT NOT NULL,
  block_type TEXT NOT NULL, -- 'retrieval' | 'embedding' | 'feedback' | 'summary'
  row_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_chain_block_type ON _env_chain(block_type);
CREATE INDEX IF NOT EXISTS idx_chain_created_at ON _env_chain(created_at);

-- ============================================================================
-- RETRIEVAL LOGS
-- ============================================================================

-- Logs every search/retrieval operation performed
-- Enables learning from query patterns and improving relevance
CREATE TABLE IF NOT EXISTS env_retrieval_log (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL REFERENCES _env_chain(seq),
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  query_text TEXT NOT NULL,
  query_type TEXT NOT NULL CHECK(query_type IN ('fts', 'vector', 'hybrid', 'graph')),
  top_docs TEXT, -- JSON array of {gid, score, snippet}
  hit_count INTEGER NOT NULL DEFAULT 0,
  parent_hash TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_retrieval_ts ON env_retrieval_log(ts);
CREATE INDEX IF NOT EXISTS idx_retrieval_type ON env_retrieval_log(query_type);
CREATE INDEX IF NOT EXISTS idx_retrieval_query ON env_retrieval_log(query_text);

-- ============================================================================
-- CONTEXTUAL EMBEDDINGS
-- ============================================================================

-- Runtime-generated embeddings for queries, responses, and context
-- Provides adaptive semantic memory beyond the canonical Core vectors
CREATE TABLE IF NOT EXISTS env_embeddings (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL REFERENCES _env_chain(seq),
  source TEXT NOT NULL, -- 'user_query' | 'llm_response' | 'context_window' | 'feedback_cluster'
  vector BLOB NOT NULL,
  metadata TEXT, -- JSON metadata about this embedding
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  parent_hash TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_embeddings_source ON env_embeddings(source);
CREATE INDEX IF NOT EXISTS idx_embeddings_created ON env_embeddings(created_at);

-- ============================================================================
-- USER FEEDBACK
-- ============================================================================

-- User ratings and feedback on retrievals and responses
-- Enables learning from human signals and improving relevance over time
CREATE TABLE IF NOT EXISTS env_feedback (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL REFERENCES _env_chain(seq),
  retrieval_id TEXT REFERENCES env_retrieval_log(id),
  rating INTEGER NOT NULL CHECK(rating IN (-1, 0, 1)), -- -1 (bad) | 0 (neutral) | 1 (good)
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  parent_hash TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_feedback_rating ON env_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_feedback_retrieval ON env_feedback(retrieval_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON env_feedback(created_at);

-- ============================================================================
-- CONTEXT SUMMARIES
-- ============================================================================

-- LLM-generated context summaries and insights
-- Captures high-level understanding and reasoning patterns
CREATE TABLE IF NOT EXISTS env_context_summaries (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL REFERENCES _env_chain(seq),
  summary TEXT NOT NULL,
  relevance REAL NOT NULL CHECK(relevance >= 0.0 AND relevance <= 1.0),
  source_retrievals TEXT, -- JSON array of retrieval_log IDs
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  parent_hash TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_summaries_relevance ON env_context_summaries(relevance);
CREATE INDEX IF NOT EXISTS idx_summaries_created ON env_context_summaries(created_at);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Recent activity view (last 100 events)
CREATE VIEW IF NOT EXISTS v_recent_activity AS
SELECT
  'retrieval' as event_type,
  id,
  ts as timestamp,
  query_text as description,
  hit_count as value
FROM env_retrieval_log
UNION ALL
SELECT
  'feedback' as event_type,
  id,
  created_at as timestamp,
  notes as description,
  rating as value
FROM env_feedback
UNION ALL
SELECT
  'summary' as event_type,
  id,
  created_at as timestamp,
  substr(summary, 1, 100) as description,
  relevance as value
FROM env_context_summaries
ORDER BY timestamp DESC
LIMIT 100;

-- Envelope statistics view
CREATE VIEW IF NOT EXISTS v_envelope_stats AS
SELECT
  (SELECT COUNT(*) FROM env_retrieval_log) as retrieval_count,
  (SELECT COUNT(*) FROM env_embeddings) as embedding_count,
  (SELECT COUNT(*) FROM env_feedback) as feedback_count,
  (SELECT COUNT(*) FROM env_context_summaries) as summary_count,
  (SELECT COUNT(*) FROM _env_chain) as chain_length,
  (SELECT MIN(ts) FROM env_retrieval_log) as first_activity,
  (SELECT MAX(ts) FROM env_retrieval_log) as last_activity;
