/**
 * Shared types used across server and tool modules.
 *
 * Extracted here to avoid circular imports between server.ts and tool modules.
 */

/**
 * Embedder loading status for observability.
 */
export type EmbedderStatus = "pending" | "downloading" | "ready" | "failed";

/**
 * Documentation indexing status for observability.
 */
export type IndexingStatus = "idle" | "indexing" | "complete" | "failed";

/** User-facing messages for indexing status states, shared by search-docs and check-status. */
export const INDEXING_MESSAGES = {
  failed: "Auto-indexing failed. Run fetch_docs to index manually.",
  inProgress: "Auto-indexing in progress. This takes 1-2 minutes on first run.",
} as const;
