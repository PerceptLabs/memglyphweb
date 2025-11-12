// LLM-specific types

export interface LlmSnippet {
  gid: string;
  pageNo: number;
  title: string | null;
  text: string;
  score: number;
}

export interface ReasoningRequest {
  question: string;
  snippets: LlmSnippet[];
  maxTokens?: number;
  temperature?: number;
}

export interface ReasoningResponse {
  answer: string;
  usedSnippets: string[]; // GIDs that were cited
  tokensGenerated: number;
  inferenceTimeMs: number;
}

export interface LlmModelInfo {
  modelId: string;
  loaded: boolean;
  size?: number; // MB
  tokensPerSecond?: number;
}

// LLM Worker messages
export type LlmWorkerRequest =
  | { type: 'LOAD_MODEL'; modelUrl: string }
  | { type: 'REASON'; request: ReasoningRequest }
  | { type: 'UNLOAD_MODEL' }
  | { type: 'GET_STATUS' }
  | { type: 'ABORT_REASONING' };

export type LlmWorkerResponse =
  | { ok: true; data: LlmModelInfo | ReasoningResponse | null }
  | { ok: false; error: string };

export interface LlmWorkerMessage {
  id: number;
  request: LlmWorkerRequest;
}

export interface LlmWorkerReply {
  id: number;
  response: LlmWorkerResponse;
}

// Streaming token event
export interface StreamTokenEvent {
  type: 'STREAM_TOKEN';
  id: number;
  token: string;
  piece: string;
}

// Streaming complete event
export interface StreamCompleteEvent {
  type: 'STREAM_COMPLETE';
  id: number;
}

// Streaming error event
export interface StreamErrorEvent {
  type: 'STREAM_ERROR';
  id: number;
  error: string;
}

// Progress events
export interface LlmProgress {
  type: 'DOWNLOAD' | 'LOAD' | 'INFERENCE';
  progress: number; // 0-1
  message: string;
}
