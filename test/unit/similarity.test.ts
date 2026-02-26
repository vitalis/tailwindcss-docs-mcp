import { describe, expect, it } from "vitest";
import { cosineSimilarity } from "../../src/utils/similarity.js";

describe("Cosine Similarity", () => {
  describe("cosineSimilarity", () => {
    it("returns 1.0 for identical vectors", () => {
      const a = new Float32Array([1, 0, 0]);
      expect(cosineSimilarity(a, a)).toBeCloseTo(1.0, 6);
    });

    it("returns 0.0 for orthogonal vectors", () => {
      const a = new Float32Array([1, 0, 0]);
      const b = new Float32Array([0, 1, 0]);
      expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 6);
    });

    it("returns -1.0 for opposite vectors", () => {
      const a = new Float32Array([1, 0]);
      const b = new Float32Array([-1, 0]);
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 6);
    });

    it("handles zero vectors", () => {
      const zero = new Float32Array([0, 0, 0]);
      const nonZero = new Float32Array([1, 0, 0]);
      expect(cosineSimilarity(zero, nonZero)).toBe(0);
      expect(cosineSimilarity(zero, zero)).toBe(0);
    });

    it("handles high-dimensional vectors (384-dim)", () => {
      const a = new Float32Array(384);
      const b = new Float32Array(384);
      for (let i = 0; i < 384; i++) {
        a[i] = Math.sin(i);
        b[i] = Math.sin(i);
      }
      expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
    });

    it("maintains float precision within epsilon", () => {
      const a = new Float32Array([0.1, 0.2, 0.3]);
      const b = new Float32Array([0.4, 0.5, 0.6]);
      const result = cosineSimilarity(a, b);
      // Manual calculation: dot=0.32, magA=sqrt(0.14), magB=sqrt(0.77)
      const expected = 0.32 / (Math.sqrt(0.14) * Math.sqrt(0.77));
      expect(Math.abs(result - expected)).toBeLessThan(1e-5);
    });

    it("throws on mismatched vector lengths", () => {
      const a = new Float32Array([1, 0, 0]);
      const b = new Float32Array([1, 0]);
      expect(() => cosineSimilarity(a, b)).toThrow("Vector length mismatch");
    });
  });
});
