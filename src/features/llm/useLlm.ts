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
      console.log('[LLM] Model loaded:', info);
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      console.error('[LLM] Failed to load model:', err);
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
      // Disabling
      setEnabled(false);
      setReasoning(null);
    }
  };

  /**
   * Run reasoning on search results
   */
  const reason = async (query: string, results: HybridResult[], maxTokens = 256) => {
    if (!modelInfo?.loaded) {
      console.warn('[LLM] Cannot reason: model not loaded');
      return;
    }

    // Rate limiting check
    const now = Date.now();
    const timeSinceLastReason = now - lastReasonTime.current;

    if (timeSinceLastReason < MIN_REASON_INTERVAL) {
      const waitTime = Math.ceil((MIN_REASON_INTERVAL - timeSinceLastReason) / 1000);
      const errorMsg = `Please wait ${waitTime}s before making another query (rate limit: 1 query per 5 seconds)`;
      setError(errorMsg);
      console.warn('[LLM] Rate limit hit:', errorMsg);
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

      // Publish output event to stream
      publishLlmOutput({
        response: response.answer,
        citations: response.usedSnippets.map(s => ({ gid: s.gid, pageNo: s.pageNo })),
        model: modelInfo.modelId
      });

      // Publish citation events for each used snippet
      response.usedSnippets.forEach(snippet => {
        publishLlmCitation({
          gid: snippet.gid,
          pageNo: snippet.pageNo,
          title: snippet.title || undefined,
          snippet: snippet.text
        });
      });

      setReasoning(response);
      setIsStreaming(false);
      console.log('[LLM] Reasoning complete:', response);
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      setIsStreaming(false);
      setStreamingText('');
      console.error('[LLM] Reasoning failed:', err);
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
      console.log('[LLM] Reasoning aborted');
    } catch (err) {
      console.error('[LLM] Failed to abort reasoning:', err);
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
