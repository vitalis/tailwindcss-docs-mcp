import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maybeAutoIndex } from "../../src/auto-index.js";
import type { Database } from "../../src/storage/database.js";
import { createDatabase } from "../../src/storage/database.js";
import type { Config } from "../../src/utils/config.js";
import { testConfig as baseTestConfig } from "../helpers/factories.js";
import { createMockEmbedder } from "../setup.js";

const TEST_DIR = "/tmp/tailwindcss-docs-mcp-auto-index-test";

const MINIMAL_MDX = `---
title: "Padding"
description: "Utilities for controlling an element's padding."
---

## Basic usage

Use \`p-4\` for padding.
`;

function testConfig(overrides?: Partial<Config>): Config {
  return baseTestConfig({
    dataDir: TEST_DIR,
    rawDir: join(TEST_DIR, "raw"),
    ...overrides,
  });
}

describe("maybeAutoIndex", () => {
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

  it("skips indexing when version is already indexed", async () => {
    // Pre-populate index status
    db.updateIndexStatus("v4", "test-model", 384);

    const embedder = createMockEmbedder(384);
    const onStart = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    await maybeAutoIndex(config, db, embedder, {
      onStart,
      onComplete,
      onError,
    });

    expect(onStart).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(embedder.calls).toHaveLength(0);
  });

  it("triggers indexing when no index exists", async () => {
    // Write fixture MDX file so handleFetchDocs has something to process
    const dir = join(config.rawDir, "v4");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "padding.mdx"), MINIMAL_MDX, "utf-8");

    const embedder = createMockEmbedder(384);
    const onStart = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    await maybeAutoIndex(config, db, embedder, {
      onStart,
      onComplete,
      onError,
    });

    expect(onStart).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(embedder.calls.length).toBeGreaterThan(0);
  });

  it("calls onError when indexing fails", async () => {
    // No fixture files and mock fetch to reject
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    try {
      const embedder = createMockEmbedder(384);
      const onStart = vi.fn();
      const onComplete = vi.fn();
      const onError = vi.fn();

      await maybeAutoIndex(config, db, embedder, {
        onStart,
        onComplete,
        onError,
      });

      expect(onStart).toHaveBeenCalledOnce();
      expect(onComplete).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledOnce();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses the configured default version", async () => {
    const v3Config = testConfig({ defaultVersion: "v3" });

    // Index v4 but not v3
    db.updateIndexStatus("v4", "test-model", 384);

    // Write fixture for v3
    const dir = join(v3Config.rawDir, "v3");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "padding.mdx"), MINIMAL_MDX, "utf-8");

    const embedder = createMockEmbedder(384);
    const onStart = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    await maybeAutoIndex(v3Config, db, embedder, {
      onStart,
      onComplete,
      onError,
    });

    // Should trigger indexing because v3 is not indexed (even though v4 is)
    expect(onStart).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("calls onError when db.getIndexStatus throws", async () => {
    // Close DB to force getIndexStatus to throw
    db.close();

    const embedder = createMockEmbedder(384);
    const onStart = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    await maybeAutoIndex(config, db, embedder, {
      onStart,
      onComplete,
      onError,
    });

    expect(onStart).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();

    // Reopen DB for afterEach cleanup
    db = await createDatabase(config);
  });
});
