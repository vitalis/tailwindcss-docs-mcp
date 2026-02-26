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
  /** Human-readable status message */
  message: string;
}

/**
 * Handle the `check_status` MCP tool call.
 *
 * Reports the current index state without triggering any work.
 * Returns doc/chunk counts, embedding model used, and last indexed timestamp.
 */
export async function handleCheckStatus(
  input: CheckStatusInput,
  db: Database,
): Promise<CheckStatusResult> {
  const versions = db.getIndexStatus(input.version);
  const indexed = versions.length > 0;

  return {
    indexed,
    versions,
    message: formatStatus({ indexed, versions, message: "" }),
  };
}

/**
 * Format the status as markdown for LLM consumption.
 */
export function formatStatus(result: CheckStatusResult): string {
  if (!result.indexed) {
    return "Not indexed. Run fetch_docs to index Tailwind CSS documentation.";
  }

  const lines: string[] = ["# Tailwind CSS Documentation Index Status\n"];

  for (const v of result.versions) {
    lines.push(`## ${v.version}`);
    lines.push(`- **Documents**: ${v.doc_count}`);
    lines.push(`- **Chunks**: ${v.chunk_count}`);
    lines.push(`- **Model**: ${v.embedding_model} (${v.embedding_dimensions} dimensions)`);
    lines.push(`- **Last indexed**: ${v.indexed_at}`);
    lines.push("");
  }

  return lines.join("\n");
}
