/**
 * Search Panel Component
 *
 * Provides UI for search functionality with mode selection.
 */

import { useState } from 'preact/hooks';
import DOMPurify from 'dompurify';
import type { SearchMode } from './useSearch';
import type { HybridResult } from '../../db/types';
import { glyphCaseManager } from '../../db/glyphcase.manager';
import { generateEnvelopeId } from '../../db/envelope.writer';
import { publishFeedback } from '../../core/stream';

export interface SearchModeToggleProps {
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  showToggle?: boolean;
}

export function SearchModeToggle({ mode, onModeChange, showToggle = true }: SearchModeToggleProps) {
  if (!showToggle) {
    return null;
  }

  return (
    <div className="search-mode-toggle">
      <button
        className={`mode-btn ${mode === 'fts' ? 'active' : ''}`}
        onClick={() => onModeChange('fts')}
      >
        📝 FTS Only
      </button>
      <button
        className={`mode-btn ${mode === 'hybrid' ? 'active' : ''}`}
        onClick={() => onModeChange('hybrid')}
      >
        ⚡ Hybrid
      </button>
      <button
        className={`mode-btn ${mode === 'graph' ? 'active' : ''}`}
        onClick={() => onModeChange('graph')}
      >
        🕸️ Graph
      </button>
    </div>
  );
}

export interface SearchBarProps {
  onSearch: (query: string) => void;
  loading?: boolean;
  placeholder?: string;
  searchHistory?: string[];
  onClearHistory?: () => void;
}

export function SearchBar({ onSearch, loading, placeholder, searchHistory, onClearHistory }: SearchBarProps) {
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          const query = formData.get('query') as string;
          if (query?.trim()) {
            onSearch(query.trim());
          }
        }}
      >
        <div className="search-bar">
          <input
            type="text"
            name="query"
            placeholder={placeholder || 'Search the capsule...'}
            className="search-input"
            disabled={loading}
          />
          <button type="submit" className="btn-search" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {/* Search History */}
      {searchHistory && searchHistory.length > 0 && (
        <div className="search-history">
          <div className="search-history-header">
            <span className="search-history-label">Recent searches:</span>
            {onClearHistory && (
              <button
                className="search-history-clear"
                onClick={onClearHistory}
                type="button"
              >
                Clear
              </button>
            )}
          </div>
          <div className="search-history-items">
            {searchHistory.map((query, index) => (
              <button
                key={index}
                className="search-history-item"
                onClick={() => onSearch(query)}
                type="button"
              >
                {query}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

interface FeedbackButtonsProps {
  resultGid: string;
  retrievalId?: string;
}

function FeedbackButtons({ resultGid, retrievalId }: FeedbackButtonsProps) {
  const [feedback, setFeedback] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleFeedback = async (rating: -1 | 0 | 1) => {
    setSubmitting(true);
    try {
      // Publish to stream
      publishFeedback({
        retrievalId,
        rating,
        notes: undefined
      });

      // Log to envelope if in dynamic mode
      if (glyphCaseManager.isDynamic()) {
        const envelope = glyphCaseManager.getEnvelope();
        const writer = envelope.getWriter();

        if (writer) {
          await writer.appendFeedback({
            id: generateEnvelopeId('fb'),
            retrieval_id: retrievalId,
            rating,
            notes: undefined
          });
        }
      }

      setFeedback(rating);
    } catch (err) {
      console.error('[Feedback] Failed to submit feedback:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!glyphCaseManager.isDynamic()) {
    // Only show feedback buttons in dynamic mode
    return null;
  }

  return (
    <div className="result-feedback">
      <button
        className={`feedback-btn ${feedback === 1 ? 'feedback-btn-active-positive' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          handleFeedback(1);
        }}
        disabled={submitting || feedback !== null}
        title="Helpful result"
      >
        👍
      </button>
      <button
        className={`feedback-btn ${feedback === -1 ? 'feedback-btn-active-negative' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          handleFeedback(-1);
        }}
        disabled={submitting || feedback !== null}
        title="Not helpful"
      >
        👎
      </button>
    </div>
  );
}

export interface SearchResultsProps {
  results: HybridResult[];
  query: string;
  onResultClick?: (gid: string) => void;
  retrievalId?: string;
}

export function SearchResults({ results, query, onResultClick, retrievalId }: SearchResultsProps) {
  return (
    <div className="search-results">
      <p className="results-header">
        Found {results.length} results for <strong>"{query}"</strong>
      </p>
      {results.map((result) => (
        <div
          key={result.gid}
          className={`result-item ${onResultClick ? 'result-item-clickable' : ''}`}
          onClick={() => onResultClick?.(result.gid)}
          style={{ cursor: onResultClick ? 'pointer' : 'default' }}
        >
          <div className="result-header">
            <span className="result-page">Page {result.pageNo}</span>
            <span className="result-score">Score: {result.scores.final.toFixed(3)}</span>
            <FeedbackButtons resultGid={result.gid} retrievalId={retrievalId} />
          </div>
          <h4 className="result-title">{result.title}</h4>
          {result.snippet && (
            <p
              className="result-snippet"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(result.snippet, {
                  ALLOWED_TAGS: ['mark', 'strong', 'em', 'b', 'i'],
                  ALLOWED_ATTR: [],
                })
              }}
            />
          )}
          <div className="result-scores">
            <span>FTS: {result.scores.fts.toFixed(2)}</span>
            <span>Entity: {result.scores.entity.toFixed(2)}</span>
            <span>Graph: {result.scores.graph.toFixed(2)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export interface SearchPanelProps {
  mode: SearchMode;
  results: HybridResult[] | null;
  lastQuery: string;
  loading: boolean;
  onSearch: (query: string) => void;
  onModeChange: (mode: SearchMode) => void;
  onResultClick?: (gid: string) => void;
  showModeToggle?: boolean;
  placeholder?: string;
  searchHint?: string;
  searchHistory?: string[];
  onClearHistory?: () => void;
}

export function SearchPanel({
  mode,
  results,
  lastQuery,
  loading,
  onSearch,
  onModeChange,
  onResultClick,
  showModeToggle = true,
  placeholder,
  searchHint,
  searchHistory,
  onClearHistory,
}: SearchPanelProps) {
  return (
    <div className="search-section">
      <div className="search-header">
        <h3>🔍 Search</h3>
      </div>

      {/* Search Mode Toggle */}
      <SearchModeToggle mode={mode} onModeChange={onModeChange} showToggle={showModeToggle} />

      {/* Search Hint */}
      {searchHint && <p className="search-hint">{searchHint}</p>}

      {/* Keyboard Shortcuts Hint */}
      <div className="keyboard-shortcuts-hint">
        <span className="shortcut-item">
          <kbd>/</kbd> Focus search
        </span>
        <span className="shortcut-item">
          <kbd>Ctrl+L</kbd> Toggle LLM
        </span>
        <span className="shortcut-item">
          <kbd>Esc</kbd> Clear focus
        </span>
      </div>

      {/* Search Bar */}
      <SearchBar
        onSearch={onSearch}
        loading={loading}
        placeholder={placeholder}
        searchHistory={searchHistory}
        onClearHistory={onClearHistory}
      />

      {/* Search Results */}
      {results && results.length > 0 && (
        <SearchResults results={results} query={lastQuery} onResultClick={onResultClick} />
      )}

      {/* No Results */}
      {results && results.length === 0 && (
        <div className="no-results">
          <p>No results found for <strong>"{lastQuery}"</strong></p>
          <p className="search-hint">Try different keywords or search terms.</p>
        </div>
      )}
    </div>
  );
}
