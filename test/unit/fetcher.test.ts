import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readCachedDocs } from "../../src/pipeline/fetcher.js";
import type { Config } from "../../src/utils/config.js";

const TEST_DIR = "/tmp/tailwindcss-docs-mcp-fetcher-test";

function testConfig(): Config {
  return {
    dataDir: TEST_DIR,
    dbPath: join(TEST_DIR, "docs.db"),
    rawDir: join(TEST_DIR, "raw"),
    defaultVersion: "v3",
    embeddingModel: "test-model",
    embeddingDimensions: 384,
    queryPrefix: "test: ",
  };
}

describe("Fetcher", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("readCachedDocs", () => {
    it("returns empty array when directory does not exist", async () => {
      const config = testConfig();
      const result = await readCachedDocs(config, "v3");
      expect(result).toHaveLength(0);
    });

    it("reads MDX files from cache directory", async () => {
      const config = testConfig();
      const dir = join(config.rawDir, "v3");
      mkdirSync(dir, { recursive: true });

      writeFileSync(
        join(dir, "padding.mdx"),
        "---\ntitle: Padding\n---\n\n## Usage",
        "utf-8",
      );
      writeFileSync(
        join(dir, "margin.mdx"),
        "---\ntitle: Margin\n---\n\n## Usage",
        "utf-8",
      );

      const result = await readCachedDocs(config, "v3");
      expect(result).toHaveLength(2);

      const slugs = result.map((r) => r.slug).sort();
      expect(slugs).toEqual(["margin", "padding"]);
    });

    it("extracts slug from filename", async () => {
      const config = testConfig();
      const dir = join(config.rawDir, "v3");
      mkdirSync(dir, { recursive: true });

      writeFileSync(join(dir, "grid-template-columns.mdx"), "content", "utf-8");

      const result = await readCachedDocs(config, "v3");
      expect(result[0].slug).toBe("grid-template-columns");
    });

    it("reads file content correctly", async () => {
      const config = testConfig();
      const dir = join(config.rawDir, "v3");
      mkdirSync(dir, { recursive: true });

      const content =
        "---\ntitle: Padding\n---\n\n## Basic usage\n\nUse `p-4`.";
      writeFileSync(join(dir, "padding.mdx"), content, "utf-8");

      const result = await readCachedDocs(config, "v3");
      expect(result[0].content).toBe(content);
    });

    it("ignores non-MDX files", async () => {
      const config = testConfig();
      const dir = join(config.rawDir, "v3");
      mkdirSync(dir, { recursive: true });

      writeFileSync(join(dir, "padding.mdx"), "content", "utf-8");
      writeFileSync(join(dir, "notes.txt"), "not mdx", "utf-8");
      writeFileSync(join(dir, ".gitkeep"), "", "utf-8");

      const result = await readCachedDocs(config, "v3");
      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe("padding");
    });

    it("sets correct path relative to docs directory", async () => {
      const config = testConfig();
      const dir = join(config.rawDir, "v3");
      mkdirSync(dir, { recursive: true });

      writeFileSync(join(dir, "padding.mdx"), "content", "utf-8");

      const result = await readCachedDocs(config, "v3");
      expect(result[0].path).toBe("src/pages/docs/padding.mdx");
    });

    it("reads from correct version directory", async () => {
      const config = testConfig();

      // Create files in both v3 and v4
      for (const version of ["v3", "v4"] as const) {
        const dir = join(config.rawDir, version);
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          join(dir, `padding-${version}.mdx`),
          `${version} content`,
          "utf-8",
        );
      }

      const v3 = await readCachedDocs(config, "v3");
      const v4 = await readCachedDocs(config, "v4");

      expect(v3).toHaveLength(1);
      expect(v3[0].slug).toBe("padding-v3");
      expect(v4).toHaveLength(1);
      expect(v4[0].slug).toBe("padding-v4");
    });
  });
});
