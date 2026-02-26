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
  /** Initialize the database: create tables, indexes, and FTS */
  initialize(): void;

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

  /** Close the database connection */
  close(): void;
}

/**
 * SQL schema for the documentation database.
 */
export const SCHEMA = `
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
  content_rowid='id'
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
 * Create a database instance.
 *
 * Uses `bun:sqlite` when running under Bun, falls back to `better-sqlite3`
 * for Node.js. The runtime detection is automatic.
 */
export async function createDatabase(config: Config): Promise<Database> {
  // TODO: implement
  // 1. Detect runtime (Bun vs Node.js)
  // 2. Open or create the SQLite database at config.dbPath
  // 3. Run migrations (create tables)
  // 4. Return Database instance
  throw new Error("Not implemented");
}

/**
 * Convert a Float32Array to a Buffer for BLOB storage.
 */
export function embeddingToBlob(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer);
}

/**
 * Convert a BLOB Buffer back to a Float32Array.
 */
export function blobToEmbedding(blob: Buffer): Float32Array {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}
