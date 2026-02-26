import type { Embedder } from "../pipeline/embedder.js";
import type { Database } from "../storage/database.js";
import type { SearchResult } from "../storage/search.js";
import type { TailwindVersion } from "../utils/config.js";

/**
 * Input parameters for the search_docs MCP tool.
 */
export interface SearchDocsInput {
  /** Natural language search query */
  query: string;
  /** Tailwind CSS major version to search (default: "v3") */
  version?: TailwindVersion;
  /** Maximum number of results (default: 5, min: 1, max: 20) */
  limit?: number;
}

/**
 * Handle the `search_docs` MCP tool call.
 *
 * Performs hybrid semantic + keyword search:
 * 1. Embed the query (with snowflake-arctic-embed-xs query prefix)
 * 2. Cosine similarity against in-memory chunk embeddings
 * 3. FTS5 keyword search for exact class names
 * 4. Merge, deduplicate, and rank results
 *
 * Returns an error message if the index has not been built yet.
 */
export async function handleSearchDocs(
  input: SearchDocsInput,
  db: Database,
  embedder: Embedder,
): Promise<SearchResult[]> {
  // TODO: implement
  return [];
}

/**
 * Format search results as markdown for LLM consumption.
 *
 * Each result includes:
 * - Heading breadcrumb
 * - Content snippet
 * - Deep link to tailwindcss.com
 */
export function formatSearchResults(results: SearchResult[]): string {
  // TODO: implement
  return "";
}
