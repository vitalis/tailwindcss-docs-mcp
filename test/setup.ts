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
import { normalize } from "../src/pipeline/embedder.js";

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
  /** Tracks the options passed to each embed() call (for verifying isQuery usage). */
  const calls: {
    text: string;
    options?: import("../src/pipeline/embedder.js").EmbedOptions;
  }[] = [];

  const embedder = {
    /** Access recorded embed() calls for test assertions. */
    get calls() {
      return calls;
    },

    /** Reset recorded calls for test isolation. */
    clearCalls() {
      calls.length = 0;
    },

    async embed(
      text: string,
      _options?: import("../src/pipeline/embedder.js").EmbedOptions,
    ): Promise<Float32Array> {
      calls.push({ text, options: _options });
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
      return normalize(vector);
    },

    async embedBatch(texts: string[]): Promise<Float32Array[]> {
      return Promise.all(texts.map((t) => this.embed(t)));
    },

    isReady(): boolean {
      return true;
    },
  };

  return embedder;
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
  // biome-ignore lint/performance/noDelete: must truly unset env var, not set to "undefined"
  delete process.env.TAILWIND_DOCS_MCP_PATH;
});
