/**
 * Page Browser Component
 *
 * Virtualized list of pages from the capsule.
 */

import { useRef } from 'preact/hooks';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { PageInfo } from '../../db/types';

export interface PageItemProps {
  page: PageInfo;
  onSelect?: (page: PageInfo) => void;
}

export function PageItem({ page, onSelect }: PageItemProps) {
  return (
    <div
      className="page-item"
      onClick={() => onSelect?.(page)}
      style={{ cursor: onSelect ? 'pointer' : 'default' }}
    >
      <div className="page-header">
        <span className="page-no">#{page.pageNo}</span>
        <span className="page-title">{page.title || '(Untitled)'}</span>
      </div>
      <div className="page-meta">
        <span className="page-gid" title={page.gid}>
          {page.gid.substring(0, 8)}...
        </span>
        {page.tags && <span className="page-tags">{page.tags}</span>}
        <span className="page-date">
          {new Date(page.updatedTs).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

export interface PageBrowserProps {
  pages: PageInfo[];
  onSelectPage?: (page: PageInfo) => void;
  height?: number;
  itemHeight?: number;
}

export function PageBrowser({
  pages,
  onSelectPage,
  height = 600,
  itemHeight = 70,
}: PageBrowserProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: pages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight,
    overscan: 5,
  });

  if (pages.length === 0) {
    return (
      <div className="page-browser-empty">
        <p>No pages to display</p>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="page-browser"
      style={{
        height: `${height}px`,
        overflow: 'auto',
      }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const page = pages[virtualItem.index];
          if (!page) return null;

          return (
            <div
              key={page.gid}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <PageItem page={page} onSelect={onSelectPage} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface PageBrowserPanelProps {
  pages: PageInfo[];
  loading?: boolean;
  error?: string | null;
  onSelectPage?: (page: PageInfo) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  height?: number;
}

export function PageBrowserPanel({
  pages,
  loading,
  error,
  onSelectPage,
  onLoadMore,
  hasMore = false,
  height = 600,
}: PageBrowserPanelProps) {
  return (
    <div className="page-browser-panel">
      <div className="page-browser-header">
        <h4>Pages ({pages.length})</h4>
      </div>

      {error && (
        <div className="page-browser-error">
          <p>Error: {error}</p>
        </div>
      )}

      {loading && pages.length === 0 ? (
        <div className="page-browser-loading">
          <p>Loading pages...</p>
        </div>
      ) : (
        <PageBrowser
          pages={pages}
          onSelectPage={onSelectPage}
          height={height}
        />
      )}

      {hasMore && !loading && (
        <div className="page-browser-footer">
          <button className="btn-secondary" onClick={onLoadMore}>
            Load More
          </button>
        </div>
      )}

      {loading && pages.length > 0 && (
        <div className="page-browser-footer">
          <p>Loading more...</p>
        </div>
      )}
    </div>
  );
}
