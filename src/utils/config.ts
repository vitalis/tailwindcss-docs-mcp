import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Tailwind CSS version identifiers.
 */
export type TailwindVersion = "v3" | "v4";

/**
 * Application configuration derived from environment variables and defaults.
 */
export interface Config {
  /** Root data directory for the MCP server */
  dataDir: string;
  /** Path to the SQLite database file */
  dbPath: string;
  /** Directory for cached raw MDX files */
  rawDir: string;
  /** Default Tailwind CSS version */
  defaultVersion: TailwindVersion;
  /** Embedding model identifier */
  embeddingModel: string;
  /** Embedding vector dimensions */
  embeddingDimensions: number;
  /** Query prefix required by snowflake-arctic-embed-xs */
  queryPrefix: string;
}

/**
 * Version-to-branch mapping for the tailwindcss.com repository.
 */
export const VERSION_BRANCH_MAP: Record<TailwindVersion, string> = {
  v3: "master",
  v4: "next",
};

/**
 * GitHub repository details for Tailwind CSS documentation.
 */
export const GITHUB_REPO = {
  owner: "tailwindlabs",
  repo: "tailwindcss.com",
  docsPath: "src/pages/docs",
} as const;

/**
 * Load configuration from environment variables with defaults.
 */
const VALID_VERSIONS = new Set<string>(["v3", "v4"]);

export function loadConfig(): Config {
  const dataDir = process.env.TAILWIND_DOCS_MCP_PATH ?? join(homedir(), ".tailwindcss-docs-mcp");
  const envVersion = process.env.TAILWIND_DOCS_MCP_DEFAULT_VERSION;
  const defaultVersion: TailwindVersion =
    envVersion && VALID_VERSIONS.has(envVersion) ? (envVersion as TailwindVersion) : "v3";

  return {
    dataDir,
    dbPath: join(dataDir, "docs.db"),
    rawDir: join(dataDir, "raw"),
    defaultVersion,
    embeddingModel: "Snowflake/snowflake-arctic-embed-xs",
    embeddingDimensions: 384,
    queryPrefix: "Represent this sentence for searching relevant passages: ",
  };
}
