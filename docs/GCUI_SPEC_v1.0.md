# GlyphCapsule UI Specification v1.0

**GCUI Spec v1.0** — Declarative website and dashboard rendering from SQLAR capsules.

## Overview

The GlyphCapsule UI (GCUI) specification defines how SQLAR capsules can optionally include metadata to render as beautiful websites, dashboards, or interactive applications—while remaining fully agnostic to readers that don't implement the spec.

### Core Principles

1. **Capsules stay agnostic** — Data first. UI hints are purely optional via `_ui_*` tables.
2. **Readers may ignore** — GCUI tables are suggestions, not requirements. Readers can fall back to generic database browsing.
3. **Declarative, not imperative** — Describe what to render (data, layout), not how (no code execution).
4. **Security first** — Read-only by default, sanitized content, performance limits.
5. **Versioned** — Explicit version negotiation via `_meta_manifest`.

---

## Rendering Modes (Auto-detected)

Readers detect mode by checking for specific tables:

| Tables Present | Mode | Description |
|---------------|------|-------------|
| `_ui_pages` | **Website** | Routed pages with content and navigation |
| `_ui_dashboards` | **Dashboard** | Data visualizations and charts |
| Neither | **Generic Browser** | Table viewer with search |

Modes are not mutually exclusive—capsules can have both pages and dashboards.

---

## Namespacing & Versioning

### Reserved Prefixes

- **`_ui_*`** — Presentation and rendering hints
- **`_meta_*`** — Document metadata (author, version, license, etc.)
- **`fts_*`** — SQLite FTS5 full-text search (built-in)
- **`sqlar`** — SQLAR file storage (built-in)

Everything else is user data.

### Version Declaration

**Required table:** `_meta_manifest`

```sql
CREATE TABLE _meta_manifest (
  key TEXT PRIMARY KEY,
  value TEXT
);

INSERT INTO _meta_manifest VALUES
  ('gcui', '1.0'),              -- GCUI spec version
  ('capsule_kind', 'sqlar'),    -- File format
  ('created', '2025-11-08'),
  ('title', 'My Knowledge Base');
```

**Capability Negotiation (Optional):**

```sql
CREATE TABLE _meta_capabilities (
  feature TEXT PRIMARY KEY,
  required BOOLEAN,
  version TEXT
);

INSERT INTO _meta_capabilities VALUES
  ('ui_pages', 1, '1.0'),
  ('ui_dashboards', 0, '1.0'),
  ('vegalite-lite', 0, 'v1');
```

Readers check `required` features and warn if unsupported.

---

## Website Mode

### Pages & Routing

**Table:** `_ui_pages`

```sql
CREATE TABLE _ui_pages (
  slug TEXT PRIMARY KEY,      -- URL path: "/" or "/docs/api"
  title TEXT NOT NULL,
  content TEXT,               -- Markdown content
  layout TEXT,                -- Layout template name
  category TEXT,              -- For grouping/filtering
  order_index INTEGER         -- Sort order
);
```

**Example:**

```sql
INSERT INTO _ui_pages VALUES
  ('/', 'Home', '# Welcome to MemGlyph...', 'landing', NULL, 0),
  ('/docs/intro', 'Introduction', '## Getting Started...', 'docs', 'Documentation', 1),
  ('/404', 'Not Found', '# Page Not Found', 'simple', NULL, 999);
```

**Routing behavior:**

1. User navigates to `/docs/intro`
2. Reader queries: `SELECT * FROM _ui_pages WHERE slug='/docs/intro'`
3. Renders content using specified layout
4. Missing slug → check for `/404` page, else show built-in 404

**Home page:**

Defined in `_ui_config` with key `home` (defaults to first page by `order_index` if missing).

### Configuration

**Table:** `_ui_config`

```sql
CREATE TABLE _ui_config (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

**Documented keys:**

| Key | Type | Description | Example |
|-----|------|-------------|---------|
| `home` | slug | Home page route | `"/"` |
| `site_title` | string | Site name | `"MemGlyph Docs"` |
| `theme_primary` | color | Primary brand color | `"#6366f1"` |
| `theme_background` | color | Background color | `"#ffffff"` |
| `theme_mode` | enum | `"light"` or `"dark"` | `"dark"` |
| `font_heading` | font | Heading font family | `"Inter"` |
| `font_body` | font | Body font family | `"system-ui"` |
| `logo_asset` | asset:// | Logo image | `"asset://assets/logo.svg"` |
| `hero_title` | string | Landing page title | `"Knowledge Crystallized"` |
| `hero_subtitle` | string | Landing page subtitle | `"SQLAR-powered docs"` |
| `hero_image` | asset:// | Hero background | `"asset://assets/hero.jpg"` |
| `layout_max_width` | CSS | Max content width | `"1200px"` |
| `layout_sidebar_width` | CSS | Sidebar width | `"250px"` |

Readers map these to CSS variables or component props.

### Navigation

**Table:** `_ui_navigation`

```sql
CREATE TABLE _ui_navigation (
  menu TEXT NOT NULL,         -- "header" | "sidebar" | "footer"
  label TEXT NOT NULL,
  to_slug TEXT NOT NULL,      -- Link target
  order_index INTEGER,
  icon_asset TEXT             -- Optional icon (asset://)
);
```

**Example:**

```sql
INSERT INTO _ui_navigation VALUES
  ('header', 'Home', '/', 0, NULL),
  ('header', 'Docs', '/docs/intro', 1, NULL),
  ('sidebar', 'Getting Started', '/docs/intro', 0, 'asset://icons/book.svg'),
  ('sidebar', 'API Reference', '/docs/api', 1, 'asset://icons/code.svg');
```

Readers build navigation menus dynamically.

### Layouts

Readers provide built-in layout templates:

- **`landing`** — Hero section, feature grid, CTAs
- **`docs`** — Sidebar navigation, breadcrumbs, table of contents
- **`reference`** — API documentation style, syntax highlighting
- **`article`** — Blog post style, reading-optimized typography
- **`simple`** — Minimal chrome, just content
- **`dashboard`** — Widget grid for data visualization

Layouts are reader-specific but should follow common UX patterns.

---

## Dashboard Mode

### Dashboard Definition

**Table:** `_ui_dashboards`

```sql
CREATE TABLE _ui_dashboards (
  name TEXT PRIMARY KEY,
  query TEXT NOT NULL,        -- SQL query to execute
  grammar TEXT,               -- Chart grammar (e.g., "vegalite-lite-v1")
  config TEXT                 -- JSON configuration
);
```

**Example:**

```sql
INSERT INTO _ui_dashboards VALUES
  ('sales_trend',
   'SELECT date, SUM(amount) as revenue FROM sales GROUP BY date ORDER BY date',
   'vegalite-lite-v1',
   '{
     "mark": "line",
     "encoding": {
       "x": {"field": "date", "type": "temporal"},
       "y": {"field": "revenue", "type": "quantitative"}
     }
   }');
```

### Chart Grammar: Vega-Lite-Lite v1

**Supported subset of Vega-Lite:**

**Marks:**
- `line`, `bar`, `point`, `area`, `arc`

**Encodings:**
- `x`: `{"field": "col_name", "type": "temporal|quantitative|nominal"}`
- `y`: `{"field": "col_name", "type": "quantitative"}`
- `color`: `{"field": "col_name", "type": "nominal"}`
- `size`: `{"field": "col_name", "type": "quantitative"}`

**Aggregates (in encoding):**
- `count`, `sum`, `mean`, `min`, `max`

**Example config:**

```json
{
  "mark": "bar",
  "encoding": {
    "x": {"field": "category", "type": "nominal"},
    "y": {"field": "sales", "type": "quantitative", "aggregate": "sum"},
    "color": {"field": "region", "type": "nominal"}
  }
}
```

**Not supported in v1:**
- ❌ Complex transforms (calculate, window, bin)
- ❌ Layered/concatenated charts
- ❌ Facets
- ❌ Geo projections
- ❌ Interactive selections

Readers may render using any charting library (Chart.js, Recharts, ECharts, etc.) that can interpret this subset.

### Query Parameters

**Named parameters only:** `:param_name`

```sql
'SELECT * FROM products WHERE category = :category AND price <= :max_price'
```

**Table:** `_ui_params` (optional, for validation/UI generation)

```sql
CREATE TABLE _ui_params (
  view_name TEXT,             -- Dashboard/view name
  param_name TEXT,            -- Parameter name (without :)
  param_type TEXT,            -- "string" | "number" | "enum" | "date"
  default_value TEXT,
  allowed_values TEXT,        -- JSON array for enum types
  PRIMARY KEY (view_name, param_name)
);
```

**Example:**

```sql
INSERT INTO _ui_params VALUES
  ('sales_trend', 'category', 'enum', 'all', '["all", "electronics", "books", "clothing"]'),
  ('sales_trend', 'max_price', 'number', '1000', NULL);
```

Readers use this to:
- Auto-generate filter UI (dropdowns, sliders)
- Validate parameter types
- Prevent SQL injection

---

## Asset Protocol

**Syntax:** `asset://path/to/file`

**Resolution:**

Assets are stored in SQLAR's built-in file storage:

```sql
-- SQLAR table (built-in)
CREATE TABLE sqlar (
  name TEXT PRIMARY KEY,      -- "assets/logo.svg"
  mode INT,
  mtime INT,
  sz INT,
  data BLOB
);
```

**Convention:** Assets should be stored under `assets/` prefix:
- `asset://assets/logo.svg` → SQLAR file `assets/logo.svg`
- `asset://assets/icons/home.svg` → SQLAR file `assets/icons/home.svg`

**Reader behavior:**
1. Detect `asset://` prefix
2. Extract path: `assets/logo.svg`
3. Query: `SELECT data FROM sqlar WHERE name='assets/logo.svg'`
4. Serve as data URL or blob URL

---

## Safety & Performance

### Security

**Read-only by default:**
- GCUI spec does not define write operations
- Capsules are immutable once loaded (readers may allow edits in OPFS but not save back)

**Content sanitization:**
- Markdown rendered to HTML must sanitize XSS vectors
- Use libraries like `DOMPurify` or `sanitize-html`
- No `<script>` tags, no inline event handlers

**Query safety:**
- Parameterized queries only (prevent SQL injection)
- Validate parameter types via `_ui_params`
- Timeout long-running queries

### Performance Limits

**Recommended reader limits:**

| Resource | Limit | Reason |
|----------|-------|--------|
| SQLAR size | < 500 MB | OPFS load time, memory |
| Rows per query | < 10,000 | UI rendering lag |
| Query timeout | < 5 seconds | User experience |
| Chart data points | < 1,000 | Readability, performance |
| Concurrent queries | < 5 | SQLite is single-threaded |

**Query clamping:**

Readers should automatically limit queries:

```sql
-- User writes:
SELECT * FROM large_table;

-- Reader executes:
SELECT * FROM large_table LIMIT 10000;
```

### Required SQLite Features

Readers must use SQLite builds with:
- **FTS5** — Full-text search
- **JSON1** — JSON functions
- **SQLAR** — File storage (or emulate via table)

---

## Optional Features

### LLM/AI

**Stance:** Optional, off by default. Retrieval-only UX must work standalone.

Readers may add LLM reasoning as enhancement but:
- Must function fully without LLM
- Should be user-toggleable
- Should not block core features

### Write Operations

Not defined in GCUI v1.0. Future versions may add:
- `_ui_forms` for data entry
- `_ui_actions` for mutations
- Sync/conflict resolution

---

## Compliance Levels

Readers can implement different compliance levels:

### Level 0: Generic Browser
- Ignore all `_ui_*` tables
- Display table list, run queries
- FTS search if available

### Level 1: Website Reader
- **Required:** `_ui_pages`, `_ui_config`, `_ui_navigation`
- Render as website with routing
- Apply theming
- Support `asset://` protocol

### Level 2: Dashboard Reader
- **Required:** Level 1 + `_ui_dashboards`, `_ui_params`
- Render Vega-Lite-Lite charts
- Generate filter UI from parameters
- Support interactive queries

### Level 3: Full GCUI
- **Required:** All Level 2 features
- Advanced layouts (custom templates)
- Animation/transitions
- Offline caching strategies
- Export capabilities

---

## Examples

### Minimal Website

```sql
CREATE TABLE _meta_manifest (key, value);
INSERT INTO _meta_manifest VALUES ('gcui', '1.0'), ('capsule_kind', 'sqlar');

CREATE TABLE _ui_pages (slug, title, content, layout);
INSERT INTO _ui_pages VALUES
  ('/', 'Home', '# Hello World\nWelcome to my capsule.', 'simple');

CREATE TABLE _ui_config (key, value);
INSERT INTO _ui_config VALUES ('site_title', 'My Capsule');
```

### Documentation Site

```sql
-- (Previous manifest + config)

CREATE TABLE _ui_pages (slug, title, content, layout, category, order_index);
INSERT INTO _ui_pages VALUES
  ('/', 'Home', '# MemGlyph Docs...', 'landing', NULL, 0),
  ('/docs/intro', 'Introduction', '## What is MemGlyph...', 'docs', 'Docs', 1),
  ('/docs/api', 'API Reference', '## Functions...', 'reference', 'Docs', 2);

CREATE TABLE _ui_navigation (menu, label, to_slug, order_index);
INSERT INTO _ui_navigation VALUES
  ('header', 'Home', '/', 0),
  ('header', 'Documentation', '/docs/intro', 1),
  ('sidebar', 'Introduction', '/docs/intro', 0),
  ('sidebar', 'API Reference', '/docs/api', 1);
```

### Dashboard

```sql
CREATE TABLE sales (date TEXT, product TEXT, amount REAL);
-- ... insert sales data

CREATE TABLE _ui_dashboards (name, query, grammar, config);
INSERT INTO _ui_dashboards VALUES
  ('revenue_trend',
   'SELECT date, SUM(amount) as total FROM sales GROUP BY date',
   'vegalite-lite-v1',
   '{"mark":"line","encoding":{"x":{"field":"date","type":"temporal"},"y":{"field":"total","type":"quantitative"}}}');
```

---

## Migration Path

**From generic SQLAR:**
1. Add `_meta_manifest` table
2. Add `_ui_pages` with at least one page
3. Add `_ui_config` for theming
4. (Optional) Add navigation, dashboards

**Tooling (future):**
- CLI: `gcui init my-capsule.sqlar` — Add GCUI tables
- CLI: `gcui validate my-capsule.sqlar` — Check compliance
- CLI: `gcui preview my-capsule.sqlar` — Local dev server

---

## Version History

### v1.0 (2025-11-08)
- Initial release
- Website mode (`_ui_pages`, `_ui_config`, `_ui_navigation`)
- Dashboard mode (`_ui_dashboards`, `_ui_params`)
- Vega-Lite-Lite v1 grammar
- Asset protocol (`asset://`)
- Security and performance guidelines

---

## References

- [Vega-Lite Documentation](https://vega.github.io/vega-lite/)
- [SQLite FTS5](https://www.sqlite.org/fts5.html)
- [SQLAR Format](https://www.sqlite.org/sqlar.html)
- [MemGlyph Project](https://memglyph.com)

---

**License:** CC0 1.0 Universal (Public Domain)

**Maintained by:** MemGlyph / PerceptLabs

**Feedback:** Open an issue at [github.com/PerceptLabs/memglyphpwa](https://github.com/PerceptLabs/memglyphpwa)
