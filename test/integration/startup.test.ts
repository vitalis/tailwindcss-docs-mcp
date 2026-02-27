import { rmSync } from "node:fs";
import { join } from "node:path";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, describe, expect, it } from "vitest";
import type { EmbedderStatus } from "../../src/server.js";
import { createServer } from "../../src/server.js";
import { createDatabase } from "../../src/storage/database.js";
import { testConfig as baseTestConfig } from "../helpers/factories.js";
import { createMockEmbedder } from "../setup.js";

const TEST_DIR = "/tmp/tailwindcss-docs-mcp-startup-test";

function testConfig() {
  return baseTestConfig({ dataDir: TEST_DIR, rawDir: join(TEST_DIR, "raw") });
}

describe("Server startup lifecycle", () => {
  const cleanups: (() => void)[] = [];

  afterAll(() => {
    for (const fn of cleanups) fn();
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("starts with null embedder and reports pending status", async () => {
    const config = testConfig();
    const db = await createDatabase(config);
    cleanups.push(() => db.close());

    const [, serverTransport] = InMemoryTransport.createLinkedPair();
    const handle = await createServer({ config, db, embedder: null }, serverTransport);

    expect(handle.getEmbedderStatus()).toBe("pending");
  });

  it("hot-swaps embedder after server starts", async () => {
    const config = testConfig();
    const db = await createDatabase(config);
    cleanups.push(() => db.close());

    const [, serverTransport] = InMemoryTransport.createLinkedPair();
    const handle = await createServer({ config, db, embedder: null }, serverTransport);

    expect(handle.getEmbedderStatus()).toBe("pending");

    // Hot-swap embedder
    const embedder = createMockEmbedder(384);
    handle.setEmbedder(embedder);

    expect(handle.getEmbedderStatus()).toBe("ready");
  });

  it("tracks embedder status transitions", async () => {
    const config = testConfig();
    const db = await createDatabase(config);
    cleanups.push(() => db.close());

    const [, serverTransport] = InMemoryTransport.createLinkedPair();
    const handle = await createServer({ config, db, embedder: null }, serverTransport);

    const transitions: EmbedderStatus[] = [handle.getEmbedderStatus()];

    handle.setEmbedderStatus("downloading");
    transitions.push(handle.getEmbedderStatus());

    handle.setEmbedder(createMockEmbedder(384));
    transitions.push(handle.getEmbedderStatus());

    expect(transitions).toEqual(["pending", "downloading", "ready"]);
  });

  it("starts with ready status when embedder is provided", async () => {
    const config = testConfig();
    const db = await createDatabase(config);
    cleanups.push(() => db.close());

    const embedder = createMockEmbedder(384);
    const [, serverTransport] = InMemoryTransport.createLinkedPair();
    const handle = await createServer({ config, db, embedder }, serverTransport);

    expect(handle.getEmbedderStatus()).toBe("ready");
  });

  it("starts with idle indexing status", async () => {
    const config = testConfig();
    const db = await createDatabase(config);
    cleanups.push(() => db.close());

    const [, serverTransport] = InMemoryTransport.createLinkedPair();
    const handle = await createServer({ config, db, embedder: null }, serverTransport);

    expect(handle.getIndexingStatus()).toBe("idle");
  });

  it("tracks indexing status transitions", async () => {
    const config = testConfig();
    const db = await createDatabase(config);
    cleanups.push(() => db.close());

    const [, serverTransport] = InMemoryTransport.createLinkedPair();
    const handle = await createServer({ config, db, embedder: null }, serverTransport);

    expect(handle.getIndexingStatus()).toBe("idle");

    handle.setIndexingStatus("indexing");
    expect(handle.getIndexingStatus()).toBe("indexing");

    handle.setIndexingStatus("complete");
    expect(handle.getIndexingStatus()).toBe("complete");
  });

  it("db.close() is idempotent", async () => {
    const config = testConfig();
    const db = await createDatabase(config);

    // Closing twice should not throw
    db.close();
    expect(() => db.close()).not.toThrow();
  });
});
