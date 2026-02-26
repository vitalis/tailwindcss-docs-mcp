import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type ChunkRow,
  type Database,
  createDatabase,
  embeddingToBlob,
} from "../../src/storage/database.js";
import {
  type ScoredChunk,
  fuseResults,
  hybridSearch,
  invalidateChunkCache,
  keywordSearch,
  semanticSearch,
} from "../../src/storage/search.js";
import { makeChunk, makeDoc, makeFakeEmbedding, testConfig } from "../helpers/factories.js";
import { createMockEmbedder } from "../setup.js";

function makeChunkRow(overrides?: Partial<ChunkRow>): ChunkRow {
  return {
    id: 1,
    doc_id: 1,
    heading: "## Basic usage",
    content: "Use p-4 for padding.",
    content_hash: "hash1",
    embedding: embeddingToBlob(makeFakeEmbedding(1, 384, true)),
    url: "https://tailwindcss.com/docs/padding#basic-usage",
    token_count: 10,
    ...overrides,
  };
}

function makeScoredChunk(id: number, semanticScore: number, keywordScore = 0): ScoredChunk {
  return {
    chunk: makeChunkRow({ id }),
    semanticScore,
    keywordScore,
    fusedScore: 0,
  };
}

describe("Search", () => {
  describe("fuseResults", () => {
    it("combines semantic and keyword results via RRF", () => {
      const semantic = [makeScoredChunk(1, 0.9), makeScoredChunk(2, 0.8)];
      const keyword = [makeScoredChunk(2, 0, 1.0), makeScoredChunk(3, 0, 0.5)];

      const fused = fuseResults(semantic, keyword, 10);

      // Chunk 2 appears in both lists → highest fused score
      expect(fused[0].chunk.id).toBe(2);
      expect(fused[0].fusedScore).toBeGreaterThan(fused[1].fusedScore);
    });

    it("deduplicates by chunk ID", () => {
      const semantic = [makeScoredChunk(1, 0.9)];
      const keyword = [makeScoredChunk(1, 0, 1.0)];

      const fused = fuseResults(semantic, keyword, 10);
      expect(fused).toHaveLength(1);
      // Should have contributions from both lists
      const K = 60;
      const expected = 1 / (K + 1) + 1 / (K + 1);
      expect(fused[0].fusedScore).toBeCloseTo(expected, 6);
    });

    it("respects limit", () => {
      const semantic = [makeScoredChunk(1, 0.9), makeScoredChunk(2, 0.8), makeScoredChunk(3, 0.7)];

      const fused = fuseResults(semantic, [], 2);
      expect(fused).toHaveLength(2);
    });

    it("handles empty inputs", () => {
      expect(fuseResults([], [], 5)).toHaveLength(0);
      expect(fuseResults([], [makeScoredChunk(1, 0, 1.0)], 5)).toHaveLength(1);
      expect(fuseResults([makeScoredChunk(1, 0.9)], [], 5)).toHaveLength(1);
    });

    it("preserves scores from each strategy", () => {
      const semantic = [makeScoredChunk(1, 0.95)];
      const keyword = [makeScoredChunk(1, 0, 0.8)];

      const fused = fuseResults(semantic, keyword, 5);
      expect(fused[0].semanticScore).toBe(0.95);
      expect(fused[0].keywordScore).toBe(0.8);
    });

    it("ranks by fused score descending", () => {
      // Chunk 1: only in semantic (rank 1)
      // Chunk 2: only in keyword (rank 1)
      // Chunk 3: in both (rank 2 semantic, rank 2 keyword)
      const semantic = [makeScoredChunk(1, 0.9), makeScoredChunk(3, 0.8)];
      const keyword = [makeScoredChunk(2, 0, 1.0), makeScoredChunk(3, 0, 0.5)];

      const fused = fuseResults(semantic, keyword, 10);
      for (let i = 1; i < fused.length; i++) {
        expect(fused[i - 1].fusedScore).toBeGreaterThanOrEqual(fused[i].fusedScore);
      }
    });
  });

  describe("semanticSearch", () => {
    it("returns chunks sorted by cosine similarity", async () => {
      const embedder = createMockEmbedder(384);
      const queryEmb = await embedder.embed("padding", { isQuery: true });

      // Create chunks with different embeddings
      const chunks: ChunkRow[] = [
        makeChunkRow({
          id: 1,
          embedding: embeddingToBlob(makeFakeEmbedding(1, 384, true)),
        }),
        makeChunkRow({
          id: 2,
          embedding: embeddingToBlob(makeFakeEmbedding(2, 384, true)),
        }),
        makeChunkRow({
          id: 3,
          embedding: embeddingToBlob(makeFakeEmbedding(3, 384, true)),
        }),
      ];

      const results = await semanticSearch(embedder, chunks, "padding", 3);
      expect(results).toHaveLength(3);

      // Results should be sorted by semanticScore descending
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].semanticScore).toBeGreaterThanOrEqual(results[i].semanticScore);
      }
    });

    it("respects limit", async () => {
      const embedder = createMockEmbedder(384);
      const chunks: ChunkRow[] = [
        makeChunkRow({
          id: 1,
          embedding: embeddingToBlob(makeFakeEmbedding(1, 384, true)),
        }),
        makeChunkRow({
          id: 2,
          embedding: embeddingToBlob(makeFakeEmbedding(2, 384, true)),
        }),
        makeChunkRow({
          id: 3,
          embedding: embeddingToBlob(makeFakeEmbedding(3, 384, true)),
        }),
      ];

      const results = await semanticSearch(embedder, chunks, "test", 2);
      expect(results).toHaveLength(2);
    });

    it("skips chunks without embeddings", async () => {
      const embedder = createMockEmbedder(384);
      const chunks: ChunkRow[] = [
        makeChunkRow({
          id: 1,
          embedding: embeddingToBlob(makeFakeEmbedding(1, 384, true)),
        }),
        makeChunkRow({ id: 2, embedding: null }),
      ];

      const results = await semanticSearch(embedder, chunks, "test", 5);
      expect(results).toHaveLength(1);
      expect(results[0].chunk.id).toBe(1);
    });

    it("returns empty for no chunks", async () => {
      const embedder = createMockEmbedder(384);
      const results = await semanticSearch(embedder, [], "test", 5);
      expect(results).toHaveLength(0);
    });
  });

  describe("keywordSearch", () => {
    let db: Database;

    beforeEach(async () => {
      db = await createDatabase(testConfig());
    });

    afterEach(() => {
      db.close();
    });

    it("finds chunks matching FTS query", () => {
      const docId = db.upsertDoc(makeDoc());
      db.upsertChunk(
        makeChunk({ id: "h1", content: "Use px-4 for horizontal padding." }),
        docId,
        makeFakeEmbedding(1),
      );
      db.upsertChunk(
        makeChunk({
          id: "h2",
          heading: "## Grid",
          content: "Use grid-cols-3 for three columns.",
        }),
        docId,
        makeFakeEmbedding(2),
      );

      const results = keywordSearch(db, "padding", "v3", 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunk.content).toContain("padding");
    });

    it("returns empty for non-matching query", () => {
      const docId = db.upsertDoc(makeDoc());
      db.upsertChunk(makeChunk(), docId, makeFakeEmbedding());

      const results = keywordSearch(db, "zzzznonexistent", "v3", 10);
      expect(results).toHaveLength(0);
    });

    it("respects version filter", () => {
      const v3DocId = db.upsertDoc(makeDoc({ version: "v3" }));
      db.upsertChunk(makeChunk({ id: "v3-h", content: "padding utilities v3" }), v3DocId, null);

      const v4DocId = db.upsertDoc(makeDoc({ slug: "padding", version: "v4" }));
      db.upsertChunk(makeChunk({ id: "v4-h", content: "padding utilities v4" }), v4DocId, null);

      const v3Results = keywordSearch(db, "padding", "v3", 10);
      const v4Results = keywordSearch(db, "padding", "v4", 10);

      expect(v3Results.length).toBeGreaterThan(0);
      expect(v4Results.length).toBeGreaterThan(0);

      // v3 results should not contain v4 content
      for (const r of v3Results) {
        expect(r.chunk.content).not.toContain("v4");
      }
    });

    it("assigns decreasing keyword scores", () => {
      const docId = db.upsertDoc(makeDoc());
      db.upsertChunk(makeChunk({ id: "h1", content: "padding padding padding" }), docId, null);
      db.upsertChunk(
        makeChunk({
          id: "h2",
          heading: "## Other",
          content: "some padding here",
        }),
        docId,
        null,
      );

      const results = keywordSearch(db, "padding", "v3", 10);
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results[0].keywordScore).toBeGreaterThan(results[1].keywordScore);
    });

    it("handles FTS5 operator keywords in query", () => {
      const docId = db.upsertDoc(makeDoc());
      db.upsertChunk(
        makeChunk({ id: "h1", content: "Use AND with OR for NOT operations." }),
        docId,
        null,
      );

      // FTS5 operators should be escaped and treated as literal words
      const results = keywordSearch(db, "AND OR NOT", "v3", 10);
      expect(results.length).toBeGreaterThan(0);
    });

    it("handles column selectors in query", () => {
      const docId = db.upsertDoc(makeDoc());
      db.upsertChunk(makeChunk({ id: "h1", content: "heading padding content" }), docId, null);

      // "heading:" is FTS5 column selector syntax — should be escaped
      const results = keywordSearch(db, "heading:padding", "v3", 10);
      // Should not throw; may return empty since "heading:padding" as a literal token won't match
      expect(Array.isArray(results)).toBe(true);
    });

    it("handles special characters in query", () => {
      const docId = db.upsertDoc(makeDoc());
      db.upsertChunk(makeChunk({ id: "h1", content: "Use px-4 for padding." }), docId, null);

      // Queries with FTS5 special chars should not throw
      for (const query of ['"px-4"', "px*", "px-4^", "(padding)", "padding + margin"]) {
        const results = keywordSearch(db, query, "v3", 10);
        expect(Array.isArray(results)).toBe(true);
      }

      // Verify that escaped parenthesized query still finds matching content
      const parenResults = keywordSearch(db, "(padding)", "v3", 10);
      expect(parenResults.length).toBeGreaterThan(0);
      expect(parenResults[0].chunk.content).toContain("padding");
    });

    it("returns empty for whitespace-only query", () => {
      const docId = db.upsertDoc(makeDoc());
      db.upsertChunk(makeChunk(), docId, null);

      const results = keywordSearch(db, "   ", "v3", 10);
      expect(results).toHaveLength(0);
    });
  });

  describe("hybridSearch", () => {
    let db: Database;

    beforeEach(async () => {
      invalidateChunkCache();
      db = await createDatabase(testConfig());
    });

    afterEach(() => {
      db.close();
    });

    it("returns search results with doc titles", async () => {
      const embedder = createMockEmbedder(384);
      const docId = db.upsertDoc(makeDoc());

      const emb = await embedder.embed("padding basics");
      db.upsertChunk(makeChunk({ id: "h1", content: "Use p-4 for padding." }), docId, emb);

      const results = await hybridSearch(db, embedder, {
        query: "padding",
        version: "v3",
        limit: 5,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].docTitle).toBe("Padding");
      expect(results[0].heading).toBeTruthy();
      expect(results[0].content).toBeTruthy();
      expect(results[0].url).toBeTruthy();
      expect(results[0].score).toBeGreaterThan(0);
    });

    it("returns empty for empty query", async () => {
      const embedder = createMockEmbedder(384);
      const results = await hybridSearch(db, embedder, {
        query: "",
        version: "v3",
      });
      expect(results).toHaveLength(0);
    });

    it("returns empty when no chunks are indexed", async () => {
      const embedder = createMockEmbedder(384);
      const results = await hybridSearch(db, embedder, {
        query: "padding",
        version: "v3",
      });
      expect(results).toHaveLength(0);
    });

    it("respects limit", async () => {
      const embedder = createMockEmbedder(384);
      const docId = db.upsertDoc(makeDoc());

      // Insert 5 chunks
      for (let i = 1; i <= 5; i++) {
        const emb = await embedder.embed(`chunk ${i}`);
        db.upsertChunk(
          makeChunk({
            id: `h${i}`,
            heading: `## Section ${i}`,
            content: `Padding content ${i}`,
          }),
          docId,
          emb,
        );
      }

      const results = await hybridSearch(db, embedder, {
        query: "padding",
        version: "v3",
        limit: 2,
      });

      expect(results).toHaveLength(2);
    });

    it("defaults limit to 5", async () => {
      const embedder = createMockEmbedder(384);
      const docId = db.upsertDoc(makeDoc());

      // Insert 10 chunks
      for (let i = 1; i <= 10; i++) {
        const emb = await embedder.embed(`chunk ${i}`);
        db.upsertChunk(
          makeChunk({
            id: `h${i}`,
            heading: `## Section ${i}`,
            content: `Content for section ${i}`,
          }),
          docId,
          emb,
        );
      }

      const results = await hybridSearch(db, embedder, {
        query: "content",
        version: "v3",
      });

      expect(results).toHaveLength(5);
    });
  });
});
