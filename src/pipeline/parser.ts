/**
 * A parsed and cleaned document ready for chunking.
 */
export interface CleanDocument {
  /** URL slug (e.g., "padding", "flex-direction", "dark-mode") */
  slug: string;
  /** Document title from frontmatter */
  title: string;
  /** Document description from frontmatter */
  description: string;
  /** Clean markdown content (JSX and imports stripped) */
  content: string;
  /** Full URL to the documentation page */
  url: string;
  /** Tailwind CSS version */
  version: string;
}

/**
 * Frontmatter extracted from an MDX file.
 */
export interface Frontmatter {
  title: string;
  description: string;
  [key: string]: unknown;
}

/**
 * Parse raw MDX content into a clean markdown document.
 *
 * Processing pipeline:
 * 1. stripFrontmatter — extract title, description into metadata
 * 2. stripImportStatements — remove `import ... from ...` lines
 * 3. stripJsxComponents — remove <Component> tags, keep inner text
 * 4. normalizeCodeBlocks — strip `{{ filename: '...' }}` metadata
 * 5. preserveMarkdownStructure — keep headings, lists, code, links
 */
export function parseMdx(raw: string, slug: string, version: string): CleanDocument {
  const { frontmatter, content: afterFrontmatter } = stripFrontmatter(raw);
  let content = stripImportStatements(afterFrontmatter);
  content = stripExportStatements(content);
  content = stripJsxComponents(content);
  content = normalizeCodeBlocks(content);
  content = collapseBlankLines(content);

  return {
    slug,
    title: frontmatter.title,
    description: frontmatter.description,
    content: content.trim(),
    url: `https://tailwindcss.com/docs/${slug}`,
    version,
  };
}

/**
 * Extract frontmatter from raw MDX content.
 *
 * Parses YAML frontmatter between `---` delimiters.
 * Returns the frontmatter data and the remaining content.
 */
export function stripFrontmatter(raw: string): {
  frontmatter: Frontmatter;
  content: string;
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return {
      frontmatter: { title: "", description: "" },
      content: raw,
    };
  }

  const yamlBlock = match[1];
  const frontmatter: Frontmatter = { title: "", description: "" };

  for (const line of yamlBlock.split("\n")) {
    const kvMatch = line.match(/^(\w+):\s*"?(.*?)"?\s*$/);
    if (kvMatch) {
      frontmatter[kvMatch[1]] = kvMatch[2];
    }
  }

  return {
    frontmatter,
    content: raw.slice(match[0].length),
  };
}

/**
 * Remove ES module import statements from MDX content.
 *
 * Handles both single-line and multi-line imports:
 * - `import { Tip } from '@/components/Tip'`
 * - `import utilities from 'utilities?plugin=padding'`
 */
export function stripImportStatements(content: string): string {
  // Single-line imports
  let result = content.replace(/^import\s+.*from\s+['"].*['"];?\s*$/gm, "");
  // Default/namespace imports without from
  result = result.replace(/^import\s+['"].*['"];?\s*$/gm, "");
  return result;
}

/**
 * Remove ES module export statements from MDX content.
 *
 * Handles:
 * - `export const classes = { ... }`
 * - Multi-line export blocks
 */
function stripExportStatements(content: string): string {
  // Multi-line export blocks: export const ... = { ... }
  let result = content.replace(
    /^export\s+(?:const|let|var|function)\s+[\s\S]*?(?:\n\}|\n\);?)\s*$/gm,
    "",
  );
  // Single-line exports
  result = result.replace(/^export\s+.*$/gm, "");
  return result;
}

/**
 * Remove JSX component tags, optionally preserving inner text content.
 *
 * - Self-closing tags: `<TipGood />` -> removed entirely
 * - Wrapper tags: `<TipGood>Use padding</TipGood>` -> `Use padding`
 * - Nested tags: `<SnippetGroup><Snippet>...</Snippet></SnippetGroup>` -> content only
 */
export function stripJsxComponents(content: string): string {
  // Protect code blocks from JSX stripping
  const codeBlocks: string[] = [];
  let result = content.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // Remove self-closing JSX tags: <Component /> or <Component prop="val" />
  result = result.replace(/<[A-Z][a-zA-Z]*(?:\s+[^>]*)?\s*\/>/g, "");

  // Remove JSX wrapper tags, keeping inner text (handle nested by repeating)
  let prev = "";
  while (prev !== result) {
    prev = result;
    // Tags with text content: <Component ...>text</Component>
    result = result.replace(/<([A-Z][a-zA-Z]*)[^>]*>([\s\S]*?)<\/\1>/g, "$2");
  }

  // Restore code blocks
  result = result.replace(/__CODE_BLOCK_(\d+)__/g, (_, idx) => codeBlocks[Number(idx)]);

  return result;
}

/**
 * Normalize code block metadata syntax.
 *
 * Strips `{{ filename: '...' }}` annotations from fenced code blocks
 * while preserving the language identifier and code content.
 *
 * Input:  ` ```js {{ filename: 'tailwind.config.js' }} `
 * Output: ` ```js `
 */
export function normalizeCodeBlocks(content: string): string {
  return content.replace(/(```\w*(?:-\w+)*)\s*\{\{[\s\S]*?\}\}/g, "$1");
}

/**
 * Collapse runs of 3+ blank lines into 2.
 */
function collapseBlankLines(content: string): string {
  return content.replace(/\n{3,}/g, "\n\n");
}
