import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chunkDocument } from "../../src/pipeline/chunker.js";
import { buildEmbeddingInput } from "../../src/pipeline/embedder.js";
import { parseMdx } from "../../src/pipeline/parser.js";
import type { Database } from "../../src/storage/database.js";
import { createDatabase } from "../../src/storage/database.js";
import { formatStatus, handleCheckStatus } from "../../src/tools/check-status.js";
import { handleFetchDocs } from "../../src/tools/fetch-docs.js";
import { formatUtilitiesList, handleListUtilities } from "../../src/tools/list-utilities.js";
import { formatSearchResults, handleSearchDocs } from "../../src/tools/search-docs.js";
import type { Config } from "../../src/utils/config.js";
import { testConfig as baseTestConfig } from "../helpers/factories.js";
import { createMockEmbedder } from "../setup.js";

const TEST_DIR = "/tmp/tailwindcss-docs-mcp-tools-test";

function testConfig(): Config {
  return baseTestConfig({ dataDir: TEST_DIR, rawDir: join(TEST_DIR, "raw") });
}

const PADDING_MDX = `---
title: "Padding"
description: "Utilities for controlling an element's padding."
---

## Basic usage

### Add padding to a single side

Use the \`pt-*\`, \`pr-*\`, \`pb-*\`, and \`pl-*\` utilities to control padding on one side.

\`\`\`html
<div class="pt-6">pt-6</div>
<div class="pr-4">pr-4</div>
\`\`\`

### Add horizontal padding

Use the \`px-*\` utilities to control horizontal padding.

\`\`\`html
<div class="px-8">px-8</div>
\`\`\`
`;

/**
 * Index a test document into the database using the full pipeline.
 */
async function indexTestDoc(db: Database, config: Config, mdxContent: string, slug: string) {
  const embedder = createMockEmbedder(384);
  const doc = parseMdx(mdxContent, slug, "v3");
  const docId = db.upsertDoc(doc);
  const chunks = chunkDocument(doc);

  for (const chunk of chunks) {
    const embeddingInput = buildEmbeddingInput(doc.title, chunk.heading, chunk.content);
    const embedding = await embedder.embed(embeddingInput);
    db.upsertChunk(chunk, docId, embedding);
  }

  db.updateIndexStatus("v3", config.embeddingModel, config.embeddingDimensions);
  return { docId, chunkCount: chunks.length };
}

describe("MCP Tool Handlers", () => {
  let db: Database;
  let config: Config;

  beforeEach(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    config = testConfig();
    db = await createDatabase(config);
  });

  afterEach(() => {
    db.close();
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("check_status", () => {
    it("returns 'not indexed' status with no index", async () => {
      const result = await handleCheckStatus({}, db);
      expect(result.indexed).toBe(false);
      expect(result.versions).toHaveLength(0);
      expect(result.message).toContain("Not indexed");
    });

    it("returns correct counts after indexing", async () => {
      const { chunkCount } = await indexTestDoc(db, config, PADDING_MDX, "padding");

      const result = await handleCheckStatus({ version: "v3" }, db);
      expect(result.indexed).toBe(true);
      expect(result.versions).toHaveLength(1);
      expect(result.versions[0].version).toBe("v3");
      expect(result.versions[0].doc_count).toBe(1);
      expect(result.versions[0].chunk_count).toBe(chunkCount);
      expect(result.versions[0].embedding_model).toBe("test-model");
    });

    it("formats status as markdown", () => {
      const result = formatStatus({
        indexed: true,
        versions: [
          {
            version: "v3",
            doc_count: 10,
            chunk_count: 50,
            embedding_model: "test-model",
            embedding_dimensions: 384,
            indexed_at: "2024-01-01 00:00:00",
          },
        ],
        message: "",
      });
      expect(result).toContain("# Tailwind CSS Documentation Index Status");
      expect(result).toContain("**Documents**: 10");
      expect(result).toContain("**Chunks**: 50");
    });
  });

  describe("search_docs", () => {
    it("returns helpful message before indexing", async () => {
      const embedder = createMockEmbedder(384);
      const result = await handleSearchDocs({ query: "padding" }, db, embedder, "v3");
      expect(result.notIndexed).toBe(true);
      expect(result.results).toHaveLength(0);

      const formatted = formatSearchResults(result);
      expect(formatted).toContain("Index not built");
    });

    it("returns search results for valid query", async () => {
      await indexTestDoc(db, config, PADDING_MDX, "padding");
      const embedder = createMockEmbedder(384);

      const result = await handleSearchDocs({ query: "padding" }, db, embedder, "v3");
      expect(result.notIndexed).toBe(false);
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].docTitle).toBe("Padding");
      expect(result.results[0].url).toContain("tailwindcss.com");
    });

    it("returns empty results for empty query", async () => {
      await indexTestDoc(db, config, PADDING_MDX, "padding");
      const embedder = createMockEmbedder(384);

      const result = await handleSearchDocs({ query: "" }, db, embedder, "v3");
      expect(result.results).toHaveLength(0);
    });

    it("respects limit param", async () => {
      await indexTestDoc(db, config, PADDING_MDX, "padding");
      const embedder = createMockEmbedder(384);

      const result = await handleSearchDocs({ query: "padding", limit: 1 }, db, embedder, "v3");
      expect(result.results.length).toBeLessThanOrEqual(1);
    });

    it("clamps limit to valid range", async () => {
      await indexTestDoc(db, config, PADDING_MDX, "padding");
      const embedder = createMockEmbedder(384);

      // limit: 0 should be clamped to 1
      const r0 = await handleSearchDocs({ query: "padding", limit: 0 }, db, embedder, "v3");
      expect(r0.results.length).toBeLessThanOrEqual(1);
      expect(r0.results.length).toBeGreaterThan(0);

      // limit: -1 should be clamped to 1
      const rNeg = await handleSearchDocs({ query: "padding", limit: -1 }, db, embedder, "v3");
      expect(rNeg.results.length).toBeLessThanOrEqual(1);
      expect(rNeg.results.length).toBeGreaterThan(0);

      // limit: 100 should be clamped to 20
      const rHigh = await handleSearchDocs({ query: "padding", limit: 100 }, db, embedder, "v3");
      expect(rHigh.results.length).toBeLessThanOrEqual(20);
    });

    it("formats search results as markdown", () => {
      const formatted = formatSearchResults({
        results: [
          {
            score: 0.9,
            heading: "## Basic usage",
            content: "Use `p-4` for padding.",
            url: "https://tailwindcss.com/docs/padding#basic-usage",
            docTitle: "Padding",
          },
        ],
        notIndexed: false,
      });
      expect(formatted).toContain("Padding");
      expect(formatted).toContain("Basic usage");
      expect(formatted).toContain("tailwindcss.com");
    });
  });

  describe("list_utilities", () => {
    it("returns all categories without filter", async () => {
      const result = await handleListUtilities({}, db, "v3");
      expect(result.categories.length).toBeGreaterThan(10);
    });

    it("returns only matching category with filter", async () => {
      const result = await handleListUtilities({ category: "Spacing" }, db, "v3");
      expect(result.categories).toHaveLength(1);
      expect(result.categories[0].name).toBe("Spacing");
      expect(result.categories[0].utilities.length).toBeGreaterThan(0);
    });

    it("returns empty for unknown category", async () => {
      const result = await handleListUtilities({ category: "nonexistent" }, db, "v3");
      expect(result.categories).toHaveLength(0);
    });

    it("enriches with indexed doc data when available", async () => {
      await indexTestDoc(db, config, PADDING_MDX, "padding");

      const result = await handleListUtilities({ category: "Spacing" }, db, "v3");
      const paddingEntry = result.categories[0].utilities.find((u) => u.url.includes("padding"));
      expect(paddingEntry).toBeDefined();
      expect(paddingEntry?.title).toBe("Padding");
      expect(paddingEntry?.description).toBe("Utilities for controlling an element's padding.");
    });

    it("formats utilities list as markdown", () => {
      const formatted = formatUtilitiesList({
        categories: [
          {
            name: "Spacing",
            description: "Utilities for padding and margin",
            utilities: [
              {
                title: "Padding",
                description: "Control padding",
                url: "https://tailwindcss.com/docs/padding",
                category: "Spacing",
              },
            ],
          },
        ],
      });
      expect(formatted).toContain("# Tailwind CSS Utility Categories");
      expect(formatted).toContain("## Spacing");
      expect(formatted).toContain("Padding");
    });
  });

  describe("fetch_docs (with fixture files)", () => {
    it("indexes fixture MDX files from cache directory", async () => {
      // Write fixture files to the cache directory
      const dir = join(config.rawDir, "v3");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "padding.mdx"), PADDING_MDX, "utf-8");

      const embedder = createMockEmbedder(384);
      const result = await handleFetchDocs({ version: "v3" }, config, db, embedder);

      expect(result.docCount).toBe(1);
      expect(result.chunkCount).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.message).toContain("Indexed");
    });

    it("skips re-embedding unchanged chunks", async () => {
      const dir = join(config.rawDir, "v3");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "padding.mdx"), PADDING_MDX, "utf-8");

      const embedder = createMockEmbedder(384);

      // First run
      const result1 = await handleFetchDocs({ version: "v3" }, config, db, embedder);
      expect(result1.docCount).toBe(1);

      // Second run — should not re-embed
      const result2 = await handleFetchDocs({ version: "v3" }, config, db, embedder);
      expect(result2.docCount).toBe(1);
      // Chunks should still be there
      expect(result2.chunkCount).toBeGreaterThan(0);
    });

    it("preserves chunk count when re-indexing same content", async () => {
      // Test the force re-embedding behavior by indexing directly
      // (force on fetchDocs would hit GitHub, so we test the pipeline part)
      await indexTestDoc(db, config, PADDING_MDX, "padding");

      // Get chunk count before
      const statusBefore = await handleCheckStatus({ version: "v3" }, db);
      expect(statusBefore.indexed).toBe(true);
      const chunksBefore = statusBefore.versions[0].chunk_count;

      // Re-index the same content — all chunks should still be there
      await indexTestDoc(db, config, PADDING_MDX, "padding");
      const statusAfter = await handleCheckStatus({ version: "v3" }, db);
      expect(statusAfter.versions[0].chunk_count).toBe(chunksBefore);
    });
  });
});
