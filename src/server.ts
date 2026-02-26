import { readFileSync } from "node:fs";
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

const { version: SERVER_VERSION } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
) as { version: string };

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
 * Embedder loading status for observability.
 */
export type EmbedderStatus = "pending" | "downloading" | "ready" | "failed";

/**
 * Server dependencies injected at startup.
 * Embedder may be null if the model is still downloading.
 */
export interface ServerDeps {
  config: Config;
  db: Database;
  embedder: Embedder | null;
}

/**
 * Handle returned by createServer for post-initialization updates.
 */
export interface ServerHandle {
  /** Set the embedder once it finishes loading in the background. */
  setEmbedder(embedder: Embedder): void;
  /** Update the embedder loading status for observability. */
  setEmbedderStatus(status: EmbedderStatus): void;
  /** Get the current embedder loading status. */
  getEmbedderStatus(): EmbedderStatus;
}

export const EMBEDDER_STATUS_MESSAGES: Record<EmbedderStatus, string> = {
  pending: "Embedding model is initializing. Please wait a moment and try again.",
  downloading: "Embedding model is downloading (~27 MB). Please wait and try again.",
  ready: "Embedding model is ready.",
  failed: "Embedding model failed to load. Check server logs for details.",
};

/**
 * Create and configure the MCP server with all tool handlers.
 *
 * The server starts immediately even if the embedder is not yet available.
 * Tools that require the embedder (fetch_docs, search_docs) will throw
 * an error if called before the model has finished loading.
 */
export async function createServer(deps: ServerDeps): Promise<ServerHandle> {
  const { config, db } = deps;
  let embedder: Embedder | null = deps.embedder;
  let embedderStatus: EmbedderStatus = deps.embedder ? "ready" : "pending";

  function requireEmbedder(): Embedder {
    if (!embedder) {
      throw new Error(EMBEDDER_STATUS_MESSAGES[embedderStatus]);
    }
    return embedder;
  }

  const server = new McpServer({
    name: "tailwindcss-docs-mcp",
    version: SERVER_VERSION,
  });

  // Register fetch_docs
  server.tool(
    TOOL_NAMES.FETCH_DOCS,
    "Download and index Tailwind CSS documentation for local semantic search. Only needs to be run once per version. Re-run with force=true to refresh.",
    {
      version: z.enum(["v3", "v4"]).optional().describe("Tailwind CSS major version (default: v4)"),
      force: z
        .boolean()
        .optional()
        .describe("Force re-download and re-index even if already cached (default: false)"),
    },
    async (params) => {
      const result = await handleFetchDocs(params, config, db, requireEmbedder());
      return { content: [{ type: "text" as const, text: result.message }] };
    },
  );

  // Register search_docs
  server.tool(
    TOOL_NAMES.SEARCH_DOCS,
    "Search Tailwind CSS documentation using natural language. Returns the most relevant documentation snippets with code examples. Requires fetch_docs to be run first.",
    {
      query: z
        .string()
        .describe(
          "Natural language search query (e.g., 'how to add responsive padding', 'dark mode configuration', 'grid layout with gaps')",
        ),
      version: z
        .enum(["v3", "v4"])
        .optional()
        .describe("Tailwind CSS major version to search (default: v4)"),
      limit: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .describe("Maximum number of results to return (default: 5)"),
    },
    async (params) => {
      const result = await handleSearchDocs(params, db, requireEmbedder(), config.defaultVersion);
      const text = formatSearchResults(result);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  // Register list_utilities (does not require embedder)
  server.tool(
    TOOL_NAMES.LIST_UTILITIES,
    "List all Tailwind CSS utility categories with descriptions. Useful for discovering what utilities are available.",
    {
      category: z
        .string()
        .optional()
        .describe(
          "Filter by category (e.g., 'Layout', 'Spacing', 'Typography', 'Flexbox & Grid'). Omit to list all categories.",
        ),
      version: z.enum(["v3", "v4"]).optional().describe("Tailwind CSS major version (default: v4)"),
    },
    (params) => {
      const result = handleListUtilities(params, db, config.defaultVersion);
      const text = formatUtilitiesList(result);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  // Register check_status (does not require embedder)
  server.tool(
    TOOL_NAMES.CHECK_STATUS,
    "Check the current index status for Tailwind CSS documentation. Shows which versions are indexed, chunk counts, and when they were last updated.",
    {
      version: z
        .enum(["v3", "v4"])
        .optional()
        .describe("Check specific version (v3 or v4). Omit to check all."),
    },
    (params) => {
      const result = handleCheckStatus(params, db, embedderStatus);
      return { content: [{ type: "text" as const, text: result.message }] };
    },
  );

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  return {
    setEmbedder(e: Embedder) {
      embedder = e;
      embedderStatus = "ready";
    },
    setEmbedderStatus(status: EmbedderStatus) {
      embedderStatus = status;
    },
    getEmbedderStatus() {
      return embedderStatus;
    },
  };
}
