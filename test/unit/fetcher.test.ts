import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_CONSECUTIVE_FAILURES,
  type OctokitGitApi,
  fetchBlobs,
  fetchDocs,
  readCachedDocs,
} from "../../src/pipeline/fetcher.js";
import { testConfig as baseTestConfig } from "../helpers/factories.js";

const TEST_DIR = "/tmp/tailwindcss-docs-mcp-fetcher-test";

function testConfig() {
  return baseTestConfig({
    dataDir: TEST_DIR,
    dbPath: join(TEST_DIR, "docs.db"),
    rawDir: join(TEST_DIR, "raw"),
  });
}

describe("Fetcher", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("readCachedDocs", () => {
    it("returns empty array when directory does not exist", () => {
      const config = testConfig();
      const result = readCachedDocs(config, "v3");
      expect(result).toHaveLength(0);
    });

    it("reads MDX files from cache directory", () => {
      const config = testConfig();
      const dir = join(config.rawDir, "v3");
      mkdirSync(dir, { recursive: true });

      writeFileSync(join(dir, "padding.mdx"), "---\ntitle: Padding\n---\n\n## Usage", "utf-8");
      writeFileSync(join(dir, "margin.mdx"), "---\ntitle: Margin\n---\n\n## Usage", "utf-8");

      const result = readCachedDocs(config, "v3");
      expect(result).toHaveLength(2);

      const slugs = result.map((r) => r.slug).sort();
      expect(slugs).toEqual(["margin", "padding"]);
    });

    it("extracts slug from filename", () => {
      const config = testConfig();
      const dir = join(config.rawDir, "v3");
      mkdirSync(dir, { recursive: true });

      writeFileSync(join(dir, "grid-template-columns.mdx"), "content", "utf-8");

      const result = readCachedDocs(config, "v3");
      expect(result[0].slug).toBe("grid-template-columns");
    });

    it("reads file content correctly", () => {
      const config = testConfig();
      const dir = join(config.rawDir, "v3");
      mkdirSync(dir, { recursive: true });

      const content = "---\ntitle: Padding\n---\n\n## Basic usage\n\nUse `p-4`.";
      writeFileSync(join(dir, "padding.mdx"), content, "utf-8");

      const result = readCachedDocs(config, "v3");
      expect(result[0].content).toBe(content);
    });

    it("ignores non-MDX files", () => {
      const config = testConfig();
      const dir = join(config.rawDir, "v3");
      mkdirSync(dir, { recursive: true });

      writeFileSync(join(dir, "padding.mdx"), "content", "utf-8");
      writeFileSync(join(dir, "notes.txt"), "not mdx", "utf-8");
      writeFileSync(join(dir, ".gitkeep"), "", "utf-8");

      const result = readCachedDocs(config, "v3");
      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe("padding");
    });

    it("sets correct path relative to docs directory", () => {
      const config = testConfig();
      const dir = join(config.rawDir, "v3");
      mkdirSync(dir, { recursive: true });

      writeFileSync(join(dir, "padding.mdx"), "content", "utf-8");

      const result = readCachedDocs(config, "v3");
      expect(result[0].path).toBe("src/pages/docs/padding.mdx");
    });

    it("reads from correct version directory", () => {
      const config = testConfig();

      // Create files in both v3 and v4
      for (const version of ["v3", "v4"] as const) {
        const dir = join(config.rawDir, version);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `padding-${version}.mdx`), `${version} content`, "utf-8");
      }

      const v3 = readCachedDocs(config, "v3");
      const v4 = readCachedDocs(config, "v4");

      expect(v3).toHaveLength(1);
      expect(v3[0].slug).toBe("padding-v3");
      expect(v4).toHaveLength(1);
      expect(v4[0].slug).toBe("padding-v4");
    });
  });

  describe("fetchDocs", () => {
    it("returns cached result when files exist and force is false", async () => {
      const config = testConfig();
      const dir = join(config.rawDir, "v3");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "padding.mdx"), "---\ntitle: Padding\n---\ncontent", "utf-8");
      writeFileSync(join(dir, "margin.mdx"), "---\ntitle: Margin\n---\ncontent", "utf-8");

      const result = await fetchDocs(config, { version: "v3", force: false });

      expect(result.cached).toBe(true);
      expect(result.fileCount).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.outputDir).toBe(dir);
    });
  });

  describe("fetchBlobs", () => {
    function createMockOctokit(responses: Map<string, string | Error>): OctokitGitApi {
      return {
        rest: {
          git: {
            getRef: () => Promise.reject(new Error("not used")),
            getTree: () => Promise.reject(new Error("not used")),
            getBlob: ({ file_sha }) => {
              const response = responses.get(file_sha);
              if (response instanceof Error) return Promise.reject(response);
              const content = Buffer.from(response ?? "").toString("base64");
              return Promise.resolve({ data: { content } });
            },
          },
        },
      };
    }

    it("fetches all blobs and writes files to disk", async () => {
      const outputDir = join(TEST_DIR, "blobs");
      mkdirSync(outputDir, { recursive: true });
      const responses = new Map([
        ["sha1", "padding content"],
        ["sha2", "margin content"],
      ]);
      const octokit = createMockOctokit(responses);

      const result = await fetchBlobs(
        octokit,
        [
          { sha: "sha1", path: "src/pages/docs/padding.mdx" },
          { sha: "sha2", path: "src/pages/docs/margin.mdx" },
        ],
        outputDir,
      );

      expect(result.fetched).toBe(2);
      expect(result.skipped).toBe(0);
      expect(readFileSync(join(outputDir, "padding.mdx"), "utf-8")).toBe("padding content");
      expect(readFileSync(join(outputDir, "margin.mdx"), "utf-8")).toBe("margin content");
    });

    it("skips files without sha or path", async () => {
      const outputDir = join(TEST_DIR, "blobs");
      mkdirSync(outputDir, { recursive: true });
      const octokit = createMockOctokit(new Map([["sha1", "content"]]));

      const result = await fetchBlobs(
        octokit,
        [
          { sha: null, path: "a.mdx" },
          { sha: "sha1", path: undefined },
          { sha: "sha1", path: "b.mdx" },
        ],
        outputDir,
      );

      expect(result.fetched).toBe(1);
      expect(result.skipped).toBe(0);
    });

    it("counts skipped files on individual errors", async () => {
      const outputDir = join(TEST_DIR, "blobs");
      mkdirSync(outputDir, { recursive: true });
      const responses = new Map<string, string | Error>([
        ["sha1", "ok content"],
        ["sha2", new Error("network error")],
        ["sha3", "also ok"],
      ]);
      const octokit = createMockOctokit(responses);

      const result = await fetchBlobs(
        octokit,
        [
          { sha: "sha1", path: "a.mdx" },
          { sha: "sha2", path: "b.mdx" },
          { sha: "sha3", path: "c.mdx" },
        ],
        outputDir,
      );

      expect(result.fetched).toBe(2);
      expect(result.skipped).toBe(1);
      expect(existsSync(join(outputDir, "a.mdx"))).toBe(true);
      expect(existsSync(join(outputDir, "b.mdx"))).toBe(false);
      expect(existsSync(join(outputDir, "c.mdx"))).toBe(true);
    });

    it("aborts after MAX_CONSECUTIVE_FAILURES consecutive errors", async () => {
      const outputDir = join(TEST_DIR, "blobs");
      mkdirSync(outputDir, { recursive: true });
      // All files fail
      const responses = new Map<string, string | Error>();
      const totalFiles = MAX_CONSECUTIVE_FAILURES + 3;
      const files = [];
      for (let i = 0; i < totalFiles; i++) {
        const sha = `sha${i}`;
        responses.set(sha, new Error("fail"));
        files.push({ sha, path: `file${i}.mdx` });
      }
      const octokit = createMockOctokit(responses);

      const result = await fetchBlobs(octokit, files, outputDir);

      // Should abort after MAX_CONSECUTIVE_FAILURES, not process all files
      expect(result.fetched).toBe(0);
      expect(result.skipped).toBe(MAX_CONSECUTIVE_FAILURES);
    });

    it("resets consecutive failure count on success", async () => {
      const outputDir = join(TEST_DIR, "blobs");
      mkdirSync(outputDir, { recursive: true });
      // Alternate: fail, fail, success, fail, fail, success — never hits threshold
      const responses = new Map<string, string | Error>([
        ["s1", new Error("fail")],
        ["s2", new Error("fail")],
        ["s3", "ok"],
        ["s4", new Error("fail")],
        ["s5", new Error("fail")],
        ["s6", "ok"],
      ]);
      const octokit = createMockOctokit(responses);

      const result = await fetchBlobs(
        octokit,
        [
          { sha: "s1", path: "a.mdx" },
          { sha: "s2", path: "b.mdx" },
          { sha: "s3", path: "c.mdx" },
          { sha: "s4", path: "d.mdx" },
          { sha: "s5", path: "e.mdx" },
          { sha: "s6", path: "f.mdx" },
        ],
        outputDir,
      );

      expect(result.fetched).toBe(2);
      expect(result.skipped).toBe(4);
    });
  });
});
