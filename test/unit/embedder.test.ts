import { describe, it, expect } from "vitest";
import { buildEmbeddingInput } from "../../src/pipeline/embedder.js";

describe("Embedder", () => {
  describe("buildEmbeddingInput", () => {
    it("prepends doc title and heading to content", () => {
      // TODO: implement
      // Should combine: "Tailwind CSS: {docTitle}\n\n{heading}\n\n{content}"
    });
  });

  describe("embed", () => {
    it("generates 384-dim vectors", () => {
      // TODO: implement
      // Output is a Float32Array of length 384
    });

    it("produces deterministic output", () => {
      // TODO: implement
      // Same input text always produces the same embedding
    });

    it("prepends query prefix for search", () => {
      // TODO: implement
      // Query strings get "Represent this sentence for searching relevant passages: " prepended
    });

    it("does not prepend prefix for documents", () => {
      // TODO: implement
      // Document chunks are embedded without the query prefix
    });

    it("handles empty strings", () => {
      // TODO: implement
      // Returns a valid vector (not NaN, not error)
    });

    it("handles long text (>512 tokens)", () => {
      // TODO: implement
      // Truncates gracefully, returns valid vector
    });
  });

  describe("embedBatch", () => {
    it("embeds multiple texts in one call", () => {
      // TODO: implement
      // Multiple texts embedded in one call produce correct-length results
    });
  });
});
