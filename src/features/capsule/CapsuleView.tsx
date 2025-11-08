/**
 * Integrated Capsule View
 *
 * Main view for browsing an opened capsule with search, filters, and preview.
 */

import { useState } from 'preact/hooks';
import type { CapsuleInfo } from '../../db/rpc-contract';
import { useSearch } from '../search';
import { useEntities } from '../entities';
import { SearchPanel } from '../search/SearchPanel';
import { EntityPanel } from '../entities/EntityPanel';
import { PagePreviewPanel } from '../page';
import { CapsuleLayout, TopBar, FilterPanel } from '../layouts';

export interface CapsuleViewProps {
  capsuleInfo: CapsuleInfo;
  onClose?: () => void;
}

export function CapsuleView({ capsuleInfo, onClose }: CapsuleViewProps) {
  const [selectedPageGid, setSelectedPageGid] = useState<string | null>(null);

  // Feature hooks
  const search = useSearch({ defaultMode: 'fts' });
  const entities = useEntities({ autoLoad: true });

  // Handle entity filter selection
  const handleEntityClick = (entityType: string, entityValue: string) => {
    // Set entity filter in search
    search.setFilter({
      entityType,
      entityValue,
    });

    // Re-run search with new filter if we have a query
    if (search.lastQuery) {
      search.search(search.lastQuery);
    }
  };

  // Handle search result click
  const handleResultClick = (gid: string) => {
    setSelectedPageGid(gid);
  };

  // Clear entity filter
  const handleClearEntityFilter = () => {
    search.clearFilter();

    // Re-run search without filter if we have a query
    if (search.lastQuery) {
      search.search(search.lastQuery);
    }
  };

  // Check if entity filter is active
  const hasActiveEntityFilter = Boolean(
    search.entityFilter.entityType || search.entityFilter.entityValue
  );

  return (
    <CapsuleLayout
      topBar={
        <TopBar
          capsuleName={capsuleInfo.fileName}
          onClose={onClose}
          actions={
            <div className="capsule-stats">
              <span>{capsuleInfo.pageCount} pages</span>
              <span>{capsuleInfo.entityCount} entities</span>
              <span>{capsuleInfo.edgeCount} edges</span>
            </div>
          }
        />
      }
      leftSidebar={
        <FilterPanel
          title="Entity Filters"
          onClear={handleClearEntityFilter}
          hasActiveFilters={hasActiveEntityFilter}
        >
          {hasActiveEntityFilter && (
            <div className="active-filters">
              <p className="filter-label">Active Filter:</p>
              {search.entityFilter.entityType && (
                <span className="filter-tag">
                  Type: {search.entityFilter.entityType}
                </span>
              )}
              {search.entityFilter.entityValue && (
                <span className="filter-tag">
                  Value: {search.entityFilter.entityValue}
                </span>
              )}
            </div>
          )}

          <EntityPanel
            entities={entities.entities}
            types={entities.types}
            selectedType={entities.selectedType}
            totalCount={entities.totalCount}
            onSelectType={entities.selectType}
            getTypeCount={entities.getTypeCount}
            show={true}
            maxDisplay={20}
          />
        </FilterPanel>
      }
      centerPanel={
        <div className="capsule-center">
          {/* Search Panel */}
          <SearchPanel
            mode={search.mode}
            results={search.results}
            lastQuery={search.lastQuery}
            loading={search.loading}
            onSearch={search.search}
            onModeChange={search.changeMode}
            onResultClick={handleResultClick}
            showModeToggle={true}
            placeholder="Search the capsule..."
            searchHint='Try: "vector search", "LEANN", "SQLite", or "hybrid retrieval"'
          />

          {/* Page Preview */}
          {selectedPageGid && (
            <div className="page-preview-section">
              <h3>Page Preview</h3>
              <PagePreviewPanel
                selectedGid={selectedPageGid}
                onClose={() => setSelectedPageGid(null)}
              />
            </div>
          )}
        </div>
      }
      showLeftSidebar={true}
      showRightSidebar={false}
    />
  );
}
