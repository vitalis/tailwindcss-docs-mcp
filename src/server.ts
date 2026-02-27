import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
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
 * Documentation indexing status for observability.
 */
export type IndexingStatus = "idle" | "indexing" | "complete" | "failed";

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
  /** Update the indexing status for observability. */
  setIndexingStatus(status: IndexingStatus): void;
  /** Get the current indexing status. */
  getIndexingStatus(): IndexingStatus;
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
export async function createServer(deps: ServerDeps, transport?: Transport): Promise<ServerHandle> {
  const { config, db } = deps;
  let embedder: Embedder | null = deps.embedder;
  let embedderStatus: EmbedderStatus = deps.embedder ? "ready" : "pending";
  let indexingStatus: IndexingStatus = "idle";

  function requireEmbedder(): Embedder {
    if (!embedder) {
      throw new Error(EMBEDDER_STATUS_MESSAGES[embedderStatus]);
    }
    return embedder;
  }

  function toolError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text" as const, text: `Error: ${message}` }],
      isError: true as const,
    };
  }

  const server = new McpServer({
    name: "tailwindcss-docs-mcp",
    version: SERVER_VERSION,
  });

  // Register fetch_docs
  server.tool(
    TOOL_NAMES.FETCH_DOCS,
    "Download and index Tailwind CSS documentation from GitHub. Documentation is indexed automatically on first server start — you do not need to call this unless the user explicitly asks to refresh or re-index, or to index a different version than the default. Use with force: true to re-download after a new Tailwind CSS release.",
    {
      version: z.enum(["v4", "v3"]).optional().describe("Tailwind CSS major version (default: v4)"),
      force: z
        .boolean()
        .optional()
        .describe("Force re-download and re-index even if already cached (default: false)"),
    },
    async (params) => {
      try {
        const result = await handleFetchDocs(params, config, db, requireEmbedder());
        return { content: [{ type: "text" as const, text: result.message }] };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  // Register search_docs
  server.tool(
    TOOL_NAMES.SEARCH_DOCS,
    "Search Tailwind CSS documentation using natural language. Use this when the user asks a specific question about Tailwind utilities, classes, configuration, or concepts (e.g., 'how do I center a div', 'dark mode setup', 'responsive padding'). Returns ranked documentation sections with headings, content, code examples, and links to tailwindcss.com. Do NOT use this for browsing or discovering what utility categories exist — use list_utilities instead. IMPORTANT: The response is pre-formatted markdown with clickable links to tailwindcss.com. Output it verbatim to the user. Do NOT reformat into tables, do NOT summarize, do NOT strip the markdown links. Reformatting destroys the documentation links.",
    {
      query: z
        .string()
        .describe(
          "Natural language search query (e.g., 'how to add responsive padding', 'dark mode configuration', 'grid layout with gaps')",
        ),
      version: z
        .enum(["v4", "v3"])
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
      try {
        const result = await handleSearchDocs(params, db, requireEmbedder(), config.defaultVersion);
        const text = formatSearchResults(result, indexingStatus);
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  // Register list_utilities (does not require embedder)
  server.tool(
    TOOL_NAMES.LIST_UTILITIES,
    "List Tailwind CSS utility categories and their documentation pages. Use this when the user wants to browse, discover, or explore what utilities are available (e.g., 'what layout utilities exist', 'show me the effects category', 'list all spacing utilities'). Returns category names with descriptions and links to each utility's documentation page on tailwindcss.com. This is a browsing tool — it shows what categories and pages exist, not detailed usage. Do NOT follow up with search_docs unless the user explicitly asks a specific question. IMPORTANT: The response is pre-formatted markdown with clickable links to tailwindcss.com. Output it verbatim to the user. Do NOT reformat into tables, do NOT summarize, do NOT strip the markdown links. Reformatting destroys the documentation links.",
    {
      category: z
        .string()
        .optional()
        .describe(
          "Filter by category (e.g., 'Layout', 'Spacing', 'Typography', 'Flexbox & Grid'). Omit to list all categories.",
        ),
      version: z.enum(["v4", "v3"]).optional().describe("Tailwind CSS major version (default: v4)"),
    },
    (params) => {
      try {
        const result = handleListUtilities(params, db, config.defaultVersion);
        const text = formatUtilitiesList(result);
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  // Register check_status (does not require embedder)
  server.tool(
    TOOL_NAMES.CHECK_STATUS,
    "Check the current state of the Tailwind CSS documentation index. Returns which versions are indexed, document and chunk counts, embedding model status, and when each version was last indexed. Use this to verify the index is ready or to diagnose why search_docs returns no results.",
    {
      version: z
        .enum(["v4", "v3"])
        .optional()
        .describe("Check specific version (v4 or v3). Omit to check all."),
    },
    (params) => {
      try {
        const result = handleCheckStatus(
          params,
          db,
          embedderStatus,
          indexingStatus,
          SERVER_VERSION,
        );
        return { content: [{ type: "text" as const, text: result.message }] };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  // Connect via provided transport or default to stdio
  await server.connect(transport ?? new StdioServerTransport());

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
    setIndexingStatus(status: IndexingStatus) {
      indexingStatus = status;
    },
    getIndexingStatus() {
      return indexingStatus;
    },
  };
}
