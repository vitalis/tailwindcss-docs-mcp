import { describe, expect, it } from "vitest";
import {
  normalizeCodeBlocks,
  parseMdx,
  stripFrontmatter,
  stripImportStatements,
  stripJsxComponents,
} from "../../src/pipeline/parser.js";

describe("MDX Parser", () => {
  describe("stripFrontmatter", () => {
    it("extracts title and description from frontmatter", () => {
      const input = '---\ntitle: "Padding"\ndescription: "Utilities for padding"\n---\n\n## Usage';
      const result = stripFrontmatter(input);
      expect(result.frontmatter.title).toBe("Padding");
      expect(result.frontmatter.description).toBe("Utilities for padding");
      expect(result.content.trim()).toBe("## Usage");
    });

    it("handles unquoted frontmatter values", () => {
      const input =
        "---\ntitle: Dark Mode\ndescription: Using Tailwind CSS in dark mode.\n---\n\nContent";
      const result = stripFrontmatter(input);
      expect(result.frontmatter.title).toBe("Dark Mode");
      expect(result.frontmatter.description).toBe("Using Tailwind CSS in dark mode.");
    });

    it("handles files with only frontmatter", () => {
      const input = '---\ntitle: "Padding"\n---';
      const result = stripFrontmatter(input);
      expect(result.frontmatter.title).toBe("Padding");
      expect(result.content).toBe("");
    });

    it("returns raw content when no frontmatter exists", () => {
      const input = "## Usage\nSome content";
      const result = stripFrontmatter(input);
      expect(result.frontmatter.title).toBe("");
      expect(result.content).toBe(input);
    });
  });

  describe("stripImportStatements", () => {
    it("strips named imports", () => {
      const input = "import { Tip } from '@/components/Tip'\n\n## Usage";
      expect(stripImportStatements(input).trim()).toBe("## Usage");
    });

    it("strips default imports", () => {
      const input = "import utilities from 'utilities?plugin=padding'\n\nContent";
      expect(stripImportStatements(input).trim()).toBe("Content");
    });

    it("strips multiple imports", () => {
      const input = [
        "import { Tip } from '@/components/Tip'",
        "import utilities from 'utilities?plugin=padding'",
        "",
        "## Usage",
      ].join("\n");
      expect(stripImportStatements(input).trim()).toBe("## Usage");
    });
  });

  describe("stripJsxComponents", () => {
    it("strips JSX self-closing tags", () => {
      const input = "<TipGood />\n\nSome text";
      expect(stripJsxComponents(input).trim()).toBe("Some text");
    });

    it("strips self-closing tags with props", () => {
      const input =
        '<HoverFocusAndOtherStates defaultClass="py-4" featuredClass="py-8" />\n\nContent';
      expect(stripJsxComponents(input).trim()).toBe("Content");
    });

    it("extracts text from JSX wrappers", () => {
      const input = "<TipGood>Use padding utilities</TipGood>";
      expect(stripJsxComponents(input).trim()).toBe("Use padding utilities");
    });

    it("extracts text from JSX wrappers with props", () => {
      const input = "<TipInfo>The `selector` strategy replaced the `class` strategy.</TipInfo>";
      expect(stripJsxComponents(input).trim()).toBe(
        "The `selector` strategy replaced the `class` strategy.",
      );
    });

    it("strips nested JSX components", () => {
      const input = "<SnippetGroup><Snippet>inner content</Snippet></SnippetGroup>";
      expect(stripJsxComponents(input).trim()).toBe("inner content");
    });

    it("does not strip HTML tags inside code blocks", () => {
      const input = '```html\n<div class="p-4">text</div>\n```';
      expect(stripJsxComponents(input)).toBe(input);
    });

    it("handles Heading components wrapping text", () => {
      const input = "## <Heading hidden>Basic usage</Heading>";
      expect(stripJsxComponents(input).trim()).toBe("## Basic usage");
    });
  });

  describe("normalizeCodeBlocks", () => {
    it("preserves code blocks without metadata", () => {
      const input = "```js\nmodule.exports = {}\n```";
      expect(normalizeCodeBlocks(input)).toBe(input);
    });

    it("strips code block filename metadata", () => {
      const input = "```js {{ filename: 'tailwind.config.js' }}\nmodule.exports = {}\n```";
      expect(normalizeCodeBlocks(input)).toBe("```js\nmodule.exports = {}\n```");
    });

    it("strips code block example metadata", () => {
      const input = "```html {{ example: true }}\n<div>test</div>\n```";
      expect(normalizeCodeBlocks(input)).toBe("```html\n<div>test</div>\n```");
    });

    it("strips metadata from diff-js blocks", () => {
      const input = "```diff-js {{ filename: 'tailwind.config.js' }}\n+  darkMode: 'selector'\n```";
      expect(normalizeCodeBlocks(input)).toBe("```diff-js\n+  darkMode: 'selector'\n```");
    });

    it("handles complex metadata objects", () => {
      const input = "```html {{ example: { p: 'none' } }}\n<div>test</div>\n```";
      expect(normalizeCodeBlocks(input)).toBe("```html\n<div>test</div>\n```");
    });
  });

  describe("parseMdx", () => {
    it("produces a complete CleanDocument", () => {
      const input =
        '---\ntitle: "Padding"\ndescription: "Utilities for padding"\n---\n\nimport { Tip } from \'@/components/Tip\'\n\n## Basic usage\n\nUse `p-*` utilities.';
      const result = parseMdx(input, "padding", "v3");
      expect(result.slug).toBe("padding");
      expect(result.title).toBe("Padding");
      expect(result.description).toBe("Utilities for padding");
      expect(result.url).toBe("https://tailwindcss.com/docs/padding");
      expect(result.version).toBe("v3");
      expect(result.content).toContain("## Basic usage");
      expect(result.content).toContain("Use `p-*` utilities.");
      expect(result.content).not.toContain("import");
    });

    it("preserves markdown structure", () => {
      const input =
        "---\ntitle: Test\n---\n\n## Heading\n\n- list item\n- another\n\n[Link](https://example.com)\n\n| Col |\n| --- |\n| val |";
      const result = parseMdx(input, "test", "v3");
      expect(result.content).toContain("## Heading");
      expect(result.content).toContain("- list item");
      expect(result.content).toContain("[Link](https://example.com)");
      expect(result.content).toContain("| Col |");
    });

    it("handles empty files", () => {
      const result = parseMdx("", "empty", "v3");
      expect(result.title).toBe("");
      expect(result.content).toBe("");
      expect(result.slug).toBe("empty");
    });

    it("handles files with only frontmatter", () => {
      const result = parseMdx('---\ntitle: "Padding"\n---', "padding", "v3");
      expect(result.title).toBe("Padding");
      expect(result.content).toBe("");
    });

    it("strips export statements", () => {
      const input =
        "---\ntitle: Test\n---\n\nexport const classes = {\n  utilities,\n}\n\n## Usage";
      const result = parseMdx(input, "test", "v3");
      expect(result.content).not.toContain("export");
      expect(result.content).toContain("## Usage");
    });
  });
});
