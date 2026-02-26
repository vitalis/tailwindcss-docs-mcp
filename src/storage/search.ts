import type { Embedder } from "../pipeline/embedder.js";
import type { TailwindVersion } from "../utils/config.js";
import type { ChunkRow } from "./database.js";
import type { Database } from "./database.js";

/**
 * A search result with score and metadata.
 */
export interface SearchResult {
  /** Combined relevance score (0-1) */
  score: number;
  /** Chunk heading breadcrumb */
  heading: string;
  /** Chunk content (clean markdown) */
  content: string;
  /** Deep link to tailwindcss.com */
  url: string;
  /** Parent document title */
  docTitle: string;
}

/**
 * Options for search operations.
 */
export interface SearchOptions {
  /** Search query string */
  query: string;
  /** Tailwind CSS version to search */
  version: TailwindVersion;
  /** Maximum number of results (default: 5) */
  limit?: number;
}

/**
 * Internal representation of a scored chunk during search.
 */
interface ScoredChunk {
  chunk: ChunkRow;
  semanticScore: number;
  keywordScore: number;
  fusedScore: number;
}

/**
 * Perform hybrid semantic + keyword search across indexed documentation.
 *
 * Strategy:
 * 1. Semantic search: embed query -> cosine similarity against all chunk embeddings
 * 2. Keyword search: FTS5 query for exact class name matches
 * 3. Merge and rank: combine results, dedup by chunk ID, sort by fused score
 */
export async function hybridSearch(
  db: Database,
  embedder: Embedder,
  options: SearchOptions,
): Promise<SearchResult[]> {
  // TODO: implement
  return [];
}

/**
 * Perform semantic-only search using cosine similarity.
 *
 * Embeds the query with the snowflake-arctic-embed-xs query prefix,
 * then computes cosine similarity against all stored chunk embeddings.
 */
export async function semanticSearch(
  embedder: Embedder,
  chunks: ChunkRow[],
  query: string,
  limit: number,
): Promise<ScoredChunk[]> {
  // TODO: implement
  return [];
}

/**
 * Perform keyword-only search using SQLite FTS5.
 *
 * Useful for exact class name lookups (e.g., "px-4", "grid-cols-3").
 */
export function keywordSearch(
  db: Database,
  query: string,
  version: TailwindVersion,
  limit: number,
): ScoredChunk[] {
  // TODO: implement
  return [];
}

/**
 * Fuse semantic and keyword scores into a single ranking.
 *
 * Uses reciprocal rank fusion (RRF) to combine results from
 * both search strategies, deduplicating by chunk ID.
 */
export function fuseResults(
  semanticResults: ScoredChunk[],
  keywordResults: ScoredChunk[],
  limit: number,
): ScoredChunk[] {
  // TODO: implement
  return [];
}
