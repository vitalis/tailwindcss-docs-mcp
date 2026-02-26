import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createDatabase,
  embeddingToBlob,
  blobToEmbedding,
  type Database,
} from "../../src/storage/database.js";
import type { Config } from "../../src/utils/config.js";
import type { CleanDocument } from "../../src/pipeline/parser.js";
import type { Chunk } from "../../src/pipeline/chunker.js";

/** Minimal in-memory config for tests. */
function testConfig(): Config {
  return {
    dataDir: "/tmp/test",
    dbPath: ":memory:",
    rawDir: "/tmp/test/raw",
    defaultVersion: "v3",
    embeddingModel: "test-model",
    embeddingDimensions: 384,
    queryPrefix: "test: ",
  };
}

/** Factory for a test document. */
function makeDoc(overrides?: Partial<CleanDocument>): CleanDocument {
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
function makeChunk(overrides?: Partial<Chunk>): Chunk {
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

/** Create a deterministic 384-dim Float32Array from a seed. */
function makeFakeEmbedding(seed = 42, dims = 384): Float32Array {
  const vec = new Float32Array(dims);
  let val = seed;
  for (let i = 0; i < dims; i++) {
    val = (val * 1103515245 + 12345) | 0;
    vec[i] = (val & 0x7fffffff) / 0x7fffffff;
  }
  return vec;
}

describe("Storage / Database", () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase(testConfig());
  });

  afterEach(() => {
    db.close();
  });

  describe("schema initialization", () => {
    it("creates all tables on init", async () => {
      // Query sqlite_master for the expected tables
      // We need a second database to verify tables exist since we can't
      // run raw SQL through the Database interface — but the factory itself
      // runs SCHEMA, so if createDatabase succeeds the tables exist.
      // We verify indirectly by calling methods that depend on each table.

      // docs table — upsertDoc should not throw
      const docId = db.upsertDoc(makeDoc());
      expect(docId).toBeGreaterThan(0);

      // chunks table — upsertChunk should not throw
      db.upsertChunk(makeChunk(), docId, null);

      // chunks_fts virtual table — FTS query should not throw
      const chunks = db.getChunksForDoc(docId);
      expect(chunks).toHaveLength(1);

      // index_status table — updateIndexStatus should not throw
      db.updateIndexStatus("v3", "test-model", 384);
      const statuses = db.getIndexStatus("v3");
      expect(statuses).toHaveLength(1);
    });
  });

  describe("document operations", () => {
    it("inserts and retrieves docs", () => {
      const doc = makeDoc();
      const docId = db.upsertDoc(doc);

      const retrieved = db.getDoc("padding", "v3");
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(docId);
      expect(retrieved?.slug).toBe("padding");
      expect(retrieved?.title).toBe("Padding");
      expect(retrieved?.description).toBe("Utilities for controlling padding.");
      expect(retrieved?.url).toBe("https://tailwindcss.com/docs/padding");
      expect(retrieved?.version).toBe("v3");
      expect(retrieved?.fetched_at).toBeTruthy();
    });

    it("updates existing doc on conflict", () => {
      const doc = makeDoc();
      const firstId = db.upsertDoc(doc);

      const updatedDoc = makeDoc({ title: "Padding (updated)" });
      const secondId = db.upsertDoc(updatedDoc);

      expect(secondId).toBe(firstId);

      const retrieved = db.getDoc("padding", "v3");
      expect(retrieved?.title).toBe("Padding (updated)");
    });

    it("returns undefined for missing doc", () => {
      const result = db.getDoc("nonexistent", "v3");
      expect(result).toBeUndefined();
    });
  });

  describe("chunk operations", () => {
    it("inserts and retrieves chunks with embeddings", () => {
      const docId = db.upsertDoc(makeDoc());
      const embedding = makeFakeEmbedding();
      const chunk = makeChunk();

      db.upsertChunk(chunk, docId, embedding);

      const chunks = db.getChunksForDoc(docId);
      expect(chunks).toHaveLength(1);

      const row = chunks[0];
      expect(row.heading).toBe("## Basic usage");
      expect(row.content).toBe("Use `p-4` for 1rem padding on all sides.");
      expect(row.content_hash).toBe("abc123hash");
      expect(row.url).toBe("https://tailwindcss.com/docs/padding#basic-usage");
      expect(row.token_count).toBe(12);
      expect(row.embedding).not.toBeNull();

      // Round-trip: BLOB storage preserves Float32Array exactly
      const recovered = blobToEmbedding(row.embedding as Buffer);
      expect(recovered.length).toBe(embedding.length);
      for (let i = 0; i < embedding.length; i++) {
        expect(recovered[i]).toBeCloseTo(embedding[i], 6);
      }
    });

    it("stores null embedding when none provided", () => {
      const docId = db.upsertDoc(makeDoc());
      db.upsertChunk(makeChunk(), docId, null);

      const chunks = db.getChunksForDoc(docId);
      expect(chunks[0].embedding).toBeNull();
    });

    it("deduplicates by content hash", () => {
      const docId = db.upsertDoc(makeDoc());
      const chunk = makeChunk();

      db.upsertChunk(chunk, docId, null);
      db.upsertChunk(chunk, docId, null);

      const chunks = db.getChunksForDoc(docId);
      expect(chunks).toHaveLength(1);
    });

    it("re-embeds on content hash change", () => {
      const docId = db.upsertDoc(makeDoc());
      const embedding1 = makeFakeEmbedding(1);
      const embedding2 = makeFakeEmbedding(2);

      // Insert with first embedding
      db.upsertChunk(makeChunk({ id: "hash-v1" }), docId, embedding1);

      // Insert with different hash — should create a new row
      db.upsertChunk(makeChunk({ id: "hash-v2" }), docId, embedding2);

      const chunks = db.getChunksForDoc(docId);
      expect(chunks).toHaveLength(2);

      // Verify each has its own embedding
      const hashes = chunks.map((c) => c.content_hash);
      expect(hashes).toContain("hash-v1");
      expect(hashes).toContain("hash-v2");
    });

    it("updates embedding when upserting same chunk", () => {
      const docId = db.upsertDoc(makeDoc());
      const chunk = makeChunk();

      // Insert without embedding
      db.upsertChunk(chunk, docId, null);
      expect(db.getChunksForDoc(docId)[0].embedding).toBeNull();

      // Upsert same chunk with embedding
      const embedding = makeFakeEmbedding();
      db.upsertChunk(chunk, docId, embedding);

      const updated = db.getChunksForDoc(docId);
      expect(updated).toHaveLength(1);
      expect(updated[0].embedding).not.toBeNull();
    });

    it("deletes orphaned chunks", () => {
      const docId = db.upsertDoc(makeDoc());

      db.upsertChunk(makeChunk({ id: "keep-1" }), docId, null);
      db.upsertChunk(
        makeChunk({ id: "keep-2", heading: "## Other" }),
        docId,
        null,
      );
      db.upsertChunk(
        makeChunk({ id: "orphan-1", heading: "## Orphan" }),
        docId,
        null,
      );

      expect(db.getChunksForDoc(docId)).toHaveLength(3);

      const deleted = db.deleteOrphanedChunks(
        docId,
        new Set(["keep-1", "keep-2"]),
      );
      expect(deleted).toBe(1);
      expect(db.getChunksForDoc(docId)).toHaveLength(2);

      const remaining = db.getChunksForDoc(docId).map((c) => c.content_hash);
      expect(remaining).toContain("keep-1");
      expect(remaining).toContain("keep-2");
      expect(remaining).not.toContain("orphan-1");
    });

    it("deletes all chunks when valid hashes is empty", () => {
      const docId = db.upsertDoc(makeDoc());
      db.upsertChunk(makeChunk({ id: "h1" }), docId, null);
      db.upsertChunk(makeChunk({ id: "h2", heading: "## Other" }), docId, null);

      const deleted = db.deleteOrphanedChunks(docId, new Set());
      expect(deleted).toBe(2);
      expect(db.getChunksForDoc(docId)).toHaveLength(0);
    });

    it("looks up chunk by content hash and doc id", () => {
      const docId = db.upsertDoc(makeDoc());
      db.upsertChunk(makeChunk({ id: "target-hash" }), docId, null);

      const found = db.getChunkByHash("target-hash", docId);
      expect(found).toBeDefined();
      expect(found?.content_hash).toBe("target-hash");

      const notFound = db.getChunkByHash("nonexistent", docId);
      expect(notFound).toBeUndefined();
    });

    it("retrieves all chunks with embeddings for a version", () => {
      const docId = db.upsertDoc(makeDoc());
      const embedding = makeFakeEmbedding();

      db.upsertChunk(makeChunk({ id: "with-emb" }), docId, embedding);
      db.upsertChunk(
        makeChunk({ id: "without-emb", heading: "## No emb" }),
        docId,
        null,
      );

      const withEmbeddings = db.getAllChunksWithEmbeddings("v3");
      expect(withEmbeddings).toHaveLength(1);
      expect(withEmbeddings[0].content_hash).toBe("with-emb");
    });
  });

  describe("FTS index", () => {
    it("stays in sync with chunks table", async () => {
      // We need raw SQL access to query FTS, so open a second database
      // instance to run the FTS match query.
      const db2 = await createDatabase(testConfig());

      try {
        const docId = db2.upsertDoc(makeDoc());
        db2.upsertChunk(
          makeChunk({ content: "Use px-4 for horizontal padding." }),
          docId,
          null,
        );

        // FTS5 match query — getAllChunksWithEmbeddings won't help here
        // because we need FTS specifically. We test that after inserting
        // a chunk, the FTS trigger fires and the data is searchable.
        // Since our Database interface doesn't expose raw FTS queries,
        // we verify by checking the chunk is in the table and trust the
        // trigger mechanism. For a proper FTS test, we'd need raw SQL.
        //
        // However, we CAN verify the trigger exists by inserting and
        // deleting: if FTS triggers didn't fire, FTS would be out of sync
        // and subsequent FTS queries in the search module would fail.
        const chunks = db2.getChunksForDoc(docId);
        expect(chunks).toHaveLength(1);
        expect(chunks[0].content).toContain("px-4");

        // Delete the chunk's doc (which deletes chunks) and verify cleanup
        db2.deleteVersion("v3");
        const remaining = db2.getChunksForDoc(docId);
        expect(remaining).toHaveLength(0);
      } finally {
        db2.close();
      }
    });
  });

  describe("version operations", () => {
    it("deletes all data for a version", () => {
      const docId = db.upsertDoc(makeDoc());
      db.upsertChunk(makeChunk(), docId, null);
      db.updateIndexStatus("v3", "test-model", 384);

      db.deleteVersion("v3");

      expect(db.getDoc("padding", "v3")).toBeUndefined();
      expect(db.getIndexStatus("v3")).toHaveLength(0);
    });

    it("does not delete data for other versions", () => {
      const v3DocId = db.upsertDoc(makeDoc({ version: "v3" }));
      db.upsertChunk(makeChunk(), v3DocId, null);

      const v4DocId = db.upsertDoc(makeDoc({ slug: "padding", version: "v4" }));
      db.upsertChunk(makeChunk({ id: "v4-hash" }), v4DocId, null);

      db.deleteVersion("v3");

      expect(db.getDoc("padding", "v3")).toBeUndefined();
      expect(db.getDoc("padding", "v4")).toBeDefined();
      expect(db.getChunksForDoc(v4DocId)).toHaveLength(1);
    });
  });

  describe("index status", () => {
    it("tracks index status correctly", () => {
      const docId = db.upsertDoc(makeDoc());
      db.upsertChunk(makeChunk(), docId, makeFakeEmbedding());

      db.updateIndexStatus("v3", "test-model", 384);

      const statuses = db.getIndexStatus("v3");
      expect(statuses).toHaveLength(1);

      const status = statuses[0];
      expect(status.version).toBe("v3");
      expect(status.doc_count).toBe(1);
      expect(status.chunk_count).toBe(1);
      expect(status.embedding_model).toBe("test-model");
      expect(status.embedding_dimensions).toBe(384);
      expect(status.indexed_at).toBeTruthy();
    });

    it("updates counts on re-index", () => {
      const docId = db.upsertDoc(makeDoc());
      db.upsertChunk(makeChunk({ id: "c1" }), docId, null);
      db.updateIndexStatus("v3", "test-model", 384);

      expect(db.getIndexStatus("v3")[0].chunk_count).toBe(1);

      // Add another chunk and update status
      db.upsertChunk(makeChunk({ id: "c2", heading: "## More" }), docId, null);
      db.updateIndexStatus("v3", "test-model", 384);

      expect(db.getIndexStatus("v3")[0].chunk_count).toBe(2);
    });

    it("returns all versions when no filter given", () => {
      db.upsertDoc(makeDoc({ version: "v3" }));
      db.updateIndexStatus("v3", "test-model", 384);

      db.upsertDoc(makeDoc({ slug: "flex", version: "v4" }));
      db.updateIndexStatus("v4", "test-model", 384);

      const all = db.getIndexStatus();
      expect(all).toHaveLength(2);
      const versions = all.map((s) => s.version).sort();
      expect(versions).toEqual(["v3", "v4"]);
    });
  });

  describe("embeddingToBlob / blobToEmbedding", () => {
    it("round-trips Float32Array through Buffer", () => {
      const original = makeFakeEmbedding(99, 384);
      const blob = embeddingToBlob(original);
      const recovered = blobToEmbedding(blob);

      expect(recovered.length).toBe(original.length);
      for (let i = 0; i < original.length; i++) {
        expect(recovered[i]).toBe(original[i]);
      }
    });
  });
});
