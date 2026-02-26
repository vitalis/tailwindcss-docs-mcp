import type { Database } from "../storage/database.js";
import type { IndexStatus } from "../storage/database.js";
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
  // TODO: implement
  return {
    indexed: false,
    versions: [],
    message: "Not indexed. Run fetch_docs to index Tailwind CSS documentation.",
  };
}

/**
 * Format the status as markdown for LLM consumption.
 */
export function formatStatus(result: CheckStatusResult): string {
  // TODO: implement
  return result.message;
}
