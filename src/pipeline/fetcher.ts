import type { TailwindVersion } from "../utils/config.js";

/**
 * Options for fetching documentation from GitHub.
 */
export interface FetchOptions {
  /** Tailwind CSS major version (maps to branch: master for v3, next for v4) */
  version: TailwindVersion;
  /** Force re-fetch even if cached locally */
  force: boolean;
}

/**
 * Result of a fetch operation.
 */
export interface FetchResult {
  /** Number of MDX files fetched */
  fileCount: number;
  /** Directory where raw files were saved */
  outputDir: string;
  /** Whether files were fetched from network or loaded from cache */
  cached: boolean;
}

/**
 * A single raw MDX file fetched from the repository.
 */
export interface RawMdxFile {
  /** Filename without extension (e.g., "padding") */
  slug: string;
  /** Raw MDX content */
  content: string;
  /** File path relative to docs directory */
  path: string;
}

/**
 * Fetch Tailwind CSS documentation MDX files from the GitHub repository.
 *
 * Downloads all MDX files from `src/pages/docs/` in the tailwindcss.com repo.
 * Files are cached on disk at `~/.tailwindcss-docs-mcp/raw/{version}/`.
 * Subsequent calls return cached files unless `force: true`.
 */
export async function fetchDocs(options: FetchOptions): Promise<FetchResult> {
  // TODO: implement
  // 1. Check if cached files exist (unless force)
  // 2. Use octokit to list files in src/pages/docs/
  // 3. Download each MDX file content
  // 4. Save to disk at rawDir/{version}/*.mdx
  // 5. Return fetch result
  throw new Error("Not implemented");
}

/**
 * Read cached MDX files from disk for a given version.
 */
export async function readCachedDocs(version: TailwindVersion): Promise<RawMdxFile[]> {
  // TODO: implement
  throw new Error("Not implemented");
}
