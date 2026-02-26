import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FETCH_CONCURRENCY,
  MAX_CONSECUTIVE_FAILURES,
  fetchDocs,
  fetchRawFiles,
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
    vi.restoreAllMocks();
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

  describe("fetchRawFiles", () => {
    function matchResponse(
      url: string,
      responses: Map<string, string | Error>,
    ): string | Error | undefined {
      for (const [pattern, response] of responses) {
        if (url.includes(pattern)) return response;
      }
      return undefined;
    }

    function createMockFetch(responses: Map<string, string | Error>): typeof fetch {
      return (async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        const matched = matchResponse(url, responses);
        if (matched instanceof Error) throw matched;
        if (matched !== undefined) return new Response(matched, { status: 200 });
        return new Response("Not Found", {
          status: 404,
          statusText: "Not Found",
        });
      }) as typeof fetch;
    }

    it("fetches all files and writes to disk", async () => {
      const outputDir = join(TEST_DIR, "blobs");
      mkdirSync(outputDir, { recursive: true });
      const responses = new Map([
        ["padding.mdx", "padding content"],
        ["margin.mdx", "margin content"],
      ]);
      vi.stubGlobal("fetch", createMockFetch(responses));

      const result = await fetchRawFiles(
        "next",
        [{ path: "src/pages/docs/padding.mdx" }, { path: "src/pages/docs/margin.mdx" }],
        outputDir,
      );

      expect(result.fetched).toBe(2);
      expect(result.skipped).toBe(0);
      expect(readFileSync(join(outputDir, "padding.mdx"), "utf-8")).toBe("padding content");
      expect(readFileSync(join(outputDir, "margin.mdx"), "utf-8")).toBe("margin content");
    });

    it("skips files without path", async () => {
      const outputDir = join(TEST_DIR, "blobs");
      mkdirSync(outputDir, { recursive: true });
      vi.stubGlobal("fetch", createMockFetch(new Map([["b.mdx", "content"]])));

      const result = await fetchRawFiles(
        "next",
        [{ path: undefined }, { path: "src/pages/docs/b.mdx" }],
        outputDir,
      );

      expect(result.fetched).toBe(1);
      expect(result.skipped).toBe(0);
    });

    it("counts skipped files on individual errors", async () => {
      const outputDir = join(TEST_DIR, "blobs");
      mkdirSync(outputDir, { recursive: true });
      const responses = new Map<string, string | Error>([
        ["a.mdx", "ok content"],
        ["b.mdx", new Error("network error")],
        ["c.mdx", "also ok"],
      ]);
      vi.stubGlobal("fetch", createMockFetch(responses));

      const result = await fetchRawFiles(
        "next",
        [
          { path: "src/pages/docs/a.mdx" },
          { path: "src/pages/docs/b.mdx" },
          { path: "src/pages/docs/c.mdx" },
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
      // All files fail — use a mock that always throws
      vi.stubGlobal("fetch", createMockFetch(new Map<string, string | Error>()));

      const totalFiles = MAX_CONSECUTIVE_FAILURES + 3;
      const files = Array.from({ length: totalFiles }, (_, i) => ({
        path: `src/pages/docs/file${i}.mdx`,
      }));

      const result = await fetchRawFiles("next", files, outputDir);

      // Should abort after MAX_CONSECUTIVE_FAILURES, not process all files
      expect(result.fetched).toBe(0);
      expect(result.skipped).toBeLessThanOrEqual(MAX_CONSECUTIVE_FAILURES + FETCH_CONCURRENCY);
      expect(result.skipped).toBeGreaterThanOrEqual(MAX_CONSECUTIVE_FAILURES);
    });

    it("resets consecutive failure count on success", async () => {
      const outputDir = join(TEST_DIR, "blobs");
      mkdirSync(outputDir, { recursive: true });
      // Alternate: fail, fail, success, fail, fail, success — never hits threshold
      const responses = new Map<string, string | Error>([
        ["a.mdx", new Error("fail")],
        ["b.mdx", new Error("fail")],
        ["c.mdx", "ok"],
        ["d.mdx", new Error("fail")],
        ["e.mdx", new Error("fail")],
        ["f.mdx", "ok"],
      ]);
      vi.stubGlobal("fetch", createMockFetch(responses));

      const result = await fetchRawFiles(
        "next",
        [
          { path: "src/pages/docs/a.mdx" },
          { path: "src/pages/docs/b.mdx" },
          { path: "src/pages/docs/c.mdx" },
          { path: "src/pages/docs/d.mdx" },
          { path: "src/pages/docs/e.mdx" },
          { path: "src/pages/docs/f.mdx" },
        ],
        outputDir,
      );

      expect(result.fetched).toBe(2);
      expect(result.skipped).toBe(4);
    });
  });
});
