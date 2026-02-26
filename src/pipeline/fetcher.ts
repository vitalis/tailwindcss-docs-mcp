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
 * Minimal interface for the subset of Octokit's git API used by the fetcher.
 * Avoids importing the full Octokit type (which varies by import method).
 */
interface OctokitGitApi {
  rest: {
    git: {
      getRef(params: {
        owner: string;
        repo: string;
        ref: string;
      }): Promise<{ data: { object: { sha: string } } }>;
      getTree(params: {
        owner: string;
        repo: string;
        tree_sha: string;
        recursive?: string;
      }): Promise<{
        data: { tree: { type?: string; path?: string; sha?: string | null }[] };
      }>;
      getBlob(params: {
        owner: string;
        repo: string;
        file_sha: string;
      }): Promise<{ data: { content: string } }>;
    };
  };
}

/**
 * Fetch Tailwind CSS documentation MDX files from the GitHub repository.
 *
 * Downloads all MDX files from `src/pages/docs/` in the tailwindcss.com repo.
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
      return { fileCount: cached.length, outputDir, cached: true };
    }
  }

  mkdirSync(outputDir, { recursive: true });

  const branch = VERSION_BRANCH_MAP[version];
  const { Octokit } = await import("octokit");

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    console.warn(
      "[tailwindcss-docs-mcp] GITHUB_TOKEN not set. API requests may be rate-limited. " +
        "Set a personal access token for reliable fetching.",
    );
  }
  const octokit: OctokitGitApi = new Octokit({ auth: githubToken });

  // Step 1: Get the git tree recursively to list all files in one API call
  const { data: refData } = await octokit.rest.git.getRef({
    owner: GITHUB_REPO.owner,
    repo: GITHUB_REPO.repo,
    ref: `heads/${branch}`,
  });
  const commitSha = refData.object.sha;

  const { data: treeData } = await octokit.rest.git.getTree({
    owner: GITHUB_REPO.owner,
    repo: GITHUB_REPO.repo,
    tree_sha: commitSha,
    recursive: "true",
  });

  // Step 2: Filter for MDX files under the docs path
  const mdxFiles = treeData.tree.filter(
    (item) =>
      item.type === "blob" &&
      item.path?.startsWith(`${GITHUB_REPO.docsPath}/`) &&
      item.path.endsWith(".mdx"),
  );

  // Step 3: Fetch blobs sequentially
  const fetched = await fetchBlobs(octokit, mdxFiles, outputDir);

  return { fileCount: fetched, outputDir, cached: false };
}

/** Maximum consecutive blob fetch failures before aborting. */
const MAX_CONSECUTIVE_FAILURES = 5;

/**
 * Fetch git blobs sequentially, writing each to outputDir.
 * Aborts after MAX_CONSECUTIVE_FAILURES consecutive failures.
 * Returns the number of successfully fetched files.
 */
async function fetchBlobs(
  octokit: OctokitGitApi,
  files: { sha?: string | null; path?: string }[],
  outputDir: string,
): Promise<number> {
  let fetched = 0;
  let skipped = 0;
  let consecutiveFailures = 0;

  for (const file of files) {
    if (!file.sha || !file.path) continue;

    try {
      const { data: blobData } = await octokit.rest.git.getBlob({
        owner: GITHUB_REPO.owner,
        repo: GITHUB_REPO.repo,
        file_sha: file.sha,
      });

      const content = Buffer.from(blobData.content, "base64").toString("utf-8");
      writeFileSync(join(outputDir, basename(file.path)), content, "utf-8");
      fetched++;
      consecutiveFailures = 0;
    } catch (error) {
      skipped++;
      consecutiveFailures++;
      console.warn(
        `[tailwindcss-docs-mcp] Failed to fetch ${file.path}: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.warn(
          `[tailwindcss-docs-mcp] Aborting: ${MAX_CONSECUTIVE_FAILURES} consecutive fetch failures. Check GITHUB_TOKEN and network.`,
        );
        break;
      }
    }
  }

  if (skipped > 0) {
    console.warn(
      `[tailwindcss-docs-mcp] Skipped ${skipped} of ${files.length} files due to fetch errors.`,
    );
  }

  return fetched;
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
