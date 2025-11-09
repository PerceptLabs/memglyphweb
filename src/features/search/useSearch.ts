/**
 * Search Feature Hook
 *
 * Encapsulates search state and logic for FTS, Hybrid, and Graph modes.
 */

import { useState, useEffect, useRef } from 'preact/hooks';
import { getDbClient } from '../../db/client';
import type { HybridResult, FtsResult } from '../../db/types';

export type SearchMode = 'fts' | 'hybrid' | 'graph';

export interface UseSearchOptions {
  defaultMode?: SearchMode;
  maxResults?: number;
  maxGraphHops?: number;
  debounceMs?: number; // Debounce delay in milliseconds
}

export interface EntityFilter {
  entityType?: string;
  entityValue?: string;
}

export function useSearch(options: UseSearchOptions = {}) {
  const {
    defaultMode = 'hybrid',
    maxResults = 10,
    maxGraphHops = 2,
    debounceMs = 300, // Default 300ms debounce
  } = options;

  const [mode, setMode] = useState<SearchMode>(defaultMode);
  const [results, setResults] = useState<HybridResult[] | null>(null);
  const [lastQuery, setLastQuery] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entityFilter, setEntityFilter] = useState<EntityFilter>({});
  const [pendingQuery, setPendingQuery] = useState<string>('');
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('memglyph-search-history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const debounceTimerRef = useRef<number | null>(null);

  /**
   * Debounce effect - executes search after delay
   */
  useEffect(() => {
    if (!pendingQuery.trim()) return;

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer
    debounceTimerRef.current = window.setTimeout(() => {
      executeSearch(pendingQuery);
    }, debounceMs);

    // Cleanup on unmount or when pendingQuery changes
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [pendingQuery, mode, entityFilter]);

  /**
   * Add query to search history
   */
  const addToHistory = (query: string) => {
    if (!query.trim()) return;

    const trimmed = query.trim();
    setSearchHistory((prev) => {
      // Remove duplicates and add to front
      const filtered = prev.filter((q) => q !== trimmed);
      const updated = [trimmed, ...filtered].slice(0, 10); // Keep last 10

      // Save to localStorage
      try {
        localStorage.setItem('memglyph-search-history', JSON.stringify(updated));
      } catch (e) {
        console.warn('[Search] Failed to save history:', e);
      }

      return updated;
    });
  };

  /**
   * Clear search history
   */
  const clearHistory = () => {
    setSearchHistory([]);
    try {
      localStorage.removeItem('memglyph-search-history');
    } catch (e) {
      console.warn('[Search] Failed to clear history:', e);
    }
  };

  /**
   * Execute search based on current mode (internal implementation)
   */
  const executeSearch = async (query: string) => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setLastQuery(query);

    // Add to history
    addToHistory(query);

    try {
      const dbClient = getDbClient();
      let searchResults: HybridResult[] = [];

      switch (mode) {
        case 'fts':
          searchResults = await searchFts(dbClient, query, maxResults, entityFilter);
          break;

        case 'hybrid':
          searchResults = await dbClient.searchHybrid(query, maxResults);
          break;

        case 'graph':
          searchResults = await searchGraph(dbClient, query, maxResults, maxGraphHops, entityFilter);
          break;

        default:
          throw new Error(`Unknown search mode: ${mode}`);
      }

      setResults(searchResults);
      console.log(`[Search] ${mode} mode: ${searchResults.length} results`);

      return searchResults;
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      console.error('[Search] Failed:', err);
      return [];
    } finally {
      setLoading(false);
    }
  };

  /**
   * Debounced search - sets pending query and waits for debounce
   */
  const search = (query: string) => {
    setPendingQuery(query);
  };

  /**
   * Immediate search - bypasses debounce (useful for button clicks)
   */
  const searchImmediate = (query: string) => {
    // Clear any pending debounced search
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setPendingQuery('');
    return executeSearch(query);
  };

  /**
   * Clear search results
   */
  const clear = () => {
    setResults(null);
    setLastQuery('');
    setError(null);
    setPendingQuery('');

    // Clear debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  };

  /**
   * Change search mode
   */
  const changeMode = (newMode: SearchMode) => {
    setMode(newMode);
    // Clear results when changing modes
    setResults(null);
  };

  /**
   * Set entity filter
   */
  const setFilter = (filter: EntityFilter) => {
    setEntityFilter(filter);
    // Clear results when filter changes
    setResults(null);
  };

  /**
   * Clear entity filter
   */
  const clearFilter = () => {
    setEntityFilter({});
    setResults(null);
  };

  return {
    // State
    mode,
    results,
    lastQuery,
    loading,
    error,
    entityFilter,
    searchHistory, // Recent search queries

    // Actions
    search, // Debounced search
    searchImmediate, // Immediate search (no debounce)
    clear,
    changeMode,
    setFilter,
    clearFilter,
    clearHistory, // Clear search history
  };
}

// ============================================================================
// Internal Search Implementations
// ============================================================================

/**
 * FTS-only search
 */
async function searchFts(
  dbClient: ReturnType<typeof getDbClient>,
  query: string,
  maxResults: number,
  entityFilter: EntityFilter
): Promise<HybridResult[]> {
  const ftsResults = await dbClient.searchFts(
    query,
    maxResults,
    entityFilter.entityType,
    entityFilter.entityValue
  );

  // Convert FtsResult to HybridResult format
  return ftsResults.map((r: FtsResult) => ({
    gid: r.gid,
    pageNo: r.pageNo,
    title: r.title,
    snippet: r.snippet,
    scores: {
      fts: r.score,
      vector: 0,
      entity: 0,
      graph: 0,
      final: r.score,
    },
  }));
}

/**
 * Graph-based search: FTS seed + graph expansion
 */
async function searchGraph(
  dbClient: ReturnType<typeof getDbClient>,
  query: string,
  maxResults: number,
  maxHops: number,
  entityFilter: EntityFilter
): Promise<HybridResult[]> {
  // Start with FTS to find seed nodes
  const ftsResults = await dbClient.searchFts(
    query,
    3,
    entityFilter.entityType,
    entityFilter.entityValue
  );

  if (ftsResults.length === 0) {
    return [];
  }

  // Use top FTS result as seed for graph traversal
  const seedGid = ftsResults[0].gid;
  const graphData = await dbClient.graphHops(seedGid, undefined, maxHops, maxResults);

  // Convert graph nodes to HybridResult format
  const results = graphData.nodes.map((node) => {
    const distance = graphData.distances[node.gid] || 0;
    const ftsMatch = ftsResults.find((r) => r.gid === node.gid);

    return {
      gid: node.gid,
      pageNo: node.pageNo,
      title: node.title,
      snippet: ftsMatch?.snippet || null,
      scores: {
        fts: ftsMatch?.score || 0,
        vector: 0,
        entity: 0,
        graph: 1.0 / (distance + 1), // Closer nodes score higher
        final: (ftsMatch?.score || 0) * 0.3 + (1.0 / (distance + 1)) * 0.7,
      },
    };
  });

  // Sort by final score
  results.sort((a, b) => b.scores.final - a.scores.final);

  return results;
}
