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
  /** Directory for cached ONNX model files */
  modelCacheDir: string;
}

/**
 * Version-to-branch mapping for the tailwindcss.com repository.
 * Verified 2026-02-27: master=187 v3 MDX files, main=192 v4 MDX files.
 */
export const VERSION_BRANCH_MAP: Record<TailwindVersion, string> = {
  v3: "master",
  v4: "main",
};

/**
 * Version-to-docs-path mapping. v3 uses Pages Router layout, v4 uses App Router.
 */
export const VERSION_DOCS_PATH: Record<TailwindVersion, string> = {
  v3: "src/pages/docs",
  v4: "src/docs",
};

/**
 * Base URL for Tailwind CSS documentation pages.
 */
export const DOCS_BASE_URL = "https://tailwindcss.com/docs";

/**
 * GitHub repository details for Tailwind CSS documentation.
 */
export const GITHUB_REPO = {
  owner: "tailwindlabs",
  repo: "tailwindcss.com",
} as const;

/**
 * Load configuration from environment variables with defaults.
 */
const VALID_VERSIONS = new Set<string>(["v3", "v4"]);

export function loadConfig(): Config {
  const dataDir = process.env.TAILWIND_DOCS_MCP_PATH ?? join(homedir(), ".tailwindcss-docs-mcp");
  const envVersion = process.env.TAILWIND_DOCS_MCP_DEFAULT_VERSION;
  const defaultVersion: TailwindVersion =
    envVersion && VALID_VERSIONS.has(envVersion) ? (envVersion as TailwindVersion) : "v4";

  return {
    dataDir,
    dbPath: join(dataDir, "docs.db"),
    rawDir: join(dataDir, "raw"),
    defaultVersion,
    embeddingModel: "Snowflake/snowflake-arctic-embed-xs",
    embeddingDimensions: 384,
    queryPrefix: "Represent this sentence for searching relevant passages: ",
    modelCacheDir: join(dataDir, "models"),
  };
}
