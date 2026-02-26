import type { Embedder } from "./pipeline/embedder.js";
import type { Database } from "./storage/database.js";
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
 * MCP tool definitions with JSON schemas matching the architecture doc.
 */
export const TOOL_DEFINITIONS = [
  {
    name: TOOL_NAMES.FETCH_DOCS,
    description:
      "Download and index Tailwind CSS documentation for local semantic search. Only needs to be run once per version. Re-run with force=true to refresh.",
    inputSchema: {
      type: "object" as const,
      properties: {
        version: {
          type: "string",
          enum: ["v3", "v4"],
          default: "v3",
          description: "Tailwind CSS major version",
        },
        force: {
          type: "boolean",
          default: false,
          description: "Force re-download and re-index even if already cached",
        },
      },
    },
  },
  {
    name: TOOL_NAMES.SEARCH_DOCS,
    description:
      "Search Tailwind CSS documentation using natural language. Returns the most relevant documentation snippets with code examples. Requires fetch_docs to be run first.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Natural language search query (e.g., 'how to add responsive padding', 'dark mode configuration', 'grid layout with gaps')",
        },
        version: {
          type: "string",
          enum: ["v3", "v4"],
          default: "v3",
          description: "Tailwind CSS major version to search",
        },
        limit: {
          type: "number",
          default: 5,
          minimum: 1,
          maximum: 20,
          description: "Maximum number of results to return",
        },
      },
      required: ["query"],
    },
  },
  {
    name: TOOL_NAMES.LIST_UTILITIES,
    description:
      "List all Tailwind CSS utility categories with descriptions. Useful for discovering what utilities are available.",
    inputSchema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          description:
            "Filter by category (e.g., 'layout', 'spacing', 'typography', 'flexbox'). Omit to list all categories.",
        },
        version: {
          type: "string",
          enum: ["v3", "v4"],
          default: "v3",
        },
      },
    },
  },
  {
    name: TOOL_NAMES.CHECK_STATUS,
    description:
      "Check the current index status for Tailwind CSS documentation. Shows which versions are indexed, chunk counts, and when they were last updated.",
    inputSchema: {
      type: "object" as const,
      properties: {
        version: {
          type: "string",
          enum: ["v3", "v4"],
          description: "Check specific version. Omit to check all.",
        },
      },
    },
  },
] as const;

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
  // TODO: implement
  // 1. Create McpServer from @modelcontextprotocol/sdk
  // 2. Register each tool with its definition and handler
  // 3. Connect via stdio transport
  throw new Error("Not implemented");
}
