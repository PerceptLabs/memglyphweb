import { useState, useEffect } from 'preact/hooks';
import { getDbClient } from './db/client';
import type { CapsuleInfo } from './db/rpc-contract';

// Feature modules
import { useSearch, SearchPanel } from './features/search';
import { useEntities, EntityPanel, EntityToggleButton } from './features/entities';
import { useLlm, LlmToggle, ReasoningOutput } from './features/llm';
import { FilePicker } from './features/open/FilePicker';
import { CapsuleView } from './features/capsule';

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

  const handleFileSelected = async (file: File, opfsPath?: string) => {
    setLoading(true);
    setError(null);

    try {
      const dbClient = getDbClient();
      const info = await dbClient.openFromFile(file);
      setCapsuleInfo(info);
      console.log('Capsule opened:', info);
    } catch (err) {
      setError(String(err));
      console.error('Failed to open file:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpfsFileSelected = async (path: string) => {
    setLoading(true);
    setError(null);

    try {
      const dbClient = getDbClient();
      const info = await dbClient.openFromOpfs(path);
      setCapsuleInfo(info);
      console.log('Capsule opened from OPFS:', info);
    } catch (err) {
      setError(String(err));
      console.error('Failed to open from OPFS:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilePickerError = (errorMsg: string) => {
    setError(errorMsg);
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
            {error && (
              <div className="error" style="max-width: 600px; margin: 1rem auto;">
                <strong>Error:</strong> {error}
              </div>
            )}

            <FilePicker
              onFileSelected={handleFileSelected}
              onOpfsFileSelected={handleOpfsFileSelected}
              onError={handleFilePickerError}
            />

            <div style="text-align: center; margin-top: 1.5rem;">
              <p style="margin-bottom: 0.5rem; opacity: 0.7;">Or try the demo:</p>
              <button
                className="btn-secondary"
                onClick={handleOpenDemo}
                disabled={loading}
              >
                {loading ? 'Loading Demo...' : 'Load Demo Capsule'}
              </button>
            </div>
          </div>
        ) : gcuiContext && config.features.gcui.enabled ? (
          // GCUI Mode - Render as website/dashboard
          <div className="gcui-mode">
            <PageRouter context={gcuiContext} />
          </div>
        ) : (
          // Capsule Mode - Integrated search UI with layout
          <CapsuleView
            capsuleInfo={capsuleInfo}
            onClose={() => setCapsuleInfo(null)}
          />
        )}
      </main>

      <footer className="app-footer">
        <p>Built with Preact + SQLite WASM + OPFS</p>
      </footer>
    </div>
  );
}
