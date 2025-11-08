/**
 * Query Queue with Timeout Protection
 *
 * Serializes all database queries to prevent:
 * - Race conditions
 * - Runaway queries locking the UI
 * - Main thread jank from too many concurrent queries
 *
 * Features:
 * - FIFO queue with backpressure limits
 * - Configurable timeouts per query
 * - Busy state exposure for UI
 * - Automatic abort on timeout
 */

export interface QueuedQuery<T> {
  id: number;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeout: number;
  enqueuedAt: number;
}

export interface QueryQueueConfig {
  maxQueueSize: number;
  defaultTimeout: number; // milliseconds
  maxTimeout: number; // max allowed timeout
}

export interface QueryQueueStats {
  queueLength: number;
  busy: boolean;
  totalProcessed: number;
  totalTimeouts: number;
  totalErrors: number;
}

const DEFAULT_CONFIG: QueryQueueConfig = {
  maxQueueSize: 50,
  defaultTimeout: 10000, // 10 seconds
  maxTimeout: 30000, // 30 seconds max
};

/**
 * Query Queue Manager
 */
export class QueryQueue {
  private queue: QueuedQuery<any>[] = [];
  private processing = false;
  private nextId = 1;
  private config: QueryQueueConfig;
  private stats = {
    totalProcessed: 0,
    totalTimeouts: 0,
    totalErrors: 0,
  };

  constructor(config: Partial<QueryQueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Enqueue a query for execution
   *
   * @param execute - Async function to execute
   * @param timeout - Custom timeout (optional)
   * @returns Promise that resolves with query result
   */
  async enqueue<T>(
    execute: () => Promise<T>,
    timeout?: number
  ): Promise<T> {
    // Check queue size
    if (this.queue.length >= this.config.maxQueueSize) {
      throw new Error(
        `Query queue full (${this.config.maxQueueSize} items). Too many pending queries.`
      );
    }

    // Validate timeout
    const actualTimeout = Math.min(
      timeout || this.config.defaultTimeout,
      this.config.maxTimeout
    );

    return new Promise<T>((resolve, reject) => {
      const query: QueuedQuery<T> = {
        id: this.nextId++,
        execute,
        resolve,
        reject,
        timeout: actualTimeout,
        enqueuedAt: Date.now(),
      };

      this.queue.push(query);

      // Start processing if not already
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process the queue (FIFO)
   */
  private async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const query = this.queue.shift()!;

      try {
        await this.executeWithTimeout(query);
      } catch (error) {
        // Error already handled in executeWithTimeout
      }
    }

    this.processing = false;
  }

  /**
   * Execute a query with timeout protection
   */
  private async executeWithTimeout<T>(query: QueuedQuery<T>): Promise<void> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Query ${query.id} timed out after ${query.timeout}ms`));
      }, query.timeout);
    });

    try {
      const result = await Promise.race([
        query.execute(),
        timeoutPromise,
      ]);

      this.stats.totalProcessed++;
      query.resolve(result);
    } catch (error) {
      if (error instanceof Error && error.message.includes('timed out')) {
        this.stats.totalTimeouts++;
        console.warn(`[QueryQueue] Query ${query.id} timed out`, {
          timeout: query.timeout,
          waitTime: Date.now() - query.enqueuedAt,
        });
      } else {
        this.stats.totalErrors++;
      }

      query.reject(error as Error);
    }
  }

  /**
   * Get current queue statistics
   */
  getStats(): QueryQueueStats {
    return {
      queueLength: this.queue.length,
      busy: this.processing,
      totalProcessed: this.stats.totalProcessed,
      totalTimeouts: this.stats.totalTimeouts,
      totalErrors: this.stats.totalErrors,
    };
  }

  /**
   * Check if queue is busy (processing or has items)
   */
  isBusy(): boolean {
    return this.processing || this.queue.length > 0;
  }

  /**
   * Clear all pending queries (reject them)
   */
  clear(): void {
    const error = new Error('Query queue cleared');

    for (const query of this.queue) {
      query.reject(error);
    }

    this.queue = [];
  }

  /**
   * Get queue length
   */
  get length(): number {
    return this.queue.length;
  }
}

/**
 * Singleton query queue instance
 */
let globalQueue: QueryQueue | null = null;

/**
 * Get or create the global query queue
 */
export function getQueryQueue(config?: Partial<QueryQueueConfig>): QueryQueue {
  if (!globalQueue) {
    globalQueue = new QueryQueue(config);
  }
  return globalQueue;
}

/**
 * Reset the global query queue (useful for testing)
 */
export function resetQueryQueue(): void {
  if (globalQueue) {
    globalQueue.clear();
  }
  globalQueue = null;
}

/**
 * Convenience wrapper: Execute a query through the global queue
 */
export function queueQuery<T>(
  execute: () => Promise<T>,
  timeout?: number
): Promise<T> {
  return getQueryQueue().enqueue(execute, timeout);
}
