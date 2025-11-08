/**
 * Entities Feature Hook
 *
 * Encapsulates entity browsing and filtering state.
 */

import { useState, useEffect } from 'preact/hooks';
import { getDbClient } from '../../db/client';
import type { EntityFacet } from '../../db/types';

export interface UseEntitiesOptions {
  autoLoad?: boolean;
  maxEntities?: number;
}

export function useEntities(options: UseEntitiesOptions = {}) {
  const { autoLoad = true, maxEntities = 50 } = options;

  const [entities, setEntities] = useState<EntityFacet[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load entities from database
   */
  const loadEntities = async () => {
    setLoading(true);
    setError(null);

    try {
      const dbClient = getDbClient();
      const entityList = await dbClient.listEntities(undefined, maxEntities);
      setEntities(entityList);
      console.log('[Entities] Loaded:', entityList.length);
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      console.error('[Entities] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Auto-load on mount if enabled
   */
  useEffect(() => {
    if (autoLoad) {
      loadEntities();
    }
  }, [autoLoad]);

  /**
   * Select entity type filter
   */
  const selectType = (type: string | null) => {
    setSelectedType(type);
  };

  /**
   * Get unique entity types
   */
  const getTypes = (): string[] => {
    return Array.from(new Set(entities.map((e) => e.entityType)));
  };

  /**
   * Get filtered entities
   */
  const getFilteredEntities = (): EntityFacet[] => {
    if (!selectedType) {
      return entities;
    }
    return entities.filter((e) => e.entityType === selectedType);
  };

  /**
   * Get count for a specific type
   */
  const getTypeCount = (type: string): number => {
    return entities
      .filter((e) => e.entityType === type)
      .reduce((sum, e) => sum + e.count, 0);
  };

  /**
   * Get total count across all entities
   */
  const getTotalCount = (): number => {
    return entities.reduce((sum, e) => sum + e.count, 0);
  };

  return {
    // State
    entities,
    selectedType,
    loading,
    error,

    // Computed
    types: getTypes(),
    filteredEntities: getFilteredEntities(),
    totalCount: getTotalCount(),

    // Actions
    loadEntities,
    selectType,
    getTypeCount,
  };
}
