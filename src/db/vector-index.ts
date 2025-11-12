/**
 * In-Memory Vector Index for Fast ANN Search
 *
 * Implements a simple but effective approximate nearest neighbor search
 * using a hierarchical k-means clustering approach.
 *
 * Performance: O(sqrt(n)) query time vs O(n) brute force
 */

export interface VectorEntry {
  gid: string;
  vector: Float32Array;
  metadata?: {
    pageNo: number;
    title: string | null;
  };
}

export interface SearchResult {
  gid: string;
  similarity: number;
  metadata?: {
    pageNo: number;
    title: string | null;
  };
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * K-means clustering for building index structure
 */
class Cluster {
  centroid: Float32Array;
  entries: VectorEntry[];

  constructor(centroid: Float32Array) {
    this.centroid = centroid;
    this.entries = [];
  }

  addEntry(entry: VectorEntry) {
    this.entries.push(entry);
  }

  updateCentroid() {
    if (this.entries.length === 0) return;

    const dim = this.centroid.length;
    const newCentroid = new Float32Array(dim);

    for (const entry of this.entries) {
      for (let i = 0; i < dim; i++) {
        newCentroid[i] += entry.vector[i];
      }
    }

    for (let i = 0; i < dim; i++) {
      newCentroid[i] /= this.entries.length;
    }

    this.centroid = newCentroid;
  }
}

/**
 * Vector Index using hierarchical k-means clustering
 */
export class VectorIndex {
  private clusters: Cluster[] = [];
  private allEntries: VectorEntry[] = [];
  private dimension: number = 0;
  private numClusters: number;

  constructor(numClusters: number = 100) {
    this.numClusters = numClusters;
  }

  /**
   * Build index from vectors
   */
  async build(entries: VectorEntry[]): Promise<void> {
    if (entries.length === 0) return;

    this.allEntries = entries;
    this.dimension = entries[0].vector.length;

    // For small datasets, skip clustering
    if (entries.length < 100) {
      console.log('[VectorIndex] Small dataset, using brute force');
      return;
    }

    const startTime = performance.now();

    // Determine optimal number of clusters (sqrt of dataset size)
    const optimalClusters = Math.max(10, Math.min(this.numClusters, Math.ceil(Math.sqrt(entries.length))));

    // Initialize clusters with random entries as centroids
    const clusterIndices = new Set<number>();
    while (clusterIndices.size < optimalClusters) {
      clusterIndices.add(Math.floor(Math.random() * entries.length));
    }

    this.clusters = Array.from(clusterIndices).map(idx =>
      new Cluster(Float32Array.from(entries[idx].vector))
    );

    // K-means clustering (max 10 iterations)
    for (let iter = 0; iter < 10; iter++) {
      // Clear cluster assignments
      for (const cluster of this.clusters) {
        cluster.entries = [];
      }

      // Assign entries to nearest cluster
      for (const entry of entries) {
        let bestCluster = this.clusters[0];
        let bestSimilarity = -1;

        for (const cluster of this.clusters) {
          const similarity = cosineSimilarity(entry.vector, cluster.centroid);
          if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestCluster = cluster;
          }
        }

        bestCluster.addEntry(entry);
      }

      // Update centroids
      for (const cluster of this.clusters) {
        cluster.updateCentroid();
      }
    }

    const buildTime = performance.now() - startTime;
    console.log(`[VectorIndex] Built index with ${this.clusters.length} clusters in ${buildTime.toFixed(1)}ms`);
    console.log(`[VectorIndex] Average cluster size: ${(entries.length / this.clusters.length).toFixed(1)}`);
  }

  /**
   * Search for nearest neighbors
   */
  search(queryVector: Float32Array, k: number = 20): SearchResult[] {
    if (this.allEntries.length === 0) {
      return [];
    }

    const startTime = performance.now();

    // For small datasets or if no clusters, use brute force
    if (this.clusters.length === 0 || this.allEntries.length < 100) {
      const results = this.bruteForceSearch(queryVector, k);
      const searchTime = performance.now() - startTime;
      console.log(`[VectorIndex] Brute force search: ${searchTime.toFixed(2)}ms`);
      return results;
    }

    // Find top clusters by centroid similarity
    const topClusters = Math.max(3, Math.ceil(this.clusters.length * 0.2)); // Search top 20% of clusters
    const clusterScores = this.clusters.map((cluster, idx) => ({
      cluster,
      similarity: cosineSimilarity(queryVector, cluster.centroid),
      idx
    }));

    clusterScores.sort((a, b) => b.similarity - a.similarity);

    // Search entries in top clusters
    const candidates: SearchResult[] = [];
    let entriesScanned = 0;

    for (let i = 0; i < topClusters && i < clusterScores.length; i++) {
      const cluster = clusterScores[i].cluster;

      for (const entry of cluster.entries) {
        const similarity = cosineSimilarity(queryVector, entry.vector);
        candidates.push({
          gid: entry.gid,
          similarity,
          metadata: entry.metadata
        });
        entriesScanned++;
      }
    }

    // Sort by similarity and take top k
    candidates.sort((a, b) => b.similarity - a.similarity);
    const results = candidates.slice(0, k);

    const searchTime = performance.now() - startTime;
    console.log(`[VectorIndex] ANN search: ${searchTime.toFixed(2)}ms (scanned ${entriesScanned}/${this.allEntries.length} entries)`);

    return results;
  }

  /**
   * Brute force search (exact results)
   */
  private bruteForceSearch(queryVector: Float32Array, k: number): SearchResult[] {
    const results: SearchResult[] = [];

    for (const entry of this.allEntries) {
      const similarity = cosineSimilarity(queryVector, entry.vector);
      results.push({
        gid: entry.gid,
        similarity,
        metadata: entry.metadata
      });
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, k);
  }

  /**
   * Get index statistics
   */
  getStats() {
    return {
      totalEntries: this.allEntries.length,
      numClusters: this.clusters.length,
      dimension: this.dimension,
      avgClusterSize: this.clusters.length > 0
        ? (this.allEntries.length / this.clusters.length).toFixed(1)
        : 0
    };
  }

  /**
   * Clear index
   */
  clear() {
    this.clusters = [];
    this.allEntries = [];
    this.dimension = 0;
  }
}
