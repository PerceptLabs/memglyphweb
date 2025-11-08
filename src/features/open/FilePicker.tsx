/**
 * File Picker Component
 *
 * Allows users to:
 * - Select .mgx.sqlite files from their device
 * - View capsules stored in OPFS
 * - Open capsules from OPFS
 * - See storage quota information
 */

import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import {
  validateCapsuleFile,
  copyFileToOpfs,
  getStorageQuota,
  formatBytes,
  type StorageQuotaInfo,
  type OpfsFileInfo,
  isOpfsSupported,
  requestPersistentStorage,
} from '../../db/opfs';
import { getDbClient } from '../../db/client';

export interface FilePickerProps {
  onFileSelected: (file: File, opfsPath?: string) => void;
  onOpfsFileSelected: (path: string) => void;
  onError: (error: string) => void;
}

export function FilePicker({ onFileSelected, onOpfsFileSelected, onError }: FilePickerProps) {
  const [opfsFiles, setOpfsFiles] = useState<OpfsFileInfo[]>([]);
  const [quota, setQuota] = useState<StorageQuotaInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [persistentStorage, setPersistentStorage] = useState(false);

  const dbClient = getDbClient();

  // Load OPFS files and quota on mount
  useEffect(() => {
    loadOpfsFiles();
    loadQuotaInfo();
  }, []);

  async function loadOpfsFiles() {
    try {
      const files = await dbClient.listOpfsFiles();
      setOpfsFiles(files);
    } catch (error) {
      console.error('[FilePicker] Failed to list OPFS files:', error);
    }
  }

  async function loadQuotaInfo() {
    try {
      const quotaInfo = await getStorageQuota();
      setQuota(quotaInfo);

      // Check if storage is persistent
      const isPersisted = await navigator.storage?.persisted?.();
      setPersistentStorage(isPersisted || false);
    } catch (error) {
      console.error('[FilePicker] Failed to get quota:', error);
    }
  }

  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    setLoading(true);

    try {
      // Validate file
      const validation = await validateCapsuleFile(file);
      if (!validation.valid) {
        onError(validation.error!);
        setLoading(false);
        return;
      }

      // Check if OPFS is supported
      if (isOpfsSupported()) {
        // Copy to OPFS for persistence
        const { path } = await copyFileToOpfs(file);

        // Reload OPFS files list and quota
        await loadOpfsFiles();
        await loadQuotaInfo();

        // Notify parent with OPFS path
        onFileSelected(file, path);
      } else {
        // No OPFS support, use file directly (memory only)
        onFileSelected(file);
      }
    } catch (error) {
      onError(`Failed to load file: ${error}`);
    } finally {
      setLoading(false);
      // Reset input
      input.value = '';
    }
  }

  async function handleOpfsFileSelect(path: string) {
    setLoading(true);
    try {
      onOpfsFileSelected(path);
    } catch (error) {
      onError(`Failed to open from OPFS: ${error}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveFromOpfs(path: string, event: Event) {
    event.stopPropagation();

    if (!confirm(`Remove "${path}" from device storage?`)) {
      return;
    }

    try {
      await dbClient.removeFromOpfs(path);
      await loadOpfsFiles();
      await loadQuotaInfo();
    } catch (error) {
      onError(`Failed to remove file: ${error}`);
    }
  }

  async function handleRequestPersistence() {
    try {
      const granted = await requestPersistentStorage();
      if (granted) {
        setPersistentStorage(true);
      } else {
        onError('Persistent storage not granted. Files may be evicted under storage pressure.');
      }
    } catch (error) {
      onError(`Failed to request persistence: ${error}`);
    }
  }

  return (
    <div class="file-picker">
      <div class="file-picker-header">
        <h2>Open Capsule</h2>
        {quota && (
          <div class="storage-quota">
            <div class="quota-bar">
              <div
                class="quota-used"
                style={`width: ${Math.min(quota.percentUsed, 100)}%`}
              />
            </div>
            <p class="quota-text">
              {formatBytes(quota.usage)} / {formatBytes(quota.quota)} used
              ({quota.percentUsed.toFixed(1)}%)
            </p>
            {!persistentStorage && isOpfsSupported() && (
              <button
                class="btn-secondary btn-sm"
                onClick={handleRequestPersistence}
              >
                Request Persistent Storage
              </button>
            )}
          </div>
        )}
      </div>

      {/* File Input */}
      <div class="file-input-section">
        <label class="file-input-label">
          <input
            type="file"
            accept=".mgx.sqlite,.sqlite"
            onChange={handleFileSelect}
            disabled={loading}
            style="display: none"
          />
          <button class="btn-primary" disabled={loading}>
            {loading ? 'Loading...' : 'Select File from Device'}
          </button>
        </label>
        <p class="help-text">
          Choose a .mgx.sqlite or .sqlite file from your device
        </p>
      </div>

      {/* OPFS Files List */}
      {isOpfsSupported() && opfsFiles.length > 0 && (
        <div class="opfs-files-section">
          <h3>Stored on Device</h3>
          <ul class="opfs-files-list">
            {opfsFiles.map((file) => (
              <li key={file.path} class="opfs-file-item">
                <button
                  class="opfs-file-button"
                  onClick={() => handleOpfsFileSelect(file.path)}
                  disabled={loading}
                >
                  <div class="file-info">
                    <span class="file-name">{file.path}</span>
                    <span class="file-meta">
                      {formatBytes(file.size)} •{' '}
                      {new Date(file.lastModified).toLocaleDateString()}
                    </span>
                  </div>
                </button>
                <button
                  class="btn-remove"
                  onClick={(e) => handleRemoveFromOpfs(file.path, e)}
                  title="Remove from device"
                  aria-label="Remove from device"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* No OPFS Support Warning */}
      {!isOpfsSupported() && (
        <div class="opfs-warning">
          <p>
            <strong>Note:</strong> Your browser doesn't support persistent storage.
            Files will only be kept in memory and lost when you close the tab.
          </p>
        </div>
      )}
    </div>
  );
}
