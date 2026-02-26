import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chunkDocument } from "../../src/pipeline/chunker.js";
import { buildEmbeddingInput } from "../../src/pipeline/embedder.js";
import { parseMdx } from "../../src/pipeline/parser.js";
import { type Database, createDatabase } from "../../src/storage/database.js";
import { hybridSearch, keywordSearch } from "../../src/storage/search.js";
import { testConfig } from "../helpers/factories.js";
import { createMockEmbedder } from "../setup.js";

const FIXTURES_DIR = new URL("../fixtures/mdx", import.meta.url).pathname;

const FIXTURE_SLUGS = ["padding", "dark-mode", "grid-template-columns"];

describe("Search Quality", () => {
  // NOTE: Uses a mock embedder — semantic ranking is NOT validated here.
  // These tests verify the search pipeline (FTS, fusion, result format)
  // but not that semantically similar queries produce higher scores.
  let db: Database;
  const embedder = createMockEmbedder(384);

  beforeAll(async () => {
    db = await createDatabase(testConfig());

    for (const slug of FIXTURE_SLUGS) {
      const raw = readFileSync(`${FIXTURES_DIR}/${slug}.mdx`, "utf-8");
      const doc = parseMdx(raw, slug, "v3");
      const chunks = chunkDocument(doc);
      const docId = db.upsertDoc(doc);

      for (const chunk of chunks) {
        const input = buildEmbeddingInput(doc.title, chunk.heading, chunk.content);
        const embedding = await embedder.embed(input);
        db.upsertChunk(chunk, docId, embedding);
      }
    }

    db.updateIndexStatus("v3", "test-model", 384);
  });

  afterAll(() => {
    db.close();
  });

  it("ranks 'Padding' as top-1 result for 'padding' query", async () => {
    const results = await hybridSearch(db, embedder, {
      query: "padding",
      version: "v3",
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    // The "Padding" doc should be the top result, not just present somewhere
    expect(results[0].docTitle).toBe("Padding");
  });

  it("ranks 'Grid Template Columns' as top-1 result for 'grid' query", async () => {
    const results = await hybridSearch(db, embedder, {
      query: "grid",
      version: "v3",
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].docTitle).toBe("Grid Template Columns");
  });

  it("ranks 'Dark Mode' as top-1 result for 'dark mode' query", async () => {
    const results = await hybridSearch(db, embedder, {
      query: "dark mode",
      version: "v3",
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].docTitle).toBe("Dark Mode");
  });

  it("finds padding docs for exact hyphenated class keyword", () => {
    // With tokenchars="-", FTS5 treats "pt-6" as a single token
    const results = keywordSearch(db, "pt-6", "v3", 10);

    expect(results.length).toBeGreaterThan(0);
    // Verify the matched chunks come from the padding doc
    const paddingChunks = results.filter((r) => r.chunk.content.toLowerCase().includes("pt-6"));
    expect(paddingChunks.length).toBeGreaterThan(0);
  });

  it("all results have valid URLs and non-empty content", async () => {
    const queries = ["padding", "grid", "dark mode"];

    for (const query of queries) {
      const results = await hybridSearch(db, embedder, {
        query,
        version: "v3",
        limit: 5,
      });

      for (const result of results) {
        expect(result.url).toMatch(/^https:\/\/tailwindcss\.com\/docs\//);
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.docTitle.length).toBeGreaterThan(0);
        expect(result.heading).toBeDefined();
      }
    }
  });

  it("result scores are in descending order", async () => {
    const queries = ["padding", "grid", "dark"];

    for (const query of queries) {
      const results = await hybridSearch(db, embedder, {
        query,
        version: "v3",
        limit: 10,
      });

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    }
  });

  it("scores are normalized: top result = 1.0, all in [0, 1]", async () => {
    const queries = ["padding", "grid", "dark mode"];

    for (const query of queries) {
      const results = await hybridSearch(db, embedder, {
        query,
        version: "v3",
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);

      // Top result should be normalized to 1.0
      expect(results[0].score).toBeCloseTo(1.0, 5);

      for (const result of results) {
        // All scores must be finite numbers in [0, 1]
        expect(Number.isFinite(result.score)).toBe(true);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
    }
  });

  it("passes isQuery: true to embedder for search queries", async () => {
    const trackingEmbedder = createMockEmbedder(384);
    // Clear any calls from setup
    trackingEmbedder.calls.length = 0;

    await hybridSearch(db, trackingEmbedder, {
      query: "padding",
      version: "v3",
      limit: 5,
    });

    // hybridSearch should call embed with isQuery: true for the query
    const queryCalls = trackingEmbedder.calls.filter((c) => c.options?.isQuery === true);
    expect(queryCalls.length).toBeGreaterThan(0);
  });

  it("finds hyphenated class names via hybrid search", async () => {
    // FTS5 with tokenchars="-" treats "grid-cols-3" as a single token
    const results = await hybridSearch(db, embedder, {
      query: "grid-cols-3",
      version: "v3",
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    // With mock embedder, semantic scores are noise — grid doc may not be top-1.
    // Verify the correct doc appears in results via FTS keyword matching.
    const gridResults = results.filter((r) => r.docTitle === "Grid Template Columns");
    expect(gridResults.length).toBeGreaterThan(0);
  });
});
