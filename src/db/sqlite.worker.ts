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
  VerificationResult
} from './types';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { QUERIES, cosineSimilarity, unpackVector, parseJsonSafe, sha256, DEFAULT_FUSION_WEIGHTS } from './queries';
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

let db: any = null;
let sqlite3: any = null;
let currentCapsuleInfo: CapsuleInfo | null = null;

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
function getCapsuleInfo(fileName: string, fileSize: number): CapsuleInfo {
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

  return {
    fileName,
    fileSize,
    docId,
    pageCount,
    entityCount,
    edgeCount,
    hasVectors,
    vectorModel,
    vectorDim
  };
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
    const info = getCapsuleInfo(file.name, file.size);
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

// Close database
function closeCapsule(): RpcResponse<void> {
  if (db) {
    db.close();
    db = null;
    currentCapsuleInfo = null;
    return { ok: true, data: undefined };
  }
  return { ok: false, error: 'No database open' };
}

// FTS Search
function searchFts(query: string, limit: number): RpcResponse<FtsResult[]> {
  if (!db) return { ok: false, error: 'No database open' };

  const results: FtsResult[] = [];
  const stmt = db.prepare(QUERIES.FTS_SEARCH);

  try {
    stmt.bind([query, limit]);

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
    results.splice(limit);

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

  const fusionWeights = { ...DEFAULT_FUSION_WEIGHTS, ...weights };

  try {
    // Step 1: FTS Search
    const ftsResponse = searchFts(query, Math.min(limit * 3, 50));
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
    const topGids = Array.from(candidates.keys()).slice(0, Math.min(10, limit));
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
    finalResults.splice(limit);

    return { ok: true, data: finalResults };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

// List Entities
function listEntities(entityType?: string, limit: number = 100): RpcResponse<EntityFacet[]> {
  if (!db) return { ok: false, error: 'No database open' };

  const results: EntityFacet[] = [];
  const stmt = db.prepare(QUERIES.LIST_ENTITY_FACETS);

  try {
    stmt.bind([entityType || null, limit]);

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

  const results: PageInfo[] = [];
  const stmt = db.prepare(QUERIES.GET_PAGE_LIST);

  try {
    stmt.bind([limit, offset]);

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

  try {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const distances: Record<string, number> = {};
    const visited = new Set<string>();
    const queue: Array<{ gid: string; distance: number }> = [];

    // Start BFS from seed
    queue.push({ gid: seedGid, distance: 0 });
    distances[seedGid] = 0;

    while (queue.length > 0 && nodes.length < limit) {
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
async function handleRequest(request: RpcRequest): Promise<RpcResponse> {
  try {
    switch (request.type) {
      case 'OPEN_FROM_FILE':
        return await openFromFile(request.file);

      case 'OPEN_DEMO':
        return await openDemo();

      case 'CLOSE':
        return closeCapsule();

      case 'FTS_SEARCH':
        return searchFts(request.query, request.limit || 20);

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
