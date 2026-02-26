import { describe, it, expect, beforeAll } from "vitest";

describe("Incremental Re-indexing", () => {
  beforeAll(async () => {
    // TODO: Set up test database and run initial indexing
  });

  it("skips re-embedding for unchanged docs", () => {
    // TODO: implement
    // Call fetch_docs twice — second call embeds zero chunks
  });

  it("re-embeds only changed chunks when doc is modified", () => {
    // TODO: implement
    // Change one section -> only that chunk's hash changes -> only that chunk re-embeds
  });

  it("removes chunks when a doc is deleted", () => {
    // TODO: implement
    // Remove a fixture doc -> its chunks and embeddings are gone
  });

  it("adds chunks when a new doc appears", () => {
    // TODO: implement
    // Add a fixture doc -> new chunks appear in index
  });

  it("updates index status timestamp after re-index", () => {
    // TODO: implement
    // indexed_at timestamp changes after re-index
  });
});
