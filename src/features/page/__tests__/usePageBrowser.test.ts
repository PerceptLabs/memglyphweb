/**
 * Tests for usePageBrowser hook
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '../../../test/renderHook';
import { usePageBrowser } from '../usePageBrowser';

// Mock the db client
vi.mock('../../../db/client', () => ({
  getDbClient: () => ({
    getPageList: vi.fn().mockImplementation((limit, offset) => {
      // Return mock pages based on offset
      const mockPages = Array.from({ length: Math.min(limit, 10) }, (_, i) => ({
        gid: `page-${offset + i}`,
        docId: 'test-doc',
        pageNo: offset + i,
        title: `Page ${offset + i}`,
        tags: 'test',
        updatedTs: new Date().toISOString(),
      }));
      return Promise.resolve(mockPages);
    }),
  }),
}));

describe('usePageBrowser', () => {
  it('should initialize without auto-loading', () => {
    const { result } = renderHook(() => usePageBrowser({ autoLoad: false }));

    expect(result.current.pages).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should load pages on manual trigger', async () => {
    const { result } = renderHook(() => usePageBrowser({ autoLoad: false }));

    await act(async () => {
      await result.current.loadPages();
    });

    expect(result.current.pages.length).toBeGreaterThan(0);
    expect(result.current.loading).toBe(false);
  });

  it('should support pagination with loadMore', async () => {
    const { result } = renderHook(() => usePageBrowser({ autoLoad: false, pageSize: 10 }));

    // Initial load
    await act(async () => {
      await result.current.loadPages();
    });

    const initialCount = result.current.pages.length;

    // Load more
    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.pages.length).toBeGreaterThan(initialCount);
  });

  it('should refresh page list', async () => {
    const { result } = renderHook(() => usePageBrowser({ autoLoad: false }));

    // Initial load
    await act(async () => {
      await result.current.loadPages();
    });

    // Refresh
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.pages.length).toBeGreaterThan(0);
    expect(result.current.loading).toBe(false);
  });

  it('should handle custom page size', async () => {
    const { result } = renderHook(() => usePageBrowser({ autoLoad: false, pageSize: 5 }));

    await act(async () => {
      await result.current.loadPages();
    });

    expect(result.current.pages.length).toBeLessThanOrEqual(10);
  });
});
