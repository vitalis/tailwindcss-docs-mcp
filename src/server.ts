import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { Embedder } from "./pipeline/embedder.js";
import type { Database } from "./storage/database.js";
import { handleCheckStatus } from "./tools/check-status.js";
import { handleFetchDocs } from "./tools/fetch-docs.js";
import { formatUtilitiesList, handleListUtilities } from "./tools/list-utilities.js";
import { formatSearchResults, handleSearchDocs } from "./tools/search-docs.js";
import type { Config } from "./utils/config.js";

/**
 * MCP tool names exposed by this server.
 */
export const TOOL_NAMES = {
  FETCH_DOCS: "fetch_docs",
  SEARCH_DOCS: "search_docs",
  LIST_UTILITIES: "list_utilities",
  CHECK_STATUS: "check_status",
} as const;

/**
 * Server dependencies injected at startup.
 */
export interface ServerDeps {
  config: Config;
  db: Database;
  embedder: Embedder;
}

/**
 * Create and configure the MCP server with all tool handlers.
 *
 * Registers the four tools (fetch_docs, search_docs, list_utilities, check_status)
 * and dispatches calls to their respective handlers.
 */
export async function createServer(deps: ServerDeps): Promise<void> {
  const { config, db, embedder } = deps;

  const server = new McpServer({
    name: "tailwindcss-docs-mcp",
    version: "0.1.0",
  });

  // Register fetch_docs
  server.tool(
    TOOL_NAMES.FETCH_DOCS,
    "Download and index Tailwind CSS documentation for local semantic search. Only needs to be run once per version. Re-run with force=true to refresh.",
    {
      version: z.enum(["v3", "v4"]).optional().describe("Tailwind CSS major version"),
      force: z
        .boolean()
        .optional()
        .describe("Force re-download and re-index even if already cached"),
    },
    async (params) => {
      const result = await handleFetchDocs(params, config, db, embedder);
      return { content: [{ type: "text" as const, text: result.message }] };
    },
  );

  // Register search_docs
  server.tool(
    TOOL_NAMES.SEARCH_DOCS,
    "Search Tailwind CSS documentation using natural language. Returns the most relevant documentation snippets with code examples. Requires fetch_docs to be run first.",
    {
      query: z.string().describe("Natural language search query"),
      version: z.enum(["v3", "v4"]).optional().describe("Tailwind CSS major version to search"),
      limit: z.number().min(1).max(20).optional().describe("Maximum number of results to return"),
    },
    async (params) => {
      const results = await handleSearchDocs(params, db, embedder);
      const text = formatSearchResults(results);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  // Register list_utilities
  server.tool(
    TOOL_NAMES.LIST_UTILITIES,
    "List all Tailwind CSS utility categories with descriptions. Useful for discovering what utilities are available.",
    {
      category: z.string().optional().describe("Filter by category name"),
      version: z.enum(["v3", "v4"]).optional().describe("Tailwind CSS major version"),
    },
    async (params) => {
      const result = await handleListUtilities(params, db);
      const text = formatUtilitiesList(result);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  // Register check_status
  server.tool(
    TOOL_NAMES.CHECK_STATUS,
    "Check the current index status for Tailwind CSS documentation. Shows which versions are indexed, chunk counts, and when they were last updated.",
    {
      version: z
        .enum(["v3", "v4"])
        .optional()
        .describe("Check specific version. Omit to check all."),
    },
    async (params) => {
      const result = await handleCheckStatus(params, db);
      return { content: [{ type: "text" as const, text: result.message }] };
    },
  );

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
