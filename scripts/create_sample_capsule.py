#!/usr/bin/env python3
"""
Create a sample GlyphCase about MemGlyph for demo purposes.
This is a meta-case: MemGlyph documentation in MemGlyph format!
"""

import sqlite3
import json
import hashlib
import struct
from datetime import datetime, timezone

# Sample pages about MemGlyph
PAGES = [
    {
        "page_no": 1,
        "title": "MemGlyph Universal Specification Overview",
        "full_text": """MemGlyph is a system for creating portable, verifiable, and queryable knowledge artifacts.
        Each MemGlyph artifact is a self-contained file that bundles its own metadata, semantic structure,
        and cryptographic proof of its contents and history. The system enables offline hybrid search
        combining keyword, semantic, and graph-based retrieval directly within the artifact itself.""",
        "entities": [
            ("TECH", "MemGlyph", "MemGlyph"),
            ("TECH", "hybrid search", "hybrid search"),
        ]
    },
    {
        "page_no": 2,
        "title": "LEANN: Lightweight Embedding Strategy",
        "full_text": """LEANN (Lightweight Embedding Adaptive Neural Network) is MemGlyph's vector strategy.
        Instead of storing full 1024-dimension vectors, LEANN stores semantic hints or seeds.
        These seeds enable on-demand regeneration of embeddings, achieving 98.5% storage savings
        while maintaining semantic search capabilities. LEANN allows model upgrades without rewriting artifacts.""",
        "entities": [
            ("TECH", "LEANN", "LEANN"),
            ("PERCENT", "98.5%", "0.985"),
            ("TECH", "semantic search", "semantic search"),
        ]
    },
    {
        "page_no": 3,
        "title": "GlyphCase Modality",
        "full_text": """A GlyphCase is a SQLite-based container using SQLAR format for archival storage.
        The sqlar table contains byte-for-byte representation of the source corpus, while accelerator
        tables provide fast queries. All accelerators are rebuildable from the canonical sqlar data.
        This enables atomic operations and efficient distribution of large document collections.""",
        "entities": [
            ("TECH", "GlyphCase", "GlyphCase"),
            ("TECH", "SQLite", "SQLite"),
            ("TECH", "SQLAR", "SQLAR"),
        ]
    },
    {
        "page_no": 4,
        "title": "FTS5 Full-Text Search",
        "full_text": """MemGlyph uses SQLite's FTS5 extension for keyword search with BM25 ranking.
        The meta_fts virtual table indexes page titles, tags, entities, and full text content.
        FTS5 provides fast filtering to 100-200 candidates before semantic reranking.
        Snippet generation highlights matching terms with configurable context windows.""",
        "entities": [
            ("TECH", "FTS5", "FTS5"),
            ("TECH", "BM25", "BM25"),
            ("TECH", "SQLite", "SQLite"),
        ]
    },
    {
        "page_no": 5,
        "title": "Entity Extraction and Normalization",
        "full_text": """MemGlyph extracts named entities using Google LangExtract. Entities include organizations,
        dates, locations, and technical terms. Normalized values enable faceted search and entity-based
        retrieval boosting. Cross-document entity linking tracks entity occurrences across the corpus
        with Wikidata QID references where available.""",
        "entities": [
            ("TECH", "LangExtract", "Google LangExtract"),
            ("ORG", "Google", "Google LLC"),
            ("TECH", "Wikidata", "Wikidata"),
        ]
    },
    {
        "page_no": 6,
        "title": "Graph-Based Retrieval",
        "full_text": """The node_index and edges tables enable graph traversal queries. Predicates like cites,
        part_of, and caption_of represent semantic relationships between pages and regions.
        BFS traversal finds connected content within N hops. Graph expansion augments keyword
        and semantic results with relationship-based discovery.""",
        "entities": [
            ("TECH", "BFS", "breadth-first search"),
            ("TECH", "graph traversal", "graph traversal"),
        ]
    },
    {
        "page_no": 7,
        "title": "Hybrid Retrieval Architecture",
        "full_text": """MemGlyph combines multiple retrieval signals in a fusion ranking system.
        FTS5 provides keyword filtering (35% weight), vector search adds semantic understanding (40% weight),
        entity matching contributes structured boosting (25% weight), and graph expansion discovers
        related content. This hybrid approach outperforms single-method retrieval.""",
        "entities": [
            ("PERCENT", "35%", "0.35"),
            ("PERCENT", "40%", "0.40"),
            ("PERCENT", "25%", "0.25"),
            ("TECH", "hybrid retrieval", "hybrid retrieval"),
        ]
    },
    {
        "page_no": 8,
        "title": "Verification and Provenance",
        "full_text": """Every MemGlyph artifact includes cryptographic verification. Content hashes (SHA256) anchor
        regions to prevent tampering. The ledger tracks all operations with timestamps and signatures.
        Merkle checkpoints create temporal snapshots. Ed25519 signatures prove authorship.
        External anchors on Ethereum or IPFS provide additional trust.""",
        "entities": [
            ("TECH", "SHA256", "SHA-256"),
            ("TECH", "Merkle", "Merkle tree"),
            ("TECH", "Ed25519", "Ed25519"),
            ("TECH", "Ethereum", "Ethereum"),
            ("TECH", "IPFS", "IPFS"),
        ]
    }
]

# Graph edges (citations and relationships)
EDGES = [
    (1, 2, "cites", 0.9),      # Overview cites LEANN
    (1, 3, "cites", 0.85),     # Overview cites Glyphcapsule
    (1, 7, "part_of", 1.0),    # Overview is part of Hybrid Retrieval
    (2, 7, "cites", 0.8),      # LEANN cited by Hybrid Retrieval
    (3, 4, "cites", 0.75),     # Glyphcapsule uses FTS5
    (4, 7, "cites", 0.9),      # FTS5 cited by Hybrid Retrieval
    (5, 7, "cites", 0.85),     # Entities cited by Hybrid Retrieval
    (6, 7, "cites", 0.8),      # Graph cited by Hybrid Retrieval
    (7, 2, "cites", 0.9),      # Hybrid cites LEANN
    (7, 4, "cites", 0.85),     # Hybrid cites FTS5
    (8, 1, "part_of", 0.95),   # Verification part of system
]

DOC_ID = "sha256:memglyph_demo_" + hashlib.sha256(b"memglyph_sample_capsule").hexdigest()[:16]

def create_mock_png(page_no: int, title: str) -> bytes:
    """Create a minimal valid PNG file with text."""
    # Minimal 1x1 PNG (transparent)
    # Real implementation would render the page content
    png_data = bytes.fromhex(
        '89504e470d0a1a0a'  # PNG signature
        '0000000d49484452'  # IHDR chunk
        '0000000100000001'  # 1x1 pixels
        '0802000000907753'  # 8-bit grayscale
        'de'
        '0000000c49444154'  # IDAT chunk
        '08995163000000'
        '0200013226780a'
        '0000000049454e44'  # IEND chunk
        'ae426082'
    )
    return png_data

def mock_vector_384d(text: str) -> bytes:
    """Generate a mock 384-dimensional float32 vector based on text hash."""
    # In reality, this would be generated by an embedding model
    # We'll use deterministic pseudo-random values based on text hash
    import random
    seed = int(hashlib.sha256(text.encode()).hexdigest()[:8], 16)
    random.seed(seed)

    # Generate 384 floats in range [-1, 1]
    vector = [random.uniform(-1, 1) for _ in range(384)]

    # Pack as float32 bytes
    return struct.pack('f' * 384, *vector)

def create_capsule(output_path: str):
    """Create the sample Glyphcapsule database."""

    conn = sqlite3.connect(output_path)
    cur = conn.cursor()

    # Set PRAGMAs before any transactions
    cur.execute('PRAGMA journal_mode=WAL')
    cur.execute('PRAGMA synchronous=NORMAL')
    cur.execute('PRAGMA foreign_keys=ON')

    print(f"Creating sample Glyphcapsule: {output_path}")

    # ============================================
    # CANONICAL ARCHIVE (SQLAR)
    # ============================================

    cur.execute('''
        CREATE TABLE IF NOT EXISTS sqlar(
          name TEXT PRIMARY KEY,
          mode INT,
          mtime INT,
          sz INT,
          data BLOB
        )
    ''')

    # Add mock PNG files to SQLAR
    for page in PAGES:
        png_data = create_mock_png(page["page_no"], page["title"])
        filename = f"glyphs/page_{page['page_no']:04d}.mgx.png"
        mtime = int(datetime.now(timezone.utc).timestamp())

        cur.execute('''
            INSERT INTO sqlar (name, mode, mtime, sz, data)
            VALUES (?, 33188, ?, ?, ?)
        ''', (filename, mtime, len(png_data), png_data))

    # Add ledger file
    ledger_content = json.dumps({
        "format": "memglyph-ledger-v1",
        "created": datetime.now(timezone.utc).isoformat()
    }).encode('utf-8')

    cur.execute('''
        INSERT INTO sqlar (name, mode, mtime, sz, data)
        VALUES ('ledger/ledger.log', 33188, ?, ?, ?)
    ''', (int(datetime.now(timezone.utc).timestamp()), len(ledger_content), ledger_content))

    print(f"  ✓ Added {len(PAGES)} pages to SQLAR")

    # ============================================
    # LEDGER & CHECKPOINTS
    # ============================================

    cur.execute('''
        CREATE TABLE IF NOT EXISTS ledger_blocks(
          block_id TEXT PRIMARY KEY,
          ts TEXT NOT NULL,
          prev TEXT NOT NULL,
          entries_json TEXT NOT NULL,
          signer TEXT NOT NULL,
          sig TEXT NOT NULL,
          anchors_json TEXT
        )
    ''')

    cur.execute('CREATE INDEX IF NOT EXISTS ledger_ts_idx ON ledger_blocks(ts)')

    # Add initial ledger block
    cur.execute('''
        INSERT INTO ledger_blocks (block_id, ts, prev, entries_json, signer, sig, anchors_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (
        'b001',
        datetime.now(timezone.utc).isoformat(),
        'genesis',
        json.dumps([{
            "op": "ADD",
            "gid": f"{DOC_ID}#p{i}",
            "content_sha": hashlib.sha256(PAGES[i-1]["full_text"].encode()).hexdigest(),
            "metadata": {"title": PAGES[i-1]["title"]}
        } for i in range(1, len(PAGES) + 1)]),
        'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        'ed25519:mock_signature_' + hashlib.sha256(b'demo').hexdigest()[:32],
        json.dumps(['ipfs:QmDemo123'])
    ))

    cur.execute('''
        CREATE TABLE IF NOT EXISTS checkpoints(
          epoch TEXT PRIMARY KEY,
          merkle_root TEXT NOT NULL,
          pages_count INT NOT NULL,
          anchors_json TEXT,
          created_ts TEXT NOT NULL
        )
    ''')

    cur.execute('''
        INSERT INTO checkpoints (epoch, merkle_root, pages_count, anchors_json, created_ts)
        VALUES (?, ?, ?, ?, ?)
    ''', (
        datetime.now(timezone.utc).isoformat(),
        hashlib.sha256(b'checkpoint_demo').hexdigest(),
        len(PAGES),
        json.dumps(['ipfs:QmCheckpoint123']),
        datetime.now(timezone.utc).isoformat()
    ))

    cur.execute('''
        CREATE TABLE IF NOT EXISTS keys(
          key_id TEXT PRIMARY KEY,
          did TEXT NOT NULL,
          did_document TEXT NOT NULL,
          valid_from TEXT NOT NULL,
          valid_until TEXT,
          revoked INT DEFAULT 0
        )
    ''')

    cur.execute('''
        INSERT INTO keys (key_id, did, did_document, valid_from, revoked)
        VALUES (?, ?, ?, ?, 0)
    ''', (
        'key001',
        'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        json.dumps({"@context": "https://w3id.org/did/v1", "id": "did:key:z6Mk..."}),
        datetime.now(timezone.utc).isoformat()
    ))

    print("  ✓ Created ledger, checkpoints, and keys")

    # ============================================
    # GRAPH STRUCTURE
    # ============================================

    cur.execute('''
        CREATE TABLE IF NOT EXISTS node_index(
          node_id INTEGER PRIMARY KEY AUTOINCREMENT,
          gid TEXT UNIQUE NOT NULL,
          doc_id TEXT NOT NULL,
          page_no INT
        )
    ''')

    cur.execute('CREATE INDEX IF NOT EXISTS node_gid_idx ON node_index(gid)')
    cur.execute('CREATE INDEX IF NOT EXISTS node_doc_page_idx ON node_index(doc_id, page_no)')

    # Insert nodes for each page
    for page in PAGES:
        gid = f"{DOC_ID}#p{page['page_no']}"
        cur.execute('''
            INSERT INTO node_index (gid, doc_id, page_no)
            VALUES (?, ?, ?)
        ''', (gid, DOC_ID, page['page_no']))

    cur.execute('''
        CREATE TABLE IF NOT EXISTS edges(
          fromNode INT NOT NULL,
          toNode INT NOT NULL,
          pred TEXT NOT NULL,
          weight REAL DEFAULT 1.0,
          ts TEXT,
          evidence TEXT,
          PRIMARY KEY(fromNode, toNode, pred)
        )
    ''')

    cur.execute('CREATE INDEX IF NOT EXISTS edges_from_idx ON edges(fromNode)')
    cur.execute('CREATE INDEX IF NOT EXISTS edges_to_idx ON edges(toNode)')
    cur.execute('CREATE INDEX IF NOT EXISTS edges_pred_idx ON edges(pred)')

    # Insert edges
    for from_page, to_page, pred, weight in EDGES:
        cur.execute('''
            INSERT INTO edges (fromNode, toNode, pred, weight, ts)
            VALUES (?, ?, ?, ?, ?)
        ''', (from_page, to_page, pred, weight, datetime.now(timezone.utc).isoformat()))

    print(f"  ✓ Created graph: {len(PAGES)} nodes, {len(EDGES)} edges")

    # ============================================
    # METADATA & FTS5
    # ============================================

    cur.execute('''
        CREATE TABLE IF NOT EXISTS meta_index(
          gid TEXT PRIMARY KEY,
          doc_id TEXT NOT NULL,
          page_no INT NOT NULL,
          title TEXT,
          tags TEXT,
          entities TEXT,
          full_text TEXT,
          updated_ts TEXT NOT NULL
        )
    ''')

    cur.execute('CREATE INDEX IF NOT EXISTS meta_doc_page_idx ON meta_index(doc_id, page_no)')

    # Insert metadata
    for page in PAGES:
        gid = f"{DOC_ID}#p{page['page_no']}"
        cur.execute('''
            INSERT INTO meta_index (gid, doc_id, page_no, title, tags, entities, full_text, updated_ts)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            gid,
            DOC_ID,
            page['page_no'],
            page['title'],
            'memglyph demo documentation',
            json.dumps([e[1] for e in page['entities']]),
            page['full_text'],
            datetime.now(timezone.utc).isoformat()
        ))

    cur.execute('''
        CREATE VIRTUAL TABLE IF NOT EXISTS meta_fts USING fts5(
          title, tags, entities, full_text,
          content='meta_index',
          tokenize='unicode61 remove_diacritics 1'
        )
    ''')

    # Populate FTS5 from meta_index
    cur.execute('''
        INSERT INTO meta_fts(rowid, title, tags, entities, full_text)
        SELECT rowid, title, tags, entities, full_text FROM meta_index
    ''')

    print("  ✓ Created metadata and FTS5 index")

    # ============================================
    # ENTITIES
    # ============================================

    cur.execute('''
        CREATE TABLE IF NOT EXISTS entities(
          gid TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_text TEXT NOT NULL,
          normalized_value TEXT,
          confidence REAL NOT NULL,
          start_offset INT,
          end_offset INT,
          PRIMARY KEY(gid, entity_type, entity_text)
        )
    ''')

    cur.execute('CREATE INDEX IF NOT EXISTS entities_type_idx ON entities(entity_type)')
    cur.execute('CREATE INDEX IF NOT EXISTS entities_norm_idx ON entities(entity_type, normalized_value)')

    # Insert entities
    for page in PAGES:
        gid = f"{DOC_ID}#p{page['page_no']}"
        for entity_type, entity_text, normalized_value in page['entities']:
            cur.execute('''
                INSERT INTO entities (gid, entity_type, entity_text, normalized_value, confidence)
                VALUES (?, ?, ?, ?, ?)
            ''', (gid, entity_type, entity_text, normalized_value, 0.95))

    print("  ✓ Created entities table")

    # ============================================
    # LEANN METADATA
    # ============================================

    cur.execute('''
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
        )
    ''')

    cur.execute('CREATE INDEX IF NOT EXISTS leann_model_idx ON leann_meta(model_id)')
    cur.execute('CREATE INDEX IF NOT EXISTS leann_doc_page_idx ON leann_meta(doc_id, page_no)')

    # Insert LEANN metadata
    model_id = 'gte-small-384'
    for page in PAGES:
        gid = f"{DOC_ID}#p{page['page_no']}"
        content_sha = hashlib.sha256(page['full_text'].encode()).hexdigest()

        cur.execute('''
            INSERT INTO leann_meta (gid, model_id, scope, doc_id, page_no, dim, quant, content_sha,
                                   text_extraction, normalization, updated_utc, recompute)
            VALUES (?, ?, 'page', ?, ?, 384, 'float32', ?, 'native', 'unicode-nfkc', ?, 0)
        ''', (gid, model_id, DOC_ID, page['page_no'], content_sha, datetime.now(timezone.utc).isoformat()))

    # Create vector cache table (with mock vectors)
    cur.execute('''
        CREATE TABLE IF NOT EXISTS leann_vec(
          gid TEXT NOT NULL,
          model_id TEXT NOT NULL,
          embedding BLOB NOT NULL,
          cached_ts TEXT NOT NULL,
          PRIMARY KEY(gid, model_id)
        )
    ''')

    # Insert mock vectors
    for page in PAGES:
        gid = f"{DOC_ID}#p{page['page_no']}"
        vector_blob = mock_vector_384d(page['full_text'])

        cur.execute('''
            INSERT INTO leann_vec (gid, model_id, embedding, cached_ts)
            VALUES (?, ?, ?, ?)
        ''', (gid, model_id, vector_blob, datetime.now(timezone.utc).isoformat()))

    # Create neighbor hints
    cur.execute('''
        CREATE TABLE IF NOT EXISTS leann_neighbors(
          gid TEXT NOT NULL,
          neighbor TEXT NOT NULL,
          score REAL NOT NULL,
          reason TEXT,
          PRIMARY KEY(gid, neighbor)
        )
    ''')

    cur.execute('CREATE INDEX IF NOT EXISTS leann_neighbors_score_idx ON leann_neighbors(gid, score DESC)')

    # Add some neighbor hints based on edges
    for from_page, to_page, pred, weight in EDGES:
        from_gid = f"{DOC_ID}#p{from_page}"
        to_gid = f"{DOC_ID}#p{to_page}"
        cur.execute('''
            INSERT OR IGNORE INTO leann_neighbors (gid, neighbor, score, reason)
            VALUES (?, ?, ?, ?)
        ''', (from_gid, to_gid, weight, 'graph-' + pred))

    print("  ✓ Created LEANN metadata and cached vectors (384-dim)")

    # ============================================
    # RECEIPTS
    # ============================================

    cur.execute('''
        CREATE TABLE IF NOT EXISTS glyph_receipts(
          gid TEXT PRIMARY KEY,
          content_sha TEXT NOT NULL,
          signer TEXT NOT NULL,
          sig TEXT NOT NULL,
          ts TEXT NOT NULL,
          epoch TEXT NOT NULL,
          merkle_root TEXT NOT NULL,
          merkle_path TEXT,
          anchors_json TEXT
        )
    ''')

    cur.execute('CREATE INDEX IF NOT EXISTS glyph_receipts_epoch_idx ON glyph_receipts(epoch)')

    epoch = datetime.now(timezone.utc).isoformat()
    merkle_root = hashlib.sha256(b'checkpoint_demo').hexdigest()

    for page in PAGES:
        gid = f"{DOC_ID}#p{page['page_no']}"
        content_sha = hashlib.sha256(page['full_text'].encode()).hexdigest()

        cur.execute('''
            INSERT INTO glyph_receipts (gid, content_sha, signer, sig, ts, epoch, merkle_root, anchors_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            gid,
            content_sha,
            'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
            'ed25519:mock_sig_' + hashlib.sha256((gid + content_sha).encode()).hexdigest()[:32],
            datetime.now(timezone.utc).isoformat(),
            epoch,
            merkle_root,
            json.dumps(['ipfs:QmDemo123'])
        ))

    print("  ✓ Created receipts")

    # ============================================
    # VIEWS
    # ============================================

    cur.execute('''
        CREATE VIEW IF NOT EXISTS pages AS
        SELECT DISTINCT
          doc_id,
          page_no,
          gid
        FROM node_index
        WHERE page_no IS NOT NULL
        ORDER BY doc_id, page_no
    ''')

    cur.execute('''
        CREATE VIEW IF NOT EXISTS entity_summary AS
        SELECT
          entity_type,
          COUNT(DISTINCT entity_text) AS unique_entities,
          COUNT(DISTINCT gid) AS pages_with_entity
        FROM entities
        GROUP BY entity_type
    ''')

    print("  ✓ Created views")

    conn.commit()
    conn.close()

    print(f"\n✅ Sample Glyphcapsule created successfully!")
    print(f"   File: {output_path}")
    print(f"   Pages: {len(PAGES)}")
    print(f"   Entities: {sum(len(p['entities']) for p in PAGES)}")
    print(f"   Edges: {len(EDGES)}")
    print(f"   Vector model: {model_id} (384-dim)")

    # Print some stats
    conn = sqlite3.connect(output_path)
    cur = conn.cursor()

    print("\n📊 Database Statistics:")
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = [row[0] for row in cur.fetchall()]
    for table in tables:
        if table.startswith('sqlite_'):
            continue
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        count = cur.fetchone()[0]
        print(f"   {table}: {count} rows")

    conn.close()

if __name__ == '__main__':
    import os
    os.makedirs('/home/user/memglyphpwa/public', exist_ok=True)
    create_capsule('/home/user/memglyphpwa/public/memglyph-demo.mgx.sqlite')
