/**
 * Page Browser Hook
 *
 * Encapsulates page list loading and pagination state.
 */

import { useState, useEffect } from 'preact/hooks';
import { getDbClient } from '../../db/client';
import type { PageInfo } from '../../db/types';

export interface UsePageBrowserOptions {
  autoLoad?: boolean;
  pageSize?: number;
}

export function usePageBrowser(options: UsePageBrowserOptions = {}) {
  const { autoLoad = false, pageSize = 100 } = options;

  const [pages, setPages] = useState<PageInfo[]>([]);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load pages from database
   */
  const loadPages = async (limit = pageSize, offset = 0) => {
    setLoading(true);
    setError(null);

    try {
      const dbClient = getDbClient();
      const pageList = await dbClient.getPageList(limit, offset);

      if (offset === 0) {
        // Initial load - replace pages
        setPages(pageList);
      } else {
        // Pagination - append pages
        setPages((prev) => [...prev, ...pageList]);
      }

      // Update total count (approximate based on current load)
      if (pageList.length < limit) {
        setTotalPages(offset + pageList.length);
      }

      console.log('[PageBrowser] Loaded:', pageList.length, 'pages (offset:', offset, ')');
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      console.error('[PageBrowser] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Load more pages (pagination)
   */
  const loadMore = async () => {
    await loadPages(pageSize, pages.length);
  };

  /**
   * Refresh page list
   */
  const refresh = async () => {
    await loadPages(pageSize, 0);
  };

  /**
   * Auto-load on mount if enabled
   */
  useEffect(() => {
    if (autoLoad) {
      loadPages();
    }
  }, [autoLoad]);

  return {
    // State
    pages,
    totalPages,
    loading,
    error,

    // Actions
    loadPages,
    loadMore,
    refresh,
  };
}
