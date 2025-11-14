/**
 * Integrated Capsule View
 *
 * Main view for browsing an opened capsule with search, filters, graph, and preview.
 */

import { useState, useEffect } from 'preact/hooks';
import type { CapsuleInfo } from '../../db/rpc-contract';
import { useSearch } from '../search';
import { useEntities } from '../entities';
import { useGraph } from '../graph';
import { useProvenance } from '../provenance';
import { useLlm } from '../llm';
import { useKeyboardShortcuts } from '../shortcuts';
import { useGlyphCase } from './useGlyphCase';
import { ModalityBadge } from './ModalityBadge';
import { SearchPanel } from '../search/SearchPanel';
import { EntityPanel } from '../entities/EntityPanel';
import { PagePreviewPanel } from '../page';
import { GraphPanel, GraphControls, GraphStats } from '../graph';
import { ProvenancePanel } from '../provenance';
import { ReasoningOutput } from '../llm/LlmPanel';
import { CapsuleLayout, TopBar, FilterPanel } from '../layouts';
import { EnvelopeTimeline } from '../envelope';
import { ErrorBoundary } from '../../components/ErrorBoundary';

type ViewMode = 'search' | 'graph';

export interface CapsuleViewProps {
  capsuleInfo: CapsuleInfo;
  onClose?: () => void;
}

export function CapsuleView({ capsuleInfo, onClose }: CapsuleViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('search');
  const [selectedPageGid, setSelectedPageGid] = useState<string | null>(null);
  const [showProvenance, setShowProvenance] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);

  // Feature hooks
  const search = useSearch({ defaultMode: 'fts' });
  const entities = useEntities({ autoLoad: true });
  const graph = useGraph({ maxHops: 2, limit: 50 });
  const provenance = useProvenance({ autoLoadCheckpoints: true });
  const llm = useLlm({ autoReason: false });
  const glyphCase = useGlyphCase();

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onFocusSearch: () => {
      // Focus the search input
      const searchInput = document.querySelector<HTMLInputElement>('input[name="query"]');
      searchInput?.focus();
      searchInput?.select();
    },
    onToggleLlm: () => {
      llm.toggle();
    },
    onEscape: () => {
      // Clear focus from any input
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    },
  });

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

  // Handle page verification
  const handleVerifyPage = () => {
    if (selectedPageGid) {
      provenance.verifyPage(selectedPageGid);
      setShowProvenance(true); // Show provenance panel when verifying
    }
  };

  // Handle LLM reasoning trigger
  const handleAskLlm = async () => {
    if (llm.enabled && search.results && search.results.length > 0 && search.lastQuery) {
      // Clear previous reasoning
      llm.clearReasoning();
      // Trigger reasoning with top-5 results (max 1500 tokens as per spec)
      await llm.reason(search.lastQuery, search.results, 1500);
    }
  };

  // Auto-trigger reasoning when LLM is enabled and search completes
  useEffect(() => {
    if (llm.enabled && search.results && search.results.length > 0 && search.lastQuery) {
      // Only auto-reason if we don't have reasoning for this query yet
      if (!llm.reasoning || llm.reasoning.usedSnippets.length === 0) {
        handleAskLlm();
      }
    }
  }, [llm.enabled, search.results, search.lastQuery]);

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
            <>
              <div className="capsule-stats">
                <span>{capsuleInfo.pageCount} pages</span>
                <span>{capsuleInfo.entityCount} entities</span>
                <span>{capsuleInfo.edgeCount} edges</span>
              </div>
              <ModalityBadge
                modality={glyphCase.modality}
                envelopeStats={glyphCase.envelopeStats}
                envelopeExtracted={glyphCase.info?.envelopeExtracted}
                onEnableDynamic={glyphCase.enableDynamicMode}
                onSaveGlyphCase={async () => {
                  const blob = await glyphCase.saveGlyphCase();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  // Use .gcase for static, .gcase+ for dynamic
                  const extension = glyphCase.modality === 'dynamic' ? '.gcase+' : '.gcase';
                  const fileName = glyphCase.info?.fileName || 'glyphcase';
                  const baseName = fileName.replace(/\.(db|gcase|gcase\+)$/, '');
                  a.download = `${baseName}${extension}`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                onClearEnvelope={glyphCase.clearEnvelope}
                onVerifyEnvelope={async () => {
                  const result = await glyphCase.verifyEnvelope();
                  if (result) {
                    if (result.valid) {
                      alert('✅ Envelope integrity verified!\n\nThe hash chain is intact.');
                    } else {
                      alert(`❌ Envelope integrity check failed:\n\n${result.errors.join('\n')}`);
                    }
                  }
                }}
              />
              <button
                className={`btn-secondary btn-sm ${llm.enabled ? 'active' : ''}`}
                onClick={llm.toggle}
                disabled={llm.loading}
                title={llm.modelInfo?.loaded ? 'LLM Ready' : 'Click to load LLM'}
              >
                🤖 {llm.enabled ? 'LLM On' : 'LLM Off'}
              </button>
              <button
                className={`btn-secondary btn-sm ${showProvenance ? 'active' : ''}`}
                onClick={() => setShowProvenance(!showProvenance)}
              >
                {showProvenance ? '✓' : ''} Provenance
              </button>
              {glyphCase.isDynamic && (
                <button
                  className={`btn-secondary btn-sm ${showTimeline ? 'active' : ''}`}
                  onClick={() => setShowTimeline(!showTimeline)}
                >
                  {showTimeline ? '✓' : ''} Timeline
                </button>
              )}
            </>
          }
        />
      }
      leftSidebar={
        <ErrorBoundary name="EntityPanel">
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
        </ErrorBoundary>
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
              <ErrorBoundary name="SearchPanel">
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
                  searchHistory={search.searchHistory}
                  onClearHistory={search.clearHistory}
                />
              </ErrorBoundary>

              {/* LLM Reasoning Output */}
              <ErrorBoundary name="LLM">
                {llm.enabled && search.results && search.results.length > 0 && (
                  <div className="llm-section">
                  {/* Temperature Control */}
                  <div className="llm-temperature-control">
                    <label htmlFor="temperature-slider" className="temperature-label">
                      Creativity:
                      <input
                        id="temperature-slider"
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={llm.temperature}
                        onChange={(e) => llm.setTemperature(parseFloat(e.currentTarget.value))}
                        className="temperature-slider"
                      />
                      <span className="temperature-value">{llm.temperature.toFixed(1)}</span>
                    </label>
                    <small className="temperature-hint">
                      {llm.temperature < 0.3 && '❄️ Very factual'}
                      {llm.temperature >= 0.3 && llm.temperature < 0.6 && '📐 Mostly factual'}
                      {llm.temperature >= 0.6 && llm.temperature < 0.8 && '⚖️ Balanced'}
                      {llm.temperature >= 0.8 && '🎨 Creative'}
                    </small>
                  </div>

                  {llm.progress && (
                    <div className="llm-progress-bar">
                      <div className="llm-progress-info">
                        <span>🤖 {llm.progress.message}</span>
                        <span>{(llm.progress.progress * 100).toFixed(0)}%</span>
                      </div>
                      <div className="llm-progress-track">
                        <div
                          className="llm-progress-fill"
                          style={{ width: `${llm.progress.progress * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Streaming LLM Output */}
                  {llm.isStreaming && llm.streamingText && (
                    <div className="streaming-output">
                      <div className="streaming-header">
                        <span className="streaming-indicator">🤖 Streaming...</span>
                        <button
                          className="btn-secondary btn-sm abort-btn"
                          onClick={() => llm.abortReasoning()}
                          title="Stop reasoning"
                        >
                          ⏹️ Stop
                        </button>
                      </div>
                      <div className="streaming-text">
                        {llm.streamingText}<span className="streaming-cursor">▊</span>
                      </div>
                    </div>
                  )}

                  {llm.reasoning && (
                    <ReasoningOutput
                      reasoning={llm.reasoning}
                      searchResults={search.results}
                      loading={llm.loading}
                    />
                  )}

                  {llm.loading && !llm.reasoning && !llm.progress && !llm.isStreaming && (
                    <div className="reasoning-loading">
                      <div className="spinner"></div>
                      <p>LLM is reasoning over search results...</p>
                      {llm.elapsedTime > 0 && (
                        <p className="inference-time">
                          Elapsed: {llm.elapsedTime.toFixed(1)}s
                          {llm.elapsedTime > 3 && ' • Typically takes 2-5s'}
                        </p>
                      )}
                    </div>
                  )}

                  {llm.error && (
                    <div className="llm-error-panel">
                      <strong>⚠️ LLM Error:</strong> {llm.error}
                      <button
                        className="btn-secondary btn-sm"
                        onClick={handleAskLlm}
                        disabled={llm.loading}
                        style={{ marginLeft: '1rem' }}
                      >
                        {llm.loading ? 'Retrying...' : 'Try Again'}
                      </button>
                    </div>
                  )}
                </div>
              )}

                {/* Show message when LLM is enabled but no results */}
                {llm.enabled && (!search.results || search.results.length === 0) && search.lastQuery && (
                  <div className="llm-no-results">
                    <p>🤖 LLM needs search results to reason. Try searching first!</p>
                  </div>
                )}
              </ErrorBoundary>
            </>
          )}

          {/* Graph View */}
          {viewMode === 'graph' && (
            <ErrorBoundary name="GraphPanel">
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
            </ErrorBoundary>
          )}

          {/* Page Preview (shown in both views) */}
          {selectedPageGid && (
            <ErrorBoundary name="PagePreview">
              <div className="page-preview-section">
                <div className="page-preview-header-actions">
                  <h3>Page Preview</h3>
                  <div className="page-preview-actions">
                    {viewMode === 'search' && (
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => handleExploreGraph(selectedPageGid)}
                      >
                        Explore Graph
                      </button>
                    )}
                    <button
                      className="btn-primary btn-sm"
                      onClick={handleVerifyPage}
                      disabled={provenance.verifying}
                    >
                      {provenance.verifying ? 'Verifying...' : 'Verify Page'}
                    </button>
                  </div>
                </div>
                <PagePreviewPanel
                  selectedGid={selectedPageGid}
                  onClose={() => setSelectedPageGid(null)}
                />
              </div>
            </ErrorBoundary>
          )}
        </div>
      }
      rightSidebar={
        <>
          {showProvenance && (
            <ErrorBoundary name="ProvenancePanel">
              <ProvenancePanel
                checkpoints={provenance.checkpoints}
                verificationResult={provenance.verificationResult}
                loading={provenance.loading}
                verifying={provenance.verifying}
                error={provenance.error}
                onVerify={handleVerifyPage}
              />
            </ErrorBoundary>
          )}
          {showTimeline && glyphCase.isDynamic && (
            <ErrorBoundary name="EnvelopeTimeline">
              <EnvelopeTimeline limit={100} />
            </ErrorBoundary>
          )}
        </>
      }
      showLeftSidebar={true}
      showRightSidebar={showProvenance || showTimeline}
    />
  );
}
