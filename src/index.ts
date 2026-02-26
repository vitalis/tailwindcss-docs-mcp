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

import { loadConfig } from "./utils/config.js";

async function main(): Promise<void> {
  const config = loadConfig();

  // TODO: implement
  // 1. Ensure data directory exists (mkdir -p config.dataDir)
  // 2. Create database instance (createDatabase(config))
  // 3. Create embedder instance (createEmbedder(config))
  // 4. Start MCP server (createServer({ config, db, embedder }))

  // Placeholder: log startup info
  console.error("tailwindcss-docs-mcp starting...");
  console.error(`  Data directory: ${config.dataDir}`);
  console.error(`  Default version: ${config.defaultVersion}`);
  console.error(`  Embedding model: ${config.embeddingModel}`);
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
