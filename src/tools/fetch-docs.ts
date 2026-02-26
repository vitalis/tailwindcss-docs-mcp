import type { Embedder } from "../pipeline/embedder.js";
import type { Database } from "../storage/database.js";
import type { Config, TailwindVersion } from "../utils/config.js";

/**
 * Input parameters for the fetch_docs MCP tool.
 */
export interface FetchDocsInput {
  /** Tailwind CSS major version (default: "v3") */
  version?: TailwindVersion;
  /** Force re-download and re-index even if already cached (default: false) */
  force?: boolean;
}

/**
 * Result of the fetch_docs operation.
 */
export interface FetchDocsResult {
  /** Status message describing what happened */
  message: string;
  /** Number of documents processed */
  docCount: number;
  /** Number of chunks created */
  chunkCount: number;
  /** Time taken in milliseconds */
  durationMs: number;
}

/**
 * Handle the `fetch_docs` MCP tool call.
 *
 * Orchestrates the full pipeline:
 * 1. Fetch MDX files from GitHub (or use cache)
 * 2. Parse MDX into clean markdown
 * 3. Chunk documents by headings
 * 4. Generate embeddings via ONNX
 * 5. Store chunks and embeddings in SQLite
 *
 * Uses content hashing (SHA-256) for incremental re-indexing:
 * unchanged chunks are not re-embedded.
 */
export async function handleFetchDocs(
  input: FetchDocsInput,
  config: Config,
  db: Database,
  embedder: Embedder,
): Promise<FetchDocsResult> {
  // TODO: implement
  throw new Error("Not implemented");
}
