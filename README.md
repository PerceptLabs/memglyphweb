# 🔮 MemGlyph - Knowledge Unlocked

**Transform your SQLAR files into beautiful, queryable websites with dynamic memory.**

<div align="center">

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GCUI Spec](https://img.shields.io/badge/GCUI-v1.0-purple.svg)](docs/GCUI_SPEC_v1.0.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue.svg)](https://www.typescriptlang.org/)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-green.svg)](https://web.dev/progressive-web-apps/)

[Demo](https://memglyph.com) • [Documentation](docs/) • [GCUI Spec](docs/GCUI_SPEC_v1.0.md) • [Boilerplate Guide](#-using-as-a-boilerplate)

</div>

---

## 🌟 What is MemGlyph?

**MemGlyph** is a revolutionary way to store, share, and explore knowledge. It's a **Progressive Web App** (PWA) that turns SQLAR files into:

- 🌐 **Beautiful Websites** - Landing pages, documentation sites, dashboards
- 🔍 **Smart Search** - Full-text, hybrid, and graph-based search
- 📊 **Data Visualizations** - Charts and dashboards from your data
- 💾 **Offline-First** - Everything works without internet
- 📦 **Single File** - Entire site in one portable SQLite file

### Why MemGlyph?

Traditional websites need:
- Web servers (hosting costs)
- Databases (separate infrastructure)
- Build systems (complexity)
- Internet connection (always online)

**MemGlyph GlyphCases are different:**
- ✅ **One file** contains everything (content + data + search)
- ✅ **No server** required (runs in browser with SQLite WASM)
- ✅ **Offline-first** (works on planes, in restricted environments)
- ✅ **Version control** friendly (git diff works on SQL)
- ✅ **Portable** (email it, USB it, commit it)

---

## 🚀 Quick Start

### Run the Demo

```bash
# Clone the repository
git clone https://github.com/PerceptLabs/memglyphpwa.git
cd memglyphpwa

# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:5173
```

Click "Open Demo Capsule" to see hybrid retrieval in action!

### Build for Production

```bash
npm run build
npm run preview
```

---

## 🎯 Use Cases

### 1. **Documentation Sites** (Like viewer.memglyph.com)

Create beautiful docs from a single SQLAR file:

```sql
CREATE TABLE _ui_pages (slug TEXT, title TEXT, content TEXT, layout TEXT);
INSERT INTO _ui_pages VALUES
  ('/', 'Welcome', '# Getting Started\n\nYour documentation...', 'docs'),
  ('/api', 'API Reference', '## Functions\n\n...', 'reference');

CREATE TABLE _ui_config (key TEXT, value TEXT);
INSERT INTO _ui_config VALUES
  ('site_title', 'My Documentation'),
  ('theme_primary', '#6366f1');
```

Upload to MemGlyph → **Instant beautiful website!**

### 2. **Universal SQLAR Viewer**

viewer.memglyph.com serves as:
- **Default**: Beautiful memglyph.com docs (showcases the product)
- **Upload Mode**: Drag-and-drop any SQLAR → instant website
- **Developer Tool**: Explore any SQLAR capsule

### 3. **Personal Knowledge Base**

Store your notes, research, bookmarks in one file:
- Full-text search across everything
- Graph connections between concepts
- Portable (one file, any device)
- Private (runs locally, no cloud)

### 4. **Data Dashboards**

Create interactive dashboards from SQL queries:

```sql
CREATE TABLE _ui_dashboards (name TEXT, query TEXT, grammar TEXT, config TEXT);
INSERT INTO _ui_dashboards VALUES
  ('sales',
   'SELECT date, SUM(amount) FROM sales GROUP BY date',
   'vegalite-lite-v1',
   '{"mark": "line", "encoding": {"x": {"field": "date"}, "y": {"field": "sum"}}}');
```

**Result:** Live chart that updates with your data!

---

## 🏗️ Architecture

### Modular & Extensible

```
src/
├── features/           # Modular features (can be disabled)
│   ├── llm/           # AI reasoning (optional)
│   ├── search/        # FTS/Hybrid/Graph search
│   ├── entities/      # Entity extraction & filtering
│   ├── charts/        # Vega-Lite chart rendering
│   ├── layouts/       # Landing, docs, dashboard layouts
│   ├── router/        # Page routing & markdown
│   └── assets/        # asset:// protocol handler
├── gcui/v1/           # GCUI spec implementation
├── config/            # Feature flags & deployment modes
└── db/                # SQLite & LLM workers
```

### GCUI Spec v1.0

The **Glyph Case UI Specification** defines how SQLAR files render as websites.

**Core Principles:**
- 📄 **Declarative** - Describe what to render, not how
- 🔓 **Optional** - Regular SQLAR files still work
- 🎨 **Agnostic** - Any reader can implement it
- 🔒 **Secure** - Read-only by default, sanitized content

[Read the full spec →](docs/GCUI_SPEC_v1.0.md)

---

## 📦 Using as a Boilerplate

Want to create your own SQLAR-powered site? MemGlyph is designed as a boilerplate!

### Quick Clone & Deploy

```bash
# Clone the repo
git clone https://github.com/PerceptLabs/memglyphpwa.git my-docs-site
cd my-docs-site

# Install dependencies
npm install

# Configure for your project
# Edit src/config/features.ts
```

### Deployment Modes

**Website Mode** (`viewer.memglyph.com`):
```env
VITE_MODE=website
```
- Bundled SQLAR with your content
- Beautiful landing page
- Search & browsing

**Viewer Mode** (universal tool):
```env
VITE_MODE=viewer
```
- File upload capability
- Works with any SQLAR
- Full feature set

### What You Can Customize

**Easy (No Code):**
- ✅ Content (just edit your SQLAR file)
- ✅ Branding (via `_ui_config` table)
- ✅ Colors/theme (CSS variables)
- ✅ Features (enable/disable in config)

**Moderate (Some Code):**
- ✅ Layouts (edit `src/features/layouts/`)
- ✅ Chart types (extend Vega-Lite renderer)
- ✅ Search modes (add new search strategies)

**Advanced (Full Control):**
- ✅ Custom features (add to `src/features/`)
- ✅ New GCUI tables (extend the spec)
- ✅ Custom workers (SQLite extensions, etc.)

---

## 🎨 Features

### Core Features

- **✅ Hybrid Search**
  - Full-text search (FTS5)
  - Vector similarity (optional)
  - Entity-aware search
  - Graph traversal

- **✅ Dynamic GlyphCase (v1.1)**
  - **Static Mode** - Read-only immutable knowledge (Core)
  - **Dynamic Mode** - Episodic memory with Envelope layer
  - **Envelope** - Hash-chained append-only runtime learning
  - **Stream** - Event bus for real-time coordination
  - **Activity Timeline** - Chronological visualization of searches, feedback, and summaries
  - **Export Envelopes** - For external remint tooling
  - **Integrity Verification** - SHA-256 Merkle chain validation

- **✅ GCUI Rendering**
  - Website mode (_ui_pages)
  - Dashboard mode (_ui_dashboards)
  - Vega-Lite charts
  - Responsive layouts

- **✅ PWA Capabilities**
  - Offline-first architecture
  - Service worker caching
  - OPFS for large databases
  - Install as app

### Optional Features

- **🤖 LLM Reasoning** (can be disabled)
  - Qwen 3 0.6B model (runs locally via Wllama)
  - Auto-reasoning on search results
  - Constrained prompting (answers only from snippets)
  - Top-5 snippet synthesis with 1500 token limit
  - GID citation tracking (hallucination prevention)
  - Real-time progress visualization
  - Works completely offline

- **📊 Advanced Visualizations**
  - Bar, line, scatter, area charts
  - Auto-generated from SQL
  - Interactive dashboards
  - Responsive design

- **🕸️ Graph Navigation**
  - Entity relationships
  - Multi-hop traversal
  - Relevance ranking
  - Visual connections

---

## 🧠 How LLM Reasoning Works

The optional LLM feature provides **constrained reasoning** over your search results:

### 1. **Search First**
When you search your capsule, the system retrieves relevant snippets using hybrid search (FTS5 + entities + graph).

### 2. **Auto-Reasoning**
If LLM is enabled, it automatically:
- Takes the **top 5 search results** as context
- Sends them to a tiny local AI model (Qwen 3 0.6B)
- Generates an answer using **only** those snippets

### 3. **Constrained Prompting**
The LLM is instructed to:
- ✅ Answer ONLY from provided snippets
- ✅ Cite GID (Glyph ID) for every fact
- ✅ Say "insufficient evidence" if answer isn't in snippets
- ❌ Never hallucinate or use outside knowledge

### 4. **Citation Tracking**
Every fact in the answer is linked back to a specific snippet (GID). Click a citation to see the source.

### 5. **Hallucination Prevention**
- GID extraction validates all citations are real
- Stop tokens prevent thinking mode leakage
- 1500 token limit keeps responses focused

### Why This Matters
Unlike cloud LLMs that might "make up" answers, this approach:
- **Offline-first** - No API calls, no data leakage
- **Transparent** - Every claim has a traceable source
- **Constrained** - Can't invent facts not in your GlyphCase
- **Fast** - Tiny model (0.6B params) runs in browser

---

## 🧠 Dynamic GlyphCase: Memory & RAG Edition

**GlyphCase v1.1** introduces a three-tier memory model inspired by cognitive science:

### Three-Tier Memory Architecture

1. **Core (Semantic Substrate)** - Long-term immutable knowledge
   - FTS5 full-text search
   - Entity graph
   - Vector embeddings (optional)
   - **Read-only** - Never modified after creation

2. **Envelope (Episodic Memory)** - Runtime learning layer
   - Append-only SQLite database
   - Hash-chained integrity (SHA-256 Merkle chain)
   - Stored separately in OPFS
   - Captures: search queries, feedback signals, LLM interactions, embeddings
   - **Exportable** for external remint tooling

3. **Stream (Working Memory)** - Ephemeral event bus
   - Real-time pub/sub coordination
   - Events: retrieval.query, retrieval.result, llm.prompt, llm.output, feedback.signal
   - Connects features without tight coupling

### Static vs Dynamic Modes

**Static Mode (📦):**
- Core only (no Envelope)
- Traditional read-only exploration
- Perfect for stable knowledge bases

**Dynamic Mode (🧠):**
- Core + Envelope + Stream
- Records all interactions
- Builds episodic memory over time
- Exports for reminting (consolidating Envelope → Core)

### Key Features

- **🔗 Hash Chaining** - Cryptographic integrity for all Envelope data
- **📜 Activity Timeline** - Visual history of searches, feedback, summaries
- **📦 Export Envelopes** - For external Python/Node remint tools
- **✓ Integrity Verification** - Validate hash chain before reminting
- **🔄 Remint Ready** - Complete workflow for knowledge consolidation

### Reminting Workflow

1. **Capture** - Use Dynamic mode, search, give feedback
2. **Export** - Download `.db` envelope file
3. **Validate** - Verify hash chain integrity
4. **Review** - Analyze feedback, embeddings, patterns
5. **Remint** - Consolidate valuable data back into Core (external tool)

[Read the complete Remint Guide →](docs/REMINT.md)

---

## 🧪 Testing

### Run Tests

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Run tests once (CI mode)
npm run test:run

# Generate coverage report
npm run test:coverage
```

### Test Coverage

- ✅ GCUI detection (7 tests)
- ✅ Search hooks (8 tests)
- ✅ Entity hooks (8 tests)
- ✅ LLM integration (implemented, tests pending)
- ⏳ Chart rendering (coming soon)

---

## 🛠️ Development

### Project Structure

```
memglyphpwa/
├── docs/                   # Documentation
│   └── GCUI_SPEC_v1.0.md  # GCUI specification
├── public/                 # Static assets
│   └── memglyph-demo.mgx.sqlite  # Demo capsule
├── src/
│   ├── features/          # Modular features
│   ├── gcui/              # GCUI implementation
│   ├── config/            # Configuration
│   ├── db/                # Database clients
│   └── test/              # Test setup
├── dist/                   # Build output (tracked in repo)
└── package.json
```

### Tech Stack

- **Frontend:** Preact (3KB React alternative)
- **Database:** SQLite WASM (OPFS backend)
- **LLM:** Wllama (WebAssembly Llama)
- **Build:** Vite
- **PWA:** vite-plugin-pwa
- **Testing:** Vitest
- **TypeScript:** 100% typed

### Scripts

```bash
npm run dev          # Dev server (http://localhost:5173)
npm run build        # Production build
npm run preview      # Preview build
npm run typecheck    # Type checking
npm test             # Run tests
```

---

## 📚 Documentation

- [GCUI Spec v1.0](docs/GCUI_SPEC_v1.0.md) - Glyph Case UI specification
- [Remint Guide](docs/REMINT.md) - GlyphCase reminting workflow
- [Deployment Guide](docs/DEPLOYMENT.md) - Production deployment with security
- [Architecture](#-architecture) - System design
- [Boilerplate Guide](#-using-as-a-boilerplate) - Fork & customize
- [Features](#-features) - What's included

---

## 🌍 The Vision: viewer.memglyph.com

**viewer.memglyph.com** will be the universal SQLAR viewer that:

### Acts as Three Things:

1. **Product Showcase**
   - Beautiful memglyph.com documentation
   - Demonstrates GCUI rendering
   - Shows what's possible

2. **Universal Tool**
   - Drag-and-drop any SQLAR file
   - Instant website rendering
   - Works offline

3. **Living Example**
   - The site IS the product
   - Self-documenting
   - Open source boilerplate

### The Magic:

```
Visit viewer.memglyph.com → See beautiful docs
                           ↓
Upload your own SQLAR     → Your content, same beauty
                           ↓
Fork the repo             → Deploy your own
```

**One codebase, infinite possibilities!**

---

## 🤝 Contributing

We welcome contributions! Areas we'd love help with:

- 🎨 Additional layouts & themes
- 📊 More chart types (Vega-Lite extensions)
- 🧪 More tests & coverage
- 📝 Documentation improvements
- 🌍 Internationalization
- ♿ Accessibility enhancements

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit (`git commit -m 'Add amazing feature'`)
6. Push (`git push origin feature/amazing-feature`)
7. Open a Pull Request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **SQLite** - The amazing database that makes this possible
- **Vite** - Lightning-fast build tool
- **Preact** - Tiny React alternative
- **Wllama** - WebAssembly LLM runtime
- **Vega-Lite** - Declarative visualization grammar

---

## 📞 Contact & Support

- 🐛 **Issues:** [GitHub Issues](https://github.com/PerceptLabs/memglyphpwa/issues)
- 💬 **Discussions:** [GitHub Discussions](https://github.com/PerceptLabs/memglyphpwa/discussions)
- 🌐 **Website:** [memglyph.com](https://memglyph.com) (coming soon)
- 📧 **Email:** support@memglyph.com (coming soon)

---

<div align="center">

**Made with ❤️ by [PerceptLabs](https://github.com/PerceptLabs)**

*Your knowledge, unlocked.*

</div>
