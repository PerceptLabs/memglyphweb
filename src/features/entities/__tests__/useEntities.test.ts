/**
 * Tests for useEntities hook
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '../../../test/renderHook';
import { useEntities } from '../useEntities';

// Mock the db client
vi.mock('../../../db/client', () => ({
  getDbClient: () => ({
    listEntities: vi.fn().mockResolvedValue([
      { entityType: 'Technology', normalizedValue: 'SQLite', count: 5 },
      { entityType: 'Technology', normalizedValue: 'Vector', count: 3 },
      { entityType: 'Person', normalizedValue: 'John Doe', count: 2 },
    ]),
  }),
}));

describe('useEntities', () => {
  it('should initialize with empty entities', () => {
    const { result } = renderHook(() => useEntities({ autoLoad: false }));

    expect(result.current.entities).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.selectedType).toBeNull();
  });

  it('should load entities', async () => {
    const { result } = renderHook(() => useEntities({ autoLoad: false }));

    await act(async () => {
      await result.current.loadEntities();
    });

    expect(result.current.entities.length).toBeGreaterThan(0);
    expect(result.current.entities[0]).toHaveProperty('entityType');
    expect(result.current.entities[0]).toHaveProperty('normalizedValue');
  });

  it('should get unique entity types', async () => {
    const { result } = renderHook(() => useEntities({ autoLoad: false }));

    await act(async () => {
      await result.current.loadEntities();
    });

    const types = result.current.types;
    expect(types).toContain('Technology');
    expect(types).toContain('Person');
    expect(types.length).toBe(2);
  });

  it('should select entity type', async () => {
    const { result } = renderHook(() => useEntities({ autoLoad: false }));

    await act(async () => {
      await result.current.loadEntities();
    });

    await act(() => {
      result.current.selectType('Technology');
    });

    expect(result.current.selectedType).toBe('Technology');
  });

  it('should filter entities by type', async () => {
    const { result } = renderHook(() => useEntities({ autoLoad: false }));

    await act(async () => {
      await result.current.loadEntities();
    });

    await act(() => {
      result.current.selectType('Technology');
    });

    const filtered = result.current.filteredEntities;
    expect(filtered.every((e) => e.entityType === 'Technology')).toBe(true);
  });

  it('should get type count correctly', async () => {
    const { result } = renderHook(() => useEntities({ autoLoad: false }));

    await act(async () => {
      await result.current.loadEntities();
    });

    const techCount = result.current.getTypeCount('Technology');
    expect(techCount).toBe(8); // 5 + 3
  });

  it('should calculate total count', async () => {
    const { result } = renderHook(() => useEntities({ autoLoad: false }));

    await act(async () => {
      await result.current.loadEntities();
    });

    expect(result.current.totalCount).toBe(10); // 5 + 3 + 2
  });

  it('should clear selection', async () => {
    const { result } = renderHook(() => useEntities({ autoLoad: false }));

    await act(async () => {
      await result.current.loadEntities();
    });

    await act(() => {
      result.current.selectType('Technology');
    });

    await act(() => {
      result.current.selectType(null);
    });

    expect(result.current.selectedType).toBeNull();
    expect(result.current.filteredEntities.length).toBe(result.current.entities.length);
  });
});
