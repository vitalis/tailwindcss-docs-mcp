import { readFileSync } from "node:fs";
import { chunkDocument } from "../../src/pipeline/chunker.js";
import type { Chunk } from "../../src/pipeline/chunker.js";
import { buildEmbeddingInput } from "../../src/pipeline/embedder.js";
import type { Embedder } from "../../src/pipeline/embedder.js";
import { parseMdx } from "../../src/pipeline/parser.js";
import type { CleanDocument } from "../../src/pipeline/parser.js";
import type { Database } from "../../src/storage/database.js";
import type { TailwindVersion } from "../../src/utils/config.js";
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
    modelCacheDir: `${dataDir}/models`,
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

/** Path to the MDX fixtures directory. */
const FIXTURES_DIR = new URL("../fixtures/mdx", import.meta.url).pathname;

/**
 * Load MDX fixture files, parse, chunk, embed, and store in the database.
 *
 * Shared setup for integration tests (search-quality, hybrid-search) that
 * need a populated database with real MDX content and mock embeddings.
 */
export async function loadFixturesIntoDB(
  db: Database,
  embedder: Embedder,
  slugs: string[],
  version: TailwindVersion = "v3",
): Promise<void> {
  for (const slug of slugs) {
    const raw = readFileSync(`${FIXTURES_DIR}/${slug}.mdx`, "utf-8");
    const doc = parseMdx(raw, slug, version);
    const chunks = chunkDocument(doc);
    const docId = db.upsertDoc(doc);

    for (const chunk of chunks) {
      const input = buildEmbeddingInput(doc.title, chunk.heading, chunk.content);
      const embedding = await embedder.embed(input);
      db.upsertChunk(chunk, docId, embedding);
    }
  }

  db.updateIndexStatus(version, "test-model", 384);
}
