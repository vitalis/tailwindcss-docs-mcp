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
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

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

  // Step 3: Fetch each file's content
  let fetched = 0;
  for (const file of mdxFiles) {
    if (!file.sha || !file.path) continue;

    const { data: blobData } = await octokit.rest.git.getBlob({
      owner: GITHUB_REPO.owner,
      repo: GITHUB_REPO.repo,
      file_sha: file.sha,
    });

    const content = Buffer.from(blobData.content, "base64").toString("utf-8");
    const filename = basename(file.path);
    writeFileSync(join(outputDir, filename), content, "utf-8");
    fetched++;
  }

  return { fileCount: fetched, outputDir, cached: false };
}

/**
 * Read cached MDX files from disk for a given version.
 */
export async function readCachedDocs(
  config: Config,
  version: TailwindVersion,
): Promise<RawMdxFile[]> {
  const dir = join(config.rawDir, version);

  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter((f) => f.endsWith(".mdx"));

  return files.map((filename) => ({
    slug: basename(filename, ".mdx"),
    content: readFileSync(join(dir, filename), "utf-8"),
    path: `${GITHUB_REPO.docsPath}/${filename}`,
  }));
}
