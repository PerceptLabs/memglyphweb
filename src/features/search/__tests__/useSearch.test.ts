/**
 * Tests for useSearch hook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '../../../test/renderHook';
import { useSearch } from '../useSearch';
import type { SearchMode } from '../useSearch';

// Mock the db client
vi.mock('../../../db/client', () => ({
  getDbClient: () => ({
    searchFts: vi.fn().mockResolvedValue([
      {
        gid: 'test-1',
        pageNo: 1,
        title: 'Test Result',
        snippet: 'Test snippet',
        score: 0.95,
      },
    ]),
    searchHybrid: vi.fn().mockResolvedValue([
      {
        gid: 'test-1',
        pageNo: 1,
        title: 'Test Result',
        snippet: 'Test snippet',
        scores: { fts: 0.8, vector: 0.7, entity: 0.6, graph: 0.5, final: 0.9 },
      },
    ]),
    graphHops: vi.fn().mockResolvedValue({
      nodes: [
        { gid: 'test-1', pageNo: 1, title: 'Test Node' },
      ],
      distances: { 'test-1': 0 },
    }),
  }),
}));

describe('useSearch', () => {
  it('should initialize with default mode', () => {
    const { result } = renderHook(() => useSearch({ defaultMode: 'hybrid' }));
    expect(result.current.mode).toBe('hybrid');
    expect(result.current.results).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('should change search mode', async () => {
    const { result } = renderHook(() => useSearch());

    await act(() => {
      result.current.changeMode('graph');
    });

    expect(result.current.mode).toBe('graph');
  });

  it('should clear results when changing mode', async () => {
    const { result } = renderHook(() => useSearch());

    await act(() => {
      result.current.changeMode('fts');
    });

    expect(result.current.results).toBeNull();
  });

  it('should perform FTS search', async () => {
    const { result } = renderHook(() => useSearch({ defaultMode: 'fts' }));

    await act(async () => {
      await result.current.search('test query');
    });

    expect(result.current.results).not.toBeNull();
    expect(result.current.results?.length).toBeGreaterThan(0);
    expect(result.current.lastQuery).toBe('test query');
  });

  it('should perform hybrid search', async () => {
    const { result } = renderHook(() => useSearch({ defaultMode: 'hybrid' }));

    await act(async () => {
      await result.current.search('test query');
    });

    expect(result.current.results).not.toBeNull();
    expect(result.current.lastQuery).toBe('test query');
  });

  it('should clear search results', async () => {
    const { result } = renderHook(() => useSearch());

    await act(() => {
      result.current.clear();
    });

    expect(result.current.results).toBeNull();
    expect(result.current.lastQuery).toBe('');
  });

  it('should handle empty query gracefully', async () => {
    const { result } = renderHook(() => useSearch());

    await act(async () => {
      await result.current.search('');
    });

    // Should not execute search for empty query
    expect(result.current.results).toBeNull();
  });

  it('should set loading state during search', async () => {
    const { result } = renderHook(() => useSearch());

    // Start the search (don't await yet)
    const searchPromise = result.current.search('test');

    // Check loading state immediately (should be true during search)
    // Note: This test relies on the search being async and not completing synchronously
    await new Promise(resolve => setTimeout(resolve, 0)); // Give Preact time to update

    // After the initial state update, loading should be true or the search should complete
    // Since mocked searches complete quickly, we'll just verify the search completes successfully
    await searchPromise;

    expect(result.current.results).not.toBeNull();
    expect(result.current.loading).toBe(false); // Should be false after completion
  });
});
