/**
 * Integrated Capsule View
 *
 * Main view for browsing an opened capsule with search, filters, graph, and preview.
 */

import { useState } from 'preact/hooks';
import type { CapsuleInfo } from '../../db/rpc-contract';
import { useSearch } from '../search';
import { useEntities } from '../entities';
import { useGraph } from '../graph';
import { SearchPanel } from '../search/SearchPanel';
import { EntityPanel } from '../entities/EntityPanel';
import { PagePreviewPanel } from '../page';
import { GraphPanel, GraphControls, GraphStats } from '../graph';
import { CapsuleLayout, TopBar, FilterPanel } from '../layouts';

type ViewMode = 'search' | 'graph';

export interface CapsuleViewProps {
  capsuleInfo: CapsuleInfo;
  onClose?: () => void;
}

export function CapsuleView({ capsuleInfo, onClose }: CapsuleViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('search');
  const [selectedPageGid, setSelectedPageGid] = useState<string | null>(null);

  // Feature hooks
  const search = useSearch({ defaultMode: 'fts' });
  const entities = useEntities({ autoLoad: true });
  const graph = useGraph({ maxHops: 2, limit: 50 });

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

  // Handle graph node click
  const handleGraphNodeClick = (gid: string) => {
    // Navigate to the clicked node
    graph.navigateToNode(gid);
    // Also show page preview
    setSelectedPageGid(gid);
  };

  // Handle "explore graph" from search result
  const handleExploreGraph = (gid: string) => {
    setViewMode('graph');
    graph.loadGraph(gid);
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
          {/* View Mode Tabs */}
          <div className="view-mode-tabs">
            <button
              className={`tab-btn ${viewMode === 'search' ? 'active' : ''}`}
              onClick={() => setViewMode('search')}
            >
              🔍 Search
            </button>
            <button
              className={`tab-btn ${viewMode === 'graph' ? 'active' : ''}`}
              onClick={() => setViewMode('graph')}
            >
              🕸️ Graph
            </button>
          </div>

          {/* Search View */}
          {viewMode === 'search' && (
            <>
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
            </>
          )}

          {/* Graph View */}
          {viewMode === 'graph' && (
            <div className="graph-view-container">
              {!graph.graphData && (
                <div className="graph-view-empty">
                  <p>Select a search result to explore its graph connections</p>
                  <p className="hint">Or switch to Search tab to find pages</p>
                </div>
              )}

              {graph.graphData && (
                <>
                  <GraphStats
                    nodeCount={graph.nodeCount}
                    edgeCount={graph.edgeCount}
                    predicateCount={graph.predicates.length}
                    seedNode={graph.seedGid || undefined}
                  />

                  <GraphControls
                    predicates={graph.predicates}
                    selectedPredicate={graph.predicate}
                    onPredicateChange={graph.filterByPredicate}
                    onReset={graph.clear}
                  />

                  <GraphPanel
                    nodes={graph.graphData.nodes}
                    edges={graph.graphData.edges}
                    seedGid={graph.seedGid || undefined}
                    onNodeClick={handleGraphNodeClick}
                    loading={graph.loading}
                    error={graph.error}
                  />
                </>
              )}
            </div>
          )}

          {/* Page Preview (shown in both views) */}
          {selectedPageGid && (
            <div className="page-preview-section">
              <div className="page-preview-header-actions">
                <h3>Page Preview</h3>
                {viewMode === 'search' && (
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => handleExploreGraph(selectedPageGid)}
                  >
                    Explore Graph
                  </button>
                )}
              </div>
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
