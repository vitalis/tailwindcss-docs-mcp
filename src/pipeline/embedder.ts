import type { Config } from "../utils/config.js";

/**
 * Options for embedding operations.
 */
export interface EmbedOptions {
  /** Whether to prepend the query prefix (for search queries, not documents) */
  isQuery: boolean;
}

/**
 * Result of embedding a single text.
 */
export interface EmbeddingResult {
  /** The embedding vector as a Float32Array (384 dimensions for snowflake-arctic-embed-xs) */
  embedding: Float32Array;
}

/**
 * The embedder instance, initialized with the ONNX model.
 */
export interface Embedder {
  /** Embed a single text string */
  embed(text: string, options?: EmbedOptions): Promise<Float32Array>;
  /** Embed multiple texts in a batch */
  embedBatch(texts: string[], options?: EmbedOptions): Promise<Float32Array[]>;
  /** Check if the model is loaded */
  isReady(): boolean;
}

/**
 * Build the embedding input string for a chunk.
 *
 * Prepends metadata to improve retrieval quality:
 * - Library context ("Tailwind CSS: {docTitle}")
 * - Section context (heading breadcrumb)
 * - Actual content
 */
export function buildEmbeddingInput(docTitle: string, heading: string, content: string): string {
  // TODO: implement
  return "";
}

/**
 * Create an embedder instance using @huggingface/transformers with ONNX runtime.
 *
 * The model (snowflake-arctic-embed-xs) is downloaded on first use and cached locally.
 * Subsequent calls load from cache (~27 MB model file).
 *
 * For search queries, the model requires prepending a specific prefix:
 * "Represent this sentence for searching relevant passages: "
 * This is handled automatically when `isQuery: true` is passed to embed().
 */
export async function createEmbedder(config: Config): Promise<Embedder> {
  // TODO: implement
  // 1. Load pipeline from @huggingface/transformers
  // 2. Use config.embeddingModel as the model identifier
  // 3. Return an Embedder instance
  throw new Error("Not implemented");
}
