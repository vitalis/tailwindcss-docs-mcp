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
