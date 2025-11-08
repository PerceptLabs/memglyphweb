/**
 * LLM Panel Component
 *
 * Provides UI for LLM reasoning feature.
 */

import type { HybridResult } from '../../db/types';
import type { UseLlmOptions } from './useLlm';
import { useLlm } from './useLlm';

export interface LlmPanelProps {
  searchResults?: HybridResult[] | null;
  lastQuery?: string;
  options?: UseLlmOptions;
}

export function LlmPanel({ searchResults, lastQuery, options }: LlmPanelProps) {
  const llm = useLlm(options);

  return (
    <>
      {/* LLM Toggle */}
      <div className="llm-toggle">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={llm.enabled}
            onChange={llm.toggle}
            disabled={llm.loading}
          />
          <span className="toggle-text">
            🤖 Enable LLM Reasoning (Qwen 3 0.6B)
          </span>
        </label>
        {llm.modelInfo?.loaded && (
          <span className="model-status">✅ Model loaded</span>
        )}
        {llm.progress && (
          <div className="llm-progress">
            {llm.progress.message} ({(llm.progress.progress * 100).toFixed(0)}%)
          </div>
        )}
        {llm.error && (
          <div className="llm-error">
            ⚠️ {llm.error}
          </div>
        )}
      </div>

      {/* Reasoning Output */}
      {llm.reasoning && (
        <div className="reasoning-output">
          <div className="reasoning-header">
            <h4>🤖 LLM Reasoning</h4>
            <span className="reasoning-meta">
              {llm.reasoning.inferenceTimeMs.toFixed(0)}ms · {llm.reasoning.tokensGenerated} tokens
            </span>
          </div>
          <div className="reasoning-answer">{llm.reasoning.answer}</div>
          {llm.reasoning.usedSnippets.length > 0 && (
            <div className="reasoning-citations">
              <strong>📑 Cited sources:</strong>
              {llm.reasoning.usedSnippets.map((gid) => {
                const result = searchResults?.find((r) => r.gid === gid);
                return (
                  <span key={gid} className="citation">
                    Page {result?.pageNo || '?'}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {llm.loading && !llm.reasoning && (
        <div className="reasoning-loading">
          <div className="spinner"></div>
          <p>LLM is reasoning...</p>
        </div>
      )}
    </>
  );
}

/**
 * LLM Toggle Component (minimal version for capsule info panel)
 */
export interface LlmToggleProps {
  enabled: boolean;
  loading: boolean;
  modelLoaded: boolean;
  progress: { message: string; progress: number } | null;
  error: string | null;
  onToggle: () => void;
}

export function LlmToggle({
  enabled,
  loading,
  modelLoaded,
  progress,
  error,
  onToggle,
}: LlmToggleProps) {
  return (
    <div className="llm-toggle">
      <label className="toggle-label">
        <input
          type="checkbox"
          checked={enabled}
          onChange={onToggle}
          disabled={loading}
        />
        <span className="toggle-text">
          🤖 Enable LLM Reasoning (Qwen 3 0.6B)
        </span>
      </label>
      {modelLoaded && <span className="model-status">✅ Model loaded</span>}
      {progress && (
        <div className="llm-progress">
          {progress.message} ({(progress.progress * 100).toFixed(0)}%)
        </div>
      )}
      {error && (
        <div className="llm-error">
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}

/**
 * Reasoning Output Component (standalone)
 */
export interface ReasoningOutputProps {
  reasoning: {
    answer: string;
    inferenceTimeMs: number;
    tokensGenerated: number;
    usedSnippets: string[];
  };
  searchResults?: HybridResult[] | null;
  loading?: boolean;
}

export function ReasoningOutput({ reasoning, searchResults, loading }: ReasoningOutputProps) {
  if (loading && !reasoning) {
    return (
      <div className="reasoning-loading">
        <div className="spinner"></div>
        <p>LLM is reasoning...</p>
      </div>
    );
  }

  if (!reasoning) {
    return null;
  }

  return (
    <div className="reasoning-output">
      <div className="reasoning-header">
        <h4>🤖 LLM Reasoning</h4>
        <span className="reasoning-meta">
          {reasoning.inferenceTimeMs.toFixed(0)}ms · {reasoning.tokensGenerated} tokens
        </span>
      </div>
      <div className="reasoning-answer">{reasoning.answer}</div>
      {reasoning.usedSnippets.length > 0 && (
        <div className="reasoning-citations">
          <strong>📑 Cited sources:</strong>
          {reasoning.usedSnippets.map((gid) => {
            const result = searchResults?.find((r) => r.gid === gid);
            return (
              <span key={gid} className="citation">
                Page {result?.pageNo || '?'}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
