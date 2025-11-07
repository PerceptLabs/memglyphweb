export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Glyphcapsule Explorer</h1>
        <p>Hybrid Retrieval Demo for MemGlyph</p>
      </header>

      <main className="app-main">
        <div className="welcome">
          <h2>Welcome!</h2>
          <p>
            This is an offline-capable PWA for exploring MemGlyph Glyphcapsules
            with hybrid retrieval (FTS + Vector + Entity + Graph).
          </p>
          <p>
            <strong>Demo capsule:</strong> memglyph-demo.mgx.sqlite (8 pages, 25 entities, 11 edges)
          </p>
          <button className="btn-primary">Open Capsule</button>
        </div>
      </main>

      <footer className="app-footer">
        <p>Built with Preact + SQLite WASM + OPFS</p>
      </footer>
    </div>
  );
}
