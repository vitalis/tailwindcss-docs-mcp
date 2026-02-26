import { describe, expect, it } from "vitest";
import { buildEmbeddingInput } from "../../src/pipeline/embedder.js";
import { createMockEmbedder } from "../setup.js";

describe("Embedder", () => {
  describe("buildEmbeddingInput", () => {
    it("prepends doc title and heading to content", () => {
      const result = buildEmbeddingInput(
        "Padding",
        "## Basic usage",
        "Use `p-*` utilities.",
      );
      expect(result).toBe(
        "Tailwind CSS: Padding\n\n## Basic usage\n\nUse `p-*` utilities.",
      );
    });

    it("handles empty heading", () => {
      const result = buildEmbeddingInput("Padding", "", "Content");
      expect(result).toBe("Tailwind CSS: Padding\n\n\n\nContent");
    });
  });

  describe("embed (mock)", () => {
    it("generates 384-dim vectors", async () => {
      const embedder = createMockEmbedder(384);
      const vec = await embedder.embed("test text");
      expect(vec).toBeInstanceOf(Float32Array);
      expect(vec.length).toBe(384);
    });

    it("produces deterministic output", async () => {
      const embedder = createMockEmbedder(384);
      const vec1 = await embedder.embed("same input");
      const vec2 = await embedder.embed("same input");
      expect(Array.from(vec1)).toEqual(Array.from(vec2));
    });

    it("produces different vectors for different inputs", async () => {
      const embedder = createMockEmbedder(384);
      const vec1 = await embedder.embed("input a");
      const vec2 = await embedder.embed("input b");
      expect(Array.from(vec1)).not.toEqual(Array.from(vec2));
    });

    it("handles empty strings", async () => {
      const embedder = createMockEmbedder(384);
      const vec = await embedder.embed("");
      expect(vec).toBeInstanceOf(Float32Array);
      expect(vec.length).toBe(384);
      // No NaN values
      for (let i = 0; i < vec.length; i++) {
        expect(Number.isNaN(vec[i])).toBe(false);
      }
    });

    it("handles long text", async () => {
      const embedder = createMockEmbedder(384);
      const longText = "word ".repeat(1000);
      const vec = await embedder.embed(longText);
      expect(vec).toBeInstanceOf(Float32Array);
      expect(vec.length).toBe(384);
    });

    it("returns unit vectors (normalized)", async () => {
      const embedder = createMockEmbedder(384);
      const vec = await embedder.embed("test");
      let magnitude = 0;
      for (let i = 0; i < vec.length; i++) {
        magnitude += vec[i] * vec[i];
      }
      magnitude = Math.sqrt(magnitude);
      expect(magnitude).toBeCloseTo(1.0, 4);
    });
  });

  describe("embedBatch (mock)", () => {
    it("embeds multiple texts in one call", async () => {
      const embedder = createMockEmbedder(384);
      const results = await embedder.embedBatch([
        "text one",
        "text two",
        "text three",
      ]);
      expect(results).toHaveLength(3);
      for (const vec of results) {
        expect(vec).toBeInstanceOf(Float32Array);
        expect(vec.length).toBe(384);
      }
    });

    it("produces same results as individual calls", async () => {
      const embedder = createMockEmbedder(384);
      const batch = await embedder.embedBatch(["a", "b"]);
      const individual1 = await embedder.embed("a");
      const individual2 = await embedder.embed("b");
      expect(Array.from(batch[0])).toEqual(Array.from(individual1));
      expect(Array.from(batch[1])).toEqual(Array.from(individual2));
    });
  });

  describe("isReady (mock)", () => {
    it("returns true", () => {
      const embedder = createMockEmbedder(384);
      expect(embedder.isReady()).toBe(true);
    });
  });
});
