import { useState, useEffect } from 'preact/hooks';
import { getDbClient } from './db/client';
import type { CapsuleInfo } from './db/types';

// Feature modules
import { useSearch, SearchPanel } from './features/search';
import { useEntities, EntityPanel, EntityToggleButton } from './features/entities';
import { useLlm, LlmToggle, ReasoningOutput } from './features/llm';

// GCUI modules
import { loadGcuiContext } from './gcui/v1/detector';
import type { GcuiContext } from './gcui/v1/types';
import { PageRouter } from './features/router';

// Configuration
import { getConfig } from './config/features';

export function App() {
  const config = getConfig();

  const [capsuleInfo, setCapsuleInfo] = useState<CapsuleInfo | null>(null);
  const [gcuiContext, setGcuiContext] = useState<GcuiContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEntityPanel, setShowEntityPanel] = useState(false);

  // Feature hooks
  const search = useSearch({
    defaultMode: config.features.search.defaultMode,
  });

  const entities = useEntities({
    autoLoad: false, // Load when capsule is opened
  });

  const llm = useLlm({
    autoReason: config.features.llm.autoReason,
  });

  // Load entities and detect GCUI when capsule is opened
  useEffect(() => {
    if (capsuleInfo) {
      // Load entities for legacy mode
      entities.loadEntities();

      // Detect GCUI capabilities
      const detectGcui = async () => {
        try {
          const dbClient = getDbClient();
          const context = await loadGcuiContext(dbClient);

          console.log('[GCUI] Detected capabilities:', context.capabilities);

          // Only set context if GCUI mode is detected
          if (context.capabilities.mode !== 'generic') {
            setGcuiContext(context);
            console.log('[GCUI] Rendering in', context.capabilities.mode, 'mode');
          } else {
            console.log('[GCUI] No GCUI tables found, using legacy mode');
            setGcuiContext(null);
          }
        } catch (err) {
          console.warn('[GCUI] Detection failed, using legacy mode:', err);
          setGcuiContext(null);
        }
      };

      detectGcui();
    }
  }, [capsuleInfo]);

  const handleOpenDemo = async () => {
    setLoading(true);
    setError(null);

    try {
      const dbClient = getDbClient();
      const info = await dbClient.openDemo();
      setCapsuleInfo(info);
      console.log('Capsule info:', info);
    } catch (err) {
      setError(String(err));
      console.error('Failed to open capsule:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    if (!capsuleInfo) return;

    // Clear previous LLM reasoning
    llm.clearReasoning();

    // Execute search
    const results = await search.search(query);

    // If LLM is enabled and loaded, automatically reason
    if (
      config.features.llm.autoReason &&
      llm.enabled &&
      llm.modelInfo?.loaded &&
      results.length > 0
    ) {
      await llm.reason(query, results, config.features.llm.maxTokens);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Glyphcapsule Explorer</h1>
        <p>Hybrid Retrieval Demo for MemGlyph</p>
      </header>

      <main className="app-main">
        {!capsuleInfo ? (
          <div className="welcome">
            <h2>Welcome!</h2>
            <p>
              This is an offline-capable PWA for exploring MemGlyph Glyphcapsules
              with hybrid retrieval (FTS + Vector + Entity + Graph).
            </p>
            <p>
              <strong>Demo capsule:</strong> memglyph-demo.mgx.sqlite
              <br />
              (8 pages, 25 entities, 11 edges, 384-dim vectors)
            </p>

            {error && (
              <div className="error">
                <strong>Error:</strong> {error}
              </div>
            )}

            <button
              className="btn-primary"
              onClick={handleOpenDemo}
              disabled={loading}
            >
              {loading ? 'Opening...' : 'Open Demo Capsule'}
            </button>
          </div>
        ) : gcuiContext && config.features.gcui.enabled ? (
          // GCUI Mode - Render as website/dashboard
          <div className="gcui-mode">
            <PageRouter context={gcuiContext} />
          </div>
        ) : (
          // Legacy Mode - Traditional search UI
          <div className="capsule-view">
            <div className="capsule-info">
              <h2>📦 {capsuleInfo.fileName}</h2>
              <dl>
                <dt>File Size:</dt>
                <dd>{(capsuleInfo.fileSize / 1024).toFixed(1)} KB</dd>

                <dt>Doc ID:</dt>
                <dd><code>{capsuleInfo.docId.slice(0, 24)}...</code></dd>

                <dt>Pages:</dt>
                <dd>{capsuleInfo.pageCount}</dd>

                <dt>Entities:</dt>
                <dd>{capsuleInfo.entityCount}</dd>

                <dt>Graph Edges:</dt>
                <dd>{capsuleInfo.edgeCount}</dd>

                {capsuleInfo.hasVectors && (
                  <>
                    <dt>Vectors:</dt>
                    <dd>
                      ✅ {capsuleInfo.vectorModel} ({capsuleInfo.vectorDim}-dim)
                    </dd>
                  </>
                )}
              </dl>

              {/* LLM Toggle */}
              {config.features.llm.enabled && (
                <LlmToggle
                  enabled={llm.enabled}
                  loading={llm.loading}
                  modelLoaded={llm.modelInfo?.loaded || false}
                  progress={llm.progress}
                  error={llm.error}
                  onToggle={llm.toggle}
                />
              )}
            </div>

            <div className="search-section">
              <div className="search-header">
                <h3>🔍 Search</h3>
                <EntityToggleButton
                  show={showEntityPanel}
                  entityCount={entities.entities.length}
                  onToggle={() => setShowEntityPanel(!showEntityPanel)}
                />
              </div>

              {/* Search Panel */}
              <SearchPanel
                mode={search.mode}
                results={search.results}
                lastQuery={search.lastQuery}
                loading={search.loading || loading}
                onSearch={handleSearch}
                onModeChange={search.changeMode}
                showModeToggle={config.features.search.showModeToggle}
                placeholder="Search the capsule..."
                searchHint='Try searching: "vector search", "LEANN", "SQLite", or "hybrid retrieval"'
              />

              {/* Entity Panel */}
              <EntityPanel
                entities={entities.entities}
                types={entities.types}
                selectedType={entities.selectedType}
                totalCount={entities.totalCount}
                onSelectType={entities.selectType}
                getTypeCount={entities.getTypeCount}
                show={showEntityPanel}
                maxDisplay={20}
              />

              {/* LLM Reasoning Output */}
              {config.features.llm.enabled && llm.reasoning && (
                <ReasoningOutput
                  reasoning={llm.reasoning}
                  searchResults={search.results}
                  loading={llm.loading}
                />
              )}

              {/* LLM Loading State */}
              {config.features.llm.enabled && llm.loading && !llm.reasoning && (
                <div className="reasoning-loading">
                  <div className="spinner"></div>
                  <p>LLM is reasoning...</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>Built with Preact + SQLite WASM + OPFS</p>
      </footer>
    </div>
  );
}
