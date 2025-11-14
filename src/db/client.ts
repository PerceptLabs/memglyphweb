import type {
  RpcRequest,
  RpcResponse,
  WorkerRequest,
  WorkerResponse,
  CapsuleInfo,
  FtsResult,
  HybridResult,
  EntityFacet,
  PageInfo,
  Checkpoint,
  VerificationResult,
  FusionWeights,
  GraphNode,
  GraphEdge,
  OpfsFileInfo,
} from './rpc-contract';
import { queueQuery, type QueryQueueStats, getQueryQueue } from './query-queue';

export class DbClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, {
    resolve: (response: RpcResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    // Create worker
    this.worker = new Worker(
      new URL('./sqlite.worker.ts', import.meta.url),
      { type: 'module' }
    );

    // Handle messages
    this.worker.onmessage = (event: MessageEvent<WorkerResponse | { type: string }>) => {
      const data = event.data;

      // Handle ready message
      if ('type' in data && data.type === 'READY') {
        console.log('[DbClient] Worker ready');
        return;
      }

      // Handle RPC response
      const { id, response } = data as WorkerResponse;
      const pending = this.pending.get(id);

      if (pending) {
        this.pending.delete(id);
        pending.resolve(response);
      }
    };

    // Handle errors
    this.worker.onerror = (error) => {
      console.error('[DbClient] Worker error:', error);
      // Reject all pending requests
      for (const pending of this.pending.values()) {
        pending.reject(new Error('Worker error'));
      }
      this.pending.clear();
    };
  }

  private async sendRequest<T>(request: RpcRequest, timeout: number = 10000): Promise<T> {
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    const id = this.nextId++;

    // Use query queue to serialize requests
    return queueQuery(async () => {
      return new Promise<T>((resolve, reject) => {
        // Set up timeout
        const timeoutHandle = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`Request ${request.type} timed out after ${timeout}ms`));
        }, timeout);

        this.pending.set(id, {
          resolve: (response: RpcResponse) => {
            clearTimeout(timeoutHandle);
            if (response.ok) {
              resolve(response.data as T);
            } else {
              reject(new Error(response.error));
            }
          },
          reject: (error: Error) => {
            clearTimeout(timeoutHandle);
            reject(error);
          },
          timeout: timeoutHandle,
        });

        const workerRequest: WorkerRequest = { id, request };
        this.worker!.postMessage(workerRequest);
      });
    }, timeout);
  }

  // API Methods

  async openFromFile(file: File): Promise<CapsuleInfo> {
    return this.sendRequest<CapsuleInfo>({
      type: 'OPEN_FROM_FILE',
      file
    });
  }

  async openFromOpfs(path: string): Promise<CapsuleInfo> {
    return this.sendRequest<CapsuleInfo>({
      type: 'OPEN_FROM_OPFS',
      path
    });
  }

  async openDemo(): Promise<CapsuleInfo> {
    return this.sendRequest<CapsuleInfo>({
      type: 'OPEN_DEMO'
    });
  }

  async saveToOpfs(path: string): Promise<void> {
    return this.sendRequest<void>({
      type: 'SAVE_TO_OPFS',
      path
    });
  }

  async removeFromOpfs(path: string): Promise<void> {
    return this.sendRequest<void>({
      type: 'REMOVE_FROM_OPFS',
      path
    });
  }

  async listOpfsFiles(): Promise<OpfsFileInfo[]> {
    return this.sendRequest<OpfsFileInfo[]>({
      type: 'LIST_OPFS_FILES'
    });
  }

  async close(): Promise<void> {
    return this.sendRequest<void>({
      type: 'CLOSE'
    });
  }

  async searchFts(
    query: string,
    limit = 20,
    entityType?: string,
    entityValue?: string
  ): Promise<FtsResult[]> {
    return this.sendRequest<FtsResult[]>({
      type: 'FTS_SEARCH',
      query,
      limit,
      entityType,
      entityValue,
    });
  }

  async searchHybrid(
    query: string,
    limit = 20,
    weights?: FusionWeights
  ): Promise<HybridResult[]> {
    return this.sendRequest<HybridResult[]>({
      type: 'HYBRID_SEARCH',
      query,
      limit,
      weights
    });
  }

  async listEntities(entityType?: string, limit = 100): Promise<EntityFacet[]> {
    return this.sendRequest<EntityFacet[]>({
      type: 'LIST_ENTITIES',
      entityType,
      limit
    });
  }

  async getPageList(limit = 100, offset = 0): Promise<PageInfo[]> {
    return this.sendRequest<PageInfo[]>({
      type: 'GET_PAGE_LIST',
      limit,
      offset
    });
  }

  async getPageBlob(name: string): Promise<Blob> {
    return this.sendRequest<Blob>({
      type: 'GET_PAGE_BLOB',
      name
    });
  }

  async verifyPage(gid: string): Promise<VerificationResult> {
    return this.sendRequest<VerificationResult>({
      type: 'VERIFY_PAGE',
      gid
    });
  }

  async getCheckpoints(): Promise<Checkpoint[]> {
    return this.sendRequest<Checkpoint[]>({
      type: 'GET_CHECKPOINTS'
    });
  }

  async graphHops(
    seedGid: string,
    predicate?: string,
    maxHops?: number,
    limit?: number
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; distances: Record<string, number> }> {
    return this.sendRequest<{ nodes: GraphNode[]; edges: GraphEdge[]; distances: Record<string, number> }>({
      type: 'GRAPH_HOPS',
      seedGid,
      predicate,
      maxHops,
      limit
    });
  }

  /**
   * Execute arbitrary SQL query (for advanced use cases)
   */
  async query(sql: string, params: (string | number | null)[] = []): Promise<any[]> {
    return this.sendRequest<any[]>({
      type: 'QUERY',
      sql,
      params
    });
  }

  /**
   * Export Core database as Uint8Array
   *
   * Used for creating canonical .gcase+ files (merges Core + Envelope).
   */
  async exportDatabase(): Promise<Uint8Array> {
    return this.sendRequest<Uint8Array>({
      type: 'EXPORT_DATABASE'
    });
  }

  getQueueStats(): QueryQueueStats {
    return getQueryQueue().getStats();
  }

  isQueueBusy(): boolean {
    return getQueryQueue().isBusy();
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    // Clear all pending with timeout cleanup
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Worker terminated'));
    }
    this.pending.clear();
  }
}

// Singleton instance
let dbClient: DbClient | null = null;

export function getDbClient(): DbClient {
  if (!dbClient) {
    dbClient = new DbClient();
  }
  return dbClient;
}
