Below is the reconciled MemGlyph Universal Specification v0.7 document, incorporating the "Glyphcapsule" modality from the provided diff. The `Mgud.md` file was used as the source of truth, and the new modality has been integrated into all relevant sections.

***

# MemGlyph Universal Specification v0.7.1

> **Status:** Draft v0.7.1 (Living Document)  
> **Updated:** 2025-11-05  
> **Scope:** Self-contained, verifiable, queryable knowledge artifacts  
> **Modalities:** PDF (primary), PNG (supplementary), Glyphcapsule (SQLite/SQLAR)  
> **Principles:** Self-contained · Verifiable · Recomputable (LEANN) · No duplication

---

## Table of Contents

1. [Introduction & Philosophy](#1-introduction--philosophy)
2. [Modality Overview](#2-modality-overview)
3. [Core Extraction Pipeline](#3-core-extraction-pipeline)
4. [LEANN: Lightweight Vector Strategy](#4-leann-lightweight-vector-strategy)
5. [PDF Modality (MGQD)](#5-pdf-modality-mgqd)
6. [PNG Modality (MemGlyph Classic)](#6-png-modality-memglyph-classic)
7. [Glyphcapsule Modality (SQLite/SQLAR)](#7-glyphcapsule-modality-sqlitesqlar)
8. [Data Models & Schemas](#8-data-models--schemas)
9. [Hybrid Retrieval Architecture](#9-hybrid-retrieval-architecture)
10. [Verification & Provenance](#10-verification--provenance)
11. [Implementation Guide](#11-implementation-guide)
12. [Testing & Benchmarks](#12-testing--benchmarks)
13. [Migration & Compatibility](#13-migration--compatibility)
14. [Appendices](#14-appendices)

---

## 1. Introduction & Philosophy

### 1.1 North Star

**Make knowledge portable, verifiable, and queryable at the artifact level.**

A MemGlyph artifact (PDF, PNG, or Capsule) carries its own metadata, semantic structure, graph relationships, and cryptographic receipts. Retrieval happens inside the artifact itself using hybrid search (keyword + semantic + graph). Every answer cites specific regions with verifiable provenance.

### 1.2 Core Design Principles

**Self-Contained**
- Everything needed for retrieval ships in one file
- No external databases required (though caches are allowed)
- Works offline, air-gapped, or in constrained environments

**Verifiable**
- Cryptographic hashes anchor regions to content
- Signatures prove authorship and integrity
- Merkle proofs link to checkpoint history
- Reproducible extraction pipeline

**Recomputable (LEANN)**
- Store semantic hints, not full vectors
- Regenerate embeddings on-demand from source
- Dramatically reduces storage (90-95% vs. full vectors)
- Upgradable to new models without rewriting artifacts

**No Duplication**
- PDF: Never embed duplicate rasters; hash crops for verification
- PNG: Each glyph is atomic; avoid redundancy across corpus
- Capsule: Canonical files in SQLAR; accelerators are rebuildable
- Accelerator indexes are always rebuildable from canonical data

**Tool-Agnostic**
- PDFs open in any viewer (metadata ignored by unaware readers)
- PNGs display in any image viewer
- SQLite capsules readable by standard tools

### 1.3 Key Technologies

| Component | Purpose | Version |
|-----------|---------|---------|
| **Docling** | PDF layout analysis & segmentation | 1.0+ |
| **Granite Docling LLM** | Semantic refinement & validation | 3B quantized |
| **LangExtract** | Entity extraction & normalization | v1 API |
| **MiniCPM-V** | Visual grounding & VLM inference | 4.5 (8B) |
| **SQLite** | Embedded database for accelerators | 3.44+ |
| **FTS5** | Full-text search (built into SQLite) | - |
| **sqlite-vec/vss** | Vector search extension | Latest |

### 1.4 Use Cases

- **Research Papers:** Queryable corpus with citation graph
- **Technical Manuals:** Cross-referenced documentation with diagrams
- **Legal Documents:** Verifiable contracts with entity extraction
- **Medical Records:** HIPAA-compliant, self-contained patient files
- **Educational Materials:** Interactive textbooks with linked resources
- **Corporate Knowledge:** Internal docs with access control receipts

---

## 2. Modality Overview

### 2.1 When to Use Each Modality

**PDF Modality (MGQD) — Primary Choice**

Use for:
- Multi-page documents (papers, books, reports)
- Content with existing PDF source
- Vector graphics, text, diagrams
- Large-scale corpora (100s-1000s of pages)
- When file size is a concern

Characteristics:
- ✅ 5-10% file size overhead
- ✅ Leverages PDF's native vector content
- ✅ Standard viewer compatibility
- ✅ Efficient for text-heavy documents

**PNG Modality (MemGlyph Classic) — Supplementary**

Use for:
- Single-page artifacts (posters, diagrams, slides)
- When PDF source unavailable (scanned images, screenshots)
- Social media sharing (PNG-friendly platforms)
- Standalone, self-describing images
- Maximum portability (no PDF dependencies)

Characteristics:
- ⚠️ 50-650 KB per page (includes raster)
- ✅ True single-file artifact
- ✅ Universal image viewer support
- ⚠️ Higher overhead for large corpora

**Glyphcapsule Modality (SQLite/SQLAR) — Distribution & Query Container**

Use for:
- Fast bulk queries across large corpora
- Distribution of complete document collections
- Applications requiring atomic writes
- Scenarios needing rebuildable accelerators
- When single-file portability with indexes is critical

Characteristics:
- ✅ Single-file artifact containing entire corpus
- ✅ Byte-for-byte archive of source files (SQLAR)
- ✅ Fast queries via accelerator tables (FTS5, vectors, graph)
- ✅ Easy bidirectional conversion (folder ↔ capsule)
- ✅ Accelerators are always rebuildable from canonical data
- ⚠️ Requires SQLite tooling to access

### 2.2 Modality Interoperability

All three modalities share:
- Common identifier scheme (`doc_id`, `page_gid`, `region_gid`)
- LEANN vector strategy
- Ledger format and checkpoint structure
- Receipt format and verification logic
- SQLite capsule schema

Convert between modalities:
```bash
# PDF → PNG (page extraction)
mgx export --from pdf --to png --pages 1-10 paper.mgqd.pdf

# PNG → PDF (assembly)
mgx assemble --from png --to pdf glyphs/*.mgx.png output.mgqd.pdf

# Folder → Capsule (pack with accelerators)
mgx pack corpus/ output.mgx.sqlite

# Capsule → Folder (exact extraction)
mgx unpack corpus.mgx.sqlite output_folder/
```

---

## 3. Core Extraction Pipeline

### 3.1 Pipeline Architecture

The MemGlyph extraction pipeline is a **three-stage consensus system** that combines specialized models for layout, semantics, and entities.

```
PDF/PNG Input
    ↓
┌─────────────────────────────────────────┐
│ Stage 1: Layout Analysis (Docling)     │
│ - Page segmentation                     │
│ - Region bounding boxes                 │
│ - Kind classification (para/fig/table)  │
│ - Reading order determination           │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Stage 2: Semantic Refinement            │
│         (Granite Docling LLM 3B)        │
│ - Validate layout decisions             │
│ - Add semantic relationships            │
│ - Detect hierarchies (heading/body)     │
│ - Improve confidence scores             │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Stage 3: Entity Extraction              │
│         (Google LangExtract)            │
│ - Named entity recognition              │
- Value normalization                   │
│ - Cross-region entity linking           │
│ - Schema-aware output                   │
└─────────────────────────────────────────┘
    ↓
Consensus Output (regions + confidence)
    ↓
Write to Target Modality (PDF /MGX stream, PNG gLYP chunks, or Capsule tables)
```

### 3.2 Stage 1: Docling Layout Analysis

**IBM Docling** (version 1.0+) performs ML-based document understanding:

**Input:**
- PDF page (preferred: direct PDF operators)
- PNG image (fallback: raster input)

**Output:**
```json
{
  "page": 7,
  "regions": [
    {
      "id": "r1",
      "bbox": [72, 200, 450, 280],
      "kind": "paragraph",
      "order": 1,
      "parent": null,
      "confidence": 0.96
    },
    {
      "id": "r2",
      "bbox": [72, 300, 450, 500],
      "kind": "figure",
      "order": 2,
      "parent": null,
      "confidence": 0.94
    }
  ],
  "reading_order": ["r1", "r2", "r3"]
}
```

**Region Kinds** (extensible taxonomy):
- `paragraph` — Body text
- `heading` — Section title
- `caption` — Figure/table caption
- `figure` — Diagram, chart, illustration
- `table` — Structured data grid
- `equation` — Mathematical formula
- `code` — Source code block
- `list` — Bulleted or numbered list
- `footnote` — Reference note
- `header` — Page header
- `footer` — Page footer

**Configuration:**
```yaml
docling:
  version: "1.0.4"
  model: "docling-base"
  confidence_threshold: 0.7
  min_region_size: [20, 20]  # pixels
  overlap_tolerance: 0.1
```

### 3.3 Stage 2: Granite Docling LLM Refinement

**Granite Docling LLM** (3B quantized int8) provides semantic understanding:

**Input:**
- Page image or PDF render
- Docling layout output
- Optional: document context (title, abstract)

**Process:**
```python
# Simplified prompt structure
prompt = f"""
You are analyzing page {page_no} of a document.

Layout regions detected:
{json.dumps(docling_regions, indent=2)}

Tasks:
1. Validate region boundaries (are any merged or split incorrectly?)
2. Identify semantic relationships (which caption describes which figure?)
3. Detect hierarchical structure (is this a sub-heading under that heading?)
4. Assign confidence scores to each relationship

Return JSON with validation and relationships.
"""
```

**Output:**
```json
{
  "validated_regions": [
    {
      "id": "r1",
      "kind": "paragraph",
      "validated": true,
      "suggested_split": null,
      "confidence": 0.98
    }
  ],
  "relationships": [
    {
      "type": "caption_of",
      "source": "r3",
      "target": "r2",
      "confidence": 0.92
    },
    {
      "type": "part_of",
      "source": "r4",
      "target": "r1",
      "confidence": 0.88
    }
  ],
  "hierarchy": {
    "r1": {"level": 1, "parent": null},
    "r4": {"level": 2, "parent": "r1"}
  }
}
```

**Benefits:**
- Catches Docling segmentation errors
- Adds semantic depth beyond bbox detection
- Improves cross-region understanding
- Enables graph edge creation

### 3.4 Stage 3: LangExtract Entity Extraction

**Google LangExtract** (v1 API) extracts and normalizes entities:

**Input:**
- Text from each region (extracted via PDF native text or OCR)
- Optional: document-level context

**Output:**
```json
{
  "regions": {
    "r1": {
      "text": "IBM announced Q3 2025 results on September 30, showing 12% growth.",
      "entities": [
        {
          "type": "ORG",
          "text": "IBM",
          "start": 0,
          "end": 3,
          "confidence": 0.98,
          "normalized": "International Business Machines Corporation",
          "id": "Q37156"  // Wikidata QID if available
        },
        {
          "type": "DATE",
          "text": "September 30",
          "start": 37,
          "end": 49,
          "confidence": 0.95,
          "normalized": "2025-09-30"
        },
        {
          "type": "PERCENT",
          "text": "12%",
          "start": 59,
          "end": 62,
          "confidence": 0.99,
          "normalized": 0.12
        }
      ]
    }
  },
  "document_entities": {
    "ORG:IBM": {
      "appearances": ["r1", "r5", "r12"],
      "primary_reference": "r1"
    }
  }
}
```

**Entity Types** (subset of common types):
- `ORG` — Organizations
- `PERSON` — People
- `DATE` — Dates and times
- `MONEY` — Currency amounts
- `PERCENT` — Percentages
- `LOCATION` — Geographic locations
- `PRODUCT` — Product names
- `EVENT` — Named events
- `LAW` — Legal references
- `CITATION` — Academic citations

### 3.5 Consensus Assembly

**Final consensus** combines all three stages:

```json
{
  "protocol": "docling-granite-langextract-v1",
  "pipeline_version": "0.7.0",
  "stages": [
    {
      "name": "layout",
      "provider": "IBM Docling",
      "version": "1.0.4",
      "confidence": 0.96,
      "timestamp": "2025-10-01T12:34:56Z"
    },
    {
      "name": "semantic",
      "provider": "Granite Docling LLM",
      "version": "3B-int8",
      "confidence": 0.92,
      "timestamp": "2025-10-01T12:35:12Z"
    },
    {
      "name": "entities",
      "provider": "Google LangExtract",
      "version": "v1.2",
      "confidence": 0.88,
      "timestamp": "2025-10-01T12:35:45Z"
    }
  ],
  "regions": [
    {
      "id": "r1",
      "bbox": [72, 200, 450, 280],
      "kind": "paragraph",
      "order": 1,
      "text": "IBM announced Q3 2025 results...",
      "entities": [...],
      "relationships": [
        {"type": "part_of", "target": "doc:section2"}
      ],
      "final_confidence": 0.88  // min(stage confidences)
    }
  ],
  "document_graph": {
    "edges": [
      {"src": "r3", "pred": "caption_of", "dst": "r2", "weight": 0.92}
    ]
  }
}
```

**Confidence Calculation:**
```python
def compute_final_confidence(region):
    """
    Final confidence is the minimum across all stages
    that contributed to this region's understanding.
    """
    return min(
        region.layout_confidence,
        region.semantic_confidence,
        region.entity_confidence if region.entities else 1.0
    )
```

### 3.6 Pipeline Configuration & Reproducibility

**Deterministic Execution:**

To ensure reproducibility, the pipeline must:
1. Use fixed model versions (no automatic updates)
2. Set random seeds for any stochastic operations
3. Document all hyperparameters
4. Log pipeline execution metadata

**Configuration Template:**
```yaml
memglyph_pipeline:
  version: "0.7.0"
  
  docling:
    version: "1.0.4"
    model: "docling-base"
    seed: 42
    
  granite_docling:
    version: "3B-int8-v1.2"
    temperature: 0.0  # deterministic
    max_tokens: 2048
    
  langextract:
    version: "v1.2"
    entity_types: ["ORG", "PERSON", "DATE", "MONEY", "PERCENT"]
    confidence_threshold: 0.7
    
  verification:
    rerun_on_load: false  # trust stored consensus
    validate_hashes: true
    require_signatures: false
```

**Reproducibility Guarantee:**

Given:
- Same source PDF/PNG bytes
- Same pipeline configuration (versions, seeds, params)

Then:
- Layout regions will be identical
- Entity extraction will be identical
- Consensus confidence scores will be identical
- Output `/MGX` or PNG chunks will be byte-for-byte identical

**Exception:** Granite Docling LLM with temperature > 0 may vary; recommend temperature=0 for production.

---

## 4. LEANN: Lightweight Vector Strategy

### 4.1 The LEANN Philosophy

**LEANN** = **L**ightweight, **E**xplainable, **A**pproximate, **N**eighbor-aware, **N**avigable

**Core Insight:** Don't store vectors—store the recipe to recreate them.

**Traditional Approach (Heavy):**
```
Store: 1024-D fp16 vector per page = 2 KB
1000 pages = 2 MB of vectors
+ Region vectors: 16 regions × 1024-D = 32 KB per page = 32 MB
Total: 34 MB just for vectors
```

**LEANN Approach (Light):**
```
Store: SHA-256 seed + model ID + extraction method = 64 bytes
1000 pages = 64 KB of seeds
+ Region seeds: 16 × 64 bytes = 1 KB per page = 1 MB
Total: 1 MB (97% reduction!)
```

### 4.2 LEANN Vector Metadata

**Minimal storage per vector:**

```json
{
  "embed": {
    "model_id": "mini-embed-1024-v2",
    "dim": 1024,
    "quant": "int8",
    "recompute": true,
    "method": "deterministic-seed",
    
    "page_seed": {
      "content_sha": "sha256:a7b2c...",
      "text_extraction": "pdf-native",
      "normalization": "lowercase-strip"
    },
    
    "region_seeds": {
      "r1": {
        "content_sha": "sha256:f3e1d...",
        "text": "IBM announced Q3 2025 results..."
      },
      "r2": {
        "content_sha": "sha256:9c4b2...",
        "text": "[Figure: Q3 Revenue Chart]"
      }
    },
    
    "neighbors": [
      {"gid": "#p6", "score": 0.87},
      {"gid": "#p12", "score": 0.79}
    ]
  }
}
```

**Storage breakdown:**
- `model_id`: 32 bytes (string)
- `page_seed.content_sha`: 32 bytes (SHA-256)
- Per-region seed: 32 bytes × N regions
- Neighbor hints: 40 bytes × K neighbors (typically K=10-20)

**Total per page: 200-500 bytes** (vs. 2-34 KB for full vectors)

### 4.3 Vector Recomputation Algorithm

**On Query:**

```python
def recompute_vectors(gids, model_id="mini-embed-1024-v2"):
    """
    Recompute embeddings for given page/region GIDs.
    
    Args:
        gids: List of GIDs to recompute (e.g., ["#p7", "#p7:r1"])
        model_id: Embedding model to use
        
    Returns:
        Dict mapping GID → embedding vector
    """
    model = load_model(model_id)
    embeddings = {}
    
    for gid in gids:
        # Load LEANN metadata
        meta = load_leann_meta(gid)
        
        # Extract text using stored method
        if meta['scope'] == 'page':
            text = extract_page_text(gid, method=meta['text_extraction'])
        else:  # region
            text = extract_region_text(gid, method=meta['text_extraction'])
        
        # Normalize (must match original)
        text = normalize_text(text, method=meta['normalization'])
        
        # Compute embedding
        vec = model.encode(text)
        
        # Quantize if needed
        if meta['quant'] == 'int8':
            vec = quantize_int8(vec)
        
        # Verify determinism (optional)
        if meta.get('content_sha'):
            computed_sha = sha256(text.encode('utf-8'))
            assert computed_sha == meta['content_sha']
        
        embeddings[gid] = vec
    
    return embeddings
```

**Optimization: Batch Recomputation**

When a query needs vectors for 50 candidate pages:

```python
# Efficient batch processing
texts = [extract_page_text(gid) for gid in candidate_gids]
vectors = model.encode_batch(texts)  # GPU accelerated

# Cache in memory for this session
for gid, vec in zip(candidate_gids, vectors):
    cache[gid] = vec
```

### 4.4 Neighbor Hints Strategy

**Pre-computed neighbor hints** enable fast first-hop graph traversal:

```json
{
  "neighbors": [
    {"gid": "#p6", "score": 0.87, "reason": "semantic-similarity"},
    {"gid": "#p12", "score": 0.79, "reason": "semantic-similarity"},
    {"gid": "#p8", "score": 0.72, "reason": "citation-graph"},
    {"gid": "#p7:r2", "score": 0.68, "reason": "entity-overlap"}
  ]
}
```

**Neighbor Computation (at emit time):**

```python
def compute_neighbors(gid, k=10):
    """
    Find K nearest neighbors using multiple signals.
    """
    # Full corpus vectors available during emit
    vec = get_full_vector(gid)
    
    # Semantic similarity
    semantic_neighbors = ann_search(vec, k=k*2)
    
    # Graph connectivity
    graph_neighbors = get_graph_neighbors(gid, hops=1)
    
    # Entity co-occurrence
    entity_neighbors = get_entity_overlap(gid, threshold=0.5)
    
    # Combine and rank
    all_neighbors = combine_and_rank([
        (semantic_neighbors, weight=0.6),
        (graph_neighbors, weight=0.3),
        (entity_neighbors, weight=0.1)
    ])
    
    return all_neighbors[:k]
```

**Query-time usage:**

```sql
-- Fast neighbor expansion without recomputing vectors
WITH seeds AS (
  SELECT '#p7' AS gid
),
neighbors AS (
  SELECT n.neighbor AS gid, n.score
  FROM seeds s
  JOIN leann_neighbors n ON n.gid = s.gid
  WHERE n.score > 0.6
)
SELECT * FROM neighbors;
```

### 4.5 Model Upgrade Strategy

**Side-by-side model support:**

```sql
-- Multiple embeddings for same content
CREATE TABLE leann_meta(
  gid TEXT,
  model_id TEXT,
  scope TEXT,
  dim INT,
  -- ... other fields
  PRIMARY KEY(gid, model_id)  -- Allow multiple models
);```

**Query with preference:**

```sql
-- Prefer newest model, fallback to older
WITH preferred AS (
  SELECT * FROM leann_meta 
  WHERE gid = '#p7' AND model_id = 'mini-embed-1024-v3'
),
fallback AS (
  SELECT * FROM leann_meta
  WHERE gid = '#p7' AND model_id = 'mini-embed-1024-v2'
)
SELECT * FROM preferred
UNION ALL
SELECT * FROM fallback WHERE NOT EXISTS (SELECT 1 FROM preferred)
LIMIT 1;
```

**Gradual migration:**

```bash
# Add new model embeddings without removing old
mgx reindex --model mini-embed-1024-v3 --keep-old corpus.mgqd.pdf

# After validation, remove old
mgx prune --model mini-embed-1024-v2 corpus.mgqd.pdf
```

### 4.6 LEANN Performance Characteristics

**Storage Savings:**

| Corpus Size | Full Vectors | LEANN Seeds | Savings |
|-------------|--------------|-------------|---------|
| 10 pages | 340 KB | 5 KB | 98.5% |
| 100 pages | 3.4 MB | 50 KB | 98.5% |
| 1000 pages | 34 MB | 500 KB | 98.5% |
| 10000 pages | 340 MB | 5 MB | 98.5% |

**Recompute Latency (on modern CPU/GPU):**

| Operation | CPU (8-core) | GPU (RTX 3060) |
|-----------|--------------|----------------|
| 1 page | 15 ms | 3 ms |
| 10 pages | 80 ms | 8 ms |
| 50 pages | 350 ms | 25 ms |
| 100 pages | 700 ms | 45 ms |

**Typical query scenario:**
1. FTS5 filter → 200 candidates (instant)
2. Recompute 50 top candidates → 25-350 ms
3. ANN search → 10-50 ms
4. Total: **< 500 ms** (acceptable for interactive use)

**Memory Usage:**
- Full vectors: 2-4 KB per page × corpus size (resident)
- LEANN: 64 bytes per page (metadata) + recomputed vectors (transient)
- **Memory savings: 97%** for large corpora

---

## 5. PDF Modality (MGQD)

### 5.1 Design Principles

**MGQD** = **M**emory **G**lyph **Q**ueryable **D**ocument

**Golden Rules:**
1. **Never duplicate rasters** — PDF already has visual content
2. **Anchor without embedding** — Store hashes, not pixels
3. **Leverage PDF structure** — Use native text, operators, tags
4. **Standards compliance** — PDF 1.7+ compatible
5. **Tool agnostic** — Opens in any PDF viewer

### 5.2 File Structure

```
document.mgqd.pdf (PDF 1.7)
│
├─ Catalog (Root Object)
│  ├─ /Metadata → XMP (global identifiers)
│  ├─ /Names → /EmbeddedFiles (file attachments namespace)
│  └─ /AF [Filespec("mgx/capsule.mgx.sqlite")] ← Document capsule
│
├─ /Pages → Array of /Page objects
│  │
│  └─ /Page [N]
│     ├─ /Contents → PDF drawing operators (canonical visual)
│     ├─ /Resources → Fonts, XObjects, images
│     ├─ /Metadata → XMP (page identifiers: gid, contentSHA)
│     ├─ /MGX → Compressed CBOR stream (layout, consensus, anchors)
│     └─ /AF [Filespec("mgx/page/pN.car.sqlite")] ← Page cartridge
│
└─ Embedded Files (via /EF streams)
   ├─ mgx/capsule.mgx.sqlite (document-level SQLAR + accelerators)
   └─ mgx/page/p001.car.sqlite ... pNNN.car.sqlite (per-page indexes)
```

### 5.3 Identifiers & Addressing

**Deterministic IDs:**

```python
# Document ID (stable, never changes)
doc_id = sha256(original_pdf_bytes)
# → "sha256:a7b2c3d4..."

# Page GID (1-indexed)
page_gid = f"{doc_id}#p{page_number}"
# → "sha256:a7b2c3d4...#p7"

# Region GID
region_gid = f"{page_gid}:{region_id}"
# → "sha256:a7b2c3d4...#p7:r3"
```

**Critical:** `doc_id` is computed from the **original PDF** before MGQD metadata is added. This ensures stability across updates.

### 5.4 Anchors: Verification Without Duplication

MGQD uses **dual anchoring** for region verification:

#### 5.4.1 Operator Anchor (op_sha) — Primary

**Purpose:** Verify PDF source code hasn't changed

**Method:**
1. Parse page `/Contents` stream into operator sequence
2. Track graphics state (CTM, clipping, current point)
3. For each drawing operator, compute its bounding box in device space
4. Map region bbox → covering operator spans
5. Hash the raw bytes of those spans

**Example:**

```
Page /Contents:
q                              # Save state
1 0 0 1 72 200 cm             # Transform
BT                             # Begin text
/F1 12 Tf                      # Set font
0 0 Td                         # Position
(IBM announced Q3...) Tj       # Draw text ← REGION r1 covers this
ET                             # End text
Q                              # Restore state

Region r1 bbox: [72, 200, 450, 280]

Covering spans:
- Obj 45, bytes 850-920 → "BT /F1 12 Tf 0 0 Td (IBM...) Tj ET"

op_sha = SHA256(bytes[850:920])
```

**Implementation sketch:**

```python
def compute_op_sha(page_obj, region_bbox):
    """
    Compute operator anchor for region.
    
    Returns:
        List of (obj_num, byte_start, byte_end, op_sha)
    """
    # Parse all content streams
    content_streams = get_content_streams(page_obj)
    
    # Tokenize into operators with byte offsets
    operators = []
    for stream_obj, stream_bytes in content_streams:
        ops = parse_pdf_operators(stream_bytes)
        operators.extend([(stream_obj, op, start, end) 
                         for op, start, end in ops])
    
    # Interpret graphics state to get bbox per operator
    state = GraphicsState()
    op_bboxes = []
    
    for obj_num, op, start, end in operators:
        op_bbox = interpret_operator(op, state)
        if op_bbox and bbox_intersects(op_bbox, region_bbox):
            op_bboxes.append((obj_num, start, end))
    
    # Hash covering spans
    spans = []
    for obj_num, start, end in op_bboxes:
        content = get_stream_bytes(obj_num)[start:end]
        op_sha = sha256(content)
        spans.append({
            "obj": obj_num,
            "start": start,
            "end": end,
            "op_sha": op_sha.hex()
        })
    
    return spans
```

**Advantages:**
- ✅ Deterministic (byte-exact)
- ✅ Detects source modifications
- ✅ No rendering required
- ✅ Works with encrypted PDFs

**Limitations:**
- ⚠️ Complex to implement (requires full PDF interpreter)
- ⚠️ Doesn't catch visual-only changes (font substitution, color)

#### 5.4.2 Content Anchor (content_sha) — Secondary

**Purpose:** Verify rendered appearance hasn't changed

**Method:**
1. Render page to raster using fixed parameters
2. Crop to region bbox
3. Hash the cropped pixels

**Rendering Parameters (MUST be deterministic):**

```yaml
renderer: "mupdf-1.24.1"  # Exact version
dpi: 180
color_space: "gray"
bit_depth: 8
gamma: 2.2
antialiasing: true
overprint: false
crop_box: "prefer_cropbox_else_mediabox"
```

**Algorithm:**

```python
def compute_content_sha(pdf_path, page_num, region_bbox):
    """
    Compute content anchor for region.
    
    CRITICAL: Must use exact renderer configuration.
    """
    # Render page
    renderer = MuPDFRenderer(
        version="1.24.1",
        dpi=180,
        colorspace="gray",
        antialias=True
    )
    
    page_img = renderer.render_page(pdf_path, page_num)
    
    # Crop to region
    x, y, w, h = region_bbox
    crop = page_img[y:y+h, x:x+w]
    
    # Hash raw pixels
    content_sha = sha256(crop.tobytes())
    
    return content_sha.hex()
```

**Advantages:**
- ✅ Catches visual changes
- ✅ Simpler than operator parsing
- ✅ Works with any PDF

**Limitations:**
- ⚠️ Renderer-dependent (MuPDF ≠ Poppler ≠ CoreGraphics)
- ⚠️ Slower (requires rendering)
- ⚠️ Approximate (antialiasing, font hinting vary)

**Recommendation:** Use `op_sha` as primary, `content_sha` as backup.

#### 5.4.3 Optional: XObject Anchor

For regions containing images:

```json
{
  "anchors": {
    "regions": {
      "r2": {
        "op_sha": [...],
        "content_sha": "sha256:...",
        "xobject_sha": "sha256:...",  // Hash of /XObject stream
        "xobject_ref": "11 0 R"       // PDF object reference
      }
    }
  }
}
```

#### 5.4.4 Optional: MCID Anchor (Tagged PDFs)

For accessibility-tagged PDFs:

```json
{
  "anchors": {
    "regions": {
      "r1": {
        "op_sha": [...],
        "mcid": [12, 13, 14]  // Marked Content IDs
      }
    }
  }
}
```

### 5.5 Per-Page /MGX Stream

**Format:** Compressed CBOR or JSON (prefer CBOR for size)

**Schema:**

```json
{
  "meta": {
    "schema": "mgqd/0.7",
    "doc_id": "sha256:a7b2c3d4...",
    "page": 7,
    "gid": "sha256:a7b2c3d4...#p7",
    "page_sha": "sha256:f3e1d..."  // Hash of /Contents + /Resources
  },
  
  "layout": [
    {
      "id": "r1",
      "bbox": [72, 200, 450, 280],
      "kind": "paragraph",
      "order": 1,
      "parent": null,
      "confidence": 0.96
    },
    {
      "id": "r2",
      "bbox": [72, 300, 450, 500],
      "kind": "figure",
      "order": 2,
      "parent": null,
      "confidence": 0.94
    }
  ],
  
  "consensus": {
    "protocol": "docling-granite-langextract-v1",
    "pipeline_version": "0.7.0",
    "stages": [
      {
        "name": "layout",
        "provider": "IBM Docling",
        "version": "1.0.4",
        "confidence": 0.96,
        "timestamp": "2025-10-01T12:34:56Z"
      },
      {
        "name": "semantic",
        "provider": "Granite Docling LLM",
        "version": "3B-int8",
        "confidence": 0.92,
        "timestamp": "2025-10-01T12:35:12Z"
      },
      {
        "name": "entities",
        "provider": "Google LangExtract",
        "version": "v1.2",
        "confidence": 0.88,
        "timestamp": "2025-10-01T12:35:45Z"
      }
    ],
    "regions": [
      {
        "id": "r1",
        "text": "IBM announced Q3 2025 results on September 30...",
        "text_extraction": "pdf-native",
        "entities": [
          {
            "type": "ORG",
            "text": "IBM",
            "start": 0,
            "end": 3,
            "confidence": 0.98,
            "normalized": "International Business Machines Corporation"
          },
          {
            "type": "DATE",
            "text": "September 30",
            "start": 37,
            "end": 49,
            "confidence": 0.95,
            "normalized": "2025-09-30"
          }
        ],
        "final_confidence": 0.88
      }
    ]
  },
  
  "anchors": {
    "page_sha": "sha256:f3e1d...",  // For staleness detection
    "regions": {
      "r1": {
        "op_spans": [
          {
            "obj": 45,
            "start": 850,
            "end": 920,
            "op_sha": "sha256:c7d2a..."
          }
        ],
        "content_sha": "sha256:b8f3e...",
        "text_sha": "sha256:a1c4d..."  // Hash of extracted text
      },
      "r2": {
        "op_spans": [...],
        "content_sha": "sha256:d3f7a...",
        "xobject_sha": "sha256:e4a2c...",
        "xobject_ref": "11 0 R"
      }
    }
  },
  
  "embed": {
    "model_id": "mini-embed-1024-v2",
    "dim": 1024,
    "quant": "int8",
    "recompute": true,
    "page_seed": {
      "content_sha": "sha256:f3e1d...",
      "text_extraction": "pdf-native",
      "normalization": "lowercase-strip"
    },
    "region_seeds": {
      "r1": {"content_sha": "sha256:a1c4d..."},
      "r2": {"content_sha": "sha256:d3f7a..."}
    },
    "neighbors": [
      {"gid": "#p6", "score": 0.87},
      {"gid": "#p12", "score": 0.79}
    ]
  },
  
  "edges": [
    {
      "src": "#p7",
      "pred": "cites",
      "dst": "#p3:r2",
      "weight": 0.9,
      "evidence": "Found citation [3] in text"
    },
    {
      "src": "#p7:r3",
      "pred": "caption_of",
      "dst": "#p7:r2",
      "weight": 0.92,
      "evidence": "Granite relationship detection"
    }
  ]
}
```

**Size estimate:**
- Minimal (10 regions, sparse entities): 3-5 KB
- Typical (20 regions, moderate entities): 8-12 KB
- Rich (40 regions, heavy entities, complex graph): 15-25 KB

**Compression:** Use zlib/deflate (PDF-native):
```python
import zlib
mgx_bytes = json.dumps(mgx_data).encode('utf-8')
compressed = zlib.compress(mgx_bytes, level=9)
# Typical compression ratio: 3:1 to 5:1
```

### 5.6 Per-Page SQLite Cartridge (Optional)

**Purpose:** Fast page-local queries without opening document capsule

**Size target:** 3-10 KB per page

**Schema:**

```sql
-- Minimal page-local index
CREATE TABLE meta(
  key TEXT PRIMARY KEY,
  value TEXT
);
INSERT INTO meta VALUES 
  ('gid', 'sha256:...#p7'),
  ('doc_id', 'sha256:...'),
  ('page_no', '7');

-- FTS5 for page content
CREATE TABLE page_index(
  gid TEXT PRIMARY KEY,
  title TEXT,
  tags TEXT,
  entities TEXT,
  full_text TEXT
);

CREATE VIRTUAL TABLE page_fts USING fts5(
  title, tags, entities, full_text,
  content='page_index'
);

-- LEANN metadata (seeds only)
CREATE TABLE leann_meta(
  gid TEXT PRIMARY KEY,
  scope TEXT CHECK(scope IN('page','region')),
  region_id TEXT,
  model_id TEXT,
  dim INT,
  quant TEXT,
  content_sha TEXT,
  recompute INT DEFAULT 1
);

-- Neighbor hints
CREATE TABLE leann_neighbors(
  gid TEXT,
  neighbor TEXT,
  score REAL,
  PRIMARY KEY(gid, neighbor)
);

-- Page-local edges only
CREATE TABLE edges(
  src TEXT,
  pred TEXT,
  dst TEXT,
  weight REAL,
  PRIMARY KEY(src, pred, dst)
);

-- Receipts (if available)
CREATE TABLE receipts(
  gid TEXT PRIMARY KEY,
  content_sha TEXT,
  signer TEXT,
  sig TEXT,
  epoch TEXT,
  merkle_root TEXT,
  merkle_path TEXT
);
```

**When to include cartridges:**

```python
def should_include_cartridge(page):
    """
    Heuristic for cartridge inclusion.
    """
    # Always include for large docs
    if doc.page_count > 100:
        return True
    
    # Include for complex pages
    if len(page.regions) > 15:
        return True
    
    # Include for entity-rich pages
    if page.entity_count > 20:
        return True
    
    # Skip for simple pages in small docs
    return False
```

### 5.7 Document-Level SQLite Capsule

**File:** `mgx/capsule.mgx.sqlite` (embedded via `/AF` on Catalog)

**Purpose:** 
- Corpus-wide search (FTS5, vectors, graph)
- Ledger and checkpoint storage
- Cross-page queries
- Provenance tracking

**Schema:** (See Section 8.3 for full DDL)

**Key tables:**
- `sqlar` — Byte-for-byte archive of canonical files
- `ledger_blocks` — Event log (ADD, EDGE, REVOKE, CHECKPOINT)
- `checkpoints` — Merkle roots and anchors
- `node_index`, `edges` — Graph structure
- `meta_index`, `meta_fts` — Document-level FTS5
- `leann_meta`, `leann_neighbors` — Vector metadata
- `entities`, `entity_links` — Extracted entity graph
- `glyph_receipts`, `block_receipts` — Verification data

**Size estimate:**
- 100 pages: 500 KB - 2 MB
- 1000 pages: 3 MB - 10 MB
- 10000 pages: 30 MB - 100 MB

(Highly dependent on graph density, entity count, ledger size)

### 5.8 XMP Metadata

**Catalog-level XMP:**

```xml
<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:mgx="http://memglyph.org/ns/mgx/0.7/">
      <mgx:schema>mgqd/0.7</mgx:schema>
      <mgx:version>0.7.0</mgx:version>
      <mgx:checkpoint_root>sha256:d4c7f...</mgx:checkpoint_root>
      <mgx:epoch>2025-10-01T00:00:00Z</mgx:epoch>
      <mgx:signer>did:key:z6Mk...</mgx:signer>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>
```

**Page-level XMP:**

```xml
<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:mgx="http://memglyph.org/ns/mgx/0.7/">
      <mgx:gid>sha256:a7b2c3d4...#p7</mgx:gid>
      <mgx:afName>mgx/page/p007.car.sqlite</mgx:afName>
      <mgx:contentSHA>sha256:f3e1d...</mgx:contentSHA>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>
```

**Minimal overhead:** ~500-1000 bytes per XMP stream

### 5.9 Size Budgets & Overhead

**Per-page overhead breakdown:**

| Component | Size | Notes |
|-----------|------|-------|
| /MGX stream (compressed) | 2-8 KB | Layout + consensus + anchors + LEANN |
| Page cartridge (optional) | 3-10 KB | FTS5 + seeds + neighbors |
| XMP metadata | 0.5-1 KB | Identifiers only |
| **Total per page** | **5-20 KB** | **~10 KB typical** |

**Document-level overhead:**

| Component | Size | Notes |
|-----------|------|-------|
| Document capsule | 0.5-10 MB | Scales with corpus size |
| Catalog XMP | 1 KB | Global metadata |
| /AF objects | 0.5 KB per page | Filespec overhead |
| **Total document** | **0.5-10 MB** | **3-5 MB typical for 1000 pages** |

**Overall impact:**

| Original PDF | MGQD PDF | Overhead | % Increase |
|--------------|----------|----------|------------|
| 1 MB (10 pages) | 1.15 MB | 150 KB | 15% |
| 10 MB (100 pages) | 11 MB | 1 MB | 10% |
| 100 MB (1000 pages) | 105-110 MB | 5-10 MB | 5-10% |

**Comparison to full vector storage:**

| Approach | 1000 pages | Overhead |
|----------|-----------|----------|
| Full vectors (no LEANN) | 130-140 MB | 30-40% |
| LEANN (recompute) | 105-110 MB | 5-10% |
| **LEANN savings** | **25-30 MB** | **20-30% reduction** |

---

## 6. PNG Modality (MemGlyph Classic)

### 6.1 Use Cases

**When PNG modality is appropriate:**
- Single-page artifacts (posters, infographics, slides)
- Source is already raster (screenshots, scanned pages)
- Maximum portability (no PDF dependencies)
- Social media sharing (Twitter, Discord, etc.)
- Embedded in HTML/Markdown without PDF viewer

**When PDF is better:**
- Multi-page documents
- Text-heavy content (PDFs are more efficient)
- Large corpora (PNG overhead is higher per-page)

### 6.2 PNG Chunk Structure

MemGlyph PNGs embed metadata in standard PNG chunks:

```
PNG File
├─ IHDR (Image Header)
├─ ... standard chunks ...
├─ iTXt/zTXt: gLYP.meta
├─ iTXt/zTXt: gLYP.prov
├─ iTXt/zTXt: gLYP.layout
├─ iTXt/zTXt: gLYP.consensus
├─ iTXt/zTXt: gLYP.anchors
├─ iTXt/zTXt: gLYP.embed (LEANN)
├─ iTXt/zTXt: gLYP.edges.local (optional)
├─ iTXt/zTXt: gLYP.checkpoint.proof (optional)
├─ ... optional: gLYP.qr (visual QR code)
└─ IEND
```

**Chunk encoding:**
- Use `zTXt` for compressed JSON/CBOR (prefer CBOR)
- Use `iTXt` for international text (UTF-8)
- Compression: zlib level 9

### 6.3 PNG Chunk Schemas

**gLYP.meta:**
```json
{
  "schema": "memglyph/0.7",
  "doc_id": "sha256:...",
  "page": 7,
  "gid": "sha256:...#p7",
  "quality": "high"
}
```

**gLYP.prov:**
```json
{
  "emitter": "mgx-cli-0.7.0",
  "emitter_node": "node-12345",
  "signer": "did:key:z6Mk...",
  "sig": "ed25519:...",
  "timestamp": "2025-10-01T12:34:56Z"
}
```

**gLYP.layout:**
```json
{
  "regions": [
    {
      "id": "r1",
      "bbox": [100, 200, 400, 300],
      "kind": "paragraph",
      "order": 1,
      "parent": null
    }
  ]
}
```

**gLYP.consensus:**
```json
{
  "protocol": "docling-granite-langextract-v1",
  "stages": [...],
  "regions": [
    {
      "id": "r1",
      "text": "...",
      "entities": [...],
      "confidence": 0.88
    }
  ]
}
```

**gLYP.anchors:**
```json
{
  "page_sha": "sha256:...",  // SHA of PNG pixel data
  "regions": {
    "r1": {
      "content_sha": "sha256:...",  // SHA of region crop
      "text_sha": "sha256:..."
    }
  }
}
```

**gLYP.embed (LEANN):**```json
{
  "model_id": "mini-embed-1024-v2",
  "dim": 1024,
  "quant": "int8",
  "recompute": true,
  "page_seed": {
    "content_sha": "sha256:...",
    "text_extraction": "ocr-tesseract"
  },
  "region_seeds": {...},
  "neighbors": [
    {"gid": "#p6", "score": 0.87}
  ]
}
```

**gLYP.edges.local:**
```json
{
  "edges": [
    {
      "src": "#p7",
      "pred": "cites",
      "dst": "#p3",
      "weight": 0.9
    }
  ]
}
```

**gLYP.checkpoint.proof:**
```json
{
  "epoch": "2025-10-01T00:00:00Z",
  "merkle_root": "sha256:...",
  "merkle_path": [
    {"hash": "sha256:...", "side": "left"},
    {"hash": "sha256:...", "side": "right"}
  ],
  "signer": "did:key:z6Mk...",
  "sig": "ed25519:...",
  "anchors": ["eth:0x..."]
}
```

### 6.4 PNG Corpus Structure

**Folder-based corpus:**

```
/MyCorpus/
├─ glyphs/
│  ├─ page_0001.mgx.png
│  ├─ page_0002.mgx.png
│  └─ page_NNNN.mgx.png
└─ ledger/
   ├─ ledger.log
   ├─ graph/
   │  ├─ segments/
   │  │  ├─ seg_0001.cbor
   │  │  └─ seg_NNNN.cbor
   │  └─ checkpoints/
   │     ├─ 2025-10-01.ckpt.json
   │     └─ YYYY-MM-DD.ckpt.json
   └─ keys/
      └─ publisher.did.json
```

**Optional: Capsule mode (single file):**

```
corpus.mgx.sqlite
  ├─ sqlar table (contains all glyphs + ledger files)
  └─ accelerator tables (FTS5, vectors, graph, etc.)
```

### 6.5 Size Considerations

**Per-page PNG with LEANN:**

| Component | Size |
|-----------|------|
| Base PNG (compressed) | 40-150 KB |
| gLYP.meta | 200 bytes |
| gLYP.prov | 300 bytes |
| gLYP.layout | 1-3 KB |
| gLYP.consensus | 2-8 KB |
| gLYP.anchors | 1-2 KB |
| gLYP.embed (LEANN) | 500 bytes |
| gLYP.edges.local | 0.5-2 KB |
| gLYP.checkpoint.proof | 1-2 KB |
| **Total** | **50-170 KB** |

**Corpus overhead:**

| Pages | PNG corpus | PDF equivalent | Overhead |
|-------|-----------|----------------|----------|
| 10 | 0.5-1.7 MB | 1 MB + 150 KB | Comparable |
| 100 | 5-17 MB | 10 MB + 1 MB | Higher |
| 1000 | 50-170 MB | 100 MB + 10 MB | Much higher |

**Recommendation:** Use PNG for <50 pages, PDF for larger corpora.

---

## 7. Glyphcapsule Modality (SQLite/SQLAR)

The Glyphcapsule modality provides a single-file container for an entire MemGlyph corpus. It uses SQLite's SQLAR (SQLite Archive) format to store the exact byte-for-byte representation of the source folder, while adding rebuildable accelerator tables for fast queries.

### 7.1 Key Principles
- **Canonical Archive:** The `sqlar` table contains the exact folder structure and file data.
- **Rebuildable Accelerators:** All other tables (FTS5, vectors, graph indexes) can be dropped and rebuilt from the `sqlar` data at any time.
- **Atomic Operations:** Single-file enables atomic writes and easy distribution.
- **Bidirectional:** Perfect round-trip between a folder-based corpus and a capsule.

### 7.2 Architecture Overview
A Glyphcapsule (`.mgx.sqlite`) contains:
- **SQLAR Table:** Stores `glyphs/page_NNNN.mgx.png`, `ledger/ledger.log`, etc.
- **Accelerator Tables (Rebuildable):**
    - `meta_index` (page metadata)
    - `meta_fts` (full-text search)
    - `leann_meta` (LEANN seeds)
    - `leann_vec` (cached vectors)
    - `entities` (named entities)
    - `node_index` (graph nodes)
    - `edges` (graph relationships)
    - `ledger_blocks` (row-ified ledger)
    - `checkpoints` (Merkle snapshots)
    - `keys` (identity & verification)

---

## 8. Data Models & Schemas

### 8.1 Common Identifier System

**Applies to all modalities:**

```python
# Document ID (stable)
doc_id = sha256(original_bytes)

# Page GID (1-indexed)
page_gid = f"{doc_id}#p{page_number}"

# Region GID
region_gid = f"{page_gid}:{region_id}"

# Example
doc_id = "sha256:a7b2c3d4e5f6..."
page_gid = "sha256:a7b2c3d4e5f6...#p7"
region_gid = "sha256:a7b2c3d4e5f6...#p7:r3"
```

### 8.2 Ledger Format

**Block structure (JSON or CBOR lines):**

```json
{
  "block_id": "b123",
  "ts": "2025-10-01T12:34:56Z",
  "prev": "sha256:...",
  "entries": [
    {
      "op": "ADD",
      "gid": "sha256:...#p17",
      "content_sha": "sha256:...",
      "metadata": {...}
    },
    {
      "op": "EDGE",
      "src": "sha256:...#p17",
      "pred": "cites",
      "dst": "sha256:...#p3",
      "weight": 0.9
    },
    {
      "op": "CHECKPOINT",
      "epoch": "2025-10-01T00:00:00Z",
      "merkle_root": "sha256:...",
      "pages_count": 100
    }
  ],
  "signer": "did:key:z6Mk...",
  "sig": "ed25519:...",
  "anchors": ["eth:0x12345..."]
}
```

**Operation types:**

| Op | Purpose |
|----|---------|
| `ADD` | Register new page/glyph |
| `EDGE` | Add graph relationship |
| `REVOKE` | Mark page as invalid |
| `CHECKPOINT` | Create Merkle snapshot |
| `ROTATE_KEY` | Update signing key |

### 8.3 Document Capsule Schema (Full DDL)

```sql
-- ============================================
-- CANONICAL ARCHIVE (SQLAR)
-- ============================================

CREATE TABLE IF NOT EXISTS sqlar(
  name TEXT PRIMARY KEY,
  mode INT,
  mtime INT,
  sz INT,
  data BLOB
);

-- ============================================
-- LEDGER & CHECKPOINTS
-- ============================================

CREATE TABLE IF NOT EXISTS ledger_blocks(
  block_id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  prev TEXT NOT NULL,
  entries_json TEXT NOT NULL,
  signer TEXT NOT NULL,
  sig TEXT NOT NULL,
  anchors_json TEXT
);

CREATE INDEX ledger_ts_idx ON ledger_blocks(ts);

CREATE TABLE IF NOT EXISTS checkpoints(
  epoch TEXT PRIMARY KEY,
  merkle_root TEXT NOT NULL,
  pages_count INT NOT NULL,
  anchors_json TEXT,
  created_ts TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS keys(
  key_id TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  did_document TEXT NOT NULL,
  valid_from TEXT NOT NULL,
  valid_until TEXT,
  revoked INT DEFAULT 0
);

-- ============================================
-- GRAPH STRUCTURE
-- ============================================

CREATE TABLE IF NOT EXISTS node_index(
  node_id INTEGER PRIMARY KEY AUTOINCREMENT,
  gid TEXT UNIQUE NOT NULL,
  doc_id TEXT NOT NULL,
  page_no INT
);

CREATE INDEX node_gid_idx ON node_index(gid);
CREATE INDEX node_doc_page_idx ON node_index(doc_id, page_no);

CREATE TABLE IF NOT EXISTS edges(
  fromNode INT NOT NULL,
  toNode INT NOT NULL,
  pred TEXT NOT NULL,
  weight REAL DEFAULT 1.0,
  ts TEXT,
  evidence TEXT,
  PRIMARY KEY(fromNode, toNode, pred)
);

CREATE INDEX edges_from_idx ON edges(fromNode);
CREATE INDEX edges_to_idx ON edges(toNode);
CREATE INDEX edges_pred_idx ON edges(pred);

-- ============================================
-- METADATA & FTS5
-- ============================================

CREATE TABLE IF NOT EXISTS meta_index(
  gid TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL,
  page_no INT NOT NULL,
  title TEXT,
  tags TEXT,
  entities TEXT,  -- JSON array
  full_text TEXT,
  updated_ts TEXT NOT NULL
);

CREATE INDEX meta_doc_page_idx ON meta_index(doc_id, page_no);

CREATE VIRTUAL TABLE IF NOT EXISTS meta_fts USING fts5(
  title, tags, entities, full_text,
  content='meta_index',
  tokenize='unicode61 remove_diacritics 1'
);

-- Triggers to keep FTS5 in sync
CREATE TRIGGER meta_fts_insert AFTER INSERT ON meta_index BEGIN
  INSERT INTO meta_fts(rowid, title, tags, entities, full_text)
  VALUES (new.rowid, new.title, new.tags, new.entities, new.full_text);
END;

CREATE TRIGGER meta_fts_delete AFTER DELETE ON meta_index BEGIN
  DELETE FROM meta_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER meta_fts_update AFTER UPDATE ON meta_index BEGIN
  UPDATE meta_fts SET 
    title = new.title,
    tags = new.tags,
    entities = new.entities,
    full_text = new.full_text
  WHERE rowid = new.rowid;
END;

-- ============================================
-- ENTITIES
-- ============================================

CREATE TABLE IF NOT EXISTS entities(
  gid TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_text TEXT NOT NULL,
  normalized_value TEXT,
  confidence REAL NOT NULL,
  start_offset INT,
  end_offset INT,
  PRIMARY KEY(gid, entity_type, entity_text)
);

CREATE INDEX entities_type_idx ON entities(entity_type);
CREATE INDEX entities_norm_idx ON entities(entity_type, normalized_value);

CREATE TABLE IF NOT EXISTS entity_links(
  entity_id TEXT PRIMARY KEY,  -- e.g., "ORG:IBM"
  entity_type TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  wikidata_qid TEXT,
  occurrences_json TEXT  -- List of GIDs
);

-- ============================================
-- LEANN METADATA
-- ============================================

CREATE TABLE IF NOT EXISTS leann_meta(
  gid TEXT NOT NULL,
  model_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('page','region')),
  region_id TEXT,
  doc_id TEXT NOT NULL,
  page_no INT,
  dim INT NOT NULL,
  quant TEXT NOT NULL,
  content_sha TEXT NOT NULL,
  text_extraction TEXT,
  normalization TEXT,
  updated_utc TEXT NOT NULL,
  recompute INT DEFAULT 1,
  PRIMARY KEY(gid, model_id)
);

CREATE INDEX leann_model_idx ON leann_meta(model_id);
CREATE INDEX leann_doc_page_idx ON leann_meta(doc_id, page_no);

-- Optional: cache for frequently accessed vectors
CREATE TABLE IF NOT EXISTS leann_vector_cache(
  gid TEXT NOT NULL,
  model_id TEXT NOT NULL,
  vector BLOB NOT NULL,  -- Quantized vector bytes
  cached_ts TEXT NOT NULL,
  hits INT DEFAULT 0,
  PRIMARY KEY(gid, model_id)
);

-- Neighbor hints
CREATE TABLE IF NOT EXISTS leann_neighbors(
  gid TEXT NOT NULL,
  neighbor TEXT NOT NULL,
  score REAL NOT NULL,
  reason TEXT,  -- 'semantic', 'graph', 'entity'
  PRIMARY KEY(gid, neighbor)
);

CREATE INDEX leann_neighbors_score_idx ON leann_neighbors(gid, score DESC);

-- ============================================
-- RECEIPTS
-- ============================================

CREATE TABLE IF NOT EXISTS glyph_receipts(
  gid TEXT PRIMARY KEY,
  content_sha TEXT NOT NULL,
  signer TEXT NOT NULL,
  sig TEXT NOT NULL,
  ts TEXT NOT NULL,
  epoch TEXT NOT NULL,
  merkle_root TEXT NOT NULL,
  merkle_path TEXT,  -- JSON array
  anchors_json TEXT
);

CREATE INDEX glyph_receipts_epoch_idx ON glyph_receipts(epoch);

CREATE TABLE IF NOT EXISTS block_receipts(
  block_id TEXT PRIMARY KEY,
  prev TEXT NOT NULL,
  signer TEXT NOT NULL,
  sig TEXT NOT NULL,
  ts TEXT NOT NULL,
  entries_json TEXT NOT NULL,
  anchors_json TEXT
);

-- ============================================
-- VIEWS
-- ============================================

CREATE VIEW IF NOT EXISTS pages AS
SELECT DISTINCT 
  doc_id,
  page_no,
  gid
FROM node_index
WHERE page_no IS NOT NULL
ORDER BY doc_id, page_no;

CREATE VIEW IF NOT EXISTS citations_with_receipts AS
SELECT 
  m.gid,
  m.doc_id,
  m.page_no,
  m.title,
  gr.epoch,
  gr.merkle_root,
  gr.signer,
  gr.sig,
  gr.anchors_json
FROM meta_index m
LEFT JOIN glyph_receipts gr USING(gid);

CREATE VIEW IF NOT EXISTS entity_summary AS
SELECT 
  entity_type,
  COUNT(DISTINCT entity_text) AS unique_entities,
  COUNT(DISTINCT gid) AS pages_with_entity
FROM entities
GROUP BY entity_type;

-- ============================================
-- PRAGMAS (set at connection open)
-- ============================================

PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
PRAGMA mmap_size=268435456;  -- 256 MB
PRAGMA page_size=4096;
PRAGMA cache_size=-64000;  -- 64 MB cache
```

### 8.4 Vector Extension Integration

**Using sqlite-vec (recommended):**

```sql
-- Load extension (if dynamic loading enabled)
.load ./vec0

-- Create vector table
CREATE VIRTUAL TABLE leann_vec USING vec0(
  embedding FLOAT[1024]
);

-- Insert vectors (during recompute)
INSERT INTO leann_vec(rowid, embedding)
SELECT 
  m.rowid,
  compute_embedding(m.gid, 'mini-embed-1024-v2')
FROM leann_meta m
WHERE m.model_id = 'mini-embed-1024-v2'
  AND m.scope = 'page';

-- ANN query
SELECT 
  m.gid,
  vec_distance_L2(v.embedding, :query_vec) AS distance
FROM leann_vec v
JOIN leann_meta m ON m.rowid = v.rowid
WHERE m.model_id = 'mini-embed-1024-v2'
  AND m.scope = 'page'
ORDER BY vec_distance_L2(v.embedding, :query_vec)
LIMIT 100;
```

**Alternative: VSS extension:**

```sql
.load ./vss0

CREATE VIRTUAL TABLE leann_vss USING vss0(
  embedding(1024)
);

-- Query
SELECT 
  rowid,
  distance
FROM leann_vss
WHERE vss_search(
  embedding,
  vss_search_params(:query_vec, 100)
);
```

### 8.5 Graph Traversal Extension

**Using bfsvtab for BFS:**

```sql
.load ./bfsvtab

-- Find all pages within 2 hops of seed
WITH seeds AS (
  SELECT node_id FROM node_index WHERE gid IN ('#p7', '#p12')
)
SELECT 
  n.gid,
  bfs.distance,
  bfs.path
FROM seeds s
JOIN bfsvtab bfs 
  ON bfs.tablename = 'edges'
  AND bfs.fromcolumn = 'fromNode'
  AND bfs.tocolumn = 'toNode'
  AND bfs.root = s.node_id
  AND bfs.distance <= 2
JOIN node_index n ON n.node_id = bfs.id;
```

---

## 9. Hybrid Retrieval Architecture

### 9.1 Retrieval Pipeline Overview

```
Query
  ↓
┌─────────────────────────────────────┐
│ Stage 1: Keyword Filter (FTS5)     │
│ → 100-200 candidates                │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ Stage 2: Entity Match (Structured) │
│ → Boost pages with matching         │
│   entities (ORG, DATE, etc.)        │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ Stage 3: Semantic (LEANN ANN)      │
│ → Recompute top 50-100 candidates   │
│ → ANN search for similar pages      │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ Stage 4: Fusion & Ranking          │
│ → Combine FTS + entity + ANN        │
│ → Weighted score                    │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ Stage 5: Graph Expansion           │
│ → BFS 1-2 hops from top seeds       │
│ → Add graph-connected pages         │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ Stage 6: Refinement                │
│ → Recompute region-level vectors    │
│ → Rank regions within top pages     │
└─────────────────────────────────────┘
  ↓
Top regions with citations
```

### 9.2 Stage 1: Keyword Filter (FTS5)

**SQL:**

```sql
WITH fts AS (
  SELECT 
    gid,
    rank,
    1.0 / (rank + 1.0) AS fts_score,
    snippet(meta_fts, 0, '<b>', '</b>', '...', 32) AS snippet
  FROM meta_fts
  WHERE meta_fts MATCH :query_text
  ORDER BY rank
  LIMIT 200
)
SELECT * FROM fts;
```

**Query preprocessing:**

```python
def preprocess_fts_query(text):
    """
    Prepare text for FTS5 MATCH.
    """
    # Tokenize
    tokens = text.lower().split()
    
    # Remove stopwords (optional)
    tokens = [t for t in tokens if t not in STOPWORDS]
    
    # Build FTS5 query
    if len(tokens) == 1:
        return tokens[0]
    else:
        # Use OR for broad recall
        return ' OR '.join(tokens)
```

### 9.3 Stage 2: Entity Match

**SQL:**

```sql
WITH fts_candidates AS (
  -- From Stage 1
),
entity_match AS (
  SELECT 
    e.gid,
    COUNT(DISTINCT e.entity_text) AS entity_hits,
    SUM(e.confidence) / COUNT(*) AS avg_confidence
  FROM entities e
  WHERE 
    (e.entity_type = 'ORG' AND e.normalized_value = :org)
    OR (e.entity_type = 'DATE' AND e.normalized_value BETWEEN :date_start AND :date_end)
    OR (e.entity_type = :entity_type AND e.entity_text LIKE :pattern)
  GROUP BY e.gid
)
SELECT 
  fc.gid,
  fc.fts_score,
  COALESCE(em.entity_hits, 0) AS entity_hits,
  COALESCE(em.avg_confidence, 0) AS entity_confidence
FROM fts_candidates fc
LEFT JOIN entity_match em ON em.gid = fc.gid;
```

**Example query:**

```
User: "IBM's Q3 2025 earnings"

FTS query: "IBM OR Q3 OR 2025 OR earnings"
Entity query: 
  - ORG = "International Business Machines Corporation"
  - DATE between "2025-07-01" and "2025-09-30"
```

### 9.4 Stage 3: Semantic Search (LEANN)

**Algorithm:**

```python
def semantic_search(query_text, candidates, k=100):
    """
    Recompute embeddings for candidate pages and search.
    
    Args:
        query_text: User query string
        candidates: List of GIDs from FTS/entity stages
        k: Number of results to return
    """
    # Encode query
    query_vec = embed_model.encode(query_text)
    
    # Recompute candidate vectors (LEANN)
    candidate_vecs = {}
    for gid in candidates:
        meta = load_leann_meta(gid)
        text = extract_text(gid, method=meta['text_extraction'])
        text = normalize_text(text, method=meta['normalization'])
        vec = embed_model.encode(text)
        candidate_vecs[gid] = vec
    
    # Compute similarities
    scores = []
    for gid, vec in candidate_vecs.items():
        score = cosine_similarity(query_vec, vec)
        scores.append((gid, score))
    
    # Rank and return top-k
    scores.sort(key=lambda x: x[1], reverse=True)
    return scores[:k]
```

**SQL integration:**

```sql
-- Pseudo-SQL (requires custom function)
WITH ann_scores AS (
  SELECT 
    gid,
    leann_recompute_and_score(gid, :query_vec, 'mini-embed-1024-v2') AS ann_score
  FROM (SELECT gid FROM fts_candidates)
)
SELECT * FROM ann_scores
WHERE ann_score > 0.5
ORDER BY ann_score DESC
LIMIT 100;
```

### 9.5 Stage 4: Fusion & Ranking

**Weighted combination:**

```sql
WITH fusion AS (
  SELECT 
    COALESCE(fts.gid, ann.gid, em.gid) AS gid,
    
    -- Individual scores (normalized 0-1)
    COALESCE(fts.fts_score, 0) AS fts_score,
    COALESCE(ann.ann_score, 0) AS ann_score,
    COALESCE(em.entity_hits / :max_entity_hits, 0) AS entity_score,
    
    -- Fusion formula
    (
      0.40 * COALESCE(ann.ann_score, 0) +
      0.35 * COALESCE(fts.fts_score, 0) +
      0.25 * COALESCE(em.entity_hits / :max_entity_hits, 0)
    ) AS fusion_score
    
  FROM fts_candidates fts
  FULL OUTER JOIN ann_candidates ann USING(gid)
  FULL OUTER JOIN entity_matches em USING(gid)
)
SELECT * FROM fusion
ORDER BY fusion_score DESC
LIMIT 25;
```

**Configurable weights:**

```yaml
fusion_weights:
  semantic: 0.40  # ANN score
  keyword: 0.35   # FTS5 score
  entity: 0.25    # Entity match score
  
  # Domain-specific presets
  presets:
    academic:
      semantic: 0.50
      keyword: 0.30
      entity: 0.20
    
    legal:
      semantic: 0.30
      keyword: 0.40
      entity: 0.30  # Emphasize exact entity matching
    
    narrative:
      semantic: 0.60
      keyword: 0.30
      entity: 0.10```

### 9.6 Stage 5: Graph Expansion

**BFS traversal:**

```sql
WITH seed_ids AS (
  SELECT n.node_id, f.gid, f.fusion_score
  FROM fusion f
  JOIN node_index n ON n.gid = f.gid
  ORDER BY f.fusion_score DESC
  LIMIT 25
),
bfs AS (
  SELECT 
    si.gid AS root_gid,
    si.fusion_score AS seed_score,
    x.id AS node_id,
    x.distance,
    x.path
  FROM seed_ids si
  JOIN bfsvtab x
    ON x.tablename = 'edges'
    AND x.fromcolumn = 'fromNode'
    AND x.tocolumn = 'toNode'
    AND x.root = si.node_id
    AND x.distance <= 2
),
graph_scores AS (
  SELECT 
    n.gid,
    MAX(b.seed_score) AS max_seed_score,
    MIN(b.distance) AS min_distance,
    COUNT(*) AS path_count,
    
    -- Graph score (decay with distance)
    MAX(b.seed_score * (1.0 - b.distance * 0.3)) AS graph_score
    
  FROM bfs b
  JOIN node_index n ON n.node_id = b.node_id
  GROUP BY n.gid
)
SELECT * FROM graph_scores
WHERE graph_score > 0.3;
```

**Edge predicate filtering:**

```sql
-- Prefer certain relationship types
WITH filtered_edges AS (
  SELECT * FROM edges
  WHERE pred IN ('cites', 'part_of', 'caption_of')
    OR weight > 0.8
)
-- Use filtered_edges in BFS instead of edges
```

### 9.7 Stage 6: Region-Level Refinement

**For top pages, refine to specific regions:**

```python
def refine_regions(top_pages, query_vec, k=5):
    """
    Find best regions within top pages.
    """
    region_scores = []
    
    for page_gid in top_pages:
        # Get regions for this page
        regions = get_page_regions(page_gid)
        
        for region in regions:
            region_gid = f"{page_gid}:{region['id']}"
            
            # Recompute region vector
            text = extract_region_text(region_gid)
            vec = embed_model.encode(text)
            score = cosine_similarity(query_vec, vec)
            
            region_scores.append({
                'gid': region_gid,
                'page_gid': page_gid,
                'region_id': region['id'],
                'bbox': region['bbox'],
                'kind': region['kind'],
                'score': score,
                'text': text[:200]
            })
    
    # Rank all regions
    region_scores.sort(key=lambda x: x['score'], reverse=True)
    
    return region_scores[:k]
```

### 9.8 Final Ranking Formula

**Complete formula:**

```python
final_score = (
    0.70 * (
        0.40 * ann_score +
        0.35 * fts_score +
        0.25 * entity_score
    ) +
    0.30 * graph_score
)

# Penalties
if distance_from_seed > 2:
    final_score *= 0.5

if region_kind == 'footer':
    final_score *= 0.3

# Boosts
if entity_confidence > 0.9:
    final_score *= 1.2

if pred in ['cites', 'caption_of']:
    final_score *= 1.1
```

### 9.9 Complete Hybrid Query (SQL Template)

```sql
-- Full pipeline in SQL
WITH fts AS (
  SELECT gid, 1.0/(rank+1.0) AS fts_score
  FROM meta_fts
  WHERE meta_fts MATCH :qtext
  LIMIT 200
),
entity_match AS (
  SELECT gid, COUNT(*) AS entity_hits
  FROM entities
  WHERE (entity_type = :etype AND normalized_value = :eval)
  GROUP BY gid
),
candidates AS (
  SELECT DISTINCT gid FROM fts
  UNION
  SELECT DISTINCT gid FROM entity_match
),
ann AS (
  -- Recompute and score (custom function)
  SELECT gid, leann_ann_score(gid, :qvec) AS ann_score
  FROM candidates
),
fusion AS (
  SELECT 
    COALESCE(f.gid, a.gid, e.gid) AS gid,
    0.40 * COALESCE(a.ann_score, 0) +
    0.35 * COALESCE(f.fts_score, 0) +
    0.25 * COALESCE(e.entity_hits / 5.0, 0) AS base_score
  FROM fts f
  FULL OUTER JOIN ann a USING(gid)
  FULL OUTER JOIN entity_match e USING(gid)
),
seed_nodes AS (
  SELECT n.node_id, f.gid, f.base_score
  FROM fusion f
  JOIN node_index n ON n.gid = f.gid
  ORDER BY f.base_score DESC
  LIMIT 25
),
graph_expand AS (
  SELECT 
    n.gid,
    MAX(sn.base_score * (1.0 - bfs.distance * 0.3)) AS graph_score
  FROM seed_nodes sn
  JOIN bfsvtab bfs 
    ON bfs.root = sn.node_id AND bfs.distance <= 2
  JOIN node_index n ON n.node_id = bfs.id
  GROUP BY n.gid
)
SELECT 
  m.gid,
  m.doc_id,
  m.page_no,
  m.title,
  (0.70 * f.base_score + 0.30 * COALESCE(g.graph_score, 0)) AS final_score,
  gr.epoch,
  gr.merkle_root
FROM fusion f
LEFT JOIN graph_expand g ON g.gid = f.gid
JOIN meta_index m ON m.gid = f.gid
LEFT JOIN glyph_receipts gr ON gr.gid = f.gid
ORDER BY final_score DESC
LIMIT 40;
```

---

## 10. Verification & Provenance

### 10.1 Verification Layers

**Three levels of verification:**

1. **Content integrity** — Hashes match
2. **Provenance** — Signatures valid
3. **Temporal** — Merkle proofs verify checkpoint

### 10.2 Content Verification

**For PDF regions:**

```python
def verify_pdf_region(pdf_path, page_no, region_id, stored_anchors):
    """
    Verify a PDF region hasn't been modified.
    """
    results = {}
    
    # Primary: op_sha (deterministic)
    if 'op_spans' in stored_anchors:
        computed_op_sha = compute_op_sha(pdf_path, page_no, region_id)
        expected_op_sha = stored_anchors['op_spans']
        results['op_sha'] = (computed_op_sha == expected_op_sha)
    
    # Secondary: content_sha (renderer-dependent)
    if 'content_sha' in stored_anchors:
        computed_content_sha = compute_content_sha(pdf_path, page_no, region_id)
        expected_content_sha = stored_anchors['content_sha']
        results['content_sha'] = (computed_content_sha == expected_content_sha)
        
        if not results['content_sha']:
            # Log but don't fail (renderer variance expected)
            log.warning(f"content_sha mismatch for {region_id} (renderer variation)")
    
    # Text extraction verification
    if 'text_sha' in stored_anchors:
        text = extract_region_text(pdf_path, page_no, region_id)
        computed_text_sha = sha256(text.encode('utf-8'))
        expected_text_sha = stored_anchors['text_sha']
        results['text_sha'] = (computed_text_sha == expected_text_sha)
    
    # Overall verdict (op_sha is primary)
    results['verified'] = results.get('op_sha', False)
    
    return results
```

**For PNG regions:**

```python
def verify_png_region(png_path, region_id, stored_anchors):
    """
    Verify a PNG region.
    """
    # Load PNG
    img = load_png(png_path)
    region = get_region_from_chunks(png_path, region_id)
    
    # Crop region
    bbox = region['bbox']
    crop = img[bbox[1]:bbox[1]+bbox[3], bbox[0]:bbox[0]+bbox[2]]
    
    # Hash pixels
    computed_content_sha = sha256(crop.tobytes())
    expected_content_sha = stored_anchors['content_sha']
    
    return computed_content_sha == expected_content_sha
```

### 10.3 Signature Verification

**DID-based signatures:**

```python
def verify_signature(signed_data, signature, signer_did):
    """
    Verify Ed25519 signature using DID.
    """
    # Resolve DID document
    did_doc = resolve_did(signer_did)
    
    # Get public key
    public_key = did_doc['verificationMethod'][0]['publicKeyMultibase']
    
    # Verify signature
    verified = ed25519_verify(
        public_key=public_key,
        message=signed_data,
        signature=signature
    )
    
    return verified
```

**Block signature verification:**

```python
def verify_ledger_block(block):
    """
    Verify ledger block integrity and signature.
    """
    # Reconstruct signed message
    message = json.dumps({
        'ts': block['ts'],
        'prev': block['prev'],
        'entries': block['entries']
    }, sort_keys=True)
    
    # Verify signature
    verified = verify_signature(
        signed_data=message.encode('utf-8'),
        signature=block['sig'],
        signer_did=block['signer']
    )
    
    # Verify chain continuity
    if block['prev'] != 'genesis':
        prev_block = get_block(block['prev'])
        prev_hash = sha256(json.dumps(prev_block).encode('utf-8'))
        chain_valid = (prev_hash.hex() == block['prev'])
    else:
        chain_valid = True
    
    return {
        'signature_valid': verified,
        'chain_valid': chain_valid,
        'verified': verified and chain_valid
    }
```

### 10.4 Merkle Proof Verification

**Checkpoint structure:**

```json
{
  "epoch": "2025-10-01T00:00:00Z",
  "merkle_root": "sha256:d4c7f3a2...",
  "pages_count": 1000,
  "tree_depth": 10,
  "algorithm": "sha256-binary-tree",
  "signer": "did:key:z6Mk...",
  "sig": "ed25519:...",
  "anchors": ["eth:0x12345..."]
}
```

**Inclusion proof:**

```json
{
  "gid": "sha256:a7b2c3d4...#p7",
  "leaf_hash": "sha256:f3e1d...",
  "merkle_root": "sha256:d4c7f3a2...",
  "merkle_path": [
    {"hash": "sha256:...", "side": "left"},
    {"hash": "sha256:...", "side": "right"},
    {"hash": "sha256:...", "side": "left"}
  ]
}
```

**Verification algorithm:**

```python
def verify_merkle_proof(gid, leaf_hash, merkle_root, merkle_path):
    """
    Verify inclusion proof.
    """
    current = leaf_hash
    
    for step in merkle_path:
        if step['side'] == 'left':
            current = sha256(step['hash'] + current)
        else:  # right
            current = sha256(current + step['hash'])
    
    return current == merkle_root
```

### 10.5 Blockchain Anchoring (Optional)

**Anchor format:**

```json
{
  "anchors": [
    {
      "chain": "ethereum",
      "network": "mainnet",
      "tx_hash": "0x1234567890abcdef...",
      "block_number": 18234567,
      "contract": "0xabcdef...",
      "timestamp": "2025-10-01T00:05:32Z"
    }
  ]
}
```

**Verification:**

```python
def verify_blockchain_anchor(checkpoint, anchor):
    """
    Verify checkpoint was anchored on-chain.
    """
    # Connect to blockchain
    web3 = Web3(Web3.HTTPProvider(ETHEREUM_RPC))
    
    # Get transaction
    tx = web3.eth.get_transaction(anchor['tx_hash'])
    
    # Decode calldata (assuming custom contract)
    # Expected: storeCheckpoint(bytes32 merkleRoot, uint256 epoch)
    function_selector = tx['input'][:10]  # First 4 bytes
    expected_selector = '0x12345678'  # storeCheckpoint
    
    if function_selector != expected_selector:
        return False
    
    # Decode parameters
    merkle_root = '0x' + tx['input'][10:74]
    epoch = int(tx['input'][74:138], 16)
    
    # Verify match
    return (
        merkle_root == checkpoint['merkle_root'] and
        epoch == int(checkpoint['epoch_unix'])
    )
```

### 10.6 Verification Cache

**Speed up repeated verifications:**

```sql
CREATE TABLE verification_cache(
  gid TEXT PRIMARY KEY,
  verified_ts TEXT NOT NULL,
  verifier_id TEXT NOT NULL,  -- 'mupdf-1.24.1-linux'
  
  -- Verification results
  op_sha_valid INT,
  content_sha_valid INT,
  text_sha_valid INT,
  signature_valid INT,
  merkle_valid INT,
  
  -- Overall
  fully_verified INT NOT NULL,
  
  -- Cache TTL
  expires_ts TEXT NOT NULL
);

CREATE INDEX verification_cache_expires_idx 
  ON verification_cache(expires_ts);
```

**Usage:**

```python
def verify_region_cached(gid, max_age_hours=24):
    """
    Check verification cache first.
    """
    # Check cache
    cached = db.execute("""
        SELECT * FROM verification_cache
        WHERE gid = ? AND expires_ts > datetime('now')
    """, (gid,)).fetchone()
    
    if cached:
        return {
            'verified': bool(cached['fully_verified']),
            'cached': True,
            'age': (now() - parse_ts(cached['verified_ts'])).seconds
        }
    
    # Perform full verification
    result = verify_region_full(gid)
    
    # Cache result
    db.execute("""
        INSERT OR REPLACE INTO verification_cache
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        gid,
        now_iso(),
        VERIFIER_ID,
        result['op_sha'],
        result['content_sha'],
        result['text_sha'],
        result['signature'],
        result['merkle'],
        result['verified'],
        (now() + timedelta(hours=max_age_hours)).isoformat()
    ))
    
    return result
```

---

## 11. Implementation Guide

### 11.1 Emitter Workflow (Creating MGQD/MemGlyph)

**High-level steps:**

```
1. Compute doc_id from original bytes
2. For each page:
   a. Run Docling → layout
   b. Run Granite → semantic refinement
   c. Run LangExtract → entities
   d. Compute anchors (op_sha, content_sha)
   e. Compute LEANN seeds
   f. Write /MGX or PNG chunks
   g. Optionally build page cartridge
3. Append ledger blocks
4. Build document capsule (SQLAR + accelerators)
5. Compute checkpoint & sign
6. Embed capsule in PDF via /AF or create PNG corpus
```

**Detailed pseudocode:**

```python
def create_mgqd(input_pdf, output_pdf, config):
    """
    Convert PDF to MGQD.
    """
    # 1. Compute stable doc_id
    doc_id = sha256_file(input_pdf)
    
    # 2. Initialize ledger
    ledger = Ledger(doc_id=doc_id)
    
    # 3. Process each page
    page_data = []
    for page_num in range(1, get_page_count(input_pdf) + 1):
        print(f"Processing page {page_num}...")
        
        # 3a. Docling layout analysis
        layout = docling.segment_page(input_pdf, page_num)
        
        # 3b. Granite semantic refinement
        semantic = granite_docling_llm.refine(
            pdf=input_pdf,
            page=page_num,
            layout=layout
        )
        
        # 3c. LangExtract entities
        entities = langextract.extract(
            text=extract_page_text(input_pdf, page_num),
            context=layout
        )
        
        # 3d. Consensus assembly
        consensus = build_consensus(
            layout=layout,
            semantic=semantic,
            entities=entities
        )
        
        # 3e. Anchors
        anchors = {}
        for region in consensus['regions']:
            anchors[region['id']] = {
                'op_sha': compute_op_sha(input_pdf, page_num, region),
                'content_sha': compute_content_sha(input_pdf, page_num, region),
                'text_sha': sha256(region['text'].encode('utf-8'))
            }
        
        # 3f. LEANN seeds
        leann_seeds = compute_leann_seeds(consensus, config.embed_model)
        
        # 3g. Build /MGX stream
        mgx_data = {
            'meta': {
                'schema': 'mgqd/0.7',
                'doc_id': doc_id,
                'page': page_num,
                'gid': f"{doc_id}#p{page_num}"
            },
            'layout': layout,
            'consensus': consensus,
            'anchors': anchors,
            'embed': leann_seeds,
            'edges': semantic.get('edges', [])
        }
        
        # 3h. Compress and embed
        mgx_stream = compress_cbor(mgx_data)
        
        # 3i. Build page cartridge (optional)
        cartridge = None
        if should_include_cartridge(consensus):
            cartridge = build_page_cartridge(
                page_num=page_num,
                mgx_data=mgx_data,
                consensus=consensus
            )
        
        page_data.append({
            'page_num': page_num,
            'mgx_stream': mgx_stream,
            'cartridge': cartridge,
            'consensus': consensus,
            'anchors': anchors
        })
        
        # 3j. Add ledger entry
        ledger.add_entry({
            'op': 'ADD',
            'gid': f"{doc_id}#p{page_num}",
            'content_sha': anchors[consensus['regions'][0]['id']]['content_sha'],
            'timestamp': now_iso()
        })
    
    # 4. Build document capsule
    capsule = build_document_capsule(
        doc_id=doc_id,
        pages=page_data,
        ledger=ledger,
        config=config
    )
    
    # 5. Create checkpoint
    checkpoint = create_checkpoint(
        ledger=ledger,
        epoch=now_iso(),
        signer=config.signing_key
    )
    
    # 6. Embed everything in PDF
    output = PDFWriter(input_pdf)
    
    # 6a. Add /MGX streams to each page
    for page_info in page_data:
        output.add_page_stream(
            page_num=page_info['page_num'],
            stream_name='MGX',
            data=page_info['mgx_stream']
        )
        
        # 6b. Add page cartridge as /AF
        if page_info['cartridge']:
            output.add_page_attachment(
                page_num=page_info['page_num'],
                filename=f"mgx/page/p{page_info['page_num']:04d}.car.sqlite",
                data=page_info['cartridge']
            )
        
        # 6c. Add page XMP
        output.add_page_xmp(
            page_num=page_info['page_num'],
            xmp=build_page_xmp(page_info)
        )
    
    # 6d. Add document capsule as /AF on Catalog
    output.add_catalog_attachment(
        filename='mgx/capsule.mgx.sqlite',
        data=capsule,
        description='MemGlyph document capsule'
    )
    
    # 6e. Add catalog XMP with checkpoint
    output.set_catalog_xmp(build_catalog_xmp(checkpoint))
    
    # 7. Write output
    output.write(output_pdf)
    
    print(f"✓ Created MGQD: {output_pdf}")
    print(f"  Pages: {len(page_data)}")
    print(f"  Capsule size: {len(capsule) / 1024:.1f} KB")
    print(f"  Checkpoint: {checkpoint['epoch']}")
```

### 11.2 Reader Workflow (Querying MGQD)

**High-level steps:**

```
1. Open PDF and discover capsule
2. For corpus queries:
   - Use capsule FTS5/vector/graph tables
3. For page-local queries:
   - Use page cartridge if available
   - Otherwise extract from /MGX
4. Recompute vectors as needed (LEANN)
5. Return results with citations and receipts
```

**Detailed pseudocode:**

```python
def query_mgqd(pdf_path, query_text, mode='hybrid'):
    """
    Query MGQD document.
    """
    # 1. Open PDF and discover capsule
    pdf = open_pdf(pdf_path)
    capsule_path = extract_capsule(pdf)
    
    if not capsule_path:
        raise ValueError("Not an MGQD document (no capsule found)")
    
    # 2. Connect to capsule
    db = sqlite3.connect(capsule_path)
    
    # 3. Execute hybrid retrieval
    if mode == 'hybrid':
        results = hybrid_search(
            db=db,
            query_text=query_text,
            config=default_config
        )
    elif mode == 'fts':
        results = fts_search(db, query_text)
    elif mode == 'semantic':
        results = semantic_search(db, query_text)
    else:
        raise ValueError(f"Unknown mode: {mode}")
    
    # 4. Enrich with citations
    enriched_results = []
    for result in results:
        # Get page details
        page_num = result['page_no']
        
        # Extract /MGX
        mgx_data = extract_mgx(pdf, page_num)
        
        # Find best regions
        regions = rank_regions(
            mgx_data['consensus']['regions'],
            query_text
        )
        
        # Get receipts
        receipt = get_receipt(db, result['gid'])
        
        enriched_results.append({
            'gid': result['gid'],
            'page_no': page_num,
            'score': result['score'],
            'regions': regions[:3],  # Top 3 regions
            'receipt': receipt,
            'mgx': mgx_data
        })
    
    return enriched_results


def hybrid_search(db, query_text, config):
    """
    Full hybrid retrieval pipeline.
    """
    # Stage 1: FTS5
    fts_results = db.execute("""
        SELECT gid, 1.0/(rank+1.0) AS fts_score
        FROM meta_fts
        WHERE meta_fts MATCH ?
        LIMIT 200
    """, (preprocess_fts_query(query_text),)).fetchall()
    
    # Stage 2: Entity matching
    entities = extract_entities_from_query(query_text)
    entity_results = []
    if entities:
        entity_query = build_entity_query(entities)
        entity_results = db.execute(entity_query).fetchall()
    
    # Stage 3: Semantic (LEANN recompute)
    candidate_gids = list(set(
        [r['gid'] for r in fts_results] +
        [r['gid'] for r in entity_results]
    ))
    
    query_vec = embed_model.encode(query_text)
    ann_results = []
    
    for gid in candidate_gids[:100]:  # Limit recompute
        # Get LEANN metadata
        meta = db.execute("""
            SELECT * FROM leann_meta 
            WHERE gid = ? AND scope = 'page'
            ORDER BY model_id DESC LIMIT 1
        """, (gid,)).fetchone()
        
        if not meta:
            continue
        
        # Recompute vector
        text = extract_text_for_gid(gid, meta)
        vec = embed_model.encode(text)
        score = cosine_similarity(query_vec, vec)
        
        ann_results.append({'gid': gid, 'ann_score': score})
    
    # Stage 4: Fusion
    fusion_scores = compute_fusion(
        fts_results,
        entity_results,
        ann_results,
        weights=config.fusion_weights
    )
    
    # Stage 5: Graph expansion
    graph_scores = graph_expand(
        db,
        seed_gids=[r['gid'] for r in fusion_scores[:25]],
        max_hops=2
    )
    
    # Stage 6: Final ranking
    final_results = combine_scores(
        fusion_scores,
        graph_scores,
        base_weight=0.7,
        graph_weight=0.3
    )
    
    return sorted(final_results, key=lambda x: x['score'], reverse=True)[:40]
```

### 11.3 Verification Workflow

```python
def verify_mgqd(pdf_path, full=False):
    """
    Verify MGQD integrity.
    
    Args:
        pdf_path: Path to MGQD PDF
        full: If True, verify all regions (slow)
              If False, spot-check 10% of regions
    """
    results = {
        'verified': True,
        'checks': [],
        'errors': []
    }
    
    # 1. Open and discover
    pdf = open_pdf(pdf_path)
    capsule_path = extract_capsule(pdf)
    db = sqlite3.connect(capsule_path)
    
    # 2. Verify capsule schema
    try:
        db.execute("SELECT * FROM sqlar LIMIT 1")
        db.execute("SELECT * FROM ledger_blocks LIMIT 1")
        results['checks'].append('capsule_schema: OK')
    except Exception as e:
        results['verified'] = False
        results['errors'].append(f'capsule_schema: {e}')
    
    # 3. Verify ledger chain
    blocks = db.execute("""
        SELECT * FROM ledger_blocks ORDER BY ts
    """).fetchall()
    
    for i, block in enumerate(blocks):
        if i == 0:
            continue  # Genesis
        
        prev_block = blocks[i-1]
        prev_hash = sha256(json.dumps(dict(prev_block)).encode('utf-8'))
        
        if prev_hash.hex() != block['prev']:
            results['verified'] = False
            results['errors'].append(f'ledger_chain: broken at block {i}')
        
        # Verify signature
        if not verify_signature(block):
            results['verified'] = False
            results['errors'].append(f'ledger_signature: invalid at block {i}')
    
    results['checks'].append(f'ledger_chain: {len(blocks)} blocks OK')
    
    # 4. Verify checkpoint
    checkpoints = db.execute("""
        SELECT * FROM checkpoints ORDER BY epoch DESC LIMIT 1
    """).fetchone()
    
    if checkpoints:
        # Recompute Merkle root
        all_gids = db.execute("SELECT gid FROM node_index ORDER BY gid").fetchall()
        leaves = [sha256(gid.encode('utf-8')) for gid in all_gids]
        computed_root = compute_merkle_root(leaves)
        
        if computed_root.hex() != checkpoints['merkle_root']:
            results['verified'] = False
            results['errors'].append('checkpoint: merkle_root mismatch')
        else:
            results['checks'].append('checkpoint: merkle_root OK')
    
    # 5. Verify regions
    all_pages = db.execute("""
        SELECT DISTINCT page_no FROM meta_index ORDER BY page_no
    """).fetchall()
    
    if full:
        pages_to_check = all_pages
    else:
        # Spot check 10%
        import random
        pages_to_check = random.sample(all_pages, max(1, len(all_pages) // 10))
    
    region_ok = 0
    region_fail = 0
    
    for page_row in pages_to_check:
        page_num = page_row['page_no']
        
        # Extract /MGX
        mgx_data = extract_mgx(pdf, page_num)
        
        # Check each region
        for region_id, anchors in mgx_data['anchors']['regions'].items():
            try:
                verify_result = verify_region(
                    pdf_path,
                    page_num,
                    region_id,
                    anchors
                )
                
                if verify_result['verified']:
                    region_ok += 1
                else:
                    region_fail += 1
                    if full:  # Only report in full mode
                        results['errors'].append(
                            f'region {page_num}:{region_id}: verification failed'
                        )
            except Exception as e:
                region_fail += 1
                results['errors'].append(
                    f'region {page_num}:{region_id}: {e}'
                )
    
    if region_fail > 0:
        results['verified'] = False
    
    results['checks'].append(
        f'regions: {region_ok} OK, {region_fail} failed '
        f'({len(pages_to_check)} pages checked)'
    )
    
    return results
```

### 11.4 CLI Reference

```bash
# ============================================
# Emit (Create MGQD/MemGlyph)
# ============================================

# Basic PDF conversion
mgx emit input.pdf output.mgqd.pdf

# With options
mgx emit input.pdf output.mgqd.pdf \
  --model mini-embed-1024-v2 \
  --cartridges auto \
  --checkpoint-epoch "2025-10-01T00:00:00Z" \
  --sign-key ./my-key.did.json

# PNG mode (folder output)
mgx emit input.pdf output-folder/ \
  --format png \
  --dpi 180

# ============================================
# Query
# ============================================

# Interactive query
mgx query document.mgqd.pdf "IBM Q3 2025 earnings"

# Programmatic query with JSON output
mgx query document.mgqd.pdf "boiler pressure trends" \
  --mode hybrid \
  --format json \
  --limit 10 \
  > results.json

# Semantic-only search
mgx query document.mgqd.pdf "machine learning applications" \
  --mode semantic

# ============================================
# Verify
# ============================================

# Quick verification (spot check)
mgx verify document.mgqd.pdf

# Full verification (all regions)
mgx verify document.mgqd.pdf --full

# Verify specific pages
mgx verify document.mgqd.pdf --pages 1-10,25,30-35

# ============================================
# Inspect
# ============================================

# Show document info
mgx info document.mgqd.pdf

# Extract capsule
mgx extract document.mgqd.pdf --capsule capsule.sqlite

# Extract specific page /MGX
mgx extract document.mgqd.pdf --page 7 --mgx page7.json

# Dump ledger
mgx ledger document.mgqd.pdf

# ============================================
# Reindex (LEANN)
# ============================================

# Add new model embeddings
mgx reindex document.mgqd.pdf \
  --model mini-embed-2048-v3 \
  --keep-old

# Rebuild FTS5
mgx reindex document.mgqd.pdf --fts

# Rebuild graph
mgx reindex document.mgqd.pdf --graph

# Full rebuild
mgx reindex document.mgqd.pdf --all

# ============================================
# Pack/Unpack
# ============================================

# PNG folder → SQLite capsule
mgx pack mypng-corpus/ corpus.mgx.sqlite

# SQLite capsule → PNG folder
mgx unpack corpus.mgx.sqlite output-folder/

# ============================================
# Checkpoint
# ============================================

# Create new checkpoint
mgx checkpoint document.mgqd.pdf \
  --epoch "2025-10-15T00:00:00Z" \
  --sign-key ./my-key.did.json

# Anchor checkpoint on blockchain
mgx anchor document.mgqd.pdf \
  --chain ethereum \
  --network mainnet \
  --key ./eth-key.json

# ============================================
# Convert
# ============================================

# PDF ↔ PNG
mgx convert document.mgqd.pdf output-folder/ --to png
mgx convert png-folder/ output.mgqd.pdf --to pdf

# Extract to standard formats
mgx export document.mgqd.pdf \
  --format markdown \
  --output document.md

# ============================================
# Serve (Local HTTP Server)
# ============================================

# Start viewer server
mgx serve document.mgqd.pdf \
  --port 8080 \
  --host 0.0.0.0

# Then open: http://localhost:8080
```

### 11.5 Library API (Python Example)

```python
from memglyph import MGQD, MemGlyphPNG, Config

# ============================================
# Basic usage
# ============================================

# Create MGQD from PDF
config = Config(
    embed_model='mini-embed-1024-v2',
    signing_key='./my-key.did.json'
)

mgqd = MGQD.from_pdf(
    'input.pdf',
    output='output.mgqd.pdf',
    config=config
)

# Query
results = mgqd.query(
    "machine learning applications",
    mode='hybrid',
    limit=10
)

for result in results:
    print(f"Page {result.page_no}: {result.title}")
    print(f"Score: {result.score:.3f}")
    print(f"Regions: {len(result.regions)}")
    print(f"Receipt: {result.receipt.epoch}")
    print()

# ============================================
# Advanced usage
# ============================================

# Open existing MGQD
mgqd = MGQD.open('document.mgqd.pdf')

# Get capsule database connection
with mgqd.capsule() as db:
    # Run custom SQL
    entities = db.execute("""
        SELECT entity_type, COUNT(*) as count
        FROM entities
        GROUP BY entity_type
    """).fetchall()
    
    print("Entity distribution:")
    for row in entities:
        print(f"  {row['entity_type']}: {row['count']}")

# Get specific page
page = mgqd.get_page(7)
print(f"Page 7 regions: {len(page.regions)}")

# Extract /MGX data
mgx_data = page.mgx
print(f"Consensus protocol: {mgx_data['consensus']['protocol']}")

# Verify page
verify_result = page.verify()
print(f"Verified: {verify_result.verified}")
if not verify_result.verified:
    print(f"Errors: {verify_result.errors}")

# Recompute vectors for page
vectors = page.recompute_vectors(model='mini-embed-1024-v2')
print(f"Page vector: {vectors['page'].shape}")
print(f"Region vectors: {len(vectors['regions'])}")

# ============================================
# PNG mode
# ============================================

# Create PNG corpus
png_corpus = MemGlyphPNG.from_pdf(
    'input.pdf',
    output_dir='png-corpus/',
    config=config
)

# Query PNG corpus
results = png_corpus.query("key findings")

# Convert to SQLite capsule
png_corpus.pack('corpus.mgx.sqlite')

# ============================================
# Streaming API (large documents)
# ============================================

# Process pages one at a time
with MGQD.emit_stream('input.pdf', 'output.mgqd.pdf', config) as emitter:
    for page_num in range(1, emitter.page_count + 1):
        # Process page
        page_data = emitter.process_page(page_num)
        
        # Custom processing
        if len(page_data.regions) > 20:
            print(f"Page {page_num} has many regions: {len(page_data.regions)}")
        
        # Emit to output
        emitter.emit_page(page_data)
        
        # Progress
        print(f"Processed {page_num}/{emitter.page_count}", end='\r')

print("\nDone!")
```

---

## 12. Testing & Benchmarks

### 12.1 Test Categories

**Unit Tests**
- PNG chunk read/write
- CBOR/JSON serialization
- SHA-256 computation
- Merkle tree construction
- Signature verification
- SQL schema creation

**Integration Tests**
- End-to-end emit workflow
- Hybrid retrieval pipeline
- LEANN recompute
- Verification workflow
- Capsule pack/unpack

**Property Tests**
- Idempotent pack/unpack
- Ledger replay determinism
- Merkle root recomputation
- Anchor verification
- Round-trip JSON/CBOR

**Golden Tests**
- Fixed corpus with known answers
- Expected receipts
- Known entity counts
- Verified Merkle roots

**Fuzz Tests**
- Malformed /MGX streams
- Corrupted PNG chunks
- Invalid ledger blocks
- Partial capsule corruption

### 12.2 Performance Benchmarks

**Test Corpus Specifications:**

| Corpus | Pages | Size | Characteristics |
|--------|-------|------|-----------------|
| Small | 10 | 1 MB | Research paper, low figure density |
| Medium | 100 | 10 MB | Technical manual, moderate figures |
| Large | 1000 | 100 MB | Textbook, high text/figure ratio |
| XLarge | 10000 | 1 GB | Journal archive, diverse content |

**Emit Performance:**

| Operation | Small (10p) | Medium (100p) | Large (1000p) |
|-----------|-------------|---------------|---------------|
| Docling segmentation | 2s | 18s | 3m |
| Granite refinement | 5s | 45s | 7.5m |
| LangExtract entities | 1s | 9s | 1.5m |
| Anchor computation | 0.5s | 5s | 50s |
| /MGX write | 0.1s | 1s | 10s |
| Capsule build | 0.5s | 8s | 2m |
| **Total** | **~10s** | **~90s** | **~15m** |

**Query Performance:**

| Query Type | Small | Medium | Large | Notes |
|------------|-------|--------|-------|-------|
| FTS5 only | 5ms | 20ms | 80ms | Depends on index size |
| Entity match | 3ms | 15ms | 60ms | Pre-indexed |
| Semantic (LEANN) | 50ms | 200ms | 800ms | 50 candidate recompute |
| Hybrid (full) | 100ms | 400ms | 1.5s | FTS+entity+ANN+graph |
| Graph BFS (2 hops) | 20ms | 80ms | 300ms | 25 seeds |

**Verification Performance:**

| Operation | Small | Medium | Large |
|-----------|-------|--------|-------|
| Capsule schema check | 1ms | 1ms | 2ms |
| Ledger chain verify | 5ms | 50ms | 500ms |
| Merkle recompute | 10ms | 100ms | 1s |
| Spot region verify (10%) | 200ms | 2s | 20s |
| Full region verify (100%) | 2s | 20s | 3.5m |

**Memory Usage:**

| Operation | Peak RAM | Notes |
|-----------|----------|-------|
| Emit (Medium) | 2-4 GB | Docling + Granite in memory |
| Query (Large) | 500 MB - 1 GB | Vector recompute + cache |
| Verify (Full) | 1-2 GB | PDF rendering for content_sha |
| Capsule build | 1-3 GB | Depends on corpus size |

### 12.3 Size Benchmarks

**MGQD PDF Overhead:**

| Original | Pages | MGQD | Overhead | % Increase |
|----------|-------|------|----------|------------|
| 1 MB | 10 | 1.15 MB | 150 KB | 15% |
| 5 MB | 50 | 5.5 MB | 500 KB | 10% |
| 10 MB | 100 | 11 MB | 1 MB | 10% |
| 50 MB | 500 | 54 MB | 4 MB | 8% |
| 100 MB | 1000 | 107 MB | 7 MB | 7% |

**PNG Corpus Size:**

| Pages | Total | Avg/Page | Notes |
|-------|-------|----------|-------|
| 10 | 0.6-1.2 MB | 60-120 KB | Varies by image complexity |
| 100 | 6-12 MB | 60-120 KB | |
| 1000 | 60-120 MB | 60-120 KB | Much larger than PDF |

**LEANN Storage Savings:**

| Corpus | Full Vectors | LEANN Seeds | Savings |
|--------|--------------|-------------|---------|
| 100 pages | 3.4 MB | 50 KB | 98.5% |
| 1000 pages | 34 MB | 500 KB | 98.5% |
| 10000 pages | 340 MB | 5 MB | 98.5% |

### 12.4 Test Suite Example

```python
import pytest
from memglyph import MGQD, Config

class TestMGQDBasic:
    def test_create_and_open(self, tmp_path):
        """Test basic emit and open workflow."""
        output = tmp_path / "test.mgqd.pdf"
        
        # Create
        mgqd = MGQD.from_pdf("fixtures/sample.pdf", output)
        assert output.exists()
        
        # Reopen
        mgqd2 = MGQD.open(output)
        assert mgqd2.page_count == mgqd.page_count
    
    def test_query_returns_results(self):
        """Test that queries return results."""
        mgqd = MGQD.open("fixtures/test.mgqd.pdf")
        results = mgqd.query("machine learning")
        
        assert len(results) > 0
        assert all(r.score > 0 for r in results)
    
    def test_verification_passes(self):
        """Test that valid documents verify."""
        mgqd = MGQD.open("fixtures/test.mgqd.pdf")
        result = mgqd.verify()
        
        assert result.verified
        assert len(result.errors) == 0

class TestLEANN:
    def test_recompute_deterministic(self):
        """Test that vector recomputation is deterministic."""
        mgqd = MGQD.open("fixtures/test.mgqd.pdf")
        page = mgqd.get_page(1)
        
        vec1 = page.recompute_vectors()
        vec2 = page.recompute_vectors()
        
        assert np.allclose(vec1['page'], vec2['page'])
    
    def test_storage_savings(self):
        """Verify LEANN achieves expected storage savings."""
        mgqd = MGQD.open("fixtures/test.mgqd.pdf")
        
        # Get metadata size
        with mgqd.capsule() as db:
            leann_size = db.execute("""
                SELECT SUM(LENGTH(content_sha)) FROM leann_meta
            """).fetchone()[0]
            
            # Compare to hypothetical full storage
            page_count = db.execute("SELECT COUNT(*) FROM pages").fetchone()[0]
            full_size = page_count * 2048  # 2KB per page vector
            
            savings = 1 - (leann_size / full_size)
            assert savings > 0.95  # >95% savings

class TestHybridRetrieval:
    def test_fusion_combines_scores(self):
        """Test that fusion properly combines FTS/ANN/entity scores."""
        mgqd = MGQD.open("fixtures/test.mgqd.pdf")
        
        # Run individual retrievals
        fts_results = mgqd.query("test", mode='fts')
        ann_results = mgqd.query("test", mode='semantic')
        
        # Run hybrid
        hybrid_results = mgqd.query("test", mode='hybrid')
        
        # Hybrid should have different (combined) scores
        assert hybrid_results[0].score != fts_results[0].score
        assert hybrid_results[0].score != ann_results[0].score

class TestVerification:
    def test_detect_modified_content(self, tmp_path):
        """Test that modifications are detected."""
        # Create MGQD
        output = tmp_path / "test.mgqd.pdf"
        mgqd = MGQD.from_pdf("fixtures/sample.pdf", output)
        
        # Modify the PDF (corrupt a /Contents stream)
        corrupt_pdf(output)
        
        # Verify should fail
        mgqd2 = MGQD.open(output)
        result = mgqd2.verify()
        
        assert not result.verified
        assert "op_sha" in str(result.errors[0])
    
    def test_merkle_proof_valid(self):
        """Test Merkle proof verification."""
        mgqd = MGQD.open("fixtures/test.mgqd.pdf")
        page = mgqd.get_page(1)
        
        receipt = page.get_receipt()
        valid = verify_merkle_proof(
            gid=page.gid,
            leaf_hash=receipt.content_sha,
            merkle_root=receipt.merkle_root,
            merkle_path=receipt.merkle_path
        )
        
        assert valid

class TestEdgeCases:
    def test_empty_page(self):
        """Test handling of blank pages."""
        # Create PDF with blank page
        pdf_with_blank = create_pdf_with_blank_page()
        mgqd = MGQD.from_pdf(pdf_with_blank, "output.mgqd.pdf")
        
        # Should still work
        assert mgqd.page_count > 0
    
    def test_large_page_count(self):
        """Test scalability with many pages."""
        # This would use a large fixture
        mgqd = MGQD.open("fixtures/large.mgqd.pdf")
        assert mgqd.page_count == 1000
        
        # Query should still be fast
        import time
        start = time.time()
        results = mgqd.query("test")
        elapsed = time.time() - start
        
        assert elapsed < 2.0  # Should be under 2 seconds
    
    def test_unicode_content(self):
        """Test handling of Unicode text."""
        mgqd = MGQD.open("fixtures/unicode.mgqd.pdf")
        results = mgqd.query("日本語")  # Japanese
        
        assert len(results) > 0
```

---

## 13. Migration & Compatibility

### 13.1 Version History

| Version | Date | Key Changes |
|---------|------|-------------|
| 0.5 | 2024-09 | Initial PNG-only release |
| 0.6 | 2025-06 | Added PDF mode, super-glyphs, SQLite capsules |
| 0.7 | 2025-10 | Added LEANN, Docling pipeline, unified spec |
| 0.7.1 | 2025-11 | Added Glyphcapsule modality as third primary modality. |

### 13.2 Breaking Changes in 0.7

**Schema Changes:**
- `/MGX` now includes `consensus` section with full pipeline metadata
- `embed` section restructured for LEANN (seeds instead of vectors)
- Capsule schema adds `entities` and `entity_links` tables
- Ledger format adds `op: ROTATE_KEY` for key rotation

**API Changes:**
- `query()` now requires explicit `mode` parameter
- `verify()` returns structured result object instead of boolean
- `recompute_vectors()` added for LEANN workflow

**File Format:**
- MGQD PDFs from 0.6 missing `consensus.protocol` field
- PNG chunks from 0.6 lack `embed.recompute` flag
- Capsule from 0.6 missing `entities` table

### 13.3 Migration: 0.6 → 0.7

**Automatic Migration:**

```bash
# Upgrade MGQD PDF
mgx migrate document-0.6.mgqd.pdf document-0.7.mgqd.pdf

# Upgrade PNG corpus
mgx migrate png-corpus-0.6/ png-corpus-0.7/ --format png

# Upgrade SQLite capsule
mgx migrate corpus-0.6.sqlite corpus-0.7.sqlite
```

**What Migration Does:**

1. **Reprocess consensus:**
   - Re-run Docling+Granite+LangExtract
   - Add `consensus.protocol` field
   - Populate `entities` tables

2. **Convert to LEANN:**
   - Extract full vectors (if present)
   - Compute seeds from content_sha
   - Add `embed.recompute` flag
   - Remove heavy vector data

3. **Update capsule schema:**
   - Add `entities` and `entity_links` tables
   - Migrate `leann_meta` to new schema
   - Rebuild FTS5 with entities

4. **Preserve provenance:**
   - Keep original signatures
   - Add migration event to ledger
   - Update checkpoint with new Merkle root

**Manual Migration (if automatic fails):**

```python
from memglyph.migrate import Migrator

migrator = Migrator(
    source_version='0.6',
    target_version='0.7'
)

# Migrate with options
migrator.migrate(
    input_path='old.mgqd.pdf',
    output_path='new.mgqd.pdf',
    reprocess_consensus=True,  # Re-run pipeline
    convert_to_leann=True,     # Convert vectors to seeds
    preserve_signatures=True,  # Keep old signatures
    add_migration_event=True   # Log in ledger
)
```

### 13.4 Backwards Compatibility

**Reading old formats:**

```python
# 0.7 can read 0.6 documents
mgqd = MGQD.open("document-0.6.mgqd.pdf")

# But some features unavailable
try:
    entities = mgqd.get_entities(page=1)
except UnsupportedFeatureError:
    print("This document needs migration for entity support")

# LEANN will work (computes seeds on-the-fly)
results = mgqd.query("test", mode='semantic')  # OK
```

**Forward compatibility:**

0.6 readers **cannot** open 0.7 documents due to:
- New `/MGX` structure
- LEANN-only embedding metadata
- New capsule tables

Solution: Export to 0.6 format:

```bash
mgx export document-0.7.mgqd.pdf \
  --format mgqd-0.6 \
  --output document-0.6.mgqd.pdf \
  --compute-full-vectors  # Convert LEANN → full vectors
```

### 13.5 Interoperability with Other Tools

**PDF Readers:**
- ✅ Adobe Acrobat: Opens normally, ignores /MGX
- ✅ Preview (macOS): Opens normally, ignores /MGX
- ✅ Evince, Okular: Opens normally
- ⚠️ Some readers may warn about attachments

**PDF Libraries:**
- ✅ PyPDF2/pypdf: Can read, may need attachment extraction
- ✅ PDFium: Can read
- ✅ MuPDF: Can read and extract /MGX
- ✅ Poppler: Can read

**PNG Viewers:**
- ✅ All image viewers: Display correctly
- ⚠️ Some may strip custom chunks on save

---

## 14. Appendices

### Appendix A: Hybrid Query (Complete SQL)

```sql
-- Complete hybrid retrieval query for MGQD capsule
-- Parameters: :qtext (string), :qvec (blob), :max_entity_hits (int)

WITH fts AS (
  SELECT gid, 1.0/(rank+1.0) AS fts_score
  FROM meta_fts
  WHERE meta_fts MATCH :qtext
  LIMIT 200
),
entity_match AS (
  SELECT gid, COUNT(DISTINCT entity_text) AS entity_hits
  FROM entities
  WHERE entity_type IN ('ORG', 'PERSON', 'DATE', 'LOCATION')
    AND (
      normalized_value LIKE '%' || :entity_query || '%'
      OR entity_text LIKE '%' || :entity_query || '%'
    )
  GROUP BY gid
),
candidates AS (
  SELECT DISTINCT gid FROM fts
  UNION
  SELECT DISTINCT gid FROM entity_match
),
ann AS (
  -- Custom function: recomputes LEANN vectors and scores
  SELECT gid, leann_recompute_and_score(gid, :qvec) AS ann_score
  FROM candidates
  WHERE leann_recompute_and_score(gid, :qvec) > 0.3
),
fusion AS (
  SELECT 
    COALESCE(f.gid, a.gid, e.gid) AS gid,
    
    -- Individual scores
    COALESCE(f.fts_score, 0) AS fts_score,
    COALESCE(a.ann_score, 0) AS ann_score,
    COALESCE(e.entity_hits / CAST(:max_entity_hits AS REAL), 0) AS entity_score,
    
    -- Fusion formula (configurable weights)
    (
      0.40 * COALESCE(a.ann_score, 0) +
      0.35 * COALESCE(f.fts_score, 0) +
      0.25 * COALESCE(e.entity_hits / CAST(:max_entity_hits AS REAL), 0)
    ) AS base_score
    
  FROM fts f
  FULL OUTER JOIN ann a USING(gid)
  FULL OUTER JOIN entity_match e USING(gid)
),
seed_nodes AS (
  SELECT n.node_id, f.gid, f.base_score
  FROM fusion f
  JOIN node_index n ON n.gid = f.gid
  ORDER BY f.base_score DESC
  LIMIT 25
),
graph_expand AS (
  -- Requires bfsvtab extension
  SELECT 
    n.gid,
    sn.base_score AS seed_score,
    MIN(bfs.distance) AS min_distance,
    COUNT(*) AS path_count,
    MAX(sn.base_score * (1.0 - bfs.distance * 0.3)) AS graph_score
  FROM seed_nodes sn
  JOIN bfsvtab bfs
    ON bfs.tablename = 'edges'
    AND bfs.fromcolumn = 'fromNode'
    AND bfs.tocolumn = 'toNode'
    AND bfs.root = sn.node_id
    AND bfs.distance <= 2
  JOIN node_index n ON n.node_id = bfs.id
  GROUP BY n.gid
)
SELECT 
  m.gid,
  m.doc_id,
  m.page_no,
  m.title,
  f.fts_score,
  f.ann_score,
  f.entity_score,
  f.base_score,
  COALESCE(g.graph_score, 0) AS graph_score,
  
  -- Final ranking
  (0.70 * f.base_score + 0.30 * COALESCE(g.graph_score, 0)) AS final_score,
  
  -- Provenance
  gr.epoch,
  gr.merkle_root,
  gr.signer
  
FROM fusion f
LEFT JOIN graph_expand g ON g.gid = f.gid
JOIN meta_index m ON m.gid = f.gid
LEFT JOIN glyph_receipts gr ON gr.gid = f.gid

ORDER BY final_score DESC
LIMIT 40;
```

### Appendix B: Chunk Keys Reference

**PDF /MGX Stream Keys:**
- `meta`: Document/page identifiers
- `layout`: Region bounding boxes and kinds
- `consensus`: Extraction pipeline results
- `anchors`: Verification hashes (op_sha, content_sha)
- `embed`: LEANN metadata (seeds, neighbors)
- `edges`: Graph relationships

**PNG Chunk Keys:**
- `gLYP.meta`: Page identifiers
- `gLYP.prov`: Provenance (signer, signature)
- `gLYP.layout`: Region geometry
- `gLYP.consensus`: Extraction results
- `gLYP.anchors`: Verification hashes
- `gLYP.embed`: LEANN metadata
- `gLYP.edges.local`: Page-local graph
- `gLYP.checkpoint.proof`: Merkle inclusion proof
- `gLYP.qr`: Optional QR code (visual)

### Appendix C: Error Codes

| Code | Message | Severity | Action |
|------|---------|----------|--------|
| E001 | No capsule found | Fatal | Not an MGQD document |
| E002 | Invalid /MGX stream | Fatal | Corrupted metadata |
| E003 | Capsule schema mismatch | Fatal | Wrong version or corrupted |
| E004 | Ledger chain broken | Error | Verify integrity |
| E005 | Signature invalid | Error | Verify signer key |
| E006 | Merkle proof failed | Error | Recompute checkpoint |
| E007 | op_sha mismatch | Error | Content modified |
| E008 | content_sha mismatch | Warning | Renderer variation possible |
| E009 | Model not found | Error | Install embedding model |
| E010 | LEANN recompute failed | Error | Check text extraction |

### Appendix D: Configuration File Format

```yaml
# memglyph.yaml - Configuration file

version: "0.7"

# Embedding model
embedding:
  model_id: "mini-embed-1024-v2"
  dim: 1024
  quant: "int8"
  device: "cuda"  # or "cpu"
  batch_size: 32

# Extraction pipeline
extraction:
  docling:
    version: "1.0.4"
    confidence_threshold: 0.7
  
  granite_docling:
    version: "3B-int8-v1.2"
    temperature: 0.0
    max_tokens: 2048
  
  langextract:
    version: "v1.2"
    entity_types: ["ORG", "PERSON", "DATE", "MONEY", "PERCENT", "LOCATION"]
    confidence_threshold: 0.7

# Retrieval weights
retrieval:
  fusion_weights:
    semantic: 0.40
    keyword: 0.35
    entity: 0.25
  
  graph_weight: 0.30
  max_hops: 2
  max_seeds: 25

# Verification
verification:
  renderer: "mupdf-1.24.1"
  dpi: 180
  cache_ttl_hours: 24
  spot_check_ratio: 0.1  # 10% for quick verify

# Output options
output:
  include_cartridges: "auto"  # "always", "never", "auto"
  checkpoint_interval: "1day"
  compress_mgx: true
  compress_level: 9

# Signing
signing:
  key_path: "./keys/publisher.did.json"
  algorithm: "ed25519"

# Blockchain anchoring (optional)
anchoring:
  enabled: false
  chain: "ethereum"
  network: "mainnet"
  contract: "0xabcdef..."
  key_path: "./keys/eth-key.json"
```

### Appendix E: DID Document Format

```json
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/suites/ed25519-2020/v1"
  ],
  "id": "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH",
  "