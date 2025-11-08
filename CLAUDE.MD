# GlyphCapsule PWA - Implementation Guide

**Role**: Senior full-stack engineer implementing a production-grade PWA that opens and queries a Glyphcapsule (*.mgx.sqlite) entirely client-side.

**Goal**: Deliver an offline-capable app that (1) loads a Glyphcapsule, (2) searches via FTS5, (3) explores entities & graph edges, (4) verifies checkpoints/signatures, (5) optionally hands top-K snippets to a tiny LLM for reasoning, and (6) runs with zero backend.

---

## 🎯 Current Status (as of Sprint 2)

### ✅ Completed

**Sprint 1: Core Infrastructure**
- ✅ OPFS persistence for SQLite databases
- ✅ Type-safe RPC contract with Zod validation
- ✅ Query queue with timeout protection
- ✅ File picker for opening capsules
- ✅ Basic feature module structure

**Sprint 2: Search & Browsing**
- ✅ FTS search with BM25 ranking and `snippet()` highlighting
- ✅ Entity filtering (AND-based) integrated with FTS
- ✅ Virtualized page browser with pagination
- ✅ Asset blob lifecycle management for images/PDFs
- ✅ Comprehensive test coverage (36 tests passing)

### 🚧 In Progress / Planned

**Sprint 3: UI Integration** (Next)
- Wire entity facets to search filters
- Main layout with search, results, and page preview
- Click-to-navigate from search results to pages
- Integrated metadata display

**Sprint 4: Graph Visualization**
- Graph data hooks for traversal
- Force-directed graph visualization
- Bidirectional navigation (in/out edges)
- Predicate filtering

**Sprint 5: Provenance & Verification**
- Checkpoint timeline viewer
- Page verification (SHA anchors vs ledger)
- Ledger block browser
- Signature validation

**Sprint 6: Optional LLM Reasoning**
- WebLLM/Wllama integration
- Constrained prompting with GID citations
- Top-K snippet synthesis
- Hallucination guards

---

## 📋 Glyphcapsule Context

A **Glyphcapsule** is a single SQLite database using SQLAR to store the canonical corpus (e.g., `glyphs/page_0001.mgx.png`, ledger, etc.) plus rebuildable accelerators for search/graph.

**Key Tables**:
- `sqlar` - Canonical archive (source of truth)
- `meta_index` - Page metadata
- `meta_fts` (FTS5) - Full-text search index with BM25
- `entities` - Extracted entities with types and normalized values
- `node_index` - Graph nodes
- `edges` - Graph edges with predicates
- `ledger_blocks` - Provenance ledger
- `checkpoints` - Merkle roots and epochs
- `keys` - Signer information

**Design Principle**: Everything besides `sqlar` is rebuildable; treat `sqlar` as canonical.

---

## 🏗️ Architecture

### Tech Stack
- **Runtime**: Browser-only (no Node server)
- **Database**: sqlite-wasm with OPFS VFS + FTS5 + JSON1
- **Workers**: Dedicated DB worker (typed RPC), optional LLM worker
- **Storage**: OPFS for persistence
- **UI**: Preact with modular feature components
- **Build**: Vite + TypeScript strict + PWA plugin

### Current File Structure

```
/src
  /db
    sqlite.worker.ts       # SQLite-WASM init, RPC handler, OPFS
    client.ts              # Main thread DB client
    rpc-contract.ts        # Zod-validated RPC schemas
    queries.ts             # SQL query definitions
    query-queue.ts         # Serialized query execution
    opfs.ts                # OPFS file operations
    types.ts               # Database type definitions

  /features
    /open
      FilePickerButton.tsx # Open capsule from file picker
      useOpfs.ts           # OPFS state management

    /search
      SearchPanel.tsx      # Search UI component
      useSearch.ts         # Search hook (FTS, hybrid, graph modes)
      __tests__/           # Search tests

    /entities
      EntityPanel.tsx      # Entity facet UI
      useEntities.ts       # Entity browsing hook
      __tests__/           # Entity tests

    /page
      PageBrowser.tsx      # Virtualized page list
      usePageBrowser.ts    # Page browsing hook
      __tests__/           # Page browser tests

    /assets
      assetProtocol.ts     # Asset:// URL handler with blob lifecycle
      __tests__/           # Asset loading tests

    /graph               # [Sprint 4]
    /provenance          # [Sprint 5]
    /llm                 # [Sprint 6]
    /router              # Navigation state
    /layouts             # Layout components
    /charts              # Data visualization

  /gcui/v1
    types.ts             # GCUI protocol types
    detector.ts          # Format detection

  /test
    renderHook.tsx       # Test utilities

  app.tsx
  main.tsx
```

---

## 🔌 Worker RPC Contract

```typescript
// Type-safe RPC operations (see src/db/rpc-contract.ts)
export type RpcRequest =
  | { type: 'OPEN_FROM_FILE'; file: File }
  | { type: 'OPEN_FROM_OPFS'; path: string }
  | { type: 'FTS_SEARCH'; query: string; limit?: number; entityType?: string; entityValue?: string }
  | { type: 'HYBRID_SEARCH'; query: string; limit?: number; weights?: FusionWeights }
  | { type: 'LIST_ENTITIES'; entityType?: string; limit?: number }
  | { type: 'GRAPH_HOPS'; seedGid: string; predicate?: string; maxHops?: number; limit?: number }
  | { type: 'GET_PAGE_LIST'; limit?: number; offset?: number }
  | { type: 'GET_PAGE_BLOB'; name: string }
  | { type: 'VERIFY_PAGE'; gid: string }
  | { type: 'QUERY'; sql: string; params?: any[] };

export type RpcResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };
```

All requests are validated with Zod schemas before execution.

---

## 🔍 Core SQL Queries

### FTS Search with Entity Filtering
```sql
SELECT
  m.gid,
  m.page_no,
  m.title,
  snippet(meta_fts, 3, '<mark>', '</mark>', '…', 18) AS snippet,
  meta_fts.rank,
  (1.0 / (ABS(meta_fts.rank) + 1.0)) AS score
FROM meta_fts
JOIN meta_index m ON m.rowid = meta_fts.rowid
WHERE meta_fts MATCH ?
  AND m.gid IN (
    SELECT DISTINCT gid
    FROM entities
    WHERE (entity_type = ? OR ? IS NULL)
      AND (normalized_value = ? OR ? IS NULL)
  )
ORDER BY meta_fts.rank
LIMIT ?
```

### Entity Facets
```sql
SELECT
  entity_type,
  normalized_value,
  COUNT(DISTINCT gid) AS count
FROM entities
GROUP BY entity_type, normalized_value
ORDER BY count DESC
LIMIT ?
```

### Graph Hops (Outbound)
```sql
WITH RECURSIVE graph_traversal(gid, depth) AS (
  SELECT ?, 0
  UNION ALL
  SELECT n2.gid, gt.depth + 1
  FROM graph_traversal gt
  JOIN node_index n1 ON n1.gid = gt.gid
  JOIN edges e ON e.fromNode = n1.node_id
  JOIN node_index n2 ON n2.node_id = e.toNode
  WHERE gt.depth < ?
    AND (? IS NULL OR e.pred = ?)
)
SELECT DISTINCT
  n.gid,
  n.page_no,
  n.title,
  gt.depth AS distance
FROM graph_traversal gt
JOIN node_index n ON n.gid = gt.gid
ORDER BY gt.depth, n.page_no
LIMIT ?
```

### Page List
```sql
SELECT gid, doc_id, page_no, title, tags, updated_ts
FROM meta_index
ORDER BY page_no
LIMIT ? OFFSET ?
```

### Asset Loading
```sql
SELECT data FROM sqlar WHERE name = ? LIMIT 1
```

---

## 📊 Ranking & Fusion

### Current Implementation (Sprint 2)
- **FTS Mode**: Pure BM25 ranking from `meta_fts.rank`
- **Hybrid Mode**: Fusion of FTS + entity + graph scores
- **Graph Mode**: Distance-based scoring (1.0 / (distance + 1))

### Fusion Weights (configurable)
```typescript
{
  fts: 0.5,      // BM25 text relevance
  vector: 0.0,   // [Future] Embedding similarity
  entity: 0.3,   // Entity match score
  graph: 0.2     // Graph proximity score
}
```

---

## 🧪 Testing Strategy

**Current Coverage**: 36 tests across 5 test suites
- GCUI detector: 7 tests
- Asset protocol: 8 tests
- Search hooks: 8 tests
- Page browser: 5 tests
- Entity hooks: 8 tests

**Testing Approach**:
- Unit tests for hooks and utilities
- Mocked DB client for isolated testing
- Integration tests for full workflows (planned)
- Lighthouse PWA score target: ≥90

---

## 🚀 Sprint Roadmap

### Sprint 3: UI Integration (Immediate Next)
**Goal**: Make existing features usable through cohesive UI

1. Main layout component
   - Top bar: capsule info, search, toggles
   - Left sidebar: entity facet filters
   - Center panel: results/preview tabs
   - Right sidebar: page metadata

2. Wire entity facets to search
   - Connect `EntityPanel` to `useSearch.setFilter()`
   - Show active filters with clear buttons
   - Auto-refresh results on filter change

3. Integrated search UI
   - Combine search bar + entity filters
   - Display results with `<mark>` snippets
   - Click result → load page preview

4. Page preview component
   - Use `useAsset()` to load images
   - Display page metadata
   - Navigation controls (prev/next)

**Acceptance**: User can open capsule → search with filters → view pages

---

### Sprint 4: Graph Visualization
**Goal**: Interactive graph exploration

1. Graph data hooks
   - `useGraph()` for traversal state
   - Support in/out edge filtering
   - Predicate type filters

2. Graph visualization
   - Force-directed layout (D3/Cytoscape)
   - Node click → navigate to page
   - Highlight paths and clusters

3. Graph search integration
   - Visual representation of graph results
   - Show connection paths

**Acceptance**: User can explore graph connections between pages

---

### Sprint 5: Provenance & Verification
**Goal**: Trust and transparency

1. Checkpoint timeline
   - List from `checkpoints` table
   - Show merkle roots and epochs
   - Display signer info from `keys`

2. Page verification
   - "Verify Page" action in UI
   - Compute SHA anchor from payload
   - Compare against `ledger_blocks`
   - Display verification status

3. Provenance panel
   - Ledger block browser
   - Checkpoint history
   - Signature validation UI

**Acceptance**: User can verify page integrity and view provenance

---

### Sprint 6: Optional LLM Reasoning
**Goal**: In-browser AI synthesis

1. LLM worker integration
   - Configure WebLLM or Wllama
   - Load Gemma 3 1B or similar
   - Implement constrained prompting

2. Reasoning UI
   - Toggle for LLM mode in search
   - Take top-K snippets → LLM
   - Display answer with GID citations
   - Guard: "insufficient evidence" if no snippets

3. Performance optimization
   - Model caching
   - Token limits (1500 cap)
   - Lazy loading

**Acceptance**: User can ask questions and get cited answers from capsule

---

## 🛡️ Non-Functional Requirements

### Offline-First
- ✅ Full PWA with service worker
- ✅ OPFS persistence
- ✅ Cache app shell
- ⏳ Display storage usage controls

### Performance
- ✅ DB operations in dedicated worker
- ✅ Virtualized lists for large datasets
- ✅ Blob caching with lifecycle management
- ⏳ Debounced search input
- ⏳ Stream large result sets

### Security
- ✅ No dynamic `.load_extension`
- ✅ Precompiled WASM modules
- ✅ Result set limits (200 max)
- ⏳ File type sniffing on open
- ⏳ Content Security Policy headers

### Developer Experience
- ✅ Clean module boundaries
- ✅ Type-safe RPC with Zod validation
- ✅ Comprehensive unit tests
- ✅ TypeScript strict mode
- ⏳ Integration test suite

---

## 📦 Build & Deploy

### Commands
```bash
npm run dev          # Development server
npm run build        # Production build
npm run preview      # Preview production build
npm test             # Run tests
npm run test:ui      # Visual test runner
npm run lint         # ESLint check
```

### Bundle Size Target
- Current: ~547 KB total (gzip)
- Target: < 1 MB including WASM

### Browser Support
- Chrome/Edge 102+ (OPFS + WASM required)
- Firefox (experimental OPFS support)
- Safari (limited OPFS support)

---

## 🚫 Guardrails

1. **No Backend**: Everything runs client-side
2. **No Dynamic Extensions**: All SQLite features compiled into WASM
3. **Reasonable Bundle Size**: Lazy-load graph and LLM modules
4. **SQLAR is Canonical**: Never modify `sqlar` table
5. **Type Safety**: All RPC validated with Zod
6. **Test Coverage**: Maintain >80% for critical paths

---

## 📚 Key References

- **SQLite WASM**: https://sqlite.org/wasm/
- **OPFS**: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
- **FTS5**: https://sqlite.org/fts5.html
- **Preact**: https://preactjs.com/
- **Vite PWA**: https://vite-pwa-org.netlify.app/

---

## 🤝 Contributing

When implementing new features:
1. Start with the data layer (RPC + SQL queries)
2. Add hook for state management
3. Build UI component
4. Write tests
5. Update this document

Keep module boundaries clean. Each feature should be independently testable.
