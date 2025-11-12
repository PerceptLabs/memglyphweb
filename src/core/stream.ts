/**
 * GlyphStream - Working Memory Bus
 *
 * Ephemeral pub/sub event system for runtime coordination between:
 * - Search operations
 * - LLM interactions
 * - Envelope logging
 * - UI components
 *
 * All events are transient and not persisted (unlike Envelope).
 * In dev mode, events are logged to console for debugging.
 */

export type StreamTopic =
  | 'retrieval.query'
  | 'retrieval.result'
  | 'llm.prompt'
  | 'llm.output'
  | 'llm.citation'
  | 'feedback.signal'
  | 'envelope.append'
  | 'envelope.stats'
  | 'capsule.loaded'
  | 'capsule.unloaded';

export interface StreamEvent<T = any> {
  topic: StreamTopic;
  data: T;
  timestamp: number;
}

// Event data types for type safety
export interface RetrievalQueryEvent {
  query: string;
  type: 'fts' | 'vector' | 'hybrid' | 'graph';
  limit?: number;
}

export interface RetrievalResultEvent {
  query: string;
  type: 'fts' | 'vector' | 'hybrid' | 'graph';
  results: Array<{
    gid: string;
    score: number;
    snippet?: string;
  }>;
  executionTime?: number;
}

export interface LlmPromptEvent {
  prompt: string;
  context: string[];
  model?: string;
}

export interface LlmOutputEvent {
  response: string;
  citations: Array<{ gid: string; pageNo: number }>;
  model?: string;
}

export interface LlmCitationEvent {
  gid: string;
  pageNo: number;
  title?: string;
  snippet?: string;
}

export interface FeedbackSignalEvent {
  retrievalId?: string;
  rating: -1 | 0 | 1;
  notes?: string;
}

export interface EnvelopeAppendEvent {
  table: 'retrieval_log' | 'embeddings' | 'feedback' | 'summaries';
  count: number;
}

export interface EnvelopeStatsEvent {
  retrievalCount: number;
  embeddingCount: number;
  feedbackCount: number;
  summaryCount: number;
  chainLength: number;
}

export interface CapsuleLoadedEvent {
  gid: string;
  title: string;
  modality: 'static' | 'dynamic';
}

/**
 * GlyphStream singleton - Working memory event bus
 */
class GlyphStream {
  private bus = new EventTarget();
  private topics = new Set<StreamTopic>();
  private eventLog: StreamEvent[] = [];
  private maxLogSize = 100; // Keep last 100 events in dev mode

  /**
   * Publish an event to a topic
   */
  publish<T = any>(topic: StreamTopic, data: T): void {
    this.topics.add(topic);

    const event: StreamEvent<T> = {
      topic,
      data,
      timestamp: Date.now()
    };

    // Dispatch as custom event
    this.bus.dispatchEvent(new CustomEvent(topic, { detail: event }));

    // Log in dev mode
    if (import.meta.env.DEV) {
      this.eventLog.push(event);
      if (this.eventLog.length > this.maxLogSize) {
        this.eventLog.shift();
      }
      console.log(`[Stream:${topic}]`, data);
    }
  }

  /**
   * Subscribe to a topic
   * Returns an unsubscribe function
   */
  subscribe<T = any>(
    topic: StreamTopic,
    callback: (data: T, event: StreamEvent<T>) => void
  ): () => void {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<StreamEvent<T>>;
      callback(customEvent.detail.data, customEvent.detail);
    };

    this.bus.addEventListener(topic, handler);

    // Return unsubscribe function
    return () => {
      this.bus.removeEventListener(topic, handler);
    };
  }

  /**
   * Subscribe to multiple topics at once
   */
  subscribeMany<T = any>(
    topics: StreamTopic[],
    callback: (topic: StreamTopic, data: T, event: StreamEvent<T>) => void
  ): () => void {
    const unsubscribers = topics.map(topic =>
      this.subscribe<T>(topic, (data, event) => callback(topic, data, event))
    );

    // Return combined unsubscribe function
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }

  /**
   * Get all currently active topics
   */
  getActiveTopics(): StreamTopic[] {
    return Array.from(this.topics);
  }

  /**
   * Get recent events (dev mode only)
   */
  getRecentEvents(count?: number): StreamEvent[] {
    if (!import.meta.env.DEV) return [];
    return this.eventLog.slice(-(count || this.maxLogSize));
  }

  /**
   * Clear event log (dev mode only)
   */
  clearEventLog(): void {
    this.eventLog = [];
  }

  /**
   * Get statistics about stream usage
   */
  getStats(): {
    activeTopics: number;
    eventLogSize: number;
    topicCounts: Record<StreamTopic, number>;
  } {
    const topicCounts = {} as Record<StreamTopic, number>;

    if (import.meta.env.DEV) {
      for (const event of this.eventLog) {
        topicCounts[event.topic] = (topicCounts[event.topic] || 0) + 1;
      }
    }

    return {
      activeTopics: this.topics.size,
      eventLogSize: this.eventLog.length,
      topicCounts
    };
  }
}

// Export singleton instance
export const stream = new GlyphStream();

// Export convenience functions with proper typing
export const publishRetrievalQuery = (data: RetrievalQueryEvent) =>
  stream.publish('retrieval.query', data);

export const publishRetrievalResult = (data: RetrievalResultEvent) =>
  stream.publish('retrieval.result', data);

export const publishLlmPrompt = (data: LlmPromptEvent) =>
  stream.publish('llm.prompt', data);

export const publishLlmOutput = (data: LlmOutputEvent) =>
  stream.publish('llm.output', data);

export const publishLlmCitation = (data: LlmCitationEvent) =>
  stream.publish('llm.citation', data);

export const publishFeedback = (data: FeedbackSignalEvent) =>
  stream.publish('feedback.signal', data);

export const publishEnvelopeAppend = (data: EnvelopeAppendEvent) =>
  stream.publish('envelope.append', data);

export const publishEnvelopeStats = (data: EnvelopeStatsEvent) =>
  stream.publish('envelope.stats', data);

export const publishCapsuleLoaded = (data: CapsuleLoadedEvent) =>
  stream.publish('capsule.loaded', data);

export const publishCapsuleUnloaded = () =>
  stream.publish('capsule.unloaded', {});
