# 🔄 GlyphCase Remint Guide

**Reminting** is the process of consolidating validated Envelope data into the immutable Core, creating a new canonical version of a GlyphCase.

This guide explains how to work with GlyphCase envelopes exported from MemGlyph PWA and perform reminting using external tools.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Envelope Structure](#envelope-structure)
- [Export from MemGlyph PWA](#export-from-memglyph-pwa)
- [Envelope Validation](#envelope-validation)
- [Remint Process](#remint-process)
- [Python Example Tool](#python-example-tool)
- [Best Practices](#best-practices)

---

## 🔍 Overview

### What is Reminting?

**Reminting** is the lifecycle event that:
1. Validates Envelope integrity (hash chain verification)
2. Reviews Envelope data (human or automated)
3. Merges approved data into Core tables
4. Seals consumed Envelope blocks as immutable history
5. Increments case version and generates new canonical root

### Why Remint?

- **Knowledge Consolidation:** Promote validated learning to permanent knowledge
- **Performance:** Reduce Envelope size, improve query efficiency
- **Provenance:** Maintain traceable lineage of knowledge evolution
- **Trust:** Cryptographic verification of data integrity

---

## 📊 Envelope Structure

### Schema Tables

An exported envelope contains these tables:

#### **`_envelope_meta`**
Metadata about the envelope:
```sql
CREATE TABLE _envelope_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```
Keys:
- `gcase_id` - SHA256 hash of linked Core capsule
- `created_at` - ISO8601 creation timestamp
- `format_version` - Envelope schema version (1.1)
- `last_hash` - Current hash chain head

#### **`_env_chain`**
Merkle integrity chain:
```sql
CREATE TABLE _env_chain (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  block_hash TEXT NOT NULL UNIQUE,
  parent_hash TEXT NOT NULL,
  block_type TEXT NOT NULL, -- 'retrieval' | 'embedding' | 'feedback' | 'summary'
  row_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### **`env_retrieval_log`**
Search query history:
```sql
CREATE TABLE env_retrieval_log (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  ts TEXT NOT NULL,
  query_text TEXT NOT NULL,
  query_type TEXT NOT NULL, -- 'fts' | 'vector' | 'hybrid' | 'graph'
  top_docs TEXT, -- JSON array
  hit_count INTEGER NOT NULL,
  parent_hash TEXT NOT NULL
);
```

#### **`env_feedback`**
User feedback signals:
```sql
CREATE TABLE env_feedback (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  retrieval_id TEXT,
  rating INTEGER NOT NULL, -- -1 | 0 | 1
  notes TEXT,
  created_at TEXT NOT NULL,
  parent_hash TEXT NOT NULL
);
```

#### **`env_embeddings`**
Contextual runtime embeddings:
```sql
CREATE TABLE env_embeddings (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  source TEXT NOT NULL,
  vector BLOB NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL,
  parent_hash TEXT NOT NULL
);
```

#### **`env_context_summaries`**
LLM-generated summaries:
```sql
CREATE TABLE env_context_summaries (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  summary TEXT NOT NULL,
  relevance REAL NOT NULL,
  source_retrievals TEXT,
  created_at TEXT NOT NULL,
  parent_hash TEXT NOT NULL
);
```

---

## 📤 Export from MemGlyph PWA

### Browser Export

1. Open a GlyphCase in Dynamic mode
2. Click the **🧠 Dynamic** modality badge
3. Select **📦 Export Envelope**
4. Save the `.db` file (e.g., `envelope_1673456789.db`)

### What You Get

- **SQLite database file** with all envelope tables
- **Hash-chained integrity** for verification
- **Linked to Core capsule** via `gcase_id`
- **Standalone file** ready for processing

---

## ✅ Envelope Validation

### Verify Integrity

Before reminting, always verify the envelope's hash chain:

```python
import sqlite3
import hashlib
import json

def verify_envelope(db_path):
    """Verify envelope hash chain integrity"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Get chain blocks in order
    cursor.execute("""
        SELECT seq, block_hash, parent_hash, block_type
        FROM _env_chain
        ORDER BY seq ASC
    """)

    blocks = cursor.fetchall()
    errors = []

    # Verify linkage
    for i in range(1, len(blocks)):
        current = blocks[i]
        previous = blocks[i-1]

        if current[2] != previous[1]:  # current.parent_hash != previous.block_hash
            errors.append(
                f"Chain break at seq {current[0]}: "
                f"parent_hash {current[2]} != previous block_hash {previous[1]}"
            )

    conn.close()

    return {
        'valid': len(errors) == 0,
        'length': len(blocks),
        'errors': errors
    }

# Usage
result = verify_envelope('envelope_1673456789.db')
if result['valid']:
    print(f"✅ Envelope valid: {result['length']} blocks")
else:
    print(f"❌ Envelope invalid:")
    for error in result['errors']:
        print(f"  - {error}")
```

### Check Metadata

```python
def get_envelope_meta(db_path):
    """Get envelope metadata"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("SELECT key, value FROM _envelope_meta")
    meta = dict(cursor.fetchall())

    conn.close()
    return meta

meta = get_envelope_meta('envelope_1673456789.db')
print(f"Envelope for GCase: {meta['gcase_id']}")
print(f"Created: {meta['created_at']}")
print(f"Format: {meta['format_version']}")
```

---

## 🔄 Remint Process

### Conceptual Steps

1. **Collect** - Load and validate envelope
2. **Review** - Analyze data for merge
3. **Fold** - Merge into Core tables
4. **Seal** - Archive consumed envelope
5. **Reissue** - Increment version, sign root

### Example: Merge High-Quality Embeddings

```python
def remint_embeddings(core_db, envelope_db, min_quality=0.7):
    """
    Merge high-quality embeddings from Envelope to Core
    """
    import sqlite3

    # Connect to both databases
    core_conn = sqlite3.connect(core_db)
    env_conn = sqlite3.connect(envelope_db)

    # Find high-quality embeddings
    # (e.g., from queries with positive feedback)
    env_cursor = env_conn.cursor()
    env_cursor.execute("""
        SELECT DISTINCT e.id, e.source, e.vector, e.metadata
        FROM env_embeddings e
        JOIN env_feedback f ON f.retrieval_id LIKE '%' || e.source || '%'
        WHERE f.rating = 1
        AND json_extract(e.metadata, '$.quality') >= ?
    """, (min_quality,))

    embeddings = env_cursor.fetchall()

    # Insert into Core (if vectors table exists)
    core_cursor = core_conn.cursor()

    # Check if core has vector support
    core_cursor.execute("""
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='vectors'
    """)

    if core_cursor.fetchone():
        for emb_id, source, vector, metadata in embeddings:
            # Insert into core_vectors with provenance
            core_cursor.execute("""
                INSERT INTO vectors (id, embedding, metadata)
                VALUES (?, ?, json_set(?, '$.from_envelope', true))
            """, (emb_id, vector, metadata))

        core_conn.commit()
        print(f"✅ Merged {len(embeddings)} embeddings into Core")

    env_conn.close()
    core_conn.close()

    return len(embeddings)
```

### Example: Generate FTS Improvements

```python
def analyze_search_patterns(envelope_db):
    """
    Analyze search patterns to suggest FTS improvements
    """
    conn = sqlite3.connect(envelope_db)
    cursor = conn.cursor()

    # Find frequently searched terms with low hit counts
    cursor.execute("""
        SELECT query_text, AVG(hit_count) as avg_hits, COUNT(*) as frequency
        FROM env_retrieval_log
        WHERE query_type = 'fts'
        GROUP BY query_text
        HAVING frequency > 3 AND avg_hits < 2
        ORDER BY frequency DESC
        LIMIT 20
    """)

    low_recall_queries = cursor.fetchall()

    # Find high-feedback queries
    cursor.execute("""
        SELECT r.query_text, AVG(f.rating) as avg_rating, COUNT(f.id) as feedback_count
        FROM env_retrieval_log r
        JOIN env_feedback f ON f.retrieval_id = r.id
        GROUP BY r.query_text
        HAVING feedback_count >= 2
        ORDER BY avg_rating DESC
        LIMIT 20
    """)

    high_feedback_queries = cursor.fetchall()

    conn.close()

    return {
        'low_recall': low_recall_queries,
        'high_feedback': high_feedback_queries
    }

# Usage
insights = analyze_search_patterns('envelope_1673456789.db')
print("Queries with low recall (may need synonyms or stemming):")
for query, avg_hits, freq in insights['low_recall']:
    print(f"  - '{query}' (searched {freq}x, avg {avg_hits:.1f} results)")
```

---

## 🐍 Python Example Tool

### Complete Remint Script

```python
#!/usr/bin/env python3
"""
GlyphCase Remint Tool
Validates and merges Envelope data into Core
"""

import sqlite3
import argparse
import hashlib
import json
from datetime import datetime

class GlyphCaseRemint:
    def __init__(self, core_path, envelope_path):
        self.core_path = core_path
        self.envelope_path = envelope_path

    def verify_envelope(self):
        """Verify hash chain integrity"""
        conn = sqlite3.connect(self.envelope_path)
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) FROM _env_chain")
        chain_length = cursor.fetchone()[0]

        cursor.execute("""
            SELECT seq, block_hash, parent_hash
            FROM _env_chain
            ORDER BY seq ASC
        """)

        blocks = cursor.fetchall()
        for i in range(1, len(blocks)):
            if blocks[i][2] != blocks[i-1][1]:
                conn.close()
                return False, f"Chain break at seq {blocks[i][0]}"

        conn.close()
        return True, f"Valid chain with {chain_length} blocks"

    def get_stats(self):
        """Get envelope statistics"""
        conn = sqlite3.connect(self.envelope_path)
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM v_envelope_stats")
        row = cursor.fetchone()

        stats = {
            'retrievals': row[0],
            'embeddings': row[1],
            'feedbacks': row[2],
            'summaries': row[3],
            'chain_length': row[4],
            'first_activity': row[5],
            'last_activity': row[6]
        }

        conn.close()
        return stats

    def merge_feedback_insights(self):
        """Example: Merge feedback-validated content"""
        env_conn = sqlite3.connect(self.envelope_path)
        core_conn = sqlite3.connect(self.core_path)

        # Find highly-rated queries
        env_cursor = env_conn.cursor()
        env_cursor.execute("""
            SELECT r.query_text, r.top_docs, AVG(f.rating) as avg_rating
            FROM env_retrieval_log r
            JOIN env_feedback f ON f.retrieval_id = r.id
            GROUP BY r.query_text
            HAVING avg_rating >= 0.5
        """)

        validated_queries = env_cursor.fetchall()

        # Could be used to improve search relevance, add to training data, etc.
        print(f"Found {len(validated_queries)} validated search patterns")

        env_conn.close()
        core_conn.close()

        return len(validated_queries)

    def run(self):
        """Execute remint process"""
        print("🔄 GlyphCase Remint Tool")
        print(f"Core: {self.core_path}")
        print(f"Envelope: {self.envelope_path}")
        print()

        # Step 1: Verify
        print("📋 Step 1: Verify Envelope Integrity")
        valid, msg = self.verify_envelope()
        if not valid:
            print(f"❌ FAILED: {msg}")
            return False
        print(f"✅ {msg}")
        print()

        # Step 2: Stats
        print("📊 Step 2: Envelope Statistics")
        stats = self.get_stats()
        for key, value in stats.items():
            print(f"  {key}: {value}")
        print()

        # Step 3: Merge (example)
        print("🔀 Step 3: Merge Validated Data")
        merged = self.merge_feedback_insights()
        print(f"✅ Processed {merged} items")
        print()

        print("✨ Remint complete!")
        return True

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='GlyphCase Remint Tool')
    parser.add_argument('core', help='Path to Core GlyphCase (.gcase file)')
    parser.add_argument('envelope', help='Path to Envelope database (.db file)')

    args = parser.parse_args()

    remint = GlyphCaseRemint(args.core, args.envelope)
    remint.run()
```

### Usage

```bash
# Verify and merge
python remint_tool.py core_capsule.gcase envelope_1673456789.db

# Output:
# 🔄 GlyphCase Remint Tool
# Core: core_capsule.gcase
# Envelope: envelope_1673456789.db
#
# 📋 Step 1: Verify Envelope Integrity
# ✅ Valid chain with 47 blocks
#
# 📊 Step 2: Envelope Statistics
#   retrievals: 34
#   embeddings: 0
#   feedbacks: 12
#   summaries: 0
#   chain_length: 47
#   ...
#
# 🔀 Step 3: Merge Validated Data
# ✅ Processed 8 items
#
# ✨ Remint complete!
```

---

## 🎯 Best Practices

### 1. Always Verify First

```bash
# Never skip verification
python -c "from remint_tool import GlyphCaseRemint; \
    r = GlyphCaseRemint('core.gcase', 'env.db'); \
    print(r.verify_envelope())"
```

### 2. Backup Before Merge

```bash
# Create backups
cp core_capsule.gcase core_capsule.gcase.backup
cp envelope.db envelope.db.backup
```

### 3. Review Before Remint

- **Manual review** for sensitive data
- **Automated checks** for data quality
- **Feedback analysis** to identify valuable patterns

### 4. Incremental Merging

- Don't merge everything at once
- Start with high-confidence data
- Iterate based on results

### 5. Version Control

- Track remint history
- Document merge decisions
- Maintain lineage records

### 6. Seal Consumed Envelopes

After remint, archive the envelope:

```bash
# Move to archive
mkdir -p envelopes/sealed/
mv envelope_1673456789.db envelopes/sealed/envelope_v2_merged.db
```

---

## 🔗 Related Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment guide with security headers
- [GCUI_SPEC_v1.0.md](GCUI_SPEC_v1.0.md) - GlyphCase UI specification
- [README.md](../README.md) - MemGlyph overview

---

## 📧 Support

For questions about reminting:
1. Check envelope integrity first
2. Review this documentation
3. Open an issue on GitHub with:
   - Envelope metadata (gcase_id, format_version)
   - Error messages or verification results
   - What you're trying to merge

---

**Happy Reminting! 🚀**
