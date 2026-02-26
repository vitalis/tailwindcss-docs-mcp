import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chunkDocument } from "../../src/pipeline/chunker.js";
import { buildEmbeddingInput } from "../../src/pipeline/embedder.js";
import { parseMdx } from "../../src/pipeline/parser.js";
import type { ServerHandle } from "../../src/server.js";
import { TOOL_NAMES, createServer } from "../../src/server.js";
import type { Database } from "../../src/storage/database.js";
import { createDatabase } from "../../src/storage/database.js";
import type { Config } from "../../src/utils/config.js";
import { testConfig as baseTestConfig } from "../helpers/factories.js";
import { createMockEmbedder } from "../setup.js";

const TEST_DIR = "/tmp/tailwindcss-docs-mcp-e2e-test";

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

function testConfig(): Config {
  return baseTestConfig({ dataDir: TEST_DIR, rawDir: join(TEST_DIR, "raw") });
}

async function indexTestDoc(db: Database, config: Config) {
  const embedder = createMockEmbedder(384);
  const doc = parseMdx(PADDING_MDX, "padding", "v4");
  const docId = db.upsertDoc(doc);
  const chunks = chunkDocument(doc);

  for (const chunk of chunks) {
    const input = buildEmbeddingInput(doc.title, chunk.heading, chunk.content);
    const embedding = await embedder.embed(input);
    db.upsertChunk(chunk, docId, embedding);
  }

  db.updateIndexStatus("v4", config.embeddingModel, config.embeddingDimensions);
}

function textContent(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const first = result.content[0];
  if (first && "text" in first) return first.text as string;
  return "";
}

describe("MCP Tools E2E", () => {
  let client: Client;
  let db: Database;
  let config: Config;
  let handle: ServerHandle;

  beforeAll(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    config = testConfig();
    db = await createDatabase(config);
    const embedder = createMockEmbedder(384);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    handle = await createServer({ config, db, embedder }, serverTransport);

    client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
    db.close();
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("tools/list", () => {
    it("lists all 4 tools", async () => {
      const result = await client.listTools();
      const names = result.tools.map((t) => t.name).sort();
      expect(names).toEqual([
        TOOL_NAMES.CHECK_STATUS,
        TOOL_NAMES.FETCH_DOCS,
        TOOL_NAMES.LIST_UTILITIES,
        TOOL_NAMES.SEARCH_DOCS,
      ]);
    });

    it("each tool has a description and input schema", async () => {
      const result = await client.listTools();
      for (const tool of result.tools) {
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
      }
    });
  });

  describe("check_status", () => {
    it("returns 'Not indexed' when no docs indexed", async () => {
      const result = await client.callTool({
        name: "check_status",
        arguments: {},
      });
      expect(textContent(result)).toContain("Not indexed");
    });

    it("returns index info after indexing", async () => {
      await indexTestDoc(db, config);
      const result = await client.callTool({
        name: "check_status",
        arguments: { version: "v4" },
      });
      const text = textContent(result);
      expect(text).toContain("Documents");
      expect(text).toContain("Chunks");
    });
  });

  describe("search_docs", () => {
    it("returns 'Index not built' for unindexed version", async () => {
      const result = await client.callTool({
        name: "search_docs",
        arguments: { query: "padding", version: "v3" },
      });
      expect(textContent(result)).toContain("Index not built");
    });

    it("returns results for indexed version", async () => {
      const result = await client.callTool({
        name: "search_docs",
        arguments: { query: "padding", version: "v4" },
      });
      const text = textContent(result);
      expect(text).toContain("Padding");
      expect(text).toContain("tailwindcss.com");
    });

    it("respects limit parameter", async () => {
      const result = await client.callTool({
        name: "search_docs",
        arguments: { query: "padding", version: "v4", limit: 1 },
      });
      const text = textContent(result);
      // With limit 1, should have exactly one "## 1." heading and no "## 2."
      expect(text).toContain("## 1.");
      expect(text).not.toContain("## 2.");
    });
  });

  describe("list_utilities", () => {
    it("returns all categories", async () => {
      const result = await client.callTool({
        name: "list_utilities",
        arguments: {},
      });
      const text = textContent(result);
      expect(text).toContain("Utility Categories");
      expect(text).toContain("Spacing");
      expect(text).toContain("Layout");
    });

    it("filters by category", async () => {
      const result = await client.callTool({
        name: "list_utilities",
        arguments: { category: "Spacing" },
      });
      const text = textContent(result);
      expect(text).toContain("Spacing");
      expect(text).not.toContain("## Typography");
    });
  });

  describe("fetch_docs", () => {
    it("indexes cached fixture files", async () => {
      // Write a fixture MDX file to the cache directory
      const dir = join(config.rawDir, "v4");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "padding.mdx"), PADDING_MDX, "utf-8");

      const result = await client.callTool({
        name: "fetch_docs",
        arguments: { version: "v4" },
      });
      expect(textContent(result)).toContain("Indexed");
    });
  });

  describe("error handling", () => {
    it("returns error for embedder not ready", async () => {
      // Create a separate server with no embedder
      const [ct, st] = InMemoryTransport.createLinkedPair();
      const noEmbedderDb = await createDatabase(testConfig());
      await createServer({ config, db: noEmbedderDb, embedder: null }, st);
      const noEmbedderClient = new Client({
        name: "test-no-embedder",
        version: "1.0.0",
      });
      await noEmbedderClient.connect(ct);

      const result = await noEmbedderClient.callTool({
        name: "search_docs",
        arguments: { query: "test" },
      });
      expect(result.isError).toBe(true);
      expect(textContent(result)).toContain("initializing");

      await noEmbedderClient.close();
      noEmbedderDb.close();
    });
  });
});
