import type { Embedder } from "../pipeline/embedder.js";
import type { TailwindVersion } from "../utils/config.js";
import { cosineSimilarity } from "../utils/similarity.js";
import { type ChunkRow, type Database, blobToEmbedding } from "./database.js";

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
export interface ScoredChunk {
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
  const { query, version, limit = 5 } = options;

  if (!query.trim()) return [];

  const chunks = db.getAllChunksWithEmbeddings(version);
  if (chunks.length > 5000) {
    console.warn(
      `[tailwindcss-docs-mcp] ${chunks.length} chunks loaded for brute-force semantic search. Consider optimizing for large corpora.`,
    );
  }
  if (chunks.length === 0) return [];

  // Run both search strategies — fetch 2x limit for better fusion
  const fetchLimit = limit * 2;
  const [semantic, keyword] = await Promise.all([
    semanticSearch(embedder, chunks, query, fetchLimit),
    keywordSearch(db, query, version, fetchLimit),
  ]);

  const fused = fuseResults(semantic, keyword, limit);

  return fused.map((scored) => {
    const doc = db.getDocById(scored.chunk.doc_id);
    return {
      score: scored.fusedScore,
      heading: scored.chunk.heading,
      content: scored.chunk.content,
      url: scored.chunk.url,
      docTitle: doc?.title ?? "",
    };
  });
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
  const queryEmbedding = await embedder.embed(query, { isQuery: true });

  return chunks
    .filter((c) => c.embedding !== null)
    .map((chunk) => {
      const chunkEmbedding = blobToEmbedding(chunk.embedding as Buffer);
      const score = cosineSimilarity(queryEmbedding, chunkEmbedding);
      return {
        chunk,
        semanticScore: score,
        keywordScore: 0,
        fusedScore: score,
      };
    })
    .sort((a, b) => b.semanticScore - a.semanticScore)
    .slice(0, limit);
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
  const ftsChunks = db.searchFts(query, version, limit);

  return ftsChunks.map((chunk, index) => ({
    chunk,
    semanticScore: 0,
    // Assign decreasing scores based on FTS rank order
    keywordScore: 1 / (index + 1),
    fusedScore: 0,
  }));
}

/**
 * Fuse semantic and keyword scores into a single ranking.
 *
 * Uses reciprocal rank fusion (RRF) to combine results from
 * both search strategies, deduplicating by chunk ID.
 *
 * Formula: score = 1/(k + rank_semantic) + 1/(k + rank_keyword)
 * where k = 60 (standard RRF constant)
 */
export function fuseResults(
  semanticResults: ScoredChunk[],
  keywordResults: ScoredChunk[],
  limit: number,
): ScoredChunk[] {
  const K = 60;
  const chunkMap = new Map<number, ScoredChunk>();

  // Assign semantic RRF scores (1-indexed ranks)
  for (let i = 0; i < semanticResults.length; i++) {
    const rank = i + 1;
    const rrf = 1 / (K + rank);
    const { chunk } = semanticResults[i];
    const entry: ScoredChunk = chunkMap.get(chunk.id) ?? {
      chunk,
      semanticScore: 0,
      keywordScore: 0,
      fusedScore: 0,
    };
    entry.fusedScore += rrf;
    entry.semanticScore = semanticResults[i].semanticScore;
    chunkMap.set(chunk.id, entry);
  }

  // Assign keyword RRF scores
  for (let i = 0; i < keywordResults.length; i++) {
    const rank = i + 1;
    const rrf = 1 / (K + rank);
    const { chunk } = keywordResults[i];
    const entry: ScoredChunk = chunkMap.get(chunk.id) ?? {
      chunk,
      semanticScore: 0,
      keywordScore: 0,
      fusedScore: 0,
    };
    entry.fusedScore += rrf;
    entry.keywordScore = keywordResults[i].keywordScore;
    chunkMap.set(chunk.id, entry);
  }

  return [...chunkMap.values()].sort((a, b) => b.fusedScore - a.fusedScore).slice(0, limit);
}
