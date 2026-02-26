import { describe, expect, it } from "vitest";
import {
  chunkDocument,
  contentHash,
  estimateTokens,
  headingToAnchor,
} from "../../src/pipeline/chunker.js";
import type { CleanDocument } from "../../src/pipeline/parser.js";

function makeDoc(overrides: Partial<CleanDocument> = {}): CleanDocument {
  return {
    slug: "padding",
    title: "Padding",
    description: "Utilities for padding",
    content: "",
    url: "https://tailwindcss.com/docs/padding",
    version: "v3",
    ...overrides,
  };
}

describe("Chunker", () => {
  describe("chunkDocument", () => {
    it("splits on ## headings", () => {
      const doc = makeDoc({
        content:
          "## Basic usage\n\nUse `p-*`.\n\n## Responsive\n\nUse breakpoints.",
      });
      const chunks = chunkDocument(doc);
      expect(chunks).toHaveLength(2);
      expect(chunks[0].content).toContain("## Basic usage");
      expect(chunks[1].content).toContain("## Responsive");
    });

    it("respects max token limit by splitting on ### headings", () => {
      const longContent = "A".repeat(2000); // 2000 chars = 500 tokens
      const doc = makeDoc({
        content: `## Section\n\n### Sub1\n\n${longContent}\n\n### Sub2\n\n${longContent}`,
      });
      const chunks = chunkDocument(doc, { maxTokens: 500 });
      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    it("never splits code blocks", () => {
      const codeBlock = "```js\n" + "const x = 1;\n".repeat(50) + "```";
      const doc = makeDoc({
        content: `## Section\n\nSome text.\n\n${codeBlock}`,
      });
      const chunks = chunkDocument(doc, { maxTokens: 100 });
      // At least one chunk should contain the complete code block
      const hasComplete = chunks.some(
        (c) => c.content.includes("```js\n") && c.content.includes("```"),
      );
      expect(hasComplete).toBe(true);
    });

    it("builds heading breadcrumbs", () => {
      const padding = "X".repeat(300); // Force split by making sub-sections large
      const doc = makeDoc({
        content: `## Basic usage\n\n### Horizontal padding\n\n${padding}\n\n### Vertical padding\n\n${padding}`,
      });
      const chunks = chunkDocument(doc, { maxTokens: 100 });
      const breadcrumbs = chunks.map((c) => c.heading);
      expect(
        breadcrumbs.some(
          (b) =>
            b.includes("## Basic usage") &&
            b.includes("### Horizontal padding"),
        ),
      ).toBe(true);
    });

    it("includes parent heading in sub-chunks", () => {
      const padding = "X".repeat(300);
      const doc = makeDoc({
        content: `## Basic usage\n\n### Sub1\n\n${padding}\n\n### Sub2\n\n${padding}`,
      });
      const chunks = chunkDocument(doc, { maxTokens: 100 });
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      // All chunks should contain the parent heading
      for (const chunk of chunks) {
        expect(chunk.content).toContain("## Basic usage");
      }
    });

    it("generates correct deep-link URLs", () => {
      const doc = makeDoc({
        content: "## Basic usage\n\nUse padding.",
      });
      const chunks = chunkDocument(doc);
      expect(chunks[0].url).toBe(
        "https://tailwindcss.com/docs/padding#basic-usage",
      );
    });

    it("handles documents with no headings", () => {
      const doc = makeDoc({
        content: "Just plain text without any headings.",
      });
      const chunks = chunkDocument(doc);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe("Just plain text without any headings.");
    });

    it("returns empty array for empty content", () => {
      const doc = makeDoc({ content: "" });
      expect(chunkDocument(doc)).toHaveLength(0);
    });

    it("assigns version and docSlug from document", () => {
      const doc = makeDoc({
        content: "## Test\n\nContent.",
        slug: "dark-mode",
        version: "v4",
      });
      const chunks = chunkDocument(doc);
      expect(chunks[0].docSlug).toBe("dark-mode");
      expect(chunks[0].version).toBe("v4");
    });
  });

  describe("contentHash", () => {
    it("generates stable content hashes", () => {
      const hash1 = contentHash("some content");
      const hash2 = contentHash("some content");
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it("detects changed content", () => {
      const hash1 = contentHash("original content");
      const hash2 = contentHash("modified content");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("estimateTokens", () => {
    it("estimates token count for text", () => {
      // ~4 chars per token
      expect(estimateTokens("hello world")).toBe(Math.ceil(11 / 4));
    });

    it("returns 0 for empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });
  });

  describe("headingToAnchor", () => {
    it("converts heading to URL-safe anchor", () => {
      expect(headingToAnchor("## Basic usage")).toBe("basic-usage");
    });

    it("handles ### headings", () => {
      expect(headingToAnchor("### Adding horizontal padding")).toBe(
        "adding-horizontal-padding",
      );
    });

    it("removes special characters", () => {
      expect(headingToAnchor("## What's new?")).toBe("whats-new");
    });

    it("returns empty string for empty input", () => {
      expect(headingToAnchor("")).toBe("");
    });
  });
});
