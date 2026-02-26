import { describe, expect, it } from "vitest";
import { z } from "zod";
import { TOOL_NAMES } from "../../src/server.js";

describe("MCP Server", () => {
  describe("TOOL_NAMES", () => {
    it("exposes all four expected tool names", () => {
      expect(TOOL_NAMES).toEqual({
        FETCH_DOCS: "fetch_docs",
        SEARCH_DOCS: "search_docs",
        LIST_UTILITIES: "list_utilities",
        CHECK_STATUS: "check_status",
      });
    });
  });

  describe("Zod input schemas", () => {
    const versionSchema = z.enum(["v3", "v4"]);

    it("validates version enum accepts v3 and v4", () => {
      expect(versionSchema.parse("v3")).toBe("v3");
      expect(versionSchema.parse("v4")).toBe("v4");
      expect(() => versionSchema.parse("v5")).toThrow();
    });

    it("validates search_docs input schema", () => {
      const schema = z.object({
        query: z.string(),
        version: z.enum(["v3", "v4"]).optional(),
        limit: z.number().min(1).max(20).optional(),
      });

      // Valid inputs
      expect(schema.parse({ query: "padding" })).toEqual({ query: "padding" });
      expect(schema.parse({ query: "grid", version: "v4", limit: 10 })).toEqual({
        query: "grid",
        version: "v4",
        limit: 10,
      });

      // Invalid: missing query
      expect(() => schema.parse({})).toThrow();
      // Invalid: limit out of range
      expect(() => schema.parse({ query: "x", limit: 0 })).toThrow();
      expect(() => schema.parse({ query: "x", limit: 21 })).toThrow();
    });

    it("validates fetch_docs input schema", () => {
      const schema = z.object({
        version: z.enum(["v3", "v4"]).optional(),
        force: z.boolean().optional(),
      });

      expect(schema.parse({})).toEqual({});
      expect(schema.parse({ version: "v3", force: true })).toEqual({
        version: "v3",
        force: true,
      });
      expect(() => schema.parse({ version: "v5" })).toThrow();
    });

    it("validates list_utilities input schema", () => {
      const schema = z.object({
        category: z.string().optional(),
        version: z.enum(["v3", "v4"]).optional(),
      });

      expect(schema.parse({})).toEqual({});
      expect(schema.parse({ category: "Spacing", version: "v3" })).toEqual({
        category: "Spacing",
        version: "v3",
      });
    });

    it("validates check_status input schema", () => {
      const schema = z.object({
        version: z.enum(["v3", "v4"]).optional(),
      });

      expect(schema.parse({})).toEqual({});
      expect(schema.parse({ version: "v4" })).toEqual({ version: "v4" });
      expect(() => schema.parse({ version: "v1" })).toThrow();
    });
  });

  describe("Tool handler response format", () => {
    it("formatSearchResults returns markdown with sections", async () => {
      const { formatSearchResults } = await import("../../src/tools/search-docs.js");

      const formatted = formatSearchResults({
        results: [
          {
            score: 1.0,
            heading: "## Basic usage",
            content: "Use `p-4` for padding.",
            url: "https://tailwindcss.com/docs/padding#basic-usage",
            docTitle: "Padding",
          },
        ],
        notIndexed: false,
      });

      expect(formatted).toContain("## 1. Padding");
      expect(formatted).toContain("Basic usage");
      expect(formatted).toContain("tailwindcss.com/docs/padding");
      expect(formatted).toContain("p-4");
    });

    it("formatSearchResults returns guidance when not indexed", async () => {
      const { formatSearchResults } = await import("../../src/tools/search-docs.js");

      const formatted = formatSearchResults({ results: [], notIndexed: true });
      expect(formatted).toContain("fetch_docs");
    });

    it("formatStatus returns markdown with index info", async () => {
      const { formatStatus } = await import("../../src/tools/check-status.js");

      const formatted = formatStatus({
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

      expect(formatted).toContain("# Tailwind CSS Documentation Index Status");
      expect(formatted).toContain("**Documents**: 10");
      expect(formatted).toContain("**Chunks**: 50");
    });
  });
});
