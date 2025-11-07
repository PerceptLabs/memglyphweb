import type {
  LlmWorkerMessage,
  LlmWorkerReply,
  LlmWorkerRequest,
  LlmWorkerResponse,
  ReasoningRequest,
  ReasoningResponse,
  LlmModelInfo,
  LlmProgress
} from './llm-types';

export class LlmClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, {
    resolve: (response: LlmWorkerResponse) => void;
    reject: (error: Error) => void;
  }>();
  private progressCallback: ((progress: LlmProgress) => void) | null = null;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    // Create worker
    this.worker = new Worker(
      new URL('./llm.worker.ts', import.meta.url),
      { type: 'module' }
    );

    // Handle messages
    this.worker.onmessage = (event: MessageEvent) => {
      const data = event.data;

      // Handle ready message
      if ('type' in data && data.type === 'READY') {
        console.log('[LlmClient] Worker ready');
        return;
      }

      // Handle progress updates
      if ('type' in data && data.type === 'PROGRESS') {
        if (this.progressCallback) {
          this.progressCallback(data.data as LlmProgress);
        }
        return;
      }

      // Handle RPC response
      const { id, response } = data as LlmWorkerReply;
      const pending = this.pending.get(id);

      if (pending) {
        this.pending.delete(id);
        pending.resolve(response);
      }
    };

    // Handle errors
    this.worker.onerror = (error) => {
      console.error('[LlmClient] Worker error:', error);
      // Reject all pending requests
      for (const pending of this.pending.values()) {
        pending.reject(new Error('Worker error'));
      }
      this.pending.clear();
    };
  }

  private async sendRequest<T>(request: LlmWorkerRequest): Promise<T> {
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    const id = this.nextId++;

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (response: LlmWorkerResponse) => {
          if (response.ok) {
            resolve(response.data as T);
          } else {
            reject(new Error(response.error));
          }
        },
        reject
      });

      const workerMessage: LlmWorkerMessage = { id, request };
      this.worker!.postMessage(workerMessage);
    });
  }

  // Set progress callback
  onProgress(callback: (progress: LlmProgress) => void) {
    this.progressCallback = callback;
  }

  // API Methods

  async loadModel(modelUrl: string): Promise<LlmModelInfo> {
    return this.sendRequest<LlmModelInfo>({
      type: 'LOAD_MODEL',
      modelUrl
    });
  }

  async reason(request: ReasoningRequest): Promise<ReasoningResponse> {
    return this.sendRequest<ReasoningResponse>({
      type: 'REASON',
      request
    });
  }

  async unloadModel(): Promise<void> {
    return this.sendRequest<void>({
      type: 'UNLOAD_MODEL'
    });
  }

  async getStatus(): Promise<LlmModelInfo> {
    return this.sendRequest<LlmModelInfo>({
      type: 'GET_STATUS'
    });
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pending.clear();
    this.progressCallback = null;
  }
}

// Singleton instance
let llmClient: LlmClient | null = null;

export function getLlmClient(): LlmClient {
  if (!llmClient) {
    llmClient = new LlmClient();
  }
  return llmClient;
}

// Model URLs
export const QWEN_MODELS = {
  '0.5b': 'https://huggingface.co/ggml-org/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
  '1.5b': 'https://huggingface.co/ggml-org/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf'
};
