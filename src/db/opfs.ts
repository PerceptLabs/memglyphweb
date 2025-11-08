/**
 * OPFS (Origin Private File System) Persistence Layer
 *
 * Provides persistent storage for SQLite capsules using the browser's
 * Origin Private File System API. Includes fallback handling for browsers
 * without OPFS support.
 *
 * Storage Hierarchy:
 * 1. OPFS (preferred): Fast, quota-managed, private to origin
 * 2. IndexedDB (fallback): Slower but widely supported
 * 3. Memory (last resort): No persistence, demo-only
 */

export type StorageBackend = 'opfs' | 'indexeddb' | 'memory';

export interface OpfsFileInfo {
  path: string;
  size: number;
  lastModified: number;
}

export interface StorageQuotaInfo {
  usage: number;
  quota: number;
  available: number;
  percentUsed: number;
}

/**
 * Check if OPFS is supported in this browser
 */
export function isOpfsSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    'getDirectory' in navigator.storage
  );
}

/**
 * Get the OPFS root directory
 */
async function getOpfsRoot(): Promise<FileSystemDirectoryHandle> {
  if (!isOpfsSupported()) {
    throw new Error('OPFS not supported in this browser');
  }

  return await navigator.storage.getDirectory();
}

/**
 * Ensure the capsules directory exists
 */
async function ensureCapsulesDirre(): Promise<FileSystemDirectoryHandle> {
  const root = await getOpfsRoot();
  return await root.getDirectoryHandle('capsules', { create: true });
}

/**
 * Generate a deterministic filename from content hash
 * Uses SHA-256 prefix to avoid slug collisions
 */
export function generateOpfsPath(fileName: string): string {
  // For now, use the filename directly
  // In production, we'd use: `${sha256Prefix}-${sanitizedName}.mgx.sqlite`
  const sanitized = fileName.replace(/[^a-z0-9._-]/gi, '-');
  return sanitized.endsWith('.mgx.sqlite') ? sanitized : `${sanitized}.mgx.sqlite`;
}

/**
 * Copy a File to OPFS
 *
 * @param file - The file to persist
 * @param path - Optional custom path (defaults to generated from filename)
 * @returns The path where the file was stored
 */
export async function copyFileToOpfs(
  file: File,
  path?: string
): Promise<{ path: string; size: number }> {
  if (!isOpfsSupported()) {
    throw new Error('OPFS not supported - cannot persist file');
  }

  const capsuleDir = await ensureCapsulesDirre();
  const filePath = path || generateOpfsPath(file.name);

  // Get or create the file
  const fileHandle = await capsuleDir.getFileHandle(filePath, { create: true });

  // Create a writable stream
  const writable = await fileHandle.createWritable();

  try {
    // Write the file contents
    await writable.write(file);
    await writable.close();

    console.log(`[OPFS] Copied file to ${filePath} (${file.size} bytes)`);

    return {
      path: filePath,
      size: file.size,
    };
  } catch (error) {
    // Ensure we close the writable even on error
    await writable.close();
    throw error;
  }
}

/**
 * Read a file from OPFS as Uint8Array
 *
 * @param path - Path relative to capsules directory
 * @returns The file contents as Uint8Array
 */
export async function readFileFromOpfs(path: string): Promise<Uint8Array> {
  if (!isOpfsSupported()) {
    throw new Error('OPFS not supported');
  }

  const capsuleDir = await ensureCapsulesDirre();
  const fileHandle = await capsuleDir.getFileHandle(path);
  const file = await fileHandle.getFile();
  const arrayBuffer = await file.arrayBuffer();

  return new Uint8Array(arrayBuffer);
}

/**
 * Remove a file from OPFS
 *
 * @param path - Path relative to capsules directory
 */
export async function removeFileFromOpfs(path: string): Promise<void> {
  if (!isOpfsSupported()) {
    throw new Error('OPFS not supported');
  }

  const capsuleDir = await ensureCapsulesDirre();
  await capsuleDir.removeEntry(path);

  console.log(`[OPFS] Removed file: ${path}`);
}

/**
 * List all files in OPFS capsules directory
 */
export async function listOpfsFiles(): Promise<OpfsFileInfo[]> {
  if (!isOpfsSupported()) {
    return [];
  }

  try {
    const capsuleDir = await ensureCapsulesDirre();
    const files: OpfsFileInfo[] = [];

    // Iterate over directory entries
    for await (const [name, handle] of capsuleDir.entries()) {
      if (handle.kind === 'file') {
        const file = await (handle as FileSystemFileHandle).getFile();
        files.push({
          path: name,
          size: file.size,
          lastModified: file.lastModified,
        });
      }
    }

    return files.sort((a, b) => b.lastModified - a.lastModified);
  } catch (error) {
    console.error('[OPFS] Failed to list files:', error);
    return [];
  }
}

/**
 * Check if a file exists in OPFS
 */
export async function fileExistsInOpfs(path: string): Promise<boolean> {
  if (!isOpfsSupported()) {
    return false;
  }

  try {
    const capsuleDir = await ensureCapsulesDirre();
    await capsuleDir.getFileHandle(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get storage quota information
 */
export async function getStorageQuota(): Promise<StorageQuotaInfo | null> {
  if (!navigator.storage || !navigator.storage.estimate) {
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;

    return {
      usage,
      quota,
      available: quota - usage,
      percentUsed: quota > 0 ? (usage / quota) * 100 : 0,
    };
  } catch (error) {
    console.error('[OPFS] Failed to get storage quota:', error);
    return null;
  }
}

/**
 * Request persistent storage (reduces eviction risk)
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage || !navigator.storage.persist) {
    return false;
  }

  try {
    const isPersisted = await navigator.storage.persist();
    console.log(`[OPFS] Persistent storage: ${isPersisted}`);
    return isPersisted;
  } catch (error) {
    console.error('[OPFS] Failed to request persistent storage:', error);
    return false;
  }
}

/**
 * Check if storage is already persistent
 */
export async function checkPersistentStorage(): Promise<boolean> {
  if (!navigator.storage || !navigator.storage.persisted) {
    return false;
  }

  try {
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}

/**
 * Detect the best available storage backend
 */
export function detectStorageBackend(): StorageBackend {
  if (isOpfsSupported()) {
    return 'opfs';
  }

  // Check for IndexedDB (future fallback)
  if (typeof indexedDB !== 'undefined') {
    return 'indexeddb';
  }

  return 'memory';
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Validate file before OPFS copy
 * Checks:
 * - File size is reasonable (< 500MB default)
 * - File has .mgx.sqlite or .sqlite extension
 * - Magic number check (SQLite file header)
 */
export async function validateCapsuleFile(
  file: File,
  maxSize: number = 500 * 1024 * 1024 // 500 MB
): Promise<{ valid: boolean; error?: string }> {
  // Check file size
  if (file.size === 0) {
    return { valid: false, error: 'File is empty' };
  }

  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File too large (${formatBytes(file.size)} > ${formatBytes(maxSize)})`,
    };
  }

  // Check extension
  const ext = file.name.toLowerCase();
  if (!ext.endsWith('.mgx.sqlite') && !ext.endsWith('.sqlite')) {
    return {
      valid: false,
      error: 'File must have .mgx.sqlite or .sqlite extension',
    };
  }

  // Check SQLite magic number (first 16 bytes should be "SQLite format 3\0")
  try {
    const header = await file.slice(0, 16).arrayBuffer();
    const headerText = new TextDecoder().decode(header);

    if (!headerText.startsWith('SQLite format 3')) {
      return {
        valid: false,
        error: 'Not a valid SQLite file (invalid header)',
      };
    }
  } catch (error) {
    return {
      valid: false,
      error: `Failed to read file header: ${error}`,
    };
  }

  return { valid: true };
}
