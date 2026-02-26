import { chunkDocument, contentHash } from "../pipeline/chunker.js";
import { buildEmbeddingInput } from "../pipeline/embedder.js";
import type { Embedder } from "../pipeline/embedder.js";
import { fetchDocs, readCachedDocs } from "../pipeline/fetcher.js";
import { parseMdx } from "../pipeline/parser.js";
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
  const start = Date.now();
  const version = input.version ?? config.defaultVersion;
  const force = input.force ?? false;

  // Step 1: Fetch from GitHub (or use cache)
  await fetchDocs(config, { version, force });

  // Step 2: Read cached files
  const rawFiles = await readCachedDocs(config, version);
  if (rawFiles.length === 0) {
    return {
      message: "No documentation files found.",
      docCount: 0,
      chunkCount: 0,
      durationMs: Date.now() - start,
    };
  }

  let totalChunks = 0;

  // Process each document
  for (const file of rawFiles) {
    // Step 2: Parse MDX → clean markdown
    const doc = parseMdx(file.content, file.slug, version);

    // Step 3: Upsert document
    const docId = db.upsertDoc(doc);

    // Step 4: Chunk
    const chunks = chunkDocument(doc);
    const validHashes = new Set<string>();

    for (const chunk of chunks) {
      const hash = chunk.id; // chunk.id is the content hash
      validHashes.add(hash);

      // Check if chunk already exists with same hash (skip re-embedding)
      const existing = db.getChunkByHash(hash, docId);
      if (existing?.embedding && !force) {
        continue;
      }

      // Step 5: Embed
      const embeddingInput = buildEmbeddingInput(doc.title, chunk.heading, chunk.content);
      const embedding = await embedder.embed(embeddingInput);

      // Step 6: Store
      db.upsertChunk(chunk, docId, embedding);
    }

    // Clean up orphaned chunks
    db.deleteOrphanedChunks(docId, validHashes);
    totalChunks += chunks.length;
  }

  // Update index status
  db.updateIndexStatus(version, config.embeddingModel, config.embeddingDimensions);

  const durationMs = Date.now() - start;
  return {
    message: `Indexed ${rawFiles.length} documents with ${totalChunks} chunks in ${durationMs}ms.`,
    docCount: rawFiles.length,
    chunkCount: totalChunks,
    durationMs,
  };
}
