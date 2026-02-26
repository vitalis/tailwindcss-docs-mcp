#!/usr/bin/env node

/**
 * tailwindcss-docs-mcp — MCP server entry point.
 *
 * Local semantic search for Tailwind CSS documentation
 * via Model Context Protocol (MCP).
 *
 * Usage:
 *   bun run src/index.ts          # Development (Bun)
 *   npx tailwindcss-docs-mcp      # Published package (Node.js)
 *   bunx tailwindcss-docs-mcp     # Published package (Bun)
 */

import { mkdirSync } from "node:fs";
import { createEmbedder } from "./pipeline/embedder.js";
import { createServer } from "./server.js";
import { createDatabase } from "./storage/database.js";
import { loadConfig } from "./utils/config.js";

async function main(): Promise<void> {
  const config = loadConfig();

  // Ensure data directory exists
  mkdirSync(config.dataDir, { recursive: true });

  // Initialize database
  const db = await createDatabase(config);

  // Initialize embedder (downloads model on first run)
  const embedder = await createEmbedder(config);

  // Start MCP server
  await createServer({ config, db, embedder });
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
