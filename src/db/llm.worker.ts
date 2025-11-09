/// <reference lib="webworker" />

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
import { Wllama } from '@wllama/wllama';

let wllama: Wllama | null = null;
let modelInfo: LlmModelInfo = {
  modelId: 'qwen3-0.6b',
  loaded: false
};

// OPFS cache for model files
const MODEL_CACHE_DIR = 'llm-models';

async function getCachedModel(modelId: string): Promise<Uint8Array | null> {
  try {
    const root = await navigator.storage.getDirectory();
    const cacheDir = await root.getDirectoryHandle(MODEL_CACHE_DIR, { create: true });
    const fileHandle = await cacheDir.getFileHandle(modelId);
    const file = await fileHandle.getFile();
    const buffer = await file.arrayBuffer();
    console.log(`[LLM Worker] Loaded ${modelId} from OPFS cache (${buffer.byteLength} bytes)`);
    return new Uint8Array(buffer);
  } catch (e) {
    // File not in cache
    return null;
  }
}

async function cacheModel(modelId: string, data: Uint8Array): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    const cacheDir = await root.getDirectoryHandle(MODEL_CACHE_DIR, { create: true });
    const fileHandle = await cacheDir.getFileHandle(modelId, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
    console.log(`[LLM Worker] Cached ${modelId} to OPFS (${data.byteLength} bytes)`);
  } catch (e) {
    console.warn('[LLM Worker] Failed to cache model:', e);
  }
}

async function downloadModel(url: string, progressCallback?: (progress: { loaded: number; total: number }) => void): Promise<Uint8Array> {
  console.log('[LLM Worker] Downloading model from:', url);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download model: ${response.statusText}`);
  }

  const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error('No response body');
  }

  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    chunks.push(value);
    loaded += value.length;

    if (progressCallback && contentLength > 0) {
      progressCallback({ loaded, total: contentLength });
    }
  }

  // Concatenate chunks
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

// Initialize wllama
async function initWllama() {
  if (wllama) return;

  // Configure paths to WASM files
  const CONFIG_PATHS = {
    'single-thread/wllama.wasm': new URL('@wllama/wllama/esm/single-thread/wllama.wasm', import.meta.url).href,
    'multi-thread/wllama.wasm': new URL('@wllama/wllama/esm/multi-thread/wllama.wasm', import.meta.url).href,
  };

  wllama = new Wllama(CONFIG_PATHS, {
    // wllama will auto-detect the best backend
  });
}

// Load model
async function loadModel(modelUrl: string): Promise<LlmWorkerResponse> {
  try {
    await initWllama();

    if (!wllama) {
      return { ok: false, error: 'Failed to initialize wllama' };
    }

    const modelId = 'qwen3-0.6b.gguf';

    // Send progress updates
    const progressCallback = ({ loaded, total }: { loaded: number; total: number }) => {
      const progress = loaded / total;
      const progressMsg: LlmProgress = {
        type: 'DOWNLOAD',
        progress,
        message: `Downloading model: ${(progress * 100).toFixed(0)}%`
      };
      self.postMessage({ type: 'PROGRESS', data: progressMsg });
    };

    let modelData: Uint8Array;

    // Check OPFS cache first
    const cached = await getCachedModel(modelId);

    if (cached) {
      console.log('[LLM Worker] Using cached model');
      modelData = cached;

      // Send a quick "loaded from cache" progress update
      const progressMsg: LlmProgress = {
        type: 'DOWNLOAD',
        progress: 1.0,
        message: 'Loaded from cache'
      };
      self.postMessage({ type: 'PROGRESS', data: progressMsg });
    } else {
      console.log('[LLM Worker] Model not cached, downloading...');

      // Download model
      modelData = await downloadModel(modelUrl, progressCallback);

      // Cache for next time
      await cacheModel(modelId, modelData);
    }

    // Load model into wllama
    console.log('[LLM Worker] Loading model into wllama...');
    await wllama.loadModel(modelData.buffer, {
      n_ctx: 2048,
      n_batch: 512
    });

    modelInfo = {
      modelId: 'qwen3-0.6b',
      loaded: true
    };

    console.log('[LLM Worker] Model loaded successfully');

    return { ok: true, data: modelInfo };
  } catch (error) {
    console.error('[LLM Worker] Failed to load model:', error);
    return { ok: false, error: String(error) };
  }
}

// Build prompt with snippets
function buildPrompt(request: ReasoningRequest): string {
  const { question, snippets } = request;

  // System prompt with /no_think directive to disable Qwen3 thinking mode
  const systemPrompt = `/no_think

You are a helpful AI assistant that answers questions based ONLY on the provided document snippets. You must:
1. ONLY use information from the provided snippets
2. ALWAYS cite the GID (Glyph ID) for each fact you use
3. If the answer is not in the snippets, say "I don't have enough information in the provided documents to answer this question"
4. Format citations like this: [Page X, GID: <gid>]

Be concise and accurate. Do NOT use thinking tags or show your reasoning process.`;

  // Format snippets
  const snippetsText = snippets
    .map((s, i) => `[Snippet ${i + 1}]
Page: ${s.pageNo}
GID: ${s.gid}
Title: ${s.title || 'Untitled'}
Content: ${s.text}
---`)
    .join('\n\n');

  // Full prompt
  const prompt = `${systemPrompt}

DOCUMENT SNIPPETS:
${snippetsText}

USER QUESTION: ${question}

ANSWER (remember to cite GIDs):`;

  return prompt;
}

// Extract cited GIDs from response
function extractCitedGids(answer: string, availableGids: string[]): string[] {
  const cited = new Set<string>();

  for (const gid of availableGids) {
    // Look for the GID in the answer
    if (answer.includes(gid)) {
      cited.add(gid);
    }
  }

  return Array.from(cited);
}

// Perform reasoning
async function reason(request: ReasoningRequest): Promise<LlmWorkerResponse> {
  try {
    if (!wllama || !modelInfo.loaded) {
      return { ok: false, error: 'Model not loaded' };
    }

    console.log('[LLM Worker] Reasoning over', request.snippets.length, 'snippets');

    const prompt = buildPrompt(request);
    const startTime = performance.now();

    // Get stop token IDs for thinking tags (to prevent Qwen3 thinking mode)
    const stopTokens: number[] = [];
    try {
      const thinkOpenToken = await wllama.lookupToken('<think>');
      const thinkCloseToken = await wllama.lookupToken('</think>');
      if (thinkOpenToken !== -1) stopTokens.push(thinkOpenToken);
      if (thinkCloseToken !== -1) stopTokens.push(thinkCloseToken);
    } catch (e) {
      console.warn('[LLM Worker] Could not lookup thinking tokens:', e);
    }

    // Generate response
    const response = await wllama.createCompletion(prompt, {
      nPredict: request.maxTokens || 256,
      sampling: {
        temp: request.temperature || 0.7,
        top_p: 0.9,
      },
      stopTokens: stopTokens.length > 0 ? stopTokens : undefined
    });

    const inferenceTimeMs = performance.now() - startTime;

    // Extract answer
    const answer = response.trim();

    // Extract cited GIDs
    const availableGids = request.snippets.map(s => s.gid);
    const usedSnippets = extractCitedGids(answer, availableGids);

    const result: ReasoningResponse = {
      answer,
      usedSnippets,
      tokensGenerated: response.split(/\s+/).length, // Rough estimate
      inferenceTimeMs
    };

    console.log('[LLM Worker] Reasoning complete:', {
      tokensGenerated: result.tokensGenerated,
      inferenceTimeMs: result.inferenceTimeMs,
      usedSnippets: result.usedSnippets.length
    });

    return { ok: true, data: result };
  } catch (error) {
    console.error('[LLM Worker] Reasoning failed:', error);
    return { ok: false, error: String(error) };
  }
}

// Unload model
async function unloadModel(): Promise<LlmWorkerResponse> {
  try {
    if (wllama) {
      await wllama.exit();
      wllama = null;
      modelInfo.loaded = false;
      console.log('[LLM Worker] Model unloaded');
    }
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

// Get status
function getStatus(): LlmWorkerResponse {
  return { ok: true, data: modelInfo };
}

// Handle request
async function handleRequest(request: LlmWorkerRequest): Promise<LlmWorkerResponse> {
  switch (request.type) {
    case 'LOAD_MODEL':
      return await loadModel(request.modelUrl);

    case 'REASON':
      return await reason(request.request);

    case 'UNLOAD_MODEL':
      return await unloadModel();

    case 'GET_STATUS':
      return getStatus();

    default:
      return { ok: false, error: `Unknown request type: ${(request as any).type}` };
  }
}

// Message handler
self.onmessage = async (event: MessageEvent<LlmWorkerMessage>) => {
  const { id, request } = event.data;

  const response = await handleRequest(request);

  const reply: LlmWorkerReply = { id, response };
  self.postMessage(reply);
};

// Ready signal
self.postMessage({ type: 'READY' });

console.log('[LLM Worker] Initialized and ready');
