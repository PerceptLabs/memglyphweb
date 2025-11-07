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
  modelId: 'qwen2.5-0.5b',
  loaded: false
};

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

    console.log('[LLM Worker] Loading model from:', modelUrl);

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

    // Load model from URL
    await wllama.loadModelFromUrl(modelUrl, {
      n_ctx: 2048,
      n_batch: 512,
      progressCallback
    });

    modelInfo = {
      modelId: 'qwen2.5-0.5b',
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

  // System prompt
  const systemPrompt = `You are a helpful AI assistant that answers questions based ONLY on the provided document snippets. You must:
1. ONLY use information from the provided snippets
2. ALWAYS cite the GID (Glyph ID) for each fact you use
3. If the answer is not in the snippets, say "I don't have enough information in the provided documents to answer this question"
4. Format citations like this: [Page X, GID: <gid>]

Be concise and accurate.`;

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

    // Generate response
    const response = await wllama.createCompletion(prompt, {
      nPredict: request.maxTokens || 256,
      sampling: {
        temp: request.temperature || 0.7,
        top_p: 0.9,
      }
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
