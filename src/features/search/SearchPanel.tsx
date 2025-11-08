/**
 * Search Panel Component
 *
 * Provides UI for search functionality with mode selection.
 */

import type { SearchMode } from './useSearch';
import type { HybridResult } from '../../db/types';

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
}

export function SearchBar({ onSearch, loading, placeholder }: SearchBarProps) {
  return (
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
  );
}

export interface SearchResultsProps {
  results: HybridResult[];
  query: string;
  onResultClick?: (gid: string) => void;
}

export function SearchResults({ results, query, onResultClick }: SearchResultsProps) {
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
          </div>
          <h4 className="result-title">{result.title}</h4>
          {result.snippet && (
            <p
              className="result-snippet"
              dangerouslySetInnerHTML={{ __html: result.snippet }}
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

      {/* Search Bar */}
      <SearchBar onSearch={onSearch} loading={loading} placeholder={placeholder} />

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
