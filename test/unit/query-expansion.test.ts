import { describe, expect, it } from "vitest";
import { expandQuery } from "../../src/utils/query-expansion.js";

describe("Query Expansion", () => {
  describe("expandQuery", () => {
    // ── No-op cases ──────────────────────────────────────────────
    it("returns query unchanged when no class names detected", () => {
      expect(expandQuery("how to center a div")).toBe("how to center a div");
    });

    it("returns empty string unchanged", () => {
      expect(expandQuery("")).toBe("");
    });

    it("returns single-word query unchanged", () => {
      expect(expandQuery("padding")).toBe("padding");
    });

    it("returns natural language query unchanged", () => {
      expect(expandQuery("Tailwind CSS responsive design breakpoints")).toBe(
        "Tailwind CSS responsive design breakpoints",
      );
    });

    // ── Spacing expansions ───────────────────────────────────────
    it("expands mx-auto to include margin", () => {
      const result = expandQuery("mx-auto tailwind centering");
      expect(result).toContain("margin");
      expect(result.startsWith("mx-auto tailwind centering")).toBe(true);
    });

    it("expands pt-6 to include padding", () => {
      const result = expandQuery("what does pt-6 do");
      expect(result).toContain("padding");
    });

    it("expands px-4 to include padding", () => {
      const result = expandQuery("px-4 class");
      expect(result).toContain("padding");
    });

    it("expands py-2 to include padding", () => {
      const result = expandQuery("py-2 spacing");
      expect(result).toContain("padding");
    });

    // ── Grid expansions ──────────────────────────────────────────
    it("expands grid-cols-3 to include grid template columns", () => {
      const result = expandQuery("grid-cols-3 tailwind grid");
      expect(result).toContain("template");
      expect(result).toContain("columns");
      // "grid" already in query — should not be duplicated
      const gridCount = result.split(/\s+/).filter((t) => t === "grid").length;
      expect(gridCount).toBe(1);
    });

    it("expands grid-rows-2 to include grid template rows", () => {
      const result = expandQuery("grid-rows-2 layout");
      expect(result).toContain("template");
      expect(result).toContain("rows");
    });

    // ── text- disambiguation ─────────────────────────────────────
    it("expands text-lg to font size", () => {
      const result = expandQuery("tailwind text-lg class");
      expect(result).toContain("font");
      expect(result).toContain("size");
    });

    it("expands text-xs to font size", () => {
      const result = expandQuery("text-xs responsive");
      expect(result).toContain("font");
      expect(result).toContain("size");
    });

    it("expands text-2xl to font size", () => {
      const result = expandQuery("text-2xl heading");
      expect(result).toContain("font");
      expect(result).toContain("size");
    });

    it("expands text-red-500 to text color", () => {
      const result = expandQuery("text-red-500 hover");
      expect(result).toContain("color");
    });

    it("expands text-blue-200 to text color", () => {
      const result = expandQuery("text-blue-200 theme");
      expect(result).toContain("color");
    });

    it("does not expand ambiguous text- variants", () => {
      // text-center, text-wrap etc. should not be expanded
      expect(expandQuery("text-center align")).toBe("text-center align");
    });

    // ── Other prefix expansions ──────────────────────────────────
    it("expands rounded-lg to border radius", () => {
      const result = expandQuery("rounded-lg card");
      expect(result).toContain("border");
      expect(result).toContain("radius");
    });

    it("expands shadow-md to box shadow", () => {
      const result = expandQuery("shadow-md card");
      expect(result).toContain("box");
      expect(result).toContain("shadow");
    });

    it("expands w-full to width", () => {
      const result = expandQuery("w-full container");
      expect(result).toContain("width");
    });

    it("expands z-50 to z-index", () => {
      const result = expandQuery("z-50 modal");
      expect(result).toContain("z-index");
    });

    it("expands tracking-wide to letter spacing", () => {
      const result = expandQuery("tracking-wide text");
      expect(result).toContain("letter");
      expect(result).toContain("spacing");
    });

    it("expands leading-6 to line height", () => {
      const result = expandQuery("leading-6 paragraph");
      expect(result).toContain("line");
      expect(result).toContain("height");
    });

    it("expands bg-blue-500 to background", () => {
      const result = expandQuery("bg-blue-500 color");
      expect(result).toContain("background");
    });

    it("expands gap-4 to gap", () => {
      // "gap" is already the expansion term, so it depends on query context
      const result = expandQuery("gap-4 spacing");
      expect(result).toContain("gap");
    });

    it("expands space-x-4 to space between", () => {
      const result = expandQuery("space-x-4 items");
      expect(result).toContain("space");
      expect(result).toContain("between");
    });

    it("expands min-w-0 to min-width", () => {
      const result = expandQuery("min-w-0 container");
      expect(result).toContain("min-width");
    });

    it("expands max-w-lg to max-width", () => {
      const result = expandQuery("max-w-lg container");
      expect(result).toContain("max-width");
    });

    // ── Deduplication ────────────────────────────────────────────
    it("does not add terms already present in query", () => {
      const result = expandQuery("bg-blue-500 background color");
      // "background" is already in query — should not be duplicated
      const bgCount = result.split(/\s+/).filter((t) => t === "background").length;
      expect(bgCount).toBe(1);
    });

    it("deduplication is case-insensitive", () => {
      const result = expandQuery("Padding pt-6 class");
      const paddingCount = result
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t === "padding").length;
      expect(paddingCount).toBe(1);
    });

    // ── Multiple class names ─────────────────────────────────────
    it("expands multiple class names in a single query", () => {
      const result = expandQuery("rounded-lg gap-4 layout");
      expect(result).toContain("border");
      expect(result).toContain("radius");
      expect(result).toContain("gap");
    });

    // ── Preserves original query ─────────────────────────────────
    it("preserves all original query tokens", () => {
      const original = "how to use rounded-lg in tailwind";
      const result = expandQuery(original);
      expect(result.startsWith(original)).toBe(true);
      expect(result).toContain("border");
      expect(result).toContain("radius");
    });
  });
});
