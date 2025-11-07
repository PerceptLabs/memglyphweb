// RPC Request types
export type RpcRequest =
  | { type: 'OPEN_FROM_FILE'; file: File }
  | { type: 'OPEN_FROM_OPFS'; path: string }
  | { type: 'OPEN_DEMO' }
  | { type: 'FTS_SEARCH'; query: string; limit?: number }
  | { type: 'VECTOR_SEARCH'; queryVector: Float32Array; limit?: number }
  | { type: 'HYBRID_SEARCH'; query: string; limit?: number; weights?: FusionWeights }
  | { type: 'LIST_ENTITIES'; entityType?: string; limit?: number }
  | { type: 'GRAPH_HOPS'; seedGid: string; predicate?: string; maxHops?: number; limit?: number }
  | { type: 'GET_PAGE_BLOB'; name: string }
  | { type: 'GET_PAGE_LIST'; limit?: number; offset?: number }
  | { type: 'VERIFY_PAGE'; gid: string }
  | { type: 'GET_CHECKPOINTS' }
  | { type: 'CLOSE' };

// RPC Response types
export type RpcResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// Domain types
export interface CapsuleInfo {
  fileName: string;
  fileSize: number;
  docId: string;
  pageCount: number;
  entityCount: number;
  edgeCount: number;
  hasVectors: boolean;
  vectorModel?: string;
  vectorDim?: number;
}

export interface FtsResult {
  gid: string;
  pageNo: number;
  title: string | null;
  snippet: string;
  rank: number;
  score: number;
}

export interface VectorResult {
  gid: string;
  pageNo: number;
  title: string | null;
  similarity: number;
}

export interface HybridResult {
  gid: string;
  pageNo: number;
  title: string | null;
  snippet: string | null;
  scores: {
    fts: number;
    vector: number;
    entity: number;
    graph: number;
    final: number;
  };
}

export interface FusionWeights {
  fts: number;
  vector: number;
  entity: number;
  graph: number;
}

export interface Entity {
  gid: string;
  entityType: string;
  entityText: string;
  normalizedValue: string | null;
  confidence: number;
}

export interface EntityFacet {
  entityType: string;
  normalizedValue: string | null;
  count: number;
}

export interface GraphNode {
  gid: string;
  pageNo: number;
  title: string | null;
}

export interface GraphEdge {
  fromGid: string;
  toGid: string;
  predicate: string;
  weight: number;
}

export interface GraphHopResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  distances: Map<string, number>;
}

export interface PageInfo {
  gid: string;
  docId: string;
  pageNo: number;
  title: string | null;
  tags: string | null;
  updatedTs: string;
}

export interface Checkpoint {
  epoch: string;
  merkleRoot: string;
  pagesCount: number;
  createdTs: string;
  anchors: string[] | null;
}

export interface VerificationResult {
  gid: string;
  contentSha: string;
  expectedSha: string | null;
  verified: boolean;
  signer: string | null;
  signature: string | null;
  epoch: string | null;
  merkleRoot: string | null;
}

// Message wrapper for worker communication
export interface WorkerRequest {
  id: number;
  request: RpcRequest;
}

export interface WorkerResponse {
  id: number;
  response: RpcResponse;
}
