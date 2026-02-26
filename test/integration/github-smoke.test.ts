import { describe, expect, it } from "vitest";
import { GITHUB_REPO, VERSION_BRANCH_MAP } from "../../src/utils/config.js";

/**
 * Smoke tests that verify our GitHub integration assumptions.
 *
 * These hit the real GitHub API (2 calls) and download 1 raw file per version.
 * Gated behind RUN_NETWORK_TESTS=1 to avoid flaky CI from network issues.
 *
 * Run manually with: RUN_NETWORK_TESTS=1 bun run test test/integration/github-smoke
 */

const GITHUB_API = "https://api.github.com";
const RAW_BASE = "https://raw.githubusercontent.com";

interface GitTreeItem {
  type?: string;
  path?: string;
}

async function getTreeMdxFiles(branch: string): Promise<GitTreeItem[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "tailwindcss-docs-mcp-test",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const refRes = await fetch(
    `${GITHUB_API}/repos/${GITHUB_REPO.owner}/${GITHUB_REPO.repo}/git/ref/heads/${branch}`,
    { headers },
  );
  if (!refRes.ok)
    throw new Error(`GitHub ref lookup failed: ${refRes.status} for branch ${branch}`);
  const ref = (await refRes.json()) as { object: { sha: string } };

  const treeRes = await fetch(
    `${GITHUB_API}/repos/${GITHUB_REPO.owner}/${GITHUB_REPO.repo}/git/trees/${ref.object.sha}?recursive=true`,
    { headers },
  );
  if (!treeRes.ok) throw new Error(`GitHub tree lookup failed: ${treeRes.status}`);
  const tree = (await treeRes.json()) as { tree: GitTreeItem[] };

  return tree.tree.filter(
    (item) =>
      item.type === "blob" &&
      item.path?.startsWith(`${GITHUB_REPO.docsPath}/`) &&
      item.path.endsWith(".mdx"),
  );
}

describe.skipIf(!process.env.RUN_NETWORK_TESTS)("GitHub Fetch Smoke Tests", () => {
  for (const [version, branch] of Object.entries(VERSION_BRANCH_MAP)) {
    describe(`${version} (branch: ${branch})`, () => {
      it("branch exists and tree contains MDX docs", { timeout: 15_000 }, async () => {
        const mdxFiles = await getTreeMdxFiles(branch);

        // Tailwind docs should have a substantial number of pages
        expect(mdxFiles.length).toBeGreaterThan(50);

        // Spot-check: padding.mdx should always exist
        const hasPadding = mdxFiles.some((f) => f.path?.endsWith("/padding.mdx"));
        expect(hasPadding).toBe(true);
      });

      it("raw file download returns valid MDX", { timeout: 10_000 }, async () => {
        const url = `${RAW_BASE}/${GITHUB_REPO.owner}/${GITHUB_REPO.repo}/${branch}/${GITHUB_REPO.docsPath}/padding.mdx`;
        const res = await fetch(url);

        expect(res.ok).toBe(true);

        const content = await res.text();

        // Should have YAML frontmatter
        expect(content).toMatch(/^---\n/);
        expect(content).toContain("title:");

        // Should have actual documentation content
        expect(content.length).toBeGreaterThan(100);
      });
    });
  }
});
