import type { Embedder } from "./pipeline/embedder.js";
import type { Database } from "./storage/database.js";
import { handleFetchDocs } from "./tools/fetch-docs.js";
import type { Config } from "./utils/config.js";

/**
 * Callbacks for auto-index lifecycle events.
 */
export interface AutoIndexCallbacks {
  onStart: () => void;
  onComplete: () => void;
  onError: (error: unknown) => void;
}

/**
 * Auto-index the default Tailwind CSS version if not already indexed.
 *
 * Checks the database for an existing index. If found, calls onComplete
 * immediately. Otherwise, triggers handleFetchDocs in the background.
 *
 * Reuses handleFetchDocs which has its own mutex for concurrent-call safety.
 */
export async function maybeAutoIndex(
  config: Config,
  db: Database,
  embedder: Embedder,
  callbacks: AutoIndexCallbacks,
): Promise<void> {
  const version = config.defaultVersion;

  try {
    // Skip if already indexed
    const status = db.getIndexStatus(version);
    if (status.length > 0) {
      callbacks.onComplete();
      return;
    }

    callbacks.onStart();
    await handleFetchDocs({ version }, config, db, embedder);
    callbacks.onComplete();
  } catch (error) {
    callbacks.onError(error);
  }
}
