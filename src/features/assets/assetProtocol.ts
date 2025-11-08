/**
 * Asset Protocol Handler
 *
 * Handles asset:// URLs and loads files from SQLAR storage.
 */

import { getDbClient } from '../../db/client';
import { parseAssetURL } from '../../gcui/v1/types';

/**
 * Asset cache to avoid repeated database queries
 */
const assetCache = new Map<string, string>();

/**
 * Load an asset from SQLAR by path
 *
 * @param assetUrl - asset://path/to/file
 * @returns Data URL or object URL for the asset
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

    // Query SQLAR table for the file
    const results = await dbClient.query<{ name: string; data: Blob | Uint8Array }>(
      `SELECT name, data FROM sqlar WHERE name = ?`,
      [parsed.path]
    );

    if (results.length === 0) {
      console.warn('[Assets] Asset not found:', parsed.path);
      return null;
    }

    const { data } = results[0];

    // Convert to Blob if needed
    const blob = data instanceof Blob ? data : new Blob([data]);

    // Create object URL
    const objectUrl = URL.createObjectURL(blob);

    // Cache it
    assetCache.set(assetUrl, objectUrl);

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
  }, [assetUrl]);

  return url;
}

// Import React for the hook
import * as React from 'preact/hooks';
