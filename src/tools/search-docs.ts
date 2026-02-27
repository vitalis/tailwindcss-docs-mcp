import type { Embedder } from "../pipeline/embedder.js";
import type { IndexingStatus } from "../server.js";
import type { Database } from "../storage/database.js";
import { type SearchResult, hybridSearch } from "../storage/search.js";
import type { TailwindVersion } from "../utils/config.js";

/**
 * Input parameters for the search_docs MCP tool.
 */
export interface SearchDocsInput {
  /** Natural language search query */
  query: string;
  /** Tailwind CSS major version to search (default: "v4") */
  version?: TailwindVersion;
  /** Maximum number of results (default: 5, min: 1, max: 20) */
  limit?: number;
}

/**
 * Result from the search_docs handler, including metadata about index state.
 */
export interface SearchDocsResult {
  results: SearchResult[];
  notIndexed: boolean;
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
  defaultVersion: TailwindVersion,
): Promise<SearchDocsResult> {
  const version = input.version ?? defaultVersion;
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 20);

  // Check if index exists
  const status = db.getIndexStatus(version);
  if (status.length === 0) {
    return { results: [], notIndexed: true };
  }

  const results = await hybridSearch(db, embedder, {
    query: input.query,
    version,
    limit,
  });

  return { results, notIndexed: false };
}

/**
 * Format search results as markdown for LLM consumption.
 *
 * Each result includes:
 * - Heading breadcrumb
 * - Content snippet
 * - Deep link to tailwindcss.com
 */
export function formatSearchResults(
  result: SearchDocsResult,
  indexingStatus?: IndexingStatus,
): string {
  if (result.notIndexed) {
    if (indexingStatus === "indexing") {
      return "Documentation is being indexed automatically. This takes 1-2 minutes on first run. Please wait a moment and try again.";
    }
    if (indexingStatus === "failed") {
      return "Auto-indexing failed. Run fetch_docs to index manually.";
    }
    return "Index not built for this version. Run fetch_docs to index.";
  }

  if (result.results.length === 0) {
    return "No results found for this query.";
  }

  const lines: string[] = [];

  for (let i = 0; i < result.results.length; i++) {
    const r = result.results[i];
    lines.push(`## ${i + 1}. ${r.docTitle} — ${r.heading}`);
    lines.push(`[View on tailwindcss.com](${r.url})\n`);
    lines.push(r.content);
    lines.push("");
  }

  return lines.join("\n");
}
