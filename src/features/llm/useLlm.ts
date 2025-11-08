/**
 * LLM Feature Hook
 *
 * Encapsulates all LLM-related state and logic.
 */

import { useState } from 'preact/hooks';
import { getLlmClient, QWEN_MODELS } from '../../db/llm-client';
import type { LlmModelInfo, ReasoningResponse, LlmProgress } from '../../db/llm-types';
import type { HybridResult } from '../../db/types';

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

      const response = await llmClient.reason({
        question: query,
        snippets,
        maxTokens,
        temperature: 0.7,
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

    // Actions
    toggle,
    loadModel,
    reason,
    clearReasoning,
  };
}
