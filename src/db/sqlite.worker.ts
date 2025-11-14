/// <reference lib="webworker" />

import type {
  WorkerRequest,
  WorkerResponse,
  RpcRequest,
  RpcResponse,
  CapsuleInfo,
  FtsResult,
  VectorResult,
  HybridResult,
  EntityFacet,
  PageInfo,
  Checkpoint,
  VerificationResult,
  OpfsFileInfo,
} from './rpc-contract';
import {
  validateWorkerRequest,
  successResponse,
  errorResponse,
} from './rpc-contract';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { QUERIES, cosineSimilarity, unpackVector, parseJsonSafe, sha256, DEFAULT_FUSION_WEIGHTS } from './queries';
import {
  readFileFromOpfs,
  removeFileFromOpfs,
  listOpfsFiles,
  isOpfsSupported,
} from './opfs';
import { VectorIndex, type VectorEntry } from './vector-index';
const REQUIRED_TABLES = [
  'sqlar',
  'meta_index',
  'meta_fts',
  'entities',
  'node_index',
  'edges',
  'ledger_blocks',
  'checkpoints',
  'keys'
];

// Query safety limits
// TODO: Timeout enforcement requires async wrapper around synchronous SQLite ops
// For now, MAX_QUERY_RESULTS and MAX_FTS_RESULTS provide protection against runaway queries
const QUERY_TIMEOUT_MS = 10000; // 10 seconds max per query (aspirational)
const MAX_QUERY_RESULTS = 10000; // Maximum rows returned per query
const MAX_FTS_RESULTS = 1000; // Maximum FTS search results

let db: any = null;
let sqlite3: any = null;
let currentCapsuleInfo: CapsuleInfo | null = null;
let vectorIndex: VectorIndex | null = null;

// Initialize SQLite WASM
async function initSqlite() {
  if (sqlite3) return;

  console.log('[Worker] Initializing SQLite WASM...');

  sqlite3 = await sqlite3InitModule({
    print: console.log,
    printErr: console.error,
  });

  console.log('[Worker] SQLite WASM initialized:', sqlite3.version.libVersion);
}

// Validate schema
function validateSchema(): { valid: boolean; missing: string[] } {
  if (!db) return { valid: false, missing: ['no database open'] };

  const tables = new Set<string>();
  const stmt = db.prepare('SELECT name FROM sqlite_master WHERE type="table"');

  try {
    while (stmt.step()) {
      tables.add(stmt.get([])[0]);
    }
  } finally {
    stmt.finalize();
  }

  const missing = REQUIRED_TABLES.filter(t => !tables.has(t));
  return { valid: missing.length === 0, missing };
}

// Get capsule metadata
async function getCapsuleInfo(fileName: string, fileSize: number, opfsPath?: string): Promise<CapsuleInfo> {
  if (!db) throw new Error('No database open');

  // Get doc_id from first page
  let docId = 'unknown';
  let stmt = db.prepare('SELECT doc_id FROM meta_index LIMIT 1');
  try {
    if (stmt.step()) {
      docId = stmt.get([])[0];
    }
  } finally {
    stmt.finalize();
  }

  // Count pages
  stmt = db.prepare('SELECT COUNT(*) FROM meta_index');
  let pageCount = 0;
  try {
    if (stmt.step()) {
      pageCount = stmt.get([])[0];
    }
  } finally {
    stmt.finalize();
  }

  // Count entities
  stmt = db.prepare('SELECT COUNT(*) FROM entities');
  let entityCount = 0;
  try {
    if (stmt.step()) {
      entityCount = stmt.get([])[0];
    }
  } finally {
    stmt.finalize();
  }

  // Count edges
  stmt = db.prepare('SELECT COUNT(*) FROM edges');
  let edgeCount = 0;
  try {
    if (stmt.step()) {
      edgeCount = stmt.get([])[0];
    }
  } finally {
    stmt.finalize();
  }

  // Check for vectors
  let hasVectors = false;
  let vectorModel: string | undefined;
  let vectorDim: number | undefined;

  stmt = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name='leann_vec'
  `);
  try {
    if (stmt.step()) {
      hasVectors = true;

      // Get vector metadata
      const metaStmt = db.prepare('SELECT model_id, dim FROM leann_meta LIMIT 1');
      try {
        if (metaStmt.step()) {
          const row = metaStmt.get([]);
          vectorModel = row[0];
          vectorDim = row[1];
        }
      } finally {
        metaStmt.finalize();
      }
    }
  } finally {
    stmt.finalize();
  }

  const capsuleInfo = {
    fileName,
    fileSize,
    docId,
    pageCount,
    entityCount,
    edgeCount,
    hasVectors,
    vectorModel,
    vectorDim,
    opfsPath,
  };

  // Build vector index if capsule has vectors
  if (hasVectors) {
    await buildVectorIndex();
  }

  return capsuleInfo;
}

// Build vector index from leann_vec table
async function buildVectorIndex(): Promise<void> {
  if (!db || !currentCapsuleInfo?.hasVectors) return;

  try {
    const startTime = performance.now();
    console.log('[Worker] Building vector index...');

    // Clear existing index
    if (vectorIndex) {
      vectorIndex.clear();
    }

    // Create new index
    vectorIndex = new VectorIndex(100); // 100 clusters

    // Load all vectors from leann_vec
    const entries: VectorEntry[] = [];
    const model = currentCapsuleInfo.vectorModel || 'gte-small-384';

    const stmt = db.prepare(`
      SELECT lv.gid, lv.embedding, m.page_no, m.title
      FROM leann_vec lv
      JOIN meta_index m ON m.gid = lv.gid
      WHERE lv.model_id = ?
      LIMIT 10000
    `);

    try {
      stmt.bind([model]);

      while (stmt.step()) {
        const row = stmt.get([]);
        const vector = unpackVector(row[1]);
        entries.push({
          gid: row[0],
          vector,
          metadata: {
            pageNo: row[2],
            title: row[3]
          }
        });
      }
    } finally {
      stmt.finalize();
    }

    // Build index
    await vectorIndex.build(entries);

    const buildTime = performance.now() - startTime;
    const stats = vectorIndex.getStats();
    console.log(`[Worker] Vector index built in ${buildTime.toFixed(1)}ms:`, stats);
  } catch (error) {
    console.error('[Worker] Failed to build vector index:', error);
    vectorIndex = null;
  }
}

// Open capsule from File
async function openFromFile(file: File): Promise<RpcResponse<CapsuleInfo>> {
  try {
    // Read file into Uint8Array
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Close existing database
    if (db) {
      db.close();
      db = null;
    }

    // Open in-memory database
    db = new sqlite3.oo1.DB(':memory:');

    // Deserialize the database
    const rc = sqlite3.capi.sqlite3_deserialize(
      db.pointer,
      'main',
      bytes,
      bytes.length,
      bytes.length,
      sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
      sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE
    );

    if (rc !== sqlite3.capi.SQLITE_OK) {
      throw new Error(`Failed to deserialize database: ${rc}`);
    }

    // Validate schema
    const validation = validateSchema();
    if (!validation.valid) {
      throw new Error(`Invalid schema. Missing tables: ${validation.missing.join(', ')}`);
    }

    // Get metadata
    const info = await getCapsuleInfo(file.name, file.size);
    currentCapsuleInfo = info;

    console.log('[Worker] Capsule opened:', info);

    return { ok: true, data: info };
  } catch (error) {
    console.error('[Worker] Failed to open capsule:', error);
    return { ok: false, error: String(error) };
  }
}

// Open demo capsule
async function openDemo(): Promise<RpcResponse<CapsuleInfo>> {
  try {
    // Fetch demo capsule from public folder
    const response = await fetch('/memglyph-demo.mgx.sqlite');
    if (!response.ok) {
      throw new Error(`Failed to fetch demo capsule: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: 'application/x-sqlite3' });
    const file = new File([blob], 'memglyph-demo.mgx.sqlite', { type: 'application/x-sqlite3' });

    return await openFromFile(file);
  } catch (error) {
    console.error('[Worker] Failed to open demo capsule:', error);
    return { ok: false, error: String(error) };
  }
}

// Open capsule from OPFS
async function openFromOpfs(path: string): Promise<RpcResponse<CapsuleInfo>> {
  try {
    if (!isOpfsSupported()) {
      throw new Error('OPFS not supported in this browser');
    }

    // Read file from OPFS
    const bytes = await readFileFromOpfs(path);

    // Close existing database
    if (db) {
      db.close();
      db = null;
    }

    // Open in-memory database
    db = new sqlite3.oo1.DB(':memory:');

    // Deserialize the database
    const rc = sqlite3.capi.sqlite3_deserialize(
      db.pointer,
      'main',
      bytes,
      bytes.length,
      bytes.length,
      sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
      sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE
    );

    if (rc !== sqlite3.capi.SQLITE_OK) {
      throw new Error(`Failed to deserialize database: ${rc}`);
    }

    // Validate schema
    const validation = validateSchema();
    if (!validation.valid) {
      throw new Error(`Invalid schema. Missing tables: ${validation.missing.join(', ')}`);
    }

    // Get metadata (include OPFS path)
    const info = await getCapsuleInfo(path, bytes.length, path);
    currentCapsuleInfo = info;

    console.log('[Worker] Capsule opened from OPFS:', info);

    return successResponse(info);
  } catch (error) {
    console.error('[Worker] Failed to open capsule from OPFS:', error);
    return errorResponse(error as Error);
  }
}

// Save current database to OPFS
async function saveToOpfs(path: string): Promise<RpcResponse<void>> {
  try {
    if (!db) {
      throw new Error('No database open');
    }

    if (!isOpfsSupported()) {
      throw new Error('OPFS not supported in this browser');
    }

    // Serialize the database
    const serialized = sqlite3.capi.sqlite3_serialize(
      db.pointer,
      'main',
      0,
      0
    );

    if (!serialized) {
      throw new Error('Failed to serialize database');
    }

    // Note: In a worker context, we can't directly write to OPFS from here
    // The main thread needs to handle the actual OPFS write
    // So we'll send the data back via a different mechanism
    throw new Error('SAVE_TO_OPFS should be handled by main thread, not worker');

  } catch (error) {
    console.error('[Worker] Failed to save to OPFS:', error);
    return errorResponse(error as Error);
  }
}

// Remove file from OPFS
async function removeFromOpfsHandler(path: string): Promise<RpcResponse<void>> {
  try {
    if (!isOpfsSupported()) {
      throw new Error('OPFS not supported in this browser');
    }

    await removeFileFromOpfs(path);

    console.log(`[Worker] Removed file from OPFS: ${path}`);

    return successResponse(undefined);
  } catch (error) {
    console.error('[Worker] Failed to remove file from OPFS:', error);
    return errorResponse(error as Error);
  }
}

// List files in OPFS
async function listOpfsFilesHandler(): Promise<RpcResponse<OpfsFileInfo[]>> {
  try {
    if (!isOpfsSupported()) {
      return successResponse([]);
    }

    const files = await listOpfsFiles();

    return successResponse(files);
  } catch (error) {
    console.error('[Worker] Failed to list OPFS files:', error);
    return errorResponse(error as Error);
  }
}

// Close database
function closeCapsule(): RpcResponse<void> {
  if (db) {
    db.close();
    db = null;
    currentCapsuleInfo = null;

    // Clear vector index
    if (vectorIndex) {
      vectorIndex.clear();
      vectorIndex = null;
    }

    return { ok: true, data: undefined };
  }
  return { ok: false, error: 'No database open' };
}

// FTS Search (with optional entity filtering)
function searchFts(
  query: string,
  limit: number,
  entityType?: string,
  entityValue?: string
): RpcResponse<FtsResult[]> {
  if (!db) return { ok: false, error: 'No database open' };

  // Clamp limit to prevent resource exhaustion
  const clampedLimit = Math.min(limit, MAX_FTS_RESULTS);

  const results: FtsResult[] = [];

  // Use entity-filtered query if filters are provided
  const useEntityFilter = entityType || entityValue;
  const sqlQuery = useEntityFilter ? QUERIES.FTS_SEARCH_WITH_ENTITIES : QUERIES.FTS_SEARCH;
  const stmt = db.prepare(sqlQuery);

  try {
    if (useEntityFilter) {
      // Bind parameters for entity-filtered query
      stmt.bind([
        query,
        entityType || null,
        entityType || null,
        entityValue || null,
        entityValue || null,
        clampedLimit
      ]);
    } else {
      // Bind parameters for regular FTS query
      stmt.bind([query, clampedLimit]);
    }

    while (stmt.step()) {
      const row = stmt.get([]);
      results.push({
        gid: row[0],
        pageNo: row[1],
        title: row[2],
        snippet: row[3],
        rank: row[4],
        score: row[5]
      });
    }

    return { ok: true, data: results };
  } catch (error) {
    return { ok: false, error: String(error) };
  } finally {
    stmt.finalize();
  }
}

// Vector Search (manual cosine similarity)
function searchVector(queryVector: Float32Array, limit: number): RpcResponse<VectorResult[]> {
  if (!db) return { ok: false, error: 'No database open' };
  if (!currentCapsuleInfo?.hasVectors) {
    return { ok: false, error: 'No vectors available in capsule' };
  }

  // Clamp limit to prevent resource exhaustion
  const clampedLimit = Math.min(limit, MAX_QUERY_RESULTS);

  const startTime = performance.now();

  // Use vector index if available (fast ANN search)
  if (vectorIndex) {
    const indexResults = vectorIndex.search(queryVector, clampedLimit);
    const results: VectorResult[] = indexResults.map(r => ({
      gid: r.gid,
      pageNo: r.metadata!.pageNo,
      title: r.metadata!.title,
      similarity: r.similarity
    }));

    const searchTime = performance.now() - startTime;
    console.log(`[Worker] Vector search (indexed): ${searchTime.toFixed(2)}ms, ${results.length} results`);

    return { ok: true, data: results };
  }

  // Fallback to brute force if no index
  console.log('[Worker] Vector search (brute force fallback)');
  const results: VectorResult[] = [];
  const model = currentCapsuleInfo.vectorModel || 'gte-small-384';

  // Get all cached vectors
  const stmt = db.prepare(QUERIES.GET_ALL_VECTORS);

  try {
    stmt.bind([model]);

    const candidates: Array<{
      gid: string;
      pageNo: number;
      title: string | null;
      vector: Float32Array;
    }> = [];

    while (stmt.step()) {
      const row = stmt.get([]);
      const embedding = unpackVector(row[3]);
      candidates.push({
        gid: row[0],
        pageNo: row[1],
        title: row[2],
        vector: embedding
      });
    }

    // Calculate similarities
    for (const candidate of candidates) {
      const similarity = cosineSimilarity(queryVector, candidate.vector);
      results.push({
        gid: candidate.gid,
        pageNo: candidate.pageNo,
        title: candidate.title,
        similarity
      });
    }

    // Sort by similarity (descending) and limit
    results.sort((a, b) => b.similarity - a.similarity);
    results.splice(clampedLimit);

    return { ok: true, data: results };
  } catch (error) {
    return { ok: false, error: String(error) };
  } finally {
    stmt.finalize();
  }
}

// Hybrid Search (FTS + Vector + Entity fusion)
function searchHybrid(query: string, limit: number, weights?: Partial<typeof DEFAULT_FUSION_WEIGHTS>): RpcResponse<HybridResult[]> {
  if (!db) return { ok: false, error: 'No database open' };

  // Clamp limit to prevent resource exhaustion
  const clampedLimit = Math.min(limit, MAX_QUERY_RESULTS);

  const fusionWeights = { ...DEFAULT_FUSION_WEIGHTS, ...weights };

  try {
    // Step 1: FTS Search
    const ftsResponse = searchFts(query, Math.min(clampedLimit * 3, 50));
    if (!ftsResponse.ok) return ftsResponse as RpcResponse<HybridResult[]>;
    const ftsResults = ftsResponse.data!;

    // Build candidate map
    const candidates = new Map<string, {
      gid: string;
      pageNo: number;
      title: string | null;
      snippet: string | null;
      ftsScore: number;
      vectorScore: number;
      entityScore: number;
      graphScore: number;
    }>();

    // Populate from FTS results
    for (const result of ftsResults) {
      candidates.set(result.gid, {
        gid: result.gid,
        pageNo: result.pageNo,
        title: result.title,
        snippet: result.snippet,
        ftsScore: result.score,
        vectorScore: 0,
        entityScore: 0,
        graphScore: 0
      });
    }

    // Step 2: Entity Boosting (simple: count matching entities)
    const entityQuery = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (entityQuery.length > 0) {
      for (const [gid, candidate] of candidates) {
        const entStmt = db.prepare(QUERIES.GET_PAGE_ENTITIES);
        try {
          entStmt.bind([gid]);
          let entityHits = 0;

          while (entStmt.step()) {
            const row = entStmt.get([]);
            const entityText = String(row[1]).toLowerCase();
            for (const term of entityQuery) {
              if (entityText.includes(term)) {
                entityHits++;
                break;
              }
            }
          }

          candidate.entityScore = Math.min(entityHits / 3, 1); // Normalize to 0-1
        } finally {
          entStmt.finalize();
        }
      }
    }

    // Step 3: Graph Boosting (neighbor hints)
    // For top N candidates, check if they're connected
    const topGids = Array.from(candidates.keys()).slice(0, Math.min(10, clampedLimit));
    for (const gid of topGids) {
      const candidate = candidates.get(gid)!;
      const graphStmt = db.prepare(QUERIES.GET_GRAPH_NEIGHBORS);
      try {
        graphStmt.bind([gid, 5]);
        let neighborCount = 0;

        while (graphStmt.step()) {
          const row = graphStmt.get([]);
          const neighborGid = row[0];
          if (candidates.has(neighborGid)) {
            neighborCount++;
          }
        }

        candidate.graphScore = Math.min(neighborCount / 3, 1); // Normalize
      } finally {
        graphStmt.finalize();
      }
    }

    // Step 4: Fusion Ranking
    const finalResults: HybridResult[] = [];

    for (const [_, candidate] of candidates) {
      const finalScore =
        fusionWeights.fts * candidate.ftsScore +
        fusionWeights.vector * candidate.vectorScore +
        fusionWeights.entity * candidate.entityScore +
        fusionWeights.graph * candidate.graphScore;

      finalResults.push({
        gid: candidate.gid,
        pageNo: candidate.pageNo,
        title: candidate.title,
        snippet: candidate.snippet,
        scores: {
          fts: candidate.ftsScore,
          vector: candidate.vectorScore,
          entity: candidate.entityScore,
          graph: candidate.graphScore,
          final: finalScore
        }
      });
    }

    // Sort by final score
    finalResults.sort((a, b) => b.scores.final - a.scores.final);
    finalResults.splice(clampedLimit);

    return { ok: true, data: finalResults };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

// List Entities
function listEntities(entityType?: string, limit: number = 100): RpcResponse<EntityFacet[]> {
  if (!db) return { ok: false, error: 'No database open' };

  // Clamp limit to prevent resource exhaustion
  const clampedLimit = Math.min(limit, MAX_QUERY_RESULTS);

  const results: EntityFacet[] = [];
  const stmt = db.prepare(QUERIES.LIST_ENTITY_FACETS);

  try {
    stmt.bind([entityType || null, clampedLimit]);

    while (stmt.step()) {
      const row = stmt.get([]);
      results.push({
        entityType: row[0],
        normalizedValue: row[1],
        count: row[2]
      });
    }

    return { ok: true, data: results };
  } catch (error) {
    return { ok: false, error: String(error) };
  } finally {
    stmt.finalize();
  }
}

// Get Page List
function getPageList(limit: number, offset: number): RpcResponse<PageInfo[]> {
  if (!db) return { ok: false, error: 'No database open' };

  // Clamp limit to prevent resource exhaustion
  const clampedLimit = Math.min(limit, MAX_QUERY_RESULTS);

  const results: PageInfo[] = [];
  const stmt = db.prepare(QUERIES.GET_PAGE_LIST);

  try {
    stmt.bind([clampedLimit, offset]);

    while (stmt.step()) {
      const row = stmt.get([]);
      results.push({
        gid: row[0],
        docId: row[1],
        pageNo: row[2],
        title: row[3],
        tags: row[4],
        updatedTs: row[5]
      });
    }

    return { ok: true, data: results };
  } catch (error) {
    return { ok: false, error: String(error) };
  } finally {
    stmt.finalize();
  }
}

// Get Page Blob
function getPageBlob(name: string): RpcResponse<Uint8Array> {
  if (!db) return { ok: false, error: 'No database open' };

  const stmt = db.prepare(QUERIES.GET_PAGE_BLOB);

  try {
    stmt.bind([name]);

    if (stmt.step()) {
      const row = stmt.get([]);
      const data = row[0]; // Uint8Array
      return { ok: true, data };
    }

    return { ok: false, error: `Blob not found: ${name}` };
  } catch (error) {
    return { ok: false, error: String(error) };
  } finally {
    stmt.finalize();
  }
}

// Verify Page
async function verifyPage(gid: string): Promise<RpcResponse<VerificationResult>> {
  if (!db) return { ok: false, error: 'No database open' };

  const stmt = db.prepare(QUERIES.VERIFY_PAGE);

  try {
    stmt.bind([gid]);

    if (stmt.step()) {
      const row = stmt.get([]);
      const storedContentSha = row[1];
      const fullText = row[6];

      // Compute actual SHA
      const computedSha = await sha256(fullText || '');

      return {
        ok: true,
        data: {
          gid: row[0],
          contentSha: storedContentSha,
          expectedSha: computedSha,
          verified: storedContentSha === computedSha,
          signer: row[2],
          signature: row[3],
          epoch: row[4],
          merkleRoot: row[5]
        }
      };
    }

    return { ok: false, error: `No receipt found for GID: ${gid}` };
  } catch (error) {
    return { ok: false, error: String(error) };
  } finally {
    stmt.finalize();
  }
}

// Get Checkpoints
function getCheckpoints(): RpcResponse<Checkpoint[]> {
  if (!db) return { ok: false, error: 'No database open' };

  const results: Checkpoint[] = [];
  const stmt = db.prepare(QUERIES.GET_CHECKPOINTS);

  try {
    while (stmt.step()) {
      const row = stmt.get([]);
      results.push({
        epoch: row[0],
        merkleRoot: row[1],
        pagesCount: row[2],
        createdTs: row[4],
        anchors: parseJsonSafe<string[]>(row[3])
      });
    }

    return { ok: true, data: results };
  } catch (error) {
    return { ok: false, error: String(error) };
  } finally {
    stmt.finalize();
  }
}

// Graph Hops (BFS traversal)
function graphHops(
  seedGid: string,
  predicate?: string,
  maxHops: number = 3,
  limit: number = 50
): RpcResponse<{ nodes: GraphNode[]; edges: GraphEdge[]; distances: Record<string, number> }> {
  if (!db) return { ok: false, error: 'No database open' };

  // Clamp limit to prevent resource exhaustion
  const clampedLimit = Math.min(limit, MAX_QUERY_RESULTS);

  try {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const distances: Record<string, number> = {};
    const visited = new Set<string>();
    const queue: Array<{ gid: string; distance: number }> = [];

    // Start BFS from seed
    queue.push({ gid: seedGid, distance: 0 });
    distances[seedGid] = 0;

    while (queue.length > 0 && nodes.length < clampedLimit) {
      const { gid, distance } = queue.shift()!;

      // Skip if already visited or exceeded max hops
      if (visited.has(gid) || distance > maxHops) {
        continue;
      }

      visited.add(gid);

      // Get node info
      const nodeStmt = db.prepare('SELECT gid, page_no, title FROM meta_index WHERE gid = ?');
      try {
        nodeStmt.bind([gid]);
        if (nodeStmt.step()) {
          const row = nodeStmt.get([]);
          nodes.push({
            gid: row[0],
            pageNo: row[1],
            title: row[2]
          });
        }
      } finally {
        nodeStmt.finalize();
      }

      // Get neighbors (if not at max hops)
      if (distance < maxHops) {
        const edgeStmt = db.prepare(`
          SELECT
            n2.gid,
            e.pred,
            e.weight
          FROM node_index n1
          JOIN edges e ON e.fromNode = n1.node_id
          JOIN node_index n2 ON n2.node_id = e.toNode
          WHERE n1.gid = ?
          ${predicate ? 'AND e.pred = ?' : ''}
          ORDER BY e.weight DESC
        `);

        try {
          if (predicate) {
            edgeStmt.bind([gid, predicate]);
          } else {
            edgeStmt.bind([gid]);
          }

          while (edgeStmt.step()) {
            const row = edgeStmt.get([]);
            const neighborGid = row[0];
            const pred = row[1];
            const weight = row[2];

            // Add edge
            edges.push({
              fromGid: gid,
              toGid: neighborGid,
              predicate: pred,
              weight
            });

            // Add to queue if not visited
            if (!visited.has(neighborGid) && !(neighborGid in distances)) {
              distances[neighborGid] = distance + 1;
              queue.push({ gid: neighborGid, distance: distance + 1 });
            }
          }
        } finally {
          edgeStmt.finalize();
        }
      }
    }

    return { ok: true, data: { nodes, edges, distances } };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

// Handle RPC request
/**
 * Execute arbitrary SQL query (for advanced use cases)
 */
function executeQuery(sql: string, params: (string | number | null)[]): RpcResponse {
  if (!db) {
    return { ok: false, error: 'No database open' };
  }

  try {
    const stmt = db.prepare(sql);
    const results: any[] = [];

    try {
      stmt.bind(params);
      while (stmt.step()) {
        results.push(stmt.get([]));
      }
    } finally {
      stmt.finalize();
    }

    return { ok: true, data: results };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Export current Core database as Uint8Array
 *
 * This exports the raw SQLite database bytes for merging with Envelope.
 * Used by GlyphCaseManager.exportGlyphCase() to create canonical .gcase+ files.
 */
function exportDatabase(): RpcResponse<Uint8Array> {
  if (!db) {
    return { ok: false, error: 'No database open' };
  }

  try {
    // Export database to Uint8Array
    const exported = sqlite3.capi.sqlite3_js_db_export(db.pointer);

    if (!exported) {
      return { ok: false, error: 'Failed to export database' };
    }

    console.log(`[Worker] Exported Core database: ${exported.byteLength} bytes`);
    return { ok: true, data: exported };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Compute hash of capsule file for envelope identification
 */
async function computeCapsuleHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check if a database file contains envelope tables (canonical .gcase+ format)
 */
function hasEnvelopeTables(fileBytes: Uint8Array): RpcResponse<boolean> {
  const tempDb = new sqlite3.oo1.DB(':memory:');

  try {
    // Deserialize the file into memory
    const rc = sqlite3.capi.sqlite3_deserialize(
      tempDb.pointer,
      'main',
      fileBytes,
      fileBytes.byteLength,
      fileBytes.byteLength,
      sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
      sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE
    );

    if (rc !== 0) {
      return { ok: true, data: false };
    }

    // Check for envelope metadata table
    const stmt = tempDb.prepare(`
      SELECT COUNT(*)
      FROM sqlite_master
      WHERE type='table' AND name='_envelope_meta'
    `);

    try {
      if (stmt.step()) {
        const count = stmt.get([])[0];
        return { ok: true, data: count > 0 };
      }
      return { ok: true, data: false };
    } finally {
      stmt.finalize();
    }
  } catch (err) {
    console.warn('[Worker] Error checking for envelope tables:', err);
    return { ok: true, data: false };
  } finally {
    tempDb.close();
  }
}

/**
 * Extract envelope tables from canonical .gcase+ file to OPFS sidecar
 */
async function extractEnvelope(file: File): Promise<RpcResponse<void>> {
  try {
    const gcaseId = await computeCapsuleHash(file);
    const opfsPath = `/envelopes/${gcaseId}.db`;

    console.log('[Worker] Extracting envelope from canonical .gcase+ file...');

    // Read file bytes
    const fileBytes = new Uint8Array(await file.arrayBuffer());

    // Create OPFS directory for sidecar (OPFS is available in workers)
    const opfsRoot = await navigator.storage.getDirectory();
    const envelopesDir = await opfsRoot.getDirectoryHandle('envelopes', { create: true });

    // Create new sidecar database
    const sidecarDb = new sqlite3.oo1.OpfsDb(opfsPath, 'c');

    // Load source file into temp in-memory DB
    const sourceDb = new sqlite3.oo1.DB(':memory:');

    try {
      const rc = sqlite3.capi.sqlite3_deserialize(
        sourceDb.pointer,
        'main',
        fileBytes,
        fileBytes.byteLength,
        fileBytes.byteLength,
        sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
        sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE
      );

      if (rc !== 0) {
        throw new Error(`Failed to deserialize source database: ${rc}`);
      }

      // ATTACH the new sidecar to the source DB
      sourceDb.exec(`ATTACH DATABASE '${opfsPath}' AS sidecar`);

      // Copy envelope tables
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
        const createStmt = sourceDb.prepare(`
          SELECT sql FROM main.sqlite_master
          WHERE type='table' AND name=?
        `);

        try {
          createStmt.bind([table]);
          if (createStmt.step()) {
            const sql = createStmt.get([])[0];
            if (sql) {
              // Create table in sidecar
              sidecarDb.exec(sql);

              // Copy data
              sourceDb.exec(`INSERT INTO sidecar.${table} SELECT * FROM main.${table}`);
              console.log(`[Worker] Copied table: ${table}`);
            }
          }
        } finally {
          createStmt.finalize();
        }
      }

      // Copy indexes
      const indexStmt = sourceDb.prepare(`
        SELECT sql FROM main.sqlite_master
        WHERE type='index'
          AND name LIKE 'env_%'
          AND sql IS NOT NULL
      `);

      try {
        while (indexStmt.step()) {
          const sql = indexStmt.get([])[0];
          if (sql) {
            sidecarDb.exec(sql);
          }
        }
      } finally {
        indexStmt.finalize();
      }

      // Copy views
      const viewStmt = sourceDb.prepare(`
        SELECT sql FROM main.sqlite_master
        WHERE type='view' AND name LIKE 'env_%'
      `);

      try {
        while (viewStmt.step()) {
          const sql = viewStmt.get([])[0];
          if (sql) {
            sidecarDb.exec(sql);
          }
        }
      } finally {
        viewStmt.finalize();
      }

      sourceDb.exec('DETACH DATABASE sidecar');
      console.log('[Worker] Envelope extraction complete');

      return { ok: true, data: undefined };
    } finally {
      sourceDb.close();
      sidecarDb.close();
    }
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function handleRequest(request: RpcRequest): Promise<RpcResponse> {
  try {
    switch (request.type) {
      case 'OPEN_FROM_FILE':
        return await openFromFile(request.file);

      case 'OPEN_FROM_OPFS':
        return await openFromOpfs(request.path);

      case 'OPEN_DEMO':
        return await openDemo();

      case 'SAVE_TO_OPFS':
        return await saveToOpfs(request.path);

      case 'REMOVE_FROM_OPFS':
        return await removeFromOpfsHandler(request.path);

      case 'LIST_OPFS_FILES':
        return await listOpfsFilesHandler();

      case 'CLOSE':
        return closeCapsule();

      case 'FTS_SEARCH':
        return searchFts(request.query, request.limit || 20, request.entityType, request.entityValue);

      case 'VECTOR_SEARCH':
        return searchVector(request.queryVector, request.limit || 20);

      case 'HYBRID_SEARCH':
        return searchHybrid(request.query, request.limit || 20, request.weights);

      case 'LIST_ENTITIES':
        return listEntities(request.entityType, request.limit || 100);

      case 'GET_PAGE_LIST':
        return getPageList(request.limit || 100, request.offset || 0);

      case 'GET_PAGE_BLOB':
        return getPageBlob(request.name);

      case 'VERIFY_PAGE':
        return await verifyPage(request.gid);

      case 'GET_CHECKPOINTS':
        return getCheckpoints();

      case 'GRAPH_HOPS':
        return graphHops(
          request.seedGid,
          request.predicate,
          request.maxHops || 3,
          request.limit || 50
        );

      case 'EXPORT_DATABASE':
        return exportDatabase();

      case 'HAS_ENVELOPE_TABLES':
        return hasEnvelopeTables(request.fileBytes);

      case 'EXTRACT_ENVELOPE':
        return await extractEnvelope(request.file);

      case 'QUERY':
        return executeQuery(request.sql, request.params || []);

      default:
        return { ok: false, error: `Unknown request type: ${(request as any).type}` };
    }
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

// Message handler
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, request } = event.data;

  // Initialize SQLite on first request
  if (!sqlite3) {
    await initSqlite();
  }

  const response = await handleRequest(request);

  const workerResponse: WorkerResponse = { id, response };
  self.postMessage(workerResponse);
};

// Notify that worker is ready
self.postMessage({ type: 'READY' });

console.log('[Worker] SQLite worker loaded and ready');
