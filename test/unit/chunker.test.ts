import { describe, it, expect } from "vitest";
import {
  chunkDocument,
  contentHash,
  estimateTokens,
  headingToAnchor,
} from "../../src/pipeline/chunker.js";
import type { CleanDocument } from "../../src/pipeline/parser.js";

describe("Chunker", () => {
  describe("chunkDocument", () => {
    it("splits on ## headings", () => {
      // TODO: implement
      // Each `##` section becomes a separate chunk
    });

    it("respects max token limit", () => {
      // TODO: implement
      // Chunks exceeding ~500 tokens are split further at `###` boundaries
    });

    it("never splits code blocks", () => {
      // TODO: implement
      // A code block that pushes a chunk over the limit stays intact
    });

    it("builds heading breadcrumbs", () => {
      // TODO: implement
      // `## Basic usage > ### Horizontal padding` preserved in chunk metadata
    });

    it("includes parent heading overlap", () => {
      // TODO: implement
      // Sub-chunks include the parent `##` heading text
    });

    it("generates correct deep-link URLs", () => {
      // TODO: implement
      // `padding` + `## Basic usage` -> `https://tailwindcss.com/docs/padding#basic-usage`
    });

    it("handles documents with no headings", () => {
      // TODO: implement
      // Entire content becomes a single chunk
    });
  });

  describe("contentHash", () => {
    it("generates stable content hashes", () => {
      // TODO: implement
      // Same content always produces the same SHA-256 hash
    });

    it("detects changed content", () => {
      // TODO: implement
      // Modified content produces a different hash
    });
  });

  describe("estimateTokens", () => {
    it("estimates token count for text", () => {
      // TODO: implement
    });
  });

  describe("headingToAnchor", () => {
    it("converts heading to URL-safe anchor", () => {
      // TODO: implement
      // "## Basic usage" -> "basic-usage"
    });
  });
});
