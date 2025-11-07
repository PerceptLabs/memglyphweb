/// <reference lib="webworker" />

import type { WorkerRequest, WorkerResponse, RpcRequest, RpcResponse, CapsuleInfo } from './types';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

const OPFS_PATH = '/capsules';
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

      // TODO: Implement other operations
      case 'FTS_SEARCH':
      case 'VECTOR_SEARCH':
      case 'HYBRID_SEARCH':
      case 'LIST_ENTITIES':
      case 'GRAPH_HOPS':
      case 'GET_PAGE_BLOB':
      case 'GET_PAGE_LIST':
      case 'VERIFY_PAGE':
      case 'GET_CHECKPOINTS':
        return { ok: false, error: `Operation ${request.type} not yet implemented` };

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
