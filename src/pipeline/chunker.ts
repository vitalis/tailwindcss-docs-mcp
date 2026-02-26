import type { CleanDocument } from "./parser.js";

/**
 * A chunk of documentation content with metadata for embedding and retrieval.
 */
export interface Chunk {
  /** SHA-256 hash of content for deduplication and incremental re-indexing */
  id: string;
  /** Parent document slug (e.g., "padding") */
  docSlug: string;
  /** Heading breadcrumb (e.g., "## Basic usage > ### Padding a single side") */
  heading: string;
  /** Chunk text content (clean markdown) */
  content: string;
  /** Deep link URL (e.g., "https://tailwindcss.com/docs/padding#basic-usage") */
  url: string;
  /** Tailwind CSS version */
  version: string;
  /** Approximate token count for context window awareness */
  tokenCount: number;
}

/**
 * Options for the chunking process.
 */
export interface ChunkOptions {
  /** Maximum tokens per chunk (default: 500) */
  maxTokens?: number;
}

/** Default maximum tokens per chunk */
const DEFAULT_MAX_TOKENS = 500;

/**
 * Split a clean document into semantically meaningful chunks.
 *
 * Chunking rules:
 * 1. Split on `##` headings — each `##` section becomes one or more chunks
 * 2. Max chunk size: ~500 tokens (configurable)
 * 3. Code blocks stay intact — never split a code block across chunks
 * 4. Heading breadcrumb: include heading hierarchy in each chunk
 * 5. Overlap: include parent `##` heading text in sub-chunks
 */
export function chunkDocument(doc: CleanDocument, options?: ChunkOptions): Chunk[] {
  // TODO: implement
  return [];
}

/**
 * Generate a SHA-256 content hash for a chunk.
 *
 * Used for incremental re-indexing: unchanged content produces
 * the same hash, so we can skip re-embedding.
 */
export function contentHash(content: string): string {
  // TODO: implement
  return "";
}

/**
 * Estimate the token count for a string.
 *
 * Uses a simple heuristic: ~4 characters per token for English text.
 * This is intentionally approximate — exact tokenization is model-dependent
 * and not worth the overhead for chunk size estimation.
 */
export function estimateTokens(text: string): number {
  // TODO: implement
  return 0;
}

/**
 * Convert a heading string into a URL-safe anchor fragment.
 *
 * "## Basic usage" -> "basic-usage"
 * "### Adding horizontal padding" -> "adding-horizontal-padding"
 */
export function headingToAnchor(heading: string): string {
  // TODO: implement
  return "";
}
