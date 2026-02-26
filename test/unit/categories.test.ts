import { describe, expect, it } from "vitest";
import { categoryForSlug, findCategory } from "../../src/utils/categories.js";

describe("Categories", () => {
  describe("categoryForSlug", () => {
    it("returns the category for a known slug", () => {
      const result = categoryForSlug("padding");
      expect(result).toBeDefined();
      expect(result?.name).toBe("Spacing");
    });

    it("returns undefined for an unknown slug", () => {
      expect(categoryForSlug("nonexistent-slug")).toBeUndefined();
    });

    it("finds slugs across different categories", () => {
      expect(categoryForSlug("display")?.name).toBe("Layout");
      expect(categoryForSlug("font-size")?.name).toBe("Typography");
    });
  });

  describe("findCategory", () => {
    it("finds a category by exact name", () => {
      const result = findCategory("Spacing");
      expect(result).toBeDefined();
      expect(result?.name).toBe("Spacing");
    });

    it("is case-insensitive", () => {
      expect(findCategory("spacing")?.name).toBe("Spacing");
      expect(findCategory("SPACING")?.name).toBe("Spacing");
    });

    it("returns undefined for unknown category", () => {
      expect(findCategory("nonexistent")).toBeUndefined();
    });
  });
});
