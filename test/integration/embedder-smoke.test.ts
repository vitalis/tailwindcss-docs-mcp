import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/utils/config.js";

/**
 * Smoke tests for the real ONNX embedder.
 *
 * Gated behind RUN_ONNX_TESTS=1 to avoid downloading the ~27 MB model
 * on every CI run. Run manually with: RUN_ONNX_TESTS=1 bun test test/integration/embedder-smoke
 */
describe.skipIf(!process.env.RUN_ONNX_TESTS)("Real Embedder (ONNX)", () => {
  it("loads the model and produces correct-dimension vectors", async () => {
    const { createEmbedder } = await import("../../src/pipeline/embedder.js");
    const config = loadConfig();
    const embedder = await createEmbedder(config);

    expect(embedder.isReady()).toBe(true);

    const vector = await embedder.embed("Tailwind CSS padding utility");
    expect(vector).toBeInstanceOf(Float32Array);
    expect(vector.length).toBe(config.embeddingDimensions);

    // Vector should be L2-normalized (magnitude ~1.0)
    let mag = 0;
    for (let i = 0; i < vector.length; i++) {
      mag += vector[i] * vector[i];
    }
    expect(Math.sqrt(mag)).toBeCloseTo(1.0, 3);
  });

  it("produces different vectors for different inputs", async () => {
    const { createEmbedder } = await import("../../src/pipeline/embedder.js");
    const config = loadConfig();
    const embedder = await createEmbedder(config);

    const v1 = await embedder.embed("padding");
    const v2 = await embedder.embed("dark mode configuration");

    // Vectors should not be identical
    let allSame = true;
    for (let i = 0; i < v1.length; i++) {
      if (Math.abs(v1[i] - v2[i]) > 1e-6) {
        allSame = false;
        break;
      }
    }
    expect(allSame).toBe(false);
  });

  it("applies query prefix when isQuery is true", async () => {
    const { createEmbedder } = await import("../../src/pipeline/embedder.js");
    const config = loadConfig();
    const embedder = await createEmbedder(config);

    const docVector = await embedder.embed("padding utilities");
    const queryVector = await embedder.embed("padding utilities", {
      isQuery: true,
    });

    // Same text with and without query prefix should produce different vectors
    let allSame = true;
    for (let i = 0; i < docVector.length; i++) {
      if (Math.abs(docVector[i] - queryVector[i]) > 1e-6) {
        allSame = false;
        break;
      }
    }
    expect(allSame).toBe(false);
  });

  it("embedBatch returns correct number of vectors", async () => {
    const { createEmbedder } = await import("../../src/pipeline/embedder.js");
    const config = loadConfig();
    const embedder = await createEmbedder(config);

    const texts = ["padding", "margin", "grid"];
    const vectors = await embedder.embedBatch(texts);

    expect(vectors).toHaveLength(3);
    for (const v of vectors) {
      expect(v).toBeInstanceOf(Float32Array);
      expect(v.length).toBe(config.embeddingDimensions);
    }
  });
});
