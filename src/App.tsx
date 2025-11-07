import { useState } from 'preact/hooks';
import { getDbClient } from './db/client';
import { getLlmClient, QWEN_MODELS } from './db/llm-client';
import type { CapsuleInfo, HybridResult } from './db/types';
import type { LlmModelInfo, ReasoningResponse, LlmProgress } from './db/llm-types';

export function App() {
  const [capsuleInfo, setCapsuleInfo] = useState<CapsuleInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<HybridResult[] | null>(null);
  const [lastQuery, setLastQuery] = useState<string>('');

  // LLM state
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [llmModelInfo, setLlmModelInfo] = useState<LlmModelInfo | null>(null);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmProgress, setLlmProgress] = useState<LlmProgress | null>(null);
  const [reasoning, setReasoning] = useState<ReasoningResponse | null>(null);

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

    setLoading(true);
    setError(null);
    setLastQuery(query);
    setReasoning(null); // Clear previous reasoning

    try {
      const dbClient = getDbClient();
      const results = await dbClient.searchHybrid(query, 10);
      setSearchResults(results);
      console.log('Search results:', results);

      // If LLM is enabled and loaded, automatically reason
      if (llmEnabled && llmModelInfo?.loaded && results.length > 0) {
        await handleReason(query, results);
      }
    } catch (err) {
      setError(String(err));
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadModel = async () => {
    setLlmLoading(true);
    setError(null);
    setLlmProgress(null);

    try {
      const llmClient = getLlmClient();

      // Set up progress callback
      llmClient.onProgress((progress) => {
        setLlmProgress(progress);
      });

      // Load Qwen 0.5B model
      const modelInfo = await llmClient.loadModel(QWEN_MODELS['0.5b']);
      setLlmModelInfo(modelInfo);
      setLlmProgress(null);
      console.log('Model loaded:', modelInfo);
    } catch (err) {
      setError(String(err));
      console.error('Failed to load model:', err);
    } finally {
      setLlmLoading(false);
    }
  };

  const handleToggleLlm = async () => {
    if (!llmEnabled) {
      // Enabling - load model if not loaded
      if (!llmModelInfo?.loaded) {
        await handleLoadModel();
      }
      setLlmEnabled(true);
    } else {
      // Disabling
      setLlmEnabled(false);
      setReasoning(null);
    }
  };

  const handleReason = async (query: string, results: HybridResult[]) => {
    if (!llmModelInfo?.loaded) return;

    setLlmLoading(true);
    setError(null);

    try {
      const llmClient = getLlmClient();

      // Take top 5 results as context
      const snippets = results.slice(0, 5).map(r => ({
        gid: r.gid,
        pageNo: r.pageNo,
        title: r.title,
        text: r.snippet || '',
        score: r.scores.final
      }));

      const response = await llmClient.reason({
        question: query,
        snippets,
        maxTokens: 256,
        temperature: 0.7
      });

      setReasoning(response);
      console.log('Reasoning complete:', response);
    } catch (err) {
      setError(String(err));
      console.error('Reasoning failed:', err);
    } finally {
      setLlmLoading(false);
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
        ) : (
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
              <div className="llm-toggle">
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={llmEnabled}
                    onChange={handleToggleLlm}
                    disabled={llmLoading}
                  />
                  <span className="toggle-text">
                    🤖 Enable LLM Reasoning (Qwen 0.5B)
                  </span>
                </label>
                {llmModelInfo?.loaded && (
                  <span className="model-status">✅ Model loaded</span>
                )}
                {llmProgress && (
                  <div className="llm-progress">
                    {llmProgress.message} ({(llmProgress.progress * 100).toFixed(0)}%)
                  </div>
                )}
              </div>
            </div>

            <div className="search-section">
              <h3>🔍 Hybrid Search</h3>
              <p className="search-hint">
                Try searching: <em>"vector search"</em>, <em>"LEANN"</em>, <em>"SQLite"</em>, or <em>"hybrid retrieval"</em>
              </p>

              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const query = formData.get('query') as string;
                if (query.trim()) {
                  handleSearch(query.trim());
                }
              }}>
                <div className="search-bar">
                  <input
                    type="text"
                    name="query"
                    placeholder="Search the capsule..."
                    className="search-input"
                    disabled={loading}
                  />
                  <button type="submit" className="btn-search" disabled={loading}>
                    Search
                  </button>
                </div>
              </form>

              {searchResults && (
                <div className="search-results">
                  <p className="results-header">
                    Found {searchResults.length} results for <strong>"{lastQuery}"</strong>
                  </p>
                  {searchResults.map((result) => (
                    <div key={result.gid} className="result-item">
                      <div className="result-header">
                        <span className="result-page">Page {result.pageNo}</span>
                        <span className="result-score">Score: {result.scores.final.toFixed(3)}</span>
                      </div>
                      <h4 className="result-title">{result.title}</h4>
                      {result.snippet && (
                        <p
                          className="result-snippet"
                          dangerouslySetInnerHTML={{ __html: result.snippet }}
                        />
                      )}
                      <div className="result-scores">
                        <span>FTS: {result.scores.fts.toFixed(2)}</span>
                        <span>Entity: {result.scores.entity.toFixed(2)}</span>
                        <span>Graph: {result.scores.graph.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* LLM Reasoning Output */}
              {reasoning && (
                <div className="reasoning-output">
                  <div className="reasoning-header">
                    <h4>🤖 LLM Reasoning</h4>
                    <span className="reasoning-meta">
                      {reasoning.inferenceTimeMs.toFixed(0)}ms · {reasoning.tokensGenerated} tokens
                    </span>
                  </div>
                  <div className="reasoning-answer">
                    {reasoning.answer}
                  </div>
                  {reasoning.usedSnippets.length > 0 && (
                    <div className="reasoning-citations">
                      <strong>📑 Cited sources:</strong>
                      {reasoning.usedSnippets.map((gid) => {
                        const result = searchResults?.find(r => r.gid === gid);
                        return (
                          <span key={gid} className="citation">
                            Page {result?.pageNo || '?'}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {llmLoading && !reasoning && (
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
