/**
 * Asset Protocol Handler
 *
 * Handles asset:// URLs and loads files from SQLAR storage.
 * Provides blob lifecycle management for images, PDFs, and other assets.
 */

import { getDbClient } from '../../db/client';
import { parseAssetURL } from '../../gcui/v1/types';

/**
 * Asset cache to avoid repeated database queries
 * Maps asset path -> object URL
 */
const assetCache = new Map<string, string>();

/**
 * Blob cache with automatic cleanup via WeakMap
 * Tracks Blob objects to prevent garbage collection of cached blobs
 */
const blobRefs = new Map<string, Blob>();

/**
 * Load an asset from SQLAR by path
 *
 * @param assetUrl - asset://path/to/file
 * @returns Object URL for the asset
 */
export async function loadAsset(assetUrl: string): Promise<string | null> {
  // Check cache first
  if (assetCache.has(assetUrl)) {
    return assetCache.get(assetUrl)!;
  }

  // Parse asset URL
  const parsed = parseAssetURL(assetUrl);
  if (!parsed) {
    console.error('[Assets] Invalid asset URL:', assetUrl);
    return null;
  }

  try {
    const dbClient = getDbClient();

    // Use getPageBlob for type-safe blob retrieval
    const blob = await dbClient.getPageBlob(parsed.path);

    if (!blob || blob.size === 0) {
      console.warn('[Assets] Asset not found or empty:', parsed.path);
      return null;
    }

    // Create object URL
    const objectUrl = URL.createObjectURL(blob);

    // Cache both URL and blob reference
    assetCache.set(assetUrl, objectUrl);
    blobRefs.set(assetUrl, blob);

    console.log('[Assets] Loaded:', parsed.path, `(${blob.size} bytes, ${blob.type || 'unknown type'})`);

    return objectUrl;
  } catch (err) {
    console.error('[Assets] Failed to load asset:', assetUrl, err);
    return null;
  }
}

/**
 * Preload multiple assets
 */
export async function preloadAssets(assetUrls: string[]): Promise<void> {
  await Promise.all(assetUrls.map((url) => loadAsset(url)));
}

/**
 * Clear asset cache (useful when switching capsules)
 */
export function clearAssetCache(): void {
  // Revoke all object URLs
  assetCache.forEach((url) => {
    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  });

  assetCache.clear();
  blobRefs.clear();

  console.log('[Assets] Cache cleared');
}

/**
 * Revoke a specific asset URL and remove from cache
 */
export function revokeAsset(assetUrl: string): void {
  const objectUrl = assetCache.get(assetUrl);
  if (objectUrl && objectUrl.startsWith('blob:')) {
    URL.revokeObjectURL(objectUrl);
  }

  assetCache.delete(assetUrl);
  blobRefs.delete(assetUrl);
}

/**
 * Get cached asset stats
 */
export function getAssetCacheStats() {
  const totalSize = Array.from(blobRefs.values()).reduce(
    (sum, blob) => sum + blob.size,
    0
  );

  return {
    count: assetCache.size,
    totalSize,
    urls: Array.from(assetCache.keys()),
  };
}

/**
 * Load page blob by name (convenience wrapper)
 */
export async function loadPageBlob(name: string): Promise<string | null> {
  return loadAsset(`asset://${name}`);
}

/**
 * React hook for loading assets
 */
export function useAsset(assetUrl: string | undefined): string | null {
  const [url, setUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!assetUrl) {
      setUrl(null);
      return;
    }

    // If it's not an asset:// URL, use it directly
    if (!assetUrl.startsWith('asset://')) {
      setUrl(assetUrl);
      return;
    }

    // Load from SQLAR
    loadAsset(assetUrl).then(setUrl);

    // Cleanup: optionally revoke on unmount (disabled by default to allow sharing)
    // return () => {
    //   if (url && url.startsWith('blob:')) {
    //     revokeAsset(assetUrl);
    //   }
    // };
  }, [assetUrl]);

  return url;
}

// Import React for the hook
import * as React from 'preact/hooks';
