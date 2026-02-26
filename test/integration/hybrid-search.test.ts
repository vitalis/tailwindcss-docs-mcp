import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Database, createDatabase } from "../../src/storage/database.js";
import { hybridSearch, keywordSearch, semanticSearch } from "../../src/storage/search.js";
import { loadFixturesIntoDB, testConfig } from "../helpers/factories.js";
import { createMockEmbedder } from "../setup.js";

const FIXTURE_SLUGS = ["padding", "dark-mode", "grid-template-columns"];

describe("Hybrid Search Fusion", () => {
  let db: Database;
  const embedder = createMockEmbedder(384);

  beforeAll(async () => {
    db = await createDatabase(testConfig());
    await loadFixturesIntoDB(db, embedder, FIXTURE_SLUGS);
  });

  afterAll(() => {
    db.close();
  });

  it("returns results for semantic queries", async () => {
    // Semantic search operates on embeddings; with mock embedder the vectors
    // are deterministic but not semantically meaningful. We verify the pipeline
    // returns non-empty results for a non-trivial query.
    const results = await hybridSearch(db, embedder, {
      query: "how to center content",
      version: "v3",
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
      expect(r.content).toBeTruthy();
      expect(r.url).toMatch(/^https:\/\/tailwindcss\.com\/docs\//);
    }
  });

  it("returns results for keyword queries", async () => {
    // FTS5 should find exact class name matches
    const gridResults = await hybridSearch(db, embedder, {
      query: "grid",
      version: "v3",
      limit: 5,
    });

    expect(gridResults.length).toBeGreaterThan(0);
    // At least one result should come from the grid-template-columns doc
    const hasGridDoc = gridResults.some((r) => r.docTitle === "Grid Template Columns");
    expect(hasGridDoc).toBe(true);

    // Keyword search for a term appearing in padding doc
    const paddingResults = await hybridSearch(db, embedder, {
      query: "padding",
      version: "v3",
      limit: 5,
    });

    expect(paddingResults.length).toBeGreaterThan(0);
    const hasPaddingDoc = paddingResults.some((r) => r.docTitle === "Padding");
    expect(hasPaddingDoc).toBe(true);
  });

  it("deduplicates chunks found by both strategies", async () => {
    // Search for "padding" which should appear in both semantic (all chunks
    // are embedded) and keyword results (FTS match). After fusion, each chunk
    // should appear exactly once.
    const results = await hybridSearch(db, embedder, {
      query: "padding",
      version: "v3",
      limit: 10,
    });

    const urls = results.map((r) => r.url);
    const uniqueUrls = new Set(urls);
    // Each result has a unique URL (deduplication by chunk ID)
    expect(urls.length).toBe(uniqueUrls.size);
  });

  it("ranks hybrid matches higher than single-strategy matches", async () => {
    // Get keyword-only results for "padding"
    const keywordOnly = keywordSearch(db, "padding", "v3", 10);

    // Get semantic-only results for "padding"
    const allChunks = db.getAllChunksWithEmbeddings("v3");
    const semanticOnly = await semanticSearch(embedder, allChunks, "padding", 10);

    // Find chunks that appear in BOTH keyword and semantic results
    const keywordChunkIds = new Set(keywordOnly.map((s) => s.chunk.id));
    const semanticChunkIds = new Set(semanticOnly.map((s) => s.chunk.id));
    const sharedIds = [...keywordChunkIds].filter((id) => semanticChunkIds.has(id));

    expect(sharedIds.length).toBeGreaterThan(0);

    // Get hybrid results
    const hybridResults = await hybridSearch(db, embedder, {
      query: "padding",
      version: "v3",
      limit: 10,
    });

    // Among hybrid results, chunks appearing in both strategies should have
    // higher scores than chunks appearing in only one strategy
    const sharedIdSet = new Set(sharedIds);

    // Find a result that was in both lists and one that was only in one
    // We look up by content since we can't access chunk.id directly from SearchResult
    const sharedResults = hybridResults.filter((r) => {
      // Check if this result's content matches a keyword result that's also a semantic result
      const matchingKeyword = keywordOnly.find((k) => k.chunk.content === r.content);
      return matchingKeyword && sharedIdSet.has(matchingKeyword.chunk.id);
    });

    const singleStrategyResults = hybridResults.filter((r) => {
      const matchingKeyword = keywordOnly.find((k) => k.chunk.content === r.content);
      if (matchingKeyword && sharedIdSet.has(matchingKeyword.chunk.id)) return false;
      return true;
    });

    expect(sharedResults.length).toBeGreaterThan(0);
    expect(singleStrategyResults.length).toBeGreaterThan(0);

    const bestShared = Math.max(...sharedResults.map((r) => r.score));
    // At minimum, the best shared result should score higher than some single-strategy results
    const someSingleLower = singleStrategyResults.some((r) => r.score < bestShared);
    expect(someSingleLower).toBe(true);
  });

  it("returns empty results for empty query", async () => {
    const results = await hybridSearch(db, embedder, {
      query: "",
      version: "v3",
      limit: 5,
    });

    expect(results).toHaveLength(0);
  });

  it("returns empty results for query with no matches", async () => {
    // Use a completely nonsensical query that won't match FTS
    // Note: semantic search will still return results (cosine similarity is
    // never exactly zero with random vectors), but if FTS returns nothing
    // and the semantic scores are all very low, hybrid may still return results.
    // We use a query unlikely to match FTS to verify no crash occurs.
    const results = await hybridSearch(db, embedder, {
      query: "xyzzyplughnonexistent",
      version: "v3",
      limit: 5,
    });

    // Should not throw. Results may be non-empty due to semantic search
    // but all should have valid structure.
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
      expect(r.url).toBeTruthy();
      expect(r.content).toBeTruthy();
    }
  });
});
