import { useState } from 'preact/hooks';
import { getDbClient } from './db/client';
import type { CapsuleInfo } from './db/types';

export function App() {
  const [capsuleInfo, setCapsuleInfo] = useState<CapsuleInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            </div>

            <div className="search-section">
              <h3>Search (Coming Soon)</h3>
              <p>FTS + Vector + Entity + Graph hybrid search will appear here.</p>
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
