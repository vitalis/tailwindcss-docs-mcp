import type { EmbedderStatus, IndexingStatus } from "../server.js";
import type { Database, IndexStatus } from "../storage/database.js";
import type { TailwindVersion } from "../utils/config.js";

/**
 * Input parameters for the check_status MCP tool.
 */
export interface CheckStatusInput {
  /** Check specific version. Omit to check all. */
  version?: TailwindVersion;
}

/**
 * Result of the check_status operation.
 */
export interface CheckStatusResult {
  /** Whether any version is indexed */
  indexed: boolean;
  /** Status for each requested version */
  versions: IndexStatus[];
  /** Current embedder loading status */
  embedderStatus: EmbedderStatus;
  /** Human-readable status message */
  message: string;
}

/**
 * Handle the `check_status` MCP tool call.
 *
 * Reports the current index state without triggering any work.
 * Returns doc/chunk counts, embedding model used, and last indexed timestamp.
 */
export function handleCheckStatus(
  input: CheckStatusInput,
  db: Database,
  embedderStatus: EmbedderStatus,
  indexingStatus?: IndexingStatus,
  serverVersion?: string,
): CheckStatusResult {
  const versions = db.getIndexStatus(input.version);
  const indexed = versions.length > 0;

  const message = formatStatus(indexed, versions, embedderStatus, indexingStatus, serverVersion);

  return { indexed, versions, embedderStatus, message };
}

/**
 * Format the status as markdown for LLM consumption.
 */
export function formatStatus(
  indexed: boolean,
  versions: IndexStatus[],
  embedderStatus: EmbedderStatus,
  indexingStatus?: IndexingStatus,
  serverVersion?: string,
): string {
  const lines: string[] = ["# Tailwind CSS Documentation Index Status\n"];

  // Server version
  if (serverVersion) {
    lines.push(`**Server version**: ${serverVersion}`);
  }

  // Embedding model status
  const statusLabels: Record<EmbedderStatus, string> = {
    pending: "initializing",
    downloading: "downloading (~27 MB)",
    ready: "ready",
    failed: "failed to load",
  };
  lines.push(`**Embedding model**: ${statusLabels[embedderStatus]}\n`);

  if (!indexed) {
    if (indexingStatus === "indexing") {
      lines.push("Auto-indexing in progress. This takes 1-2 minutes on first run.");
    } else if (indexingStatus === "failed") {
      lines.push("Auto-indexing failed. Run fetch_docs to index manually.");
    } else {
      lines.push("Not indexed. Run fetch_docs to index Tailwind CSS documentation.");
    }
    return lines.join("\n");
  }

  for (const v of versions) {
    lines.push(`## ${v.version}`);
    lines.push(`- **Documents**: ${v.doc_count}`);
    lines.push(`- **Chunks**: ${v.chunk_count}`);
    lines.push(`- **Model**: ${v.embedding_model} (${v.embedding_dimensions} dimensions)`);
    lines.push(`- **Last indexed**: ${v.indexed_at}`);
    lines.push("");
  }

  return lines.join("\n");
}
