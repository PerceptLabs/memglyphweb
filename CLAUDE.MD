Role: You are a senior full-stack engineer implementing a production-grade PWA that opens and queries a Glyphcapsule (*.mgx.sqlite) entirely client-side. Goal: Deliver an offline-capable app that (1) loads a Glyphcapsule, (2) searches via FTS5, (3) explores entities & graph edges, (4) verifies checkpoints/signatures, (5) optionally hands top-K snippets to a tiny LLM for reasoning, and (6) runs with zero backend.

1) Context the model must internalize
A Glyphcapsule is a single SQLite database using SQLAR to store the canonical corpus (e.g., glyphs/page_0001.mgx.png, ledger, etc.) plus rebuildable accelerators for search/graph. Key rebuildable tables include: meta_index, meta_fts (FTS5), leann_meta (seeds), leann_vec (cached vectors), entities, node_index, edges, ledger_blocks, checkpoints, keys.
Design principle: everything besides sqlar is rebuildable from the archive; treat sqlar as the canonical source of truth.
Use cases: bulk local queries, graph hops, provenance verification, and optional reasoning over retrieved snippets. (Hybrid retrieval is a first-class concept.)
2) Non-negotiable tech choices
Runtime: Browser-only, no Node server.
Database: Official sqlite-wasm build with OPFS VFS (persistence) and FTS5 + JSON1 enabled.
Workers: One dedicated DB Web Worker exposing a typed RPC (postMessage). Optional LLM Worker for in-browser reasoning.
Storage: OPFS for the capsule (so large files persist across sessions).
UI: Preact or Solid (lean), with a simple component kit and keyboard navigation.
Build: Vite (fast dev + PWA plugin), TypeScript strict mode, ESLint.
3) Functional requirements (must have)
Open capsule: File Picker → copy to OPFS → open with sqlite-wasm VFS. Show file name, size, integrity state.

Browse corpus:

List pages (from meta_index) with lazy, virtualized pagination.
Render glyph images: read bytes from sqlar where name LIKE 'glyphs/%', convert to Blob, <img>.
Full-text search:

Text input → query meta_fts with BM25 ranking. Show highlighted snippet(), gid, and page number.
Result click scrolls to the page and highlights the region if present.
Entities & filters:

Facet by entities.entity_type and normalized_value.
Combine with FTS query (AND filter) and keep it fast.
Graph explorer:

Visualize node_index + edges (predicates like cites) in a force graph.
Clicking a node navigates to that page/entity.
Provenance:

Show checkpoint timeline (checkpoints) and signer info (keys).
Provide a “Verify current page” action: compute SHA anchor for selected page payload and compare to ledger/anchors where available.
No-LLM mode (default):

Ranking = fusion of FTS rank + entity hits + optional neighbor hints (if leann_neighbors or equivalent table exists).
Small-LLM mode (optional, toggle):

Take top-K snippets (K=3–5) → send to a tiny local LLM (WebGPU with WebLLM/Transformers.js or localhost llama.cpp) strictly for reasoning/synthesis; retrieval always stays in SQL.
Enforce “cite GIDs” in the output; refuse to answer outside provided snippets.
4) Non-functional requirements
Offline-first: full PWA install, cache app shell; capsule persists in OPFS.
Performance: DB operations in a Worker; virtualized lists; debounced search; stream rows where possible.
Security: no dynamic .load_extension; WASM modules are precompiled; guard against huge result sets; file-type sniffing on open.
DX: clean module boundaries; typed RPC; unit tests for query builder and verifiers.
5) Architecture & file layout
/app
  /public
    manifest.webmanifest
    icons/
  /src
    /db
      sqlite.worker.ts         # sqlite-wasm init; RPC; OPFS helpers
      ops.ts                   # high-level ops (openCapsule, searchFts, getPageBlob, listEntities, graphHops)
      queries.ts               # all SQL strings + row mappers
    /features
      /open
        OpenButton.tsx
        CapsulePicker.tsx
      /search
        SearchBar.tsx
        ResultsList.tsx
      /page
        PagePreview.tsx        # blob URL image view
        PageSidebar.tsx        # entities, meta
      /graph
        GraphView.tsx          # force-graph or cytoscape
      /provenance
        VerifyPanel.tsx
        CheckpointTimeline.tsx
      /reason
        ReasonToggle.tsx
        ReasonWorker.ts        # optional tiny LLM (WebGPU) path
    /state
      store.ts                 # Zustand/Signal store
      selectors.ts
    /ui
      Button.tsx, Panel.tsx, ...
    app.tsx
    main.tsx
  vite.config.ts
  package.json
  README.md
6) Worker RPC contract (typed)
// db/ops.ts types
export type RpcRequest =
  | { t: 'OPEN_FROM_FILE'; fileHandle: File }
  | { t: 'OPEN_FROM_OPFS'; path: string }
  | { t: 'FTS_SEARCH'; query: string; limit?: number }
  | { t: 'LIST_ENTITIES'; type?: string; norm?: string; limit?: number }
  | { t: 'GRAPH_HOPS'; seedGid: string; pred?: string; dir?: 'out'|'in'; limit?: number }
  | { t: 'GET_PAGE_BLOB'; name: string } // e.g., 'glyphs/page_0001.mgx.png'
  | { t: 'VERIFY_PAGE'; gid: string };

export type RpcResponse =
  | { ok: true; data: any }
  | { ok: false; error: string };
7) SQLite-WASM initialization (Worker)
Load official sqlite3.wasm + OPFS VFS.
If opening from File Picker, copy the bytes into OPFS as /capsules/<slug>.mgx.sqlite and then open with the OPFS VFS.
Expose a single db per session; serialize queries.
8) Core SQL (the agent must implement)
List archived files (SQLAR):

SELECT name, sz, mtime FROM sqlar ORDER BY name;
FTS search (BM25):

SELECT
  gid,
  snippet(meta_fts, 0, '<b>','</b>','…', 18) AS snip,
  rank
FROM meta_fts
WHERE meta_fts MATCH $q
ORDER BY rank
LIMIT $limit;
Entities (facet):

SELECT entity_type, normalized_value, COUNT(*) AS c
FROM entities
GROUP BY entity_type, normalized_value
ORDER BY c DESC
LIMIT 200;
Graph hops (outbound cites):

SELECT n2.gid, ed.pred, ed.weight
FROM node_index n1
JOIN edges ed ON ed.fromNode = n1.node_id
JOIN node_index n2 ON n2.node_id = ed.toNode
WHERE n1.gid = $seed AND ($pred IS NULL OR ed.pred = $pred)
ORDER BY ed.weight DESC
LIMIT $limit;
Get a page image blob:

SELECT data FROM sqlar WHERE name = $name LIMIT 1;
Checkpoint list & verify helpers:

SELECT epoch, merkle_root FROM checkpoints ORDER BY epoch DESC;
SELECT * FROM ledger_blocks ORDER BY ts DESC LIMIT 100;
Tables present by design: sqlar, meta_index, meta_fts, leann_meta, leann_vec, entities, node_index, edges, ledger_blocks, checkpoints, keys.

9) Ranking (no-LLM mode)
Implement a small fusion ranking on the UI side:

score = 0.5 * normalize(bm25)
      + 0.3 * normalize(entity_hit_score)
      + 0.2 * normalize(neighbor_hint_score)  // if available
Return top-N with their GIDs and snippets.

10) Optional small-LLM reasoning
In-browser: WebGPU via WebLLM/Transformers.js OR localhost llama.cpp (Gemma 3 1B Q4_K_M) behind a minimal HTTP endpoint.

Strict prompt:

System: “You are a constrained assistant. Only reason over the provided passages. Always cite gid values you used. If information is not in the snippets, say ‘insufficient evidence’.”
User content: JSON with { question, snippets: [{gid, text}], instructions }.
The agent must implement:

a toggle in UI,
a 1500-token cap,
and a guard that blocks answering if snippets.length === 0.
11) UX outline
Top bar: Open Capsule, Search, Reasoning Toggle, Verify
Left: Filters (entity facets, predicates)
Center: Results/Page Preview/Graph tabs
Right: Provenance (checkpoints, signers), Details (entities on page)
12) PWA & persistence
Add manifest.webmanifest, icons, and Service Worker (workbox) to cache app shell.
Store the capsule file in OPFS; reuse on next launch.
Display storage usage and “Remove capsule” control.
13) Testing & acceptance
Unit tests for queries.ts mappers and graph hop helpers.
Integration: open a known sample capsule; run FTS query; verify at least one graph hop; render a page image; list checkpoints.
Lighthouse PWA score ≥ 90, TTI < 2.5s with empty capsule.
Works in Chrome/Edge (WebAssembly + OPFS required).
14) Deliverables
Complete codebase per layout above.
README.md with: quick start, browser support, how to load a capsule, how to verify, how to enable optional LLM.
Demo data loader (button to open a local .mgx.sqlite).
Minimal CSS with accessible defaults; responsive layout.
15) Guardrails
Do not introduce a backend server.
Do not use dynamic SQLite extensions; everything must be compiled into the WASM build.
Keep bundle size reasonable; lazy-load graph and reasoning modules.
Build it. If something is underspecified, choose the simplest, most robust approach that satisfies offline use, OPFS persistence, and fast FTS + graph queries against the capsule.

i will explain what a glyphcapsule is after we make a plan to implement this, you can suggest adjustments
