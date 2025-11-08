/**
 * RPC Contract with Zod Runtime Validation
 *
 * This module defines the complete RPC contract between the main thread and the worker.
 * It provides:
 * - TypeScript types for compile-time safety
 * - Zod schemas for runtime validation
 * - Type inference from schemas
 */

import { z } from 'zod';

// ============================================================================
// Request Schemas
// ============================================================================

const OpenFromFileRequest = z.object({
  type: z.literal('OPEN_FROM_FILE'),
  file: z.instanceof(File),
});

const OpenFromOpfsRequest = z.object({
  type: z.literal('OPEN_FROM_OPFS'),
  path: z.string(),
});

const OpenDemoRequest = z.object({
  type: z.literal('OPEN_DEMO'),
});

const SaveToOpfsRequest = z.object({
  type: z.literal('SAVE_TO_OPFS'),
  path: z.string(),
});

const RemoveFromOpfsRequest = z.object({
  type: z.literal('REMOVE_FROM_OPFS'),
  path: z.string(),
});

const ListOpfsFilesRequest = z.object({
  type: z.literal('LIST_OPFS_FILES'),
});

const CloseRequest = z.object({
  type: z.literal('CLOSE'),
});

const FtsSearchRequest = z.object({
  type: z.literal('FTS_SEARCH'),
  query: z.string(),
  limit: z.number().int().positive().max(200).optional().default(20),
  entityType: z.string().optional(),
  entityValue: z.string().optional(),
});

const VectorSearchRequest = z.object({
  type: z.literal('VECTOR_SEARCH'),
  queryVector: z.instanceof(Float32Array),
  limit: z.number().int().positive().max(200).optional().default(20),
});

const FusionWeightsSchema = z.object({
  fts: z.number().min(0).max(1),
  vector: z.number().min(0).max(1),
  entity: z.number().min(0).max(1),
  graph: z.number().min(0).max(1),
}).partial();

const HybridSearchRequest = z.object({
  type: z.literal('HYBRID_SEARCH'),
  query: z.string(),
  limit: z.number().int().positive().max(200).optional().default(20),
  weights: FusionWeightsSchema.optional(),
});

const ListEntitiesRequest = z.object({
  type: z.literal('LIST_ENTITIES'),
  entityType: z.string().optional(),
  limit: z.number().int().positive().max(500).optional().default(100),
});

const GraphHopsRequest = z.object({
  type: z.literal('GRAPH_HOPS'),
  seedGid: z.string(),
  predicate: z.string().optional(),
  maxHops: z.number().int().positive().max(5).optional().default(3),
  limit: z.number().int().positive().max(200).optional().default(50),
});

const GetPageBlobRequest = z.object({
  type: z.literal('GET_PAGE_BLOB'),
  name: z.string(),
});

const GetPageListRequest = z.object({
  type: z.literal('GET_PAGE_LIST'),
  limit: z.number().int().positive().max(500).optional().default(100),
  offset: z.number().int().nonnegative().optional().default(0),
});

const VerifyPageRequest = z.object({
  type: z.literal('VERIFY_PAGE'),
  gid: z.string(),
});

const GetCheckpointsRequest = z.object({
  type: z.literal('GET_CHECKPOINTS'),
});

const QueryRequest = z.object({
  type: z.literal('QUERY'),
  sql: z.string(),
  params: z.array(z.union([z.string(), z.number(), z.null()])).optional().default([]),
});

// Union of all request schemas
export const RpcRequestSchema = z.discriminatedUnion('type', [
  OpenFromFileRequest,
  OpenFromOpfsRequest,
  OpenDemoRequest,
  SaveToOpfsRequest,
  RemoveFromOpfsRequest,
  ListOpfsFilesRequest,
  CloseRequest,
  FtsSearchRequest,
  VectorSearchRequest,
  HybridSearchRequest,
  ListEntitiesRequest,
  GraphHopsRequest,
  GetPageBlobRequest,
  GetPageListRequest,
  VerifyPageRequest,
  GetCheckpointsRequest,
  QueryRequest,
]);

// Infer TypeScript type from schema
export type RpcRequest = z.infer<typeof RpcRequestSchema>;

// ============================================================================
// Response Schemas
// ============================================================================

// Domain type schemas
export const CapsuleInfoSchema = z.object({
  fileName: z.string(),
  fileSize: z.number(),
  docId: z.string(),
  pageCount: z.number(),
  entityCount: z.number(),
  edgeCount: z.number(),
  hasVectors: z.boolean(),
  vectorModel: z.string().optional(),
  vectorDim: z.number().optional(),
  opfsPath: z.string().optional(), // Path in OPFS (if persisted)
});

export const FtsResultSchema = z.object({
  gid: z.string(),
  pageNo: z.number(),
  title: z.string().nullable(),
  snippet: z.string(),
  rank: z.number(),
  score: z.number(),
});

export const VectorResultSchema = z.object({
  gid: z.string(),
  pageNo: z.number(),
  title: z.string().nullable(),
  similarity: z.number(),
});

export const HybridResultSchema = z.object({
  gid: z.string(),
  pageNo: z.number(),
  title: z.string().nullable(),
  snippet: z.string().nullable(),
  scores: z.object({
    fts: z.number(),
    vector: z.number(),
    entity: z.number(),
    graph: z.number(),
    final: z.number(),
  }),
});

export const EntityFacetSchema = z.object({
  entityType: z.string(),
  normalizedValue: z.string().nullable(),
  count: z.number(),
});

export const GraphNodeSchema = z.object({
  gid: z.string(),
  pageNo: z.number(),
  title: z.string().nullable(),
});

export const GraphEdgeSchema = z.object({
  fromGid: z.string(),
  toGid: z.string(),
  predicate: z.string(),
  weight: z.number(),
});

export const PageInfoSchema = z.object({
  gid: z.string(),
  docId: z.string(),
  pageNo: z.number(),
  title: z.string().nullable(),
  tags: z.string().nullable(),
  updatedTs: z.string(),
});

export const CheckpointSchema = z.object({
  epoch: z.string(),
  merkleRoot: z.string(),
  pagesCount: z.number(),
  createdTs: z.string(),
  anchors: z.array(z.string()).nullable(),
});

export const VerificationResultSchema = z.object({
  gid: z.string(),
  contentSha: z.string(),
  expectedSha: z.string().nullable(),
  verified: z.boolean(),
  signer: z.string().nullable(),
  signature: z.string().nullable(),
  epoch: z.string().nullable(),
  merkleRoot: z.string().nullable(),
});

export const OpfsFileInfoSchema = z.object({
  path: z.string(),
  size: z.number(),
  lastModified: z.number(),
});

// Generic response wrapper
function createResponseSchema<T extends z.ZodType>(dataSchema: T) {
  return z.discriminatedUnion('ok', [
    z.object({
      ok: z.literal(true),
      data: dataSchema,
    }),
    z.object({
      ok: z.literal(false),
      error: z.string(),
    }),
  ]);
}

// Response type helper
export type RpcResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ============================================================================
// Worker Message Wrappers
// ============================================================================

export const WorkerRequestSchema = z.object({
  id: z.number(),
  request: RpcRequestSchema,
});

export const WorkerResponseSchema = z.object({
  id: z.number(),
  response: z.union([
    z.object({ ok: z.literal(true), data: z.unknown() }),
    z.object({ ok: z.literal(false), error: z.string() }),
  ]),
});

export type WorkerRequest = z.infer<typeof WorkerRequestSchema>;
export type WorkerResponse = z.infer<typeof WorkerResponseSchema>;

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate an RPC request
 * @throws {z.ZodError} if validation fails
 */
export function validateRequest(data: unknown): RpcRequest {
  return RpcRequestSchema.parse(data);
}

/**
 * Validate a worker request (id + request)
 * @throws {z.ZodError} if validation fails
 */
export function validateWorkerRequest(data: unknown): WorkerRequest {
  return WorkerRequestSchema.parse(data);
}

/**
 * Validate an RPC response with specific data schema
 */
export function validateResponse<T>(
  data: unknown,
  dataSchema: z.ZodType<T>
): RpcResponse<T> {
  const responseSchema = createResponseSchema(dataSchema);
  return responseSchema.parse(data);
}

/**
 * Create a success response
 */
export function successResponse<T>(data: T): RpcResponse<T> {
  return { ok: true, data };
}

/**
 * Create an error response
 */
export function errorResponse(error: string | Error): RpcResponse<never> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : error,
  };
}

// ============================================================================
// Exported Types (for backwards compatibility with existing code)
// ============================================================================

export type CapsuleInfo = z.infer<typeof CapsuleInfoSchema>;
export type FtsResult = z.infer<typeof FtsResultSchema>;
export type VectorResult = z.infer<typeof VectorResultSchema>;
export type HybridResult = z.infer<typeof HybridResultSchema>;
export type FusionWeights = z.infer<typeof FusionWeightsSchema>;
export type EntityFacet = z.infer<typeof EntityFacetSchema>;
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type PageInfo = z.infer<typeof PageInfoSchema>;
export type Checkpoint = z.infer<typeof CheckpointSchema>;
export type VerificationResult = z.infer<typeof VerificationResultSchema>;
export type OpfsFileInfo = z.infer<typeof OpfsFileInfoSchema>;
