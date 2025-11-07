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
  FusionWeights
} from './types';

export class DbClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, {
    resolve: (response: RpcResponse) => void;
    reject: (error: Error) => void;
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

  private async sendRequest<T>(request: RpcRequest): Promise<T> {
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    const id = this.nextId++;

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (response: RpcResponse) => {
          if (response.ok) {
            resolve(response.data as T);
          } else {
            reject(new Error(response.error));
          }
        },
        reject
      });

      const workerRequest: WorkerRequest = { id, request };
      this.worker!.postMessage(workerRequest);
    });
  }

  // API Methods

  async openFromFile(file: File): Promise<CapsuleInfo> {
    return this.sendRequest<CapsuleInfo>({
      type: 'OPEN_FROM_FILE',
      file
    });
  }

  async openDemo(): Promise<CapsuleInfo> {
    return this.sendRequest<CapsuleInfo>({
      type: 'OPEN_DEMO'
    });
  }

  async close(): Promise<void> {
    return this.sendRequest<void>({
      type: 'CLOSE'
    });
  }

  async searchFts(query: string, limit = 20): Promise<FtsResult[]> {
    return this.sendRequest<FtsResult[]>({
      type: 'FTS_SEARCH',
      query,
      limit
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

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
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
