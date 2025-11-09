/**
 * Graph Hook
 *
 * Manages graph traversal state and navigation.
 */

import { useState, useEffect } from 'preact/hooks';
import { getDbClient } from '../../db/client';
import type { GraphNode, GraphEdge } from '../../db/types';

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  distances: Record<string, number>;
}

export interface UseGraphOptions {
  autoLoad?: boolean;
  maxHops?: number;
  limit?: number;
}

export function useGraph(options: UseGraphOptions = {}) {
  const { autoLoad = false, maxHops = 2, limit = 50 } = options;

  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [seedGid, setSeedGid] = useState<string | null>(null);
  const [predicate, setPredicate] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load graph from a seed node
   */
  const loadGraph = async (gid: string, pred?: string) => {
    setLoading(true);
    setError(null);
    setSeedGid(gid);
    setPredicate(pred);

    try {
      const dbClient = getDbClient();
      const result = await dbClient.graphHops(gid, pred, maxHops, limit);

      setGraphData(result);
      console.log('[Graph] Loaded:', result.nodes.length, 'nodes,', result.edges.length, 'edges');
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      console.error('[Graph] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Navigate to a different seed node
   */
  const navigateToNode = async (gid: string) => {
    await loadGraph(gid, predicate);
  };

  /**
   * Filter by predicate
   */
  const filterByPredicate = async (pred?: string) => {
    if (seedGid) {
      await loadGraph(seedGid, pred);
    }
  };

  /**
   * Clear graph
   */
  const clear = () => {
    setGraphData(null);
    setSeedGid(null);
    setPredicate(undefined);
    setError(null);
  };

  /**
   * Get unique predicates from current graph
   */
  const getPredicates = (): string[] => {
    if (!graphData) return [];
    return Array.from(new Set(graphData.edges.map((e) => e.predicate)));
  };

  /**
   * Get node by GID
   */
  const getNode = (gid: string): GraphNode | undefined => {
    return graphData?.nodes.find((n) => n.gid === gid);
  };

  /**
   * Get edges from a node
   */
  const getNodeEdges = (gid: string): GraphEdge[] => {
    if (!graphData) return [];
    return graphData.edges.filter((e) => e.fromGid === gid);
  };

  /**
   * Auto-load if enabled and seed is set
   */
  useEffect(() => {
    if (autoLoad && seedGid) {
      loadGraph(seedGid, predicate);
    }
  }, [autoLoad]);

  return {
    // State
    graphData,
    seedGid,
    predicate,
    loading,
    error,

    // Computed
    predicates: getPredicates(),
    nodeCount: graphData?.nodes.length || 0,
    edgeCount: graphData?.edges.length || 0,

    // Actions
    loadGraph,
    navigateToNode,
    filterByPredicate,
    clear,
    getNode,
    getNodeEdges,
  };
}
