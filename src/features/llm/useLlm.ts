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

  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

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

    setLoading(true);
    setError(null);

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
      console.log('[LLM] Reasoning complete:', response);
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      console.error('[LLM] Reasoning failed:', err);
    } finally {
      setLoading(false);
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

    // Actions
    toggle,
    loadModel,
    reason,
    clearReasoning,
    setTemperature, // Update temperature setting
  };
}
