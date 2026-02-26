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
  return `Tailwind CSS: ${docTitle}\n\n${heading}\n\n${content}`;
}

/**
 * Normalize a vector to unit length (L2 normalization).
 */
function normalize(vector: Float32Array): Float32Array {
  let magnitude = 0;
  for (let i = 0; i < vector.length; i++) {
    magnitude += vector[i] * vector[i];
  }
  magnitude = Math.sqrt(magnitude);
  if (magnitude === 0) return vector;

  const result = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    result[i] = vector[i] / magnitude;
  }
  return result;
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
  const { pipeline } = await import("@huggingface/transformers");
  const extractor = await pipeline("feature-extraction", config.embeddingModel, {
    dtype: "fp32",
  });

  async function embed(text: string, options?: EmbedOptions): Promise<Float32Array> {
    const input = options?.isQuery ? `${config.queryPrefix}${text}` : text;
    const output = await extractor(input, { pooling: "cls", normalize: false });
    const data = output.tolist()[0] as number[];
    return normalize(new Float32Array(data));
  }

  return {
    embed,
    async embedBatch(texts: string[], options?: EmbedOptions): Promise<Float32Array[]> {
      const results: Float32Array[] = [];
      for (const text of texts) {
        results.push(await embed(text, options));
      }
      return results;
    },
    isReady: () => true,
  };
}
