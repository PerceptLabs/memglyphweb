/**
 * Assets Feature Module
 *
 * Asset protocol (asset://) handler for SQLAR files with blob lifecycle management
 */

export {
  loadAsset,
  loadPageBlob,
  preloadAssets,
  clearAssetCache,
  revokeAsset,
  getAssetCacheStats,
  useAsset,
} from './assetProtocol';
