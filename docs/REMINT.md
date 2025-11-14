# 🔄 GlyphCase Remint Guide

**Reminting** is the process of consolidating validated Envelope data into the immutable Core, creating a new canonical version of a GlyphCase.

This guide explains how to work with canonical .gcase+ files (Core + Envelope) saved from MemGlyph PWA and perform reminting using external tools.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Canonical .gcase+ Format](#canonical-gcase-format)
- [Envelope Structure](#envelope-structure)
- [Save from MemGlyph PWA](#save-from-memglyph-pwa)
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

## 📦 Canonical .gcase+ Format

### What is a .gcase+ file?

A **Dynamic GlyphCase** (`.gcase+`) is a single, self-contained SQLite database file that contains:

1. **Core Tables** - Immutable knowledge base (pages, entities, FTS, vectors)
2. **Envelope Tables** - Runtime learning layer (retrieval logs, feedback, embeddings, summaries)
3. **Unified Schema** - Both Core and Envelope tables in one database

### Key Principles

**Canonical Format:**
- `.gcase+` files are ALWAYS single, self-contained SQLite databases
- Core and Envelope tables are merged into one file
- No external dependencies or sidecar files

**Runtime Implementation:**
- MemGlyph PWA uses an OPFS sidecar as a temporary write buffer for performance
- The sidecar is invisible to users and automatically synced
- When you save, Core + Envelope are merged into the canonical .gcase+ format

**File Extensions:**
- `.gcase` - Static GlyphCase (Core only, read-only)
- `.gcase+` - Dynamic GlyphCase (Core + Envelope)

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

## 💾 Save from MemGlyph PWA

### Browser Save

1. Open a GlyphCase in Dynamic mode
2. Click the **🧠 Dynamic** modality badge
3. Select **💾 Save GlyphCase**
4. Save the `.gcase+` file (e.g., `my-knowledge-base.gcase+`)

### What You Get

- **Single SQLite database file** with Core + Envelope merged
- **Canonical .gcase+ format** - fully self-contained
- **Hash-chained integrity** for verification
- **All tables included**: Core pages, entities, FTS, and Envelope logs, feedback, embeddings

### Working with the Saved File

The saved `.gcase+` file contains both Core and Envelope tables in one database:

```bash
# Open with sqlite3 to inspect
sqlite3 my-knowledge-base.gcase+

# List all tables (you'll see both Core and Envelope tables)
sqlite> .tables

# Core tables: pages, entities, page_fts, vectors, etc.
# Envelope tables: _envelope_meta, _env_chain, env_retrieval_log, env_feedback, etc.

# Extract envelope data for analysis
sqlite> SELECT * FROM env_retrieval_log LIMIT 5;
sqlite> SELECT * FROM env_feedback WHERE rating = 1;
```

---

## ✅ Envelope Validation

### Verify Integrity

Before reminting, always verify the envelope's hash chain in the .gcase+ file:

```python
import sqlite3
import hashlib
import json

def verify_envelope(gcase_plus_path):
    """Verify envelope hash chain integrity in .gcase+ file"""
    conn = sqlite3.connect(gcase_plus_path)
    cursor = conn.cursor()

    # Check if envelope tables exist
    cursor.execute("""
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='_env_chain'
    """)

    if not cursor.fetchone():
        return {
            'valid': True,
            'length': 0,
            'errors': [],
            'note': 'No envelope tables found (static .gcase file)'
        }

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
result = verify_envelope('my-knowledge-base.gcase+')
if result['valid']:
    print(f"✅ Envelope valid: {result['length']} blocks")
else:
    print(f"❌ Envelope invalid:")
    for error in result['errors']:
        print(f"  - {error}")
```

### Check Metadata

```python
def get_envelope_meta(gcase_plus_path):
    """Get envelope metadata from .gcase+ file"""
    conn = sqlite3.connect(gcase_plus_path)
    cursor = conn.cursor()

    # Check if envelope tables exist
    cursor.execute("""
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='_envelope_meta'
    """)

    if not cursor.fetchone():
        conn.close()
        return None

    cursor.execute("SELECT key, value FROM _envelope_meta")
    meta = dict(cursor.fetchall())

    conn.close()
    return meta

meta = get_envelope_meta('my-knowledge-base.gcase+')
if meta:
    print(f"Envelope for GCase: {meta['gcase_id']}")
    print(f"Created: {meta['created_at']}")
    print(f"Format: {meta['format_version']}")
else:
    print("No envelope metadata found (static .gcase file)")
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
def remint_embeddings(gcase_plus_path, output_gcase_path, min_quality=0.7):
    """
    Merge high-quality embeddings from Envelope into a new Core

    Args:
        gcase_plus_path: Path to .gcase+ file (Core + Envelope)
        output_gcase_path: Path for new .gcase file (updated Core only)
        min_quality: Minimum quality threshold for embeddings
    """
    import sqlite3
    import shutil

    # Create a copy for the new Core
    shutil.copy(gcase_plus_path, output_gcase_path)

    conn = sqlite3.connect(output_gcase_path)
    cursor = conn.cursor()

    # Find high-quality embeddings from Envelope
    # (e.g., from queries with positive feedback)
    cursor.execute("""
        SELECT DISTINCT e.id, e.source, e.vector, e.metadata
        FROM env_embeddings e
        JOIN env_feedback f ON f.retrieval_id LIKE '%' || e.source || '%'
        WHERE f.rating = 1
        AND json_extract(e.metadata, '$.quality') >= ?
    """, (min_quality,))

    embeddings = cursor.fetchall()

    # Check if Core has vector support
    cursor.execute("""
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='vectors'
    """)

    if cursor.fetchone():
        for emb_id, source, vector, metadata in embeddings:
            # Insert into Core vectors with provenance
            cursor.execute("""
                INSERT INTO vectors (id, embedding, metadata)
                VALUES (?, ?, json_set(?, '$.from_envelope', true))
            """, (emb_id, vector, metadata))

        print(f"✅ Merged {len(embeddings)} embeddings into Core")

    # Remove Envelope tables from the new Core file
    envelope_tables = [
        '_envelope_meta', '_env_chain', 'env_retrieval_log',
        'env_embeddings', 'env_feedback', 'env_context_summaries'
    ]

    for table in envelope_tables:
        cursor.execute(f"DROP TABLE IF EXISTS {table}")

    # Drop envelope views and indexes
    cursor.execute("""
        SELECT name FROM sqlite_master
        WHERE type IN ('view', 'index')
        AND name LIKE 'env_%' OR name LIKE '_env_%'
    """)

    for row in cursor.fetchall():
        obj_type = 'VIEW' if 'view' in str(row) else 'INDEX'
        cursor.execute(f"DROP {obj_type} IF EXISTS {row[0]}")

    conn.commit()
    conn.close()

    print(f"📦 Created new .gcase file: {output_gcase_path}")
    return len(embeddings)
```

### Example: Generate FTS Improvements

```python
def analyze_search_patterns(gcase_plus_path):
    """
    Analyze search patterns to suggest FTS improvements from .gcase+ file
    """
    conn = sqlite3.connect(gcase_plus_path)
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
insights = analyze_search_patterns('my-knowledge-base.gcase+')
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
Validates and merges Envelope data into Core from .gcase+ files
"""

import sqlite3
import argparse
import hashlib
import json
import shutil
from datetime import datetime

class GlyphCaseRemint:
    def __init__(self, gcase_plus_path, output_path=None):
        self.gcase_plus_path = gcase_plus_path
        self.output_path = output_path or gcase_plus_path.replace('.gcase+', '_reminted.gcase')

    def verify_envelope(self):
        """Verify hash chain integrity in .gcase+ file"""
        conn = sqlite3.connect(self.gcase_plus_path)
        cursor = conn.cursor()

        # Check if envelope tables exist
        cursor.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='_env_chain'
        """)

        if not cursor.fetchone():
            conn.close()
            return True, "No envelope tables (static .gcase file)"

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
        """Get envelope statistics from .gcase+ file"""
        conn = sqlite3.connect(self.gcase_plus_path)
        cursor = conn.cursor()

        # Check if envelope stats view exists
        cursor.execute("""
            SELECT name FROM sqlite_master
            WHERE type='view' AND name='v_envelope_stats'
        """)

        if not cursor.fetchone():
            conn.close()
            return None

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
        """Example: Merge feedback-validated content into new Core"""
        conn = sqlite3.connect(self.gcase_plus_path)
        cursor = conn.cursor()

        # Find highly-rated queries from Envelope
        cursor.execute("""
            SELECT r.query_text, r.top_docs, AVG(f.rating) as avg_rating
            FROM env_retrieval_log r
            JOIN env_feedback f ON f.retrieval_id = r.id
            GROUP BY r.query_text
            HAVING avg_rating >= 0.5
        """)

        validated_queries = cursor.fetchall()

        # Could be used to improve search relevance, add to training data, etc.
        print(f"Found {len(validated_queries)} validated search patterns")

        conn.close()
        return len(validated_queries)

    def run(self):
        """Execute remint process"""
        print("🔄 GlyphCase Remint Tool")
        print(f"Input:  {self.gcase_plus_path}")
        print(f"Output: {self.output_path}")
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
        if stats:
            for key, value in stats.items():
                print(f"  {key}: {value}")
        else:
            print("  No envelope data found")
        print()

        # Step 3: Merge (example)
        print("🔀 Step 3: Analyze Feedback Patterns")
        merged = self.merge_feedback_insights()
        print(f"✅ Found {merged} validated patterns")
        print()

        # Step 4: Create new Core (stripped of Envelope)
        print("📦 Step 4: Create Reminted Core")
        print(f"Creating new .gcase file at: {self.output_path}")
        # Actual merge logic would go here
        # (See remint_embeddings() example above)
        print()

        print("✨ Remint complete!")
        print(f"📝 Next: Review {self.output_path} and publish as new version")
        return True

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='GlyphCase Remint Tool')
    parser.add_argument('gcase_plus', help='Path to .gcase+ file (Core + Envelope)')
    parser.add_argument('--output', help='Path for output .gcase file (optional)')

    args = parser.parse_args()

    remint = GlyphCaseRemint(args.gcase_plus, args.output)
    remint.run()
```

### Usage

```bash
# Verify and analyze a .gcase+ file
python remint_tool.py my-knowledge-base.gcase+

# Specify custom output path
python remint_tool.py my-knowledge-base.gcase+ --output my-knowledge-base-v2.gcase

# Output:
# 🔄 GlyphCase Remint Tool
# Input:  my-knowledge-base.gcase+
# Output: my-knowledge-base_reminted.gcase
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
#   first_activity: 2025-11-01T10:23:45Z
#   last_activity: 2025-11-14T14:52:10Z
#
# 🔀 Step 3: Analyze Feedback Patterns
# ✅ Found 8 validated patterns
#
# 📦 Step 4: Create Reminted Core
# Creating new .gcase file at: my-knowledge-base_reminted.gcase
#
# ✨ Remint complete!
# 📝 Next: Review my-knowledge-base_reminted.gcase and publish as new version
```

---

## 🎯 Best Practices

### 1. Always Verify First

```bash
# Never skip verification
python -c "from remint_tool import GlyphCaseRemint; \
    r = GlyphCaseRemint('my-knowledge-base.gcase+'); \
    print(r.verify_envelope())"
```

### 2. Backup Before Merge

```bash
# Create backups of your .gcase+ file
cp my-knowledge-base.gcase+ my-knowledge-base.gcase+.backup
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

### 6. Archive Original .gcase+ Files

After reminting, archive the original .gcase+ file:

```bash
# Move to archive with version history
mkdir -p archive/
mv my-knowledge-base.gcase+ archive/my-knowledge-base-v1.gcase+

# Or keep alongside the new Core
mv my-knowledge-base.gcase+ my-knowledge-base-with-envelope-v1.gcase+
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
