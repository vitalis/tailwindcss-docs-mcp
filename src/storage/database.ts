import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Chunk } from "../pipeline/chunker.js";
import type { CleanDocument } from "../pipeline/parser.js";
import type { Config, TailwindVersion } from "../utils/config.js";

/**
 * A document row from the `docs` table.
 */
export interface DocRow {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  url: string;
  version: string;
  fetched_at: string;
}

/**
 * A chunk row from the `chunks` table.
 */
export interface ChunkRow {
  id: number;
  doc_id: number;
  heading: string;
  content: string;
  content_hash: string;
  embedding: Buffer | null;
  url: string;
  token_count: number;
}

/**
 * Index status from the `index_status` table.
 */
export interface IndexStatus {
  version: string;
  doc_count: number;
  chunk_count: number;
  embedding_model: string;
  embedding_dimensions: number;
  indexed_at: string;
}

/**
 * The database interface for storing and retrieving documentation.
 */
export interface Database {
  /** Insert or update a document */
  upsertDoc(doc: CleanDocument): number;

  /** Insert a chunk with its embedding */
  upsertChunk(chunk: Chunk, docId: number, embedding: Float32Array | null): void;

  /** Get a document by slug and version */
  getDoc(slug: string, version: TailwindVersion): DocRow | undefined;

  /** Get all chunks for a document */
  getChunksForDoc(docId: number): ChunkRow[];

  /** Get all chunks with embeddings for a version (for in-memory search) */
  getAllChunksWithEmbeddings(version: TailwindVersion): ChunkRow[];

  /** Get chunk by content hash (for incremental re-indexing) */
  getChunkByHash(contentHash: string, docId: number): ChunkRow | undefined;

  /** Delete orphaned chunks not in the given hash set */
  deleteOrphanedChunks(docId: number, validHashes: Set<string>): number;

  /** Delete all data for a version */
  deleteVersion(version: TailwindVersion): void;

  /** Update index status after indexing */
  updateIndexStatus(version: TailwindVersion, model: string, dimensions: number): void;

  /** Get index status for a version */
  getIndexStatus(version?: TailwindVersion): IndexStatus[];

  /** Get a document by ID */
  getDocById(id: number): DocRow | undefined;

  /** Search chunks using FTS5 full-text search, ordered by BM25 relevance */
  searchFts(query: string, version: TailwindVersion, limit: number): ChunkRow[];

  /** Close the database connection */
  close(): void;
}

/**
 * SQL schema for the documentation database.
 */
const SCHEMA = `
-- Metadata
CREATE TABLE IF NOT EXISTS docs (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  version TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  UNIQUE(slug, version)
);

-- Chunks with text content and embeddings
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY,
  doc_id INTEGER NOT NULL REFERENCES docs(id),
  heading TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  embedding BLOB,
  url TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  UNIQUE(doc_id, heading, content_hash)
);

-- Full-text search for keyword queries (exact class names like px-4, grid-cols-3)
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  heading, content,
  content='chunks',
  content_rowid='id',
  tokenize = "unicode61 tokenchars '-'"
);

-- Index status
CREATE TABLE IF NOT EXISTS index_status (
  version TEXT PRIMARY KEY,
  doc_count INTEGER,
  chunk_count INTEGER,
  embedding_model TEXT,
  embedding_dimensions INTEGER,
  indexed_at TEXT NOT NULL
);
` as const;

/**
 * FTS5 triggers to keep chunks_fts in sync with the chunks table.
 *
 * These triggers fire on INSERT, DELETE, and UPDATE on the chunks table
 * and mirror changes into the FTS5 content-sync'd virtual table.
 */
const FTS_TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, heading, content) VALUES (new.id, new.heading, new.content);
END;

CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, heading, content) VALUES ('delete', old.id, old.heading, old.content);
END;

CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, heading, content) VALUES ('delete', old.id, old.heading, old.content);
  INSERT INTO chunks_fts(rowid, heading, content) VALUES (new.id, new.heading, new.content);
END;
` as const;

/**
 * Thin abstraction over bun:sqlite and better-sqlite3 to normalize their APIs.
 *
 * bun:sqlite uses `db.query(sql)` returning a Statement with `.get()`, `.all()`, `.run()`.
 * better-sqlite3 uses `db.prepare(sql)` returning a Statement with `.get()`, `.all()`, `.run()`.
 * Both are synchronous. The `run()` return value differs:
 * - bun:sqlite: `undefined`
 * - better-sqlite3: `{ changes: number, lastInsertRowid: number | bigint }`
 *
 * We wrap these differences in a `SqliteDb` interface used exclusively
 * within `createDatabase`.
 */
interface StatementResult {
  changes: number;
  lastInsertRowid: number;
}

interface SqliteDb {
  exec(sql: string): void;
  queryGet<T>(sql: string, ...params: unknown[]): T | undefined;
  queryAll<T>(sql: string, ...params: unknown[]): T[];
  queryRun(sql: string, ...params: unknown[]): StatementResult;
  close(): void;
}

/**
 * Minimal interface for the subset of bun:sqlite APIs used by this module.
 * bun:sqlite types are unavailable at compile time under Node, so we constrain
 * the dynamic import to this shape rather than casting to `any`.
 */
interface BunSqliteStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): void;
}

interface BunSqliteDb {
  exec(sql: string): void;
  query(sql: string): BunSqliteStatement;
  close(): void;
}

interface BunSqliteModule {
  default?: new (path: string) => BunSqliteDb;
  Database?: new (path: string) => BunSqliteDb;
}

/**
 * Open a SQLite database using bun:sqlite, wrapping it in SqliteDb.
 */
async function openBunSqlite(dbPath: string): Promise<SqliteDb> {
  const mod = (await import("bun:sqlite")) as BunSqliteModule;
  const BunDatabase = mod.default ?? mod.Database;
  if (!BunDatabase) throw new Error("bun:sqlite module has no Database export");
  const db = new BunDatabase(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.exec("PRAGMA journal_mode=WAL");
  // Enforce foreign key constraints at the database level
  db.exec("PRAGMA foreign_keys=ON");
  // Wait up to 5s for locks instead of failing immediately with SQLITE_BUSY
  db.exec("PRAGMA busy_timeout=5000");

  // Cache compiled statements to avoid re-calling db.query() on every operation.
  const stmtCache = new Map<string, BunSqliteStatement>();
  function stmt(sql: string): BunSqliteStatement {
    let s = stmtCache.get(sql);
    if (!s) {
      s = db.query(sql);
      stmtCache.set(sql, s);
    }
    return s;
  }

  return {
    exec(sql: string): void {
      db.exec(sql);
    },
    queryGet<T>(sql: string, ...params: unknown[]): T | undefined {
      const result = stmt(sql).get(...params);
      // bun:sqlite returns null for no match; normalize to undefined
      return (result ?? undefined) as T | undefined;
    },
    queryAll<T>(sql: string, ...params: unknown[]): T[] {
      return stmt(sql).all(...params) as T[];
    },
    queryRun(sql: string, ...params: unknown[]): StatementResult {
      stmt(sql).run(...params);
      // bun:sqlite doesn't return changes from .run(), so we query it.
      // Safe: bun:sqlite is synchronous and single-threaded — no write can
      // interleave between .run() and this SELECT within the same connection.
      const info = stmt(
        "SELECT changes() as changes, last_insert_rowid() as lastInsertRowid",
      ).get() as {
        changes: number;
        lastInsertRowid: number;
      };
      return info;
    },
    close(): void {
      stmtCache.clear();
      db.close();
    },
  };
}

/**
 * Open a SQLite database using better-sqlite3, wrapping it in SqliteDb.
 */
async function openBetterSqlite3(dbPath: string): Promise<SqliteDb> {
  const mod = await import("better-sqlite3");
  const BetterSqlite3 = mod.default;
  const db = new BetterSqlite3(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode=WAL");
  // Enforce foreign key constraints at the database level
  db.pragma("foreign_keys=ON");
  // Wait up to 5s for locks instead of failing immediately with SQLITE_BUSY
  db.pragma("busy_timeout=5000");

  // Cache compiled statements to avoid re-calling db.prepare() on every operation.
  // Use `any` for the cached statement type because better-sqlite3's Statement
  // generic overloads are incompatible with unknown[] spread args at the type level.
  // biome-ignore lint/suspicious/noExplicitAny: better-sqlite3 Statement generics
  const stmtCache = new Map<string, any>();
  function stmt(sql: string) {
    let s = stmtCache.get(sql);
    if (!s) {
      s = db.prepare(sql);
      stmtCache.set(sql, s);
    }
    return s;
  }

  return {
    exec(sql: string): void {
      db.exec(sql);
    },
    queryGet<T>(sql: string, ...params: unknown[]): T | undefined {
      return stmt(sql).get(...params) as T | undefined;
    },
    queryAll<T>(sql: string, ...params: unknown[]): T[] {
      return stmt(sql).all(...params) as T[];
    },
    queryRun(sql: string, ...params: unknown[]): StatementResult {
      const result = stmt(sql).run(...params);
      return {
        changes: result.changes,
        lastInsertRowid: Number(result.lastInsertRowid),
      };
    },
    close(): void {
      stmtCache.clear();
      db.close();
    },
  };
}

/**
 * Detect runtime and open the appropriate SQLite driver.
 *
 * Tries bun:sqlite first (zero-dependency when running under Bun),
 * then falls back to better-sqlite3 (Node.js).
 */
async function openDatabase(dbPath: string): Promise<SqliteDb> {
  let bunError: unknown;
  try {
    return await openBunSqlite(dbPath);
  } catch (error) {
    bunError = error;
  }
  try {
    return await openBetterSqlite3(dbPath);
  } catch (error) {
    throw new Error(
      `Failed to open SQLite database. bun:sqlite: ${bunError instanceof Error ? bunError.message : String(bunError)}; better-sqlite3: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Create a database instance.
 *
 * Uses `bun:sqlite` when running under Bun, falls back to `better-sqlite3`
 * for Node.js. The runtime detection is automatic.
 */
export async function createDatabase(config: Config): Promise<Database> {
  // Ensure the database directory exists (skip for in-memory databases)
  if (config.dbPath !== ":memory:") {
    mkdirSync(dirname(config.dbPath), { recursive: true });
  }

  const db = await openDatabase(config.dbPath);

  // Run schema DDL and FTS triggers
  db.exec(SCHEMA);
  db.exec(FTS_TRIGGERS);

  return {
    upsertDoc(doc: CleanDocument): number {
      db.queryRun(
        `INSERT INTO docs (slug, title, description, url, version, fetched_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(slug, version) DO UPDATE SET
           title = excluded.title,
           description = excluded.description,
           url = excluded.url,
           fetched_at = excluded.fetched_at`,
        doc.slug,
        doc.title,
        doc.description,
        doc.url,
        doc.version,
      );

      // ON CONFLICT UPDATE does not change lastInsertRowid reliably,
      // so always query the actual id by unique key.
      const row = db.queryGet<{ id: number }>(
        "SELECT id FROM docs WHERE slug = ? AND version = ?",
        doc.slug,
        doc.version,
      );
      if (!row) {
        throw new Error(`Failed to upsert doc: ${doc.slug} (${doc.version})`);
      }
      return row.id;
    },

    upsertChunk(chunk: Chunk, docId: number, embedding: Float32Array | null): void {
      const blob = embedding ? embeddingToBlob(embedding) : null;
      db.queryRun(
        `INSERT INTO chunks (doc_id, heading, content, content_hash, embedding, url, token_count)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(doc_id, heading, content_hash) DO UPDATE SET
           content = excluded.content,
           embedding = excluded.embedding,
           url = excluded.url,
           token_count = excluded.token_count`,
        docId,
        chunk.heading,
        chunk.content,
        chunk.id,
        blob,
        chunk.url,
        chunk.tokenCount,
      );
    },

    getDoc(slug: string, version: TailwindVersion): DocRow | undefined {
      return db.queryGet<DocRow>(
        "SELECT * FROM docs WHERE slug = ? AND version = ?",
        slug,
        version,
      );
    },

    getChunksForDoc(docId: number): ChunkRow[] {
      return db.queryAll<ChunkRow>("SELECT * FROM chunks WHERE doc_id = ?", docId);
    },

    getAllChunksWithEmbeddings(version: TailwindVersion): ChunkRow[] {
      return db.queryAll<ChunkRow>(
        `SELECT c.* FROM chunks c
         JOIN docs d ON c.doc_id = d.id
         WHERE d.version = ? AND c.embedding IS NOT NULL`,
        version,
      );
    },

    getChunkByHash(contentHash: string, docId: number): ChunkRow | undefined {
      return db.queryGet<ChunkRow>(
        "SELECT * FROM chunks WHERE content_hash = ? AND doc_id = ?",
        contentHash,
        docId,
      );
    },

    deleteOrphanedChunks(docId: number, validHashes: Set<string>): number {
      if (validHashes.size === 0) {
        // Delete all chunks for this doc
        const result = db.queryRun("DELETE FROM chunks WHERE doc_id = ?", docId);
        return result.changes;
      }

      // Use fixed SQL strings to avoid statement cache pollution.
      // A dynamic IN (?, ?, ...) clause creates a unique cached statement
      // per hash-set size. Instead, SELECT all + delete non-matching individually.
      const all = db.queryAll<{ id: number; content_hash: string }>(
        "SELECT id, content_hash FROM chunks WHERE doc_id = ?",
        docId,
      );
      let deleted = 0;
      for (const row of all) {
        if (!validHashes.has(row.content_hash)) {
          db.queryRun("DELETE FROM chunks WHERE id = ?", row.id);
          deleted++;
        }
      }
      return deleted;
    },

    deleteVersion(version: TailwindVersion): void {
      // Delete chunks first (referencing docs), then docs
      db.queryRun(
        `DELETE FROM chunks WHERE doc_id IN (
           SELECT id FROM docs WHERE version = ?
         )`,
        version,
      );
      db.queryRun("DELETE FROM docs WHERE version = ?", version);
      db.queryRun("DELETE FROM index_status WHERE version = ?", version);
    },

    updateIndexStatus(version: TailwindVersion, model: string, dimensions: number): void {
      const docCount = db.queryGet<{ count: number }>(
        "SELECT COUNT(*) as count FROM docs WHERE version = ?",
        version,
      );
      const chunkCount = db.queryGet<{ count: number }>(
        "SELECT COUNT(*) as count FROM chunks WHERE doc_id IN (SELECT id FROM docs WHERE version = ?)",
        version,
      );

      db.queryRun(
        `INSERT INTO index_status (version, doc_count, chunk_count, embedding_model, embedding_dimensions, indexed_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(version) DO UPDATE SET
           doc_count = excluded.doc_count,
           chunk_count = excluded.chunk_count,
           embedding_model = excluded.embedding_model,
           embedding_dimensions = excluded.embedding_dimensions,
           indexed_at = excluded.indexed_at`,
        version,
        docCount?.count ?? 0,
        chunkCount?.count ?? 0,
        model,
        dimensions,
      );
    },

    getIndexStatus(version?: TailwindVersion): IndexStatus[] {
      if (version) {
        return db.queryAll<IndexStatus>("SELECT * FROM index_status WHERE version = ?", version);
      }
      return db.queryAll<IndexStatus>("SELECT * FROM index_status");
    },

    getDocById(id: number): DocRow | undefined {
      return db.queryGet<DocRow>("SELECT * FROM docs WHERE id = ?", id);
    },

    searchFts(query: string, version: TailwindVersion, limit: number): ChunkRow[] {
      try {
        // Escape FTS5 special characters by double-quoting each token
        const escaped = query
          .split(/\s+/)
          .filter((t) => t.length > 0)
          .map((t) => `"${t.replace(/"/g, '""')}"`)
          .join(" ");
        if (!escaped) return [];

        return db.queryAll<ChunkRow>(
          `SELECT c.* FROM chunks_fts f
           JOIN chunks c ON c.id = f.rowid
           JOIN docs d ON c.doc_id = d.id
           WHERE chunks_fts MATCH ? AND d.version = ?
           ORDER BY bm25(chunks_fts)
           LIMIT ?`,
          escaped,
          version,
          limit,
        );
      } catch (error) {
        console.warn("[tailwindcss-docs-mcp] FTS5 search failed:", error);
        return [];
      }
    },

    close(): void {
      db.close();
    },
  };
}

/**
 * Convert a Float32Array to a Buffer for BLOB storage.
 */
export function embeddingToBlob(embedding: Float32Array): Buffer {
  // Copy via Uint8Array to decouple from the source ArrayBuffer,
  // symmetric with blobToEmbedding which also copies.
  return Buffer.from(new Uint8Array(embedding.buffer, embedding.byteOffset, embedding.byteLength));
}

/**
 * Convert a BLOB Buffer back to a Float32Array.
 *
 * Copies through Uint8Array to guarantee 4-byte alignment — a Buffer's
 * byteOffset may not be aligned, which would cause Float32Array to throw
 * a RangeError on construction.
 */
export function blobToEmbedding(blob: Buffer): Float32Array {
  const aligned = new Uint8Array(blob.byteLength);
  aligned.set(new Uint8Array(blob.buffer, blob.byteOffset, blob.byteLength));
  return new Float32Array(aligned.buffer);
}
