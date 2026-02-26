/**
 * Shared test setup for vitest.
 *
 * Provides:
 * - Temporary database helpers (in-memory SQLite)
 * - Mock embedder (deterministic fake vectors for unit tests)
 * - Fixture loading utilities
 * - Common constants
 */

import { afterAll, beforeAll } from "vitest";

/**
 * Path to the MDX fixtures directory.
 */
export const FIXTURES_DIR = new URL("./fixtures/mdx", import.meta.url).pathname;

/**
 * Create a mock embedder that returns deterministic fake vectors.
 *
 * Used in unit tests to avoid downloading the real ONNX model.
 * Each unique input text produces a unique but deterministic vector.
 */
export function createMockEmbedder(dimensions = 384) {
  return {
    async embed(
      text: string,
      _options?: import("../src/pipeline/embedder.js").EmbedOptions,
    ): Promise<Float32Array> {
      // Generate a deterministic vector based on text hash
      const vector = new Float32Array(dimensions);
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        hash = (hash * 31 + text.charCodeAt(i)) | 0;
      }
      for (let i = 0; i < dimensions; i++) {
        hash = (hash * 1103515245 + 12345) | 0;
        vector[i] = (hash & 0x7fffffff) / 0x7fffffff;
      }
      // Normalize to unit vector
      let magnitude = 0;
      for (let i = 0; i < dimensions; i++) {
        magnitude += vector[i] * vector[i];
      }
      magnitude = Math.sqrt(magnitude);
      if (magnitude > 0) {
        for (let i = 0; i < dimensions; i++) {
          vector[i] /= magnitude;
        }
      }
      return vector;
    },

    async embedBatch(texts: string[]): Promise<Float32Array[]> {
      return Promise.all(texts.map((t) => this.embed(t)));
    },

    isReady(): boolean {
      return true;
    },
  };
}

/**
 * Global test setup.
 */
beforeAll(() => {
  // Set test environment variables
  process.env.TAILWIND_DOCS_MCP_PATH = "/tmp/tailwindcss-docs-mcp-test";
});

afterAll(() => {
  // Cleanup
  process.env.TAILWIND_DOCS_MCP_PATH = undefined;
});
