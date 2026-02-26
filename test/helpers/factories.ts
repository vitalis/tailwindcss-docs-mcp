import type { Chunk } from "../../src/pipeline/chunker.js";
import type { CleanDocument } from "../../src/pipeline/parser.js";
import type { Config } from "../../src/utils/config.js";

/** Minimal in-memory config for tests. Override any field via Partial<Config>. */
export function testConfig(overrides?: Partial<Config>): Config {
  const dataDir = overrides?.dataDir ?? "/tmp/test";
  return {
    dataDir,
    dbPath: ":memory:",
    rawDir: `${dataDir}/raw`,
    defaultVersion: "v3",
    embeddingModel: "test-model",
    embeddingDimensions: 384,
    queryPrefix: "test: ",
    ...overrides,
  };
}

/** Factory for a test document. */
export function makeDoc(overrides?: Partial<CleanDocument>): CleanDocument {
  return {
    slug: "padding",
    title: "Padding",
    description: "Utilities for controlling padding.",
    content: "## Padding\n\nAdd padding to any element.",
    url: "https://tailwindcss.com/docs/padding",
    version: "v3",
    ...overrides,
  };
}

/** Factory for a test chunk. */
export function makeChunk(overrides?: Partial<Chunk>): Chunk {
  return {
    id: "abc123hash",
    docSlug: "padding",
    heading: "## Basic usage",
    content: "Use `p-4` for 1rem padding on all sides.",
    url: "https://tailwindcss.com/docs/padding#basic-usage",
    version: "v3",
    tokenCount: 12,
    ...overrides,
  };
}

/** Create a deterministic Float32Array from a seed. Optionally normalized to unit length. */
export function makeFakeEmbedding(seed = 42, dims = 384, normalize = false): Float32Array {
  const vec = new Float32Array(dims);
  let val = seed;
  for (let i = 0; i < dims; i++) {
    val = (val * 1103515245 + 12345) | 0;
    vec[i] = (val & 0x7fffffff) / 0x7fffffff;
  }
  if (normalize) {
    let mag = 0;
    for (let i = 0; i < dims; i++) mag += vec[i] * vec[i];
    mag = Math.sqrt(mag);
    if (mag > 0) for (let i = 0; i < dims; i++) vec[i] /= mag;
  }
  return vec;
}
