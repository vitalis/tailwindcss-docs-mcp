import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
    // Returns appropriate responses for ref lookup vs tree listing.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        const body = url.includes("/git/trees/")
          ? { tree: [] } // Empty tree — files already cached on disk
          : { object: { sha: "test-sha" } }; // Ref lookup
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }),
    );
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
    const embedsBefore = embedder.calls.length;

    const result = await handleFetchDocs({ version: "v4", force: true }, config, db, embedder);

    expect(result.docCount).toBe(2);
    expect(result.chunkCount).toBeGreaterThan(0);

    // force=true should re-embed all chunks, not skip any
    const embedsAfter = embedder.calls.length;
    expect(embedsAfter - embedsBefore).toBe(result.chunkCount);
  });

  it("skips unchanged chunks on normal re-run (no force)", async () => {
    const embedsBefore = embedder.calls.length;

    const result = await handleFetchDocs({ version: "v4" }, config, db, embedder);

    expect(result.docCount).toBe(2);

    // Without force, unchanged chunks should be skipped (no new embeds)
    const embedsAfter = embedder.calls.length;
    expect(embedsAfter - embedsBefore).toBe(0);
  });
});
