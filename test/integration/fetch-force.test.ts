import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase } from "../../src/storage/database.js";
import type { Database } from "../../src/storage/database.js";
import { handleFetchDocs } from "../../src/tools/fetch-docs.js";
import type { Config } from "../../src/utils/config.js";
import { testConfig as baseTestConfig } from "../helpers/factories.js";
import { createMockEmbedder } from "../setup.js";

const TEST_DIR = "/tmp/tailwindcss-docs-mcp-fetch-force-test";

const PADDING_MDX = `---
title: "Padding"
description: "Utilities for controlling an element's padding."
---

## Basic usage

### Add padding to a single side

Use the \`pt-*\`, \`pr-*\`, \`pb-*\`, and \`pl-*\` utilities.

\`\`\`html
<div class="pt-6">pt-6</div>
\`\`\`
`;

const MARGIN_MDX = `---
title: "Margin"
description: "Utilities for controlling an element's margin."
---

## Basic usage

### Add margin to a single side

Use the \`mt-*\`, \`mr-*\`, \`mb-*\`, and \`ml-*\` utilities.

\`\`\`html
<div class="mt-6">mt-6</div>
\`\`\`
`;

function testConfig(): Config {
  return baseTestConfig({ dataDir: TEST_DIR, rawDir: join(TEST_DIR, "raw") });
}

/**
 * Mock GitHub API responses so handleFetchDocs doesn't hit the network.
 * The fetcher checks for cached files first, so we pre-populate the raw dir.
 */
function setupCachedFiles(config: Config) {
  const dir = join(config.rawDir, "v4");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "padding.mdx"), PADDING_MDX, "utf-8");
  writeFileSync(join(dir, "margin.mdx"), MARGIN_MDX, "utf-8");
}

describe("fetch_docs with force=true", () => {
  let db: Database;
  let config: Config;
  const embedder = createMockEmbedder(384);

  beforeAll(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    config = testConfig();
    mkdirSync(config.dataDir, { recursive: true });
    setupCachedFiles(config);
    db = await createDatabase(config);

    // Mock fetch to prevent network calls during fetchDocs.
    // Returns appropriate responses for ref lookup, tree listing, and raw file downloads.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/git/trees/")) {
          // Tree listing — return entries matching v4 docs path (src/docs/)
          return Promise.resolve(
            new Response(
              JSON.stringify({
                tree: [
                  { type: "blob", path: "src/docs/padding.mdx" },
                  { type: "blob", path: "src/docs/margin.mdx" },
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        if (url.includes("raw.githubusercontent.com")) {
          // Raw file download — return MDX content
          const content = url.includes("padding.mdx") ? PADDING_MDX : MARGIN_MDX;
          return Promise.resolve(new Response(content, { status: 200 }));
        }
        // Ref lookup
        return Promise.resolve(
          new Response(JSON.stringify({ object: { sha: "test-sha" } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }),
    );
  });

  beforeEach(() => {
    embedder.clearCalls();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    db.close();
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("indexes docs on first run", async () => {
    const result = await handleFetchDocs({ version: "v4" }, config, db, embedder);

    expect(result.docCount).toBe(2);
    expect(result.chunkCount).toBeGreaterThan(0);
    expect(result.message).toContain("Indexed");
  });

  it("re-indexes all chunks with force=true", async () => {
    const result = await handleFetchDocs({ version: "v4", force: true }, config, db, embedder);

    expect(result.docCount).toBe(2);
    expect(result.chunkCount).toBeGreaterThan(0);

    // force=true should re-embed all chunks, not skip any
    expect(embedder.calls.length).toBe(result.chunkCount);
  });

  it("skips unchanged chunks on normal re-run (no force)", async () => {
    const result = await handleFetchDocs({ version: "v4" }, config, db, embedder);

    expect(result.docCount).toBe(2);

    // Without force, unchanged chunks should be skipped (no new embeds)
    expect(embedder.calls.length).toBe(0);
  });
});

describe("fetchLock serialization", () => {
  it("serializes concurrent handleFetchDocs calls", async () => {
    const { _resetFetchLockForTesting } = await import("../../src/tools/fetch-docs.js");
    _resetFetchLockForTesting();

    const TEST_LOCK_DIR = "/tmp/tailwindcss-docs-mcp-lock-test";
    rmSync(TEST_LOCK_DIR, { recursive: true, force: true });

    const lockConfig = baseTestConfig({
      dataDir: TEST_LOCK_DIR,
      rawDir: join(TEST_LOCK_DIR, "raw"),
    });
    mkdirSync(lockConfig.dataDir, { recursive: true });

    // Set up cached files
    const dir = join(lockConfig.rawDir, "v4");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "padding.mdx"),
      "---\ntitle: Padding\n---\n\n## Usage\n\nUse p-4.",
      "utf-8",
    );

    const lockDb = await createDatabase(lockConfig);
    const lockEmbedder = createMockEmbedder(384);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        const body = url.includes("/git/trees/") ? { tree: [] } : { object: { sha: "test-sha" } };
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }),
    );

    try {
      const order: string[] = [];

      // Fire two concurrent calls
      const p1 = handleFetchDocs({ version: "v4" }, lockConfig, lockDb, lockEmbedder).then(() => {
        order.push("first");
      });
      const p2 = handleFetchDocs({ version: "v4" }, lockConfig, lockDb, lockEmbedder).then(() => {
        order.push("second");
      });

      await Promise.all([p1, p2]);

      // Both completed, second waited for first
      expect(order).toEqual(["first", "second"]);
    } finally {
      vi.unstubAllGlobals();
      lockDb.close();
      rmSync(TEST_LOCK_DIR, { recursive: true, force: true });
      _resetFetchLockForTesting();
    }
  });
});
