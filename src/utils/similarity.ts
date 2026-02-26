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
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }
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
