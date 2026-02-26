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

  it("finds padding docs for 'padding' query", async () => {
    // FTS5 keyword search should match "padding" in the padding doc content
    const results = await hybridSearch(db, embedder, {
      query: "padding",
      version: "v3",
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    const paddingResults = results.filter((r) => r.docTitle === "Padding");
    expect(paddingResults.length).toBeGreaterThan(0);
  });

  it("finds grid docs for 'grid' query", async () => {
    // FTS5 keyword search should match "grid" in the grid-template-columns doc
    const results = await hybridSearch(db, embedder, {
      query: "grid",
      version: "v3",
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    const gridResults = results.filter((r) => r.docTitle === "Grid Template Columns");
    expect(gridResults.length).toBeGreaterThan(0);
  });

  it("finds dark mode docs for 'dark mode' query", async () => {
    // "dark" and "mode" should match via FTS in the dark-mode doc
    const results = await hybridSearch(db, embedder, {
      query: "dark mode",
      version: "v3",
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    const darkModeResults = results.filter((r) => r.docTitle === "Dark Mode");
    expect(darkModeResults.length).toBeGreaterThan(0);
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
});
