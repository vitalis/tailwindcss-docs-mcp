import { describe, expect, it } from "vitest";
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
  });
});
