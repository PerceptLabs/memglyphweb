/**
 * Page Preview Component
 *
 * Displays page content with image preview and metadata.
 */

import { useState, useEffect } from 'preact/hooks';
import { useAsset } from '../assets';
import { getDbClient } from '../../db/client';
import type { PageInfo } from '../../db/types';

export interface PagePreviewProps {
  gid: string;
  onClose?: () => void;
}

export function PagePreview({ gid, onClose }: PagePreviewProps) {
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load page info
  useEffect(() => {
    const loadPage = async () => {
      setLoading(true);
      setError(null);

      try {
        const dbClient = getDbClient();

        // Get page info from meta_index
        const results = await dbClient.query<PageInfo>(
          'SELECT gid, doc_id, page_no, title, tags, updated_ts FROM meta_index WHERE gid = ? LIMIT 1',
          [gid]
        );

        if (results.length > 0) {
          setPageInfo(results[0]);
        } else {
          setError('Page not found');
        }
      } catch (err) {
        setError(String(err));
        console.error('[PagePreview] Failed to load page:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPage();
  }, [gid]);

  // Construct asset URL for page image
  const assetUrl = pageInfo
    ? `asset://glyphs/page_${String(pageInfo.pageNo).padStart(4, '0')}.mgx.png`
    : undefined;

  // Load image using asset hook
  const imageUrl = useAsset(assetUrl);

  if (loading) {
    return (
      <div className="page-preview">
        <div className="page-preview-loading">
          <div className="spinner"></div>
          <p>Loading page...</p>
        </div>
      </div>
    );
  }

  if (error || !pageInfo) {
    return (
      <div className="page-preview">
        <div className="page-preview-error">
          <p>Error: {error || 'Page not found'}</p>
          {onClose && (
            <button className="btn-secondary" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page-preview">
      {/* Header */}
      <div className="page-preview-header">
        <div className="page-preview-title">
          <span className="page-number">Page {pageInfo.pageNo}</span>
          <h3>{pageInfo.title || '(Untitled)'}</h3>
        </div>
        {onClose && (
          <button className="btn-icon" onClick={onClose} title="Close preview">
            ✕
          </button>
        )}
      </div>

      {/* Image */}
      <div className="page-preview-content">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`Page ${pageInfo.pageNo}`}
            className="page-image"
          />
        ) : (
          <div className="page-preview-placeholder">
            <p>No image available for this page</p>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="page-preview-metadata">
        <dl>
          <dt>GID:</dt>
          <dd>
            <code title={pageInfo.gid}>{pageInfo.gid.substring(0, 16)}...</code>
          </dd>

          {pageInfo.tags && (
            <>
              <dt>Tags:</dt>
              <dd>{pageInfo.tags}</dd>
            </>
          )}

          <dt>Updated:</dt>
          <dd>{new Date(pageInfo.updatedTs).toLocaleString()}</dd>
        </dl>
      </div>
    </div>
  );
}

export interface PagePreviewPanelProps {
  selectedGid: string | null;
  onClose: () => void;
}

export function PagePreviewPanel({ selectedGid, onClose }: PagePreviewPanelProps) {
  if (!selectedGid) {
    return (
      <div className="page-preview-panel-empty">
        <p>Select a search result to preview the page</p>
      </div>
    );
  }

  return <PagePreview gid={selectedGid} onClose={onClose} />;
}
