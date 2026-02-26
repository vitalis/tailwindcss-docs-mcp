import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Config, TailwindVersion } from "../utils/config.js";
import { GITHUB_REPO, VERSION_BRANCH_MAP } from "../utils/config.js";

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
  /** Number of files skipped due to fetch errors (0 when cached) */
  skipped: number;
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

/** GitHub REST API response for GET /repos/{owner}/{repo}/git/ref/{ref} */
interface GitRefResponse {
  object: { sha: string };
}

/** GitHub REST API response for GET /repos/{owner}/{repo}/git/trees/{sha} */
interface GitTreeResponse {
  tree: { type?: string; path?: string; sha?: string | null }[];
}

const GITHUB_API_BASE = "https://api.github.com";
const RAW_CONTENT_BASE = "https://raw.githubusercontent.com";

/**
 * Fetch JSON from the GitHub REST API with proper headers and optional auth.
 */
async function githubApiFetch<T>(path: string): Promise<T> {
  const url = `${GITHUB_API_BASE}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "tailwindcss-docs-mcp",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status}: ${url}`);
  }
  return response.json() as Promise<T>;
}

/**
 * Fetch Tailwind CSS documentation MDX files from the GitHub repository.
 *
 * Uses the GitHub REST API (2 calls) for file discovery, then downloads
 * raw content from raw.githubusercontent.com (no rate limits, no auth needed).
 * Files are cached on disk at `~/.tailwindcss-docs-mcp/raw/{version}/`.
 * Subsequent calls return cached files unless `force: true`.
 */
export async function fetchDocs(config: Config, options: FetchOptions): Promise<FetchResult> {
  const { version, force } = options;
  const outputDir = join(config.rawDir, version);

  // Check cache: if directory exists and has .mdx files, skip unless force
  if (!force && existsSync(outputDir)) {
    const cached = readdirSync(outputDir).filter((f) => f.endsWith(".mdx"));
    if (cached.length > 0) {
      return { fileCount: cached.length, outputDir, cached: true, skipped: 0 };
    }
  }

  mkdirSync(outputDir, { recursive: true });

  const branch = VERSION_BRANCH_MAP[version];

  // Step 1: Get the git tree recursively to list all files (2 API calls)
  const refData = await githubApiFetch<GitRefResponse>(
    `/repos/${GITHUB_REPO.owner}/${GITHUB_REPO.repo}/git/ref/heads/${branch}`,
  );
  const commitSha = refData.object.sha;

  const treeData = await githubApiFetch<GitTreeResponse>(
    `/repos/${GITHUB_REPO.owner}/${GITHUB_REPO.repo}/git/trees/${commitSha}?recursive=true`,
  );

  // Step 2: Filter for MDX files under the docs path
  const mdxFiles = treeData.tree.filter(
    (item) =>
      item.type === "blob" &&
      item.path?.startsWith(`${GITHUB_REPO.docsPath}/`) &&
      item.path.endsWith(".mdx"),
  );

  // Step 3: Fetch raw file content in parallel batches
  const blobResult = await fetchRawFiles(branch, mdxFiles, outputDir);

  return {
    fileCount: blobResult.fetched,
    outputDir,
    cached: false,
    skipped: blobResult.skipped,
  };
}

/** Maximum concurrent file downloads. */
export const FETCH_CONCURRENCY = 10;

/** Maximum consecutive fetch failures before aborting. */
export const MAX_CONSECUTIVE_FAILURES = 5;

/** Fetch a single raw file and return its path + content. */
async function fetchOneRawFile(
  branch: string,
  filePath: string,
): Promise<{ path: string; content: string }> {
  const url = `${RAW_CONTENT_BASE}/${GITHUB_REPO.owner}/${GITHUB_REPO.repo}/${branch}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${filePath}`);
  return { path: filePath, content: await res.text() };
}

/** Process settled batch results, writing files and tracking failures. */
function processBatchResults(
  results: PromiseSettledResult<{ path: string; content: string }>[],
  outputDir: string,
  state: { fetched: number; skipped: number; consecutiveFailures: number },
): void {
  for (const result of results) {
    if (result.status === "fulfilled") {
      writeFileSync(join(outputDir, basename(result.value.path)), result.value.content, "utf-8");
      state.fetched++;
      state.consecutiveFailures = 0;
    } else {
      state.skipped++;
      state.consecutiveFailures++;
      const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.warn(`[tailwindcss-docs-mcp] Failed to fetch: ${msg}`);
      if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) break;
    }
  }
}

/**
 * Fetch raw file content from raw.githubusercontent.com in parallel batches.
 * Aborts after MAX_CONSECUTIVE_FAILURES consecutive failures.
 * Returns counts of successfully fetched and skipped files.
 */
export async function fetchRawFiles(
  branch: string,
  files: { path?: string }[],
  outputDir: string,
): Promise<{ fetched: number; skipped: number }> {
  const validFiles = files.filter((f): f is { path: string } => !!f.path);
  const state = { fetched: 0, skipped: 0, consecutiveFailures: 0 };

  for (let i = 0; i < validFiles.length; i += FETCH_CONCURRENCY) {
    if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.warn(
        `[tailwindcss-docs-mcp] Aborting: ${MAX_CONSECUTIVE_FAILURES} consecutive fetch failures.`,
      );
      break;
    }

    const batch = validFiles.slice(i, i + FETCH_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((file) => fetchOneRawFile(branch, file.path)),
    );
    processBatchResults(results, outputDir, state);
  }

  if (state.skipped > 0) {
    console.warn(
      `[tailwindcss-docs-mcp] Skipped ${state.skipped} of ${validFiles.length} files due to fetch errors.`,
    );
  }

  return { fetched: state.fetched, skipped: state.skipped };
}

/**
 * Read cached MDX files from disk for a given version.
 */
export function readCachedDocs(config: Config, version: TailwindVersion): RawMdxFile[] {
  const dir = join(config.rawDir, version);

  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter((f) => f.endsWith(".mdx"));

  return files.map((filename) => ({
    slug: basename(filename, ".mdx"),
    content: readFileSync(join(dir, filename), "utf-8"),
    path: `${GITHUB_REPO.docsPath}/${filename}`,
  }));
}
