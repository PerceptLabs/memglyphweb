/**
 * Search Feature Hook
 *
 * Encapsulates search state and logic for FTS, Hybrid, and Graph modes.
 */

import { useState } from 'preact/hooks';
import { getDbClient } from '../../db/client';
import type { HybridResult, FtsResult } from '../../db/types';

export type SearchMode = 'fts' | 'hybrid' | 'graph';

export interface UseSearchOptions {
  defaultMode?: SearchMode;
  maxResults?: number;
  maxGraphHops?: number;
}

export function useSearch(options: UseSearchOptions = {}) {
  const {
    defaultMode = 'hybrid',
    maxResults = 10,
    maxGraphHops = 2,
  } = options;

  const [mode, setMode] = useState<SearchMode>(defaultMode);
  const [results, setResults] = useState<HybridResult[] | null>(null);
  const [lastQuery, setLastQuery] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Execute search based on current mode
   */
  const search = async (query: string) => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setLastQuery(query);

    try {
      const dbClient = getDbClient();
      let searchResults: HybridResult[] = [];

      switch (mode) {
        case 'fts':
          searchResults = await searchFts(dbClient, query, maxResults);
          break;

        case 'hybrid':
          searchResults = await dbClient.searchHybrid(query, maxResults);
          break;

        case 'graph':
          searchResults = await searchGraph(dbClient, query, maxResults, maxGraphHops);
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
   * Clear search results
   */
  const clear = () => {
    setResults(null);
    setLastQuery('');
    setError(null);
  };

  /**
   * Change search mode
   */
  const changeMode = (newMode: SearchMode) => {
    setMode(newMode);
    // Clear results when changing modes
    setResults(null);
  };

  return {
    // State
    mode,
    results,
    lastQuery,
    loading,
    error,

    // Actions
    search,
    clear,
    changeMode,
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
  maxResults: number
): Promise<HybridResult[]> {
  const ftsResults = await dbClient.searchFts(query, maxResults);

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
  maxHops: number
): Promise<HybridResult[]> {
  // Start with FTS to find seed nodes
  const ftsResults = await dbClient.searchFts(query, 3);

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
