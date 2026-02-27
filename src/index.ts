#!/usr/bin/env node

/**
 * tailwindcss-docs-mcp — MCP server entry point.
 *
 * Local semantic search for Tailwind CSS documentation
 * via Model Context Protocol (MCP).
 *
 * Boot workflow:
 * 1. Start MCP server immediately (database only, no embedder)
 * 2. Try to load embedding model from cache (no network, fast)
 *    - Success: server is fully operational, check for updates in background
 *    - Failure: download model in background, server tools fail until ready
 * 3. Background update/download completes — embedder is hot-swapped immediately
 * 4. Auto-index default version if not already indexed
 */

import { mkdirSync } from "node:fs";
import { maybeAutoIndex } from "./auto-index.js";
import type { Embedder } from "./pipeline/embedder.js";
import { createEmbedder, loadCachedEmbedder } from "./pipeline/embedder.js";
import type { ServerHandle } from "./server.js";
import { createServer } from "./server.js";
import type { Database } from "./storage/database.js";
import { createDatabase } from "./storage/database.js";
import type { Config } from "./utils/config.js";
import { loadConfig } from "./utils/config.js";

async function main(): Promise<void> {
  const config = loadConfig();

  // Ensure data directory exists
  mkdirSync(config.dataDir, { recursive: true });

  // Initialize database
  const db = await createDatabase(config);

  // Ensure database is closed on process exit (WAL checkpoint, release locks)
  process.on("exit", () => {
    db.close();
  });

  // Start MCP server immediately (embedder loads in background)
  const server = await createServer({ config, db, embedder: null });

  // Auto-index helper: fire-and-forget after embedder is ready
  function triggerAutoIndex(e: Embedder) {
    maybeAutoIndex(config, db, e, {
      onStart: () => {
        server.setIndexingStatus("indexing");
        console.error("[tailwindcss-docs-mcp] Auto-indexing documentation...");
      },
      onComplete: () => {
        server.setIndexingStatus("complete");
        console.error("[tailwindcss-docs-mcp] Documentation index ready.");
      },
      onError: (error: unknown) => {
        server.setIndexingStatus("failed");
        console.error("[tailwindcss-docs-mcp] Auto-indexing failed:", error);
      },
    });
  }

  // Phase 1: Try local cache (fast, no network)
  const cached = await loadCachedEmbedder(config);

  if (cached) {
    // Model loaded from cache — server is fully operational
    server.setEmbedder(cached);
    console.error("[tailwindcss-docs-mcp] Embedding model loaded from cache.");
    triggerAutoIndex(cached);

    // Phase 2: Check for model updates in background, hot-swap if updated
    createEmbedder(config)
      .then((updated) => {
        server.setEmbedder(updated);
        console.error("[tailwindcss-docs-mcp] Model update check complete.");
      })
      .catch((error: unknown) => {
        console.error("[tailwindcss-docs-mcp] Model update check failed:", error);
      });
  } else {
    // Model not cached — download in background
    server.setEmbedderStatus("downloading");
    console.error(
      "[tailwindcss-docs-mcp] Embedding model not cached. Downloading in background...",
    );
    createEmbedder(config)
      .then((embedder) => {
        server.setEmbedder(embedder);
        console.error("[tailwindcss-docs-mcp] Embedding model downloaded and ready.");
        triggerAutoIndex(embedder);
      })
      .catch((error: unknown) => {
        server.setEmbedderStatus("failed");
        console.error("[tailwindcss-docs-mcp] Failed to download embedding model:", error);
      });
  }
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
