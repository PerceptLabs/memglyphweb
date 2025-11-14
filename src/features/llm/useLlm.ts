/**
 * LLM Feature Hook
 *
 * Encapsulates all LLM-related state and logic.
 * Publishes events to GlyphStream when reasoning occurs.
 */

import { useState, useEffect, useRef } from 'preact/hooks';
import { getLlmClient, QWEN_MODELS } from '../../db/llm-client';
import type { LlmModelInfo, ReasoningResponse, LlmProgress } from '../../db/llm-types';
import type { HybridResult } from '../../db/types';
import { publishLlmPrompt, publishLlmOutput, publishLlmCitation } from '../../core/stream';
import { glyphCaseManager } from '../../db/glyphcase.manager';
import { generateEnvelopeId } from '../../db/envelope.writer';
import { getLogger } from '@logtape/logtape';

const logger = getLogger(['llm']);

export interface UseLlmOptions {
  autoReason?: boolean;  // Auto-trigger reasoning after search
}

export function useLlm(options: UseLlmOptions = {}) {
  const [enabled, setEnabled] = useState(false);
  const [modelInfo, setModelInfo] = useState<LlmModelInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<LlmProgress | null>(null);
  const [reasoning, setReasoning] = useState<ReasoningResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [temperature, setTemperature] = useState<number>(0.7); // Default 0.7

  // Streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState<string>('');

  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const lastReasonTime = useRef<number>(0);

  // Rate limiting constants
  const MIN_REASON_INTERVAL = 5000; // 5 seconds between queries

  /**
   * Update elapsed time while loading
   */
  useEffect(() => {
    if (loading && !progress) {
      // Inference is happening (no download progress, but loading)
      startTimeRef.current = Date.now();
      setElapsedTime(0);

      // Update every 100ms
      timerRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        setElapsedTime(elapsed);
      }, 100);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    } else {
      // Not loading or has progress - clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsedTime(0);
    }
  }, [loading, progress]);

  /**
   * Load the LLM model
   */
  const loadModel = async () => {
    setLoading(true);
    setError(null);
    setProgress(null);

    try {
      const llmClient = getLlmClient();

      // Set up progress callback
      llmClient.onProgress((prog) => {
        setProgress(prog);
      });

      // Set up streaming callbacks
      llmClient.onStreamToken((token: string, piece: string) => {
        setStreamingText(prev => prev + piece);
      });

      llmClient.onStreamComplete(() => {
        setIsStreaming(false);
      });

      llmClient.onStreamError((err: string) => {
        setError(err);
        setIsStreaming(false);
        setStreamingText('');
      });

      // Load Qwen 3 0.6B model
      const info = await llmClient.loadModel(QWEN_MODELS['0.6b']);
      setModelInfo(info);
      setProgress(null);
      logger.info('Model loaded successfully', {
        modelId: info.modelId,
        size_mb: info.size
      });
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      logger.error('Failed to load model', { error: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Toggle LLM on/off
   */
  const toggle = async () => {
    if (!enabled) {
      // Enabling - load model if not loaded
      if (!modelInfo?.loaded) {
        await loadModel();
      }
      setEnabled(true);
    } else {
      // Disabling - unload model to free memory
      setEnabled(false);
      setReasoning(null);

      if (modelInfo?.loaded) {
        try {
          const llmClient = getLlmClient();
          await llmClient.unloadModel();
          setModelInfo({ ...modelInfo, loaded: false });
          logger.info('Model unloaded successfully', {
            modelId: modelInfo.modelId
          });
        } catch (err) {
          logger.error('Failed to unload model', { error: String(err) });
        }
      }
    }
  };

  /**
   * Run reasoning on search results
   */
  const reason = async (query: string, results: HybridResult[], maxTokens = 256) => {
    if (!modelInfo?.loaded) {
      logger.warn('Cannot reason: model not loaded');
      return;
    }

    // Rate limiting check
    const now = Date.now();
    const timeSinceLastReason = now - lastReasonTime.current;

    if (timeSinceLastReason < MIN_REASON_INTERVAL) {
      const waitTime = Math.ceil((MIN_REASON_INTERVAL - timeSinceLastReason) / 1000);
      const errorMsg = `Please wait ${waitTime}s before making another query (rate limit: 1 query per 5 seconds)`;
      setError(errorMsg);
      logger.warn('Rate limit hit', { wait_seconds: waitTime });
      return;
    }

    lastReasonTime.current = now;
    setLoading(true);
    setError(null);
    setIsStreaming(true);
    setStreamingText('');

    try {
      const llmClient = getLlmClient();

      // Take top 5 results as context
      const snippets = results.slice(0, 5).map((r) => ({
        gid: r.gid,
        pageNo: r.pageNo,
        title: r.title,
        text: r.snippet || '',
        score: r.scores.final,
      }));

      // Publish prompt event to stream
      publishLlmPrompt({
        prompt: query,
        context: snippets.map(s => s.text),
        model: modelInfo.modelId
      });

      const response = await llmClient.reason({
        question: query,
        snippets,
        maxTokens,
        temperature,
      });

      // Map used GIDs back to full snippet objects
      const usedSnippetObjects = response.usedSnippets
        .map(gid => snippets.find(s => s.gid === gid))
        .filter(s => s !== undefined);

      // Publish output event to stream
      publishLlmOutput({
        response: response.answer,
        citations: usedSnippetObjects.map(s => ({ gid: s.gid, pageNo: s.pageNo })),
        model: modelInfo.modelId
      });

      // Publish citation events for each used snippet
      usedSnippetObjects.forEach(snippet => {
        publishLlmCitation({
          gid: snippet.gid,
          pageNo: snippet.pageNo,
          title: snippet.title || undefined,
          snippet: snippet.text
        });
      });

      // Persist LLM output to envelope (if in dynamic mode)
      if (glyphCaseManager.isDynamic()) {
        const envelope = glyphCaseManager.getEnvelope();
        if (envelope.isOpen()) {
          const writer = envelope.getWriter();
          if (writer) {
            // Calculate relevance from average of used snippet scores
            const avgScore = usedSnippetObjects.length > 0
              ? usedSnippetObjects.reduce((sum, s) => sum + s.score, 0) / usedSnippetObjects.length
              : 1.0;

            await writer.appendSummary({
              id: generateEnvelopeId('llm'),
              summary: response.answer,
              relevance: avgScore,
              source_retrievals: response.usedSnippets // Array of GID strings
            });
          }
        }
      }

      setReasoning(response);
      setIsStreaming(false);
      logger.info('Reasoning complete', {
        query,
        tokensGenerated: response.tokensGenerated,
        inferenceTimeMs: response.inferenceTimeMs,
        usedSnippets: response.usedSnippets.length
      });
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      setIsStreaming(false);
      setStreamingText('');
      logger.error('Reasoning failed', { query, error: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Abort ongoing reasoning
   */
  const abortReasoning = async () => {
    try {
      const llmClient = getLlmClient();
      await llmClient.abortReasoning();
      setIsStreaming(false);
      setStreamingText('');
      setLoading(false);
      logger.info('Reasoning aborted');
    } catch (err) {
      logger.error('Failed to abort reasoning', { error: String(err) });
    }
  };

  /**
   * Clear reasoning results
   */
  const clearReasoning = () => {
    setReasoning(null);
  };

  return {
    // State
    enabled,
    modelInfo,
    loading,
    progress,
    reasoning,
    error,
    elapsedTime, // Elapsed time during inference (in seconds)
    temperature, // LLM temperature setting (0.0 - 1.0)
    isStreaming, // Whether LLM is currently streaming tokens
    streamingText, // Accumulated streaming text (live output)

    // Actions
    toggle,
    loadModel,
    reason,
    clearReasoning,
    abortReasoning, // Stop ongoing reasoning
    setTemperature, // Update temperature setting
  };
}
