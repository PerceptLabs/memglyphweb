/**
 * Tests for asset protocol
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadAsset,
  loadPageBlob,
  clearAssetCache,
  revokeAsset,
  getAssetCacheStats,
} from '../assetProtocol';

// Mock the db client
const mockGetPageBlob = vi.fn();
vi.mock('../../../db/client', () => ({
  getDbClient: () => ({
    getPageBlob: mockGetPageBlob,
  }),
}));

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url-123');
global.URL.revokeObjectURL = vi.fn();

describe('Asset Protocol', () => {
  beforeEach(() => {
    clearAssetCache();
    vi.clearAllMocks();
  });

  it('should load asset and create blob URL', async () => {
    const mockBlob = new Blob(['test data'], { type: 'image/png' });
    mockGetPageBlob.mockResolvedValue(mockBlob);

    const url = await loadAsset('asset://test.png');

    expect(url).toBe('blob:mock-url-123');
    expect(mockGetPageBlob).toHaveBeenCalledWith('test.png');
    expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
  });

  it('should cache loaded assets', async () => {
    const mockBlob = new Blob(['test data'], { type: 'image/png' });
    mockGetPageBlob.mockResolvedValue(mockBlob);

    // Load asset twice
    await loadAsset('asset://test.png');
    await loadAsset('asset://test.png');

    // Should only call getPageBlob once (cached on second call)
    expect(mockGetPageBlob).toHaveBeenCalledTimes(1);
  });

  it('should handle invalid asset URLs', async () => {
    const url = await loadAsset('invalid://url');
    expect(url).toBeNull();
  });

  it('should handle empty blobs', async () => {
    const emptyBlob = new Blob([], { type: 'image/png' });
    mockGetPageBlob.mockResolvedValue(emptyBlob);

    const url = await loadAsset('asset://empty.png');
    expect(url).toBeNull();
  });

  it('should revoke specific asset', async () => {
    const mockBlob = new Blob(['test data'], { type: 'image/png' });
    mockGetPageBlob.mockResolvedValue(mockBlob);

    await loadAsset('asset://test.png');
    revokeAsset('asset://test.png');

    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url-123');
  });

  it('should clear all assets from cache', async () => {
    const mockBlob = new Blob(['test data'], { type: 'image/png' });
    mockGetPageBlob.mockResolvedValue(mockBlob);

    await loadAsset('asset://test1.png');
    await loadAsset('asset://test2.png');

    clearAssetCache();

    const stats = getAssetCacheStats();
    expect(stats.count).toBe(0);
    expect(global.URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('should track cache statistics', async () => {
    const mockBlob1 = new Blob(['test data 1'], { type: 'image/png' });
    const mockBlob2 = new Blob(['test data 2'], { type: 'image/jpeg' });

    mockGetPageBlob
      .mockResolvedValueOnce(mockBlob1)
      .mockResolvedValueOnce(mockBlob2);

    await loadAsset('asset://test1.png');
    await loadAsset('asset://test2.jpg');

    const stats = getAssetCacheStats();
    expect(stats.count).toBe(2);
    expect(stats.totalSize).toBeGreaterThan(0);
    expect(stats.urls).toContain('asset://test1.png');
    expect(stats.urls).toContain('asset://test2.jpg');
  });

  it('should support loadPageBlob convenience wrapper', async () => {
    const mockBlob = new Blob(['test data'], { type: 'application/pdf' });
    mockGetPageBlob.mockResolvedValue(mockBlob);

    const url = await loadPageBlob('document.pdf');

    expect(url).toBe('blob:mock-url-123');
    expect(mockGetPageBlob).toHaveBeenCalledWith('document.pdf');
  });
});
