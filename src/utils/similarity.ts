/**
 * Compute cosine similarity between two vectors.
 *
 * Returns a value in [-1, 1] where:
 * - 1.0 means identical direction
 * - 0.0 means orthogonal (no similarity)
 * - -1.0 means opposite direction
 *
 * Returns 0 if either vector has zero magnitude.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  if (magnitude === 0) return 0;
  return dot / magnitude;
}

/**
 * Rank an array of items by cosine similarity to a query vector.
 *
 * Returns items sorted by descending similarity score, each paired with its score.
 */
export function rankBySimilarity<T>(
  queryEmbedding: Float32Array,
  items: T[],
  getEmbedding: (item: T) => Float32Array,
): Array<{ item: T; score: number }> {
  return items
    .map((item) => ({
      item,
      score: cosineSimilarity(queryEmbedding, getEmbedding(item)),
    }))
    .sort((a, b) => b.score - a.score);
}
