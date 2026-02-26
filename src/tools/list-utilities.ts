import type { Database } from "../storage/database.js";
import { UTILITY_CATEGORIES, type UtilityCategory, findCategory } from "../utils/categories.js";
import type { TailwindVersion } from "../utils/config.js";

/**
 * Input parameters for the list_utilities MCP tool.
 */
export interface ListUtilitiesInput {
  /** Filter by category name (e.g., "layout", "spacing", "typography"). Omit to list all. */
  category?: string;
  /** Tailwind CSS major version (default: "v3") */
  version?: TailwindVersion;
}

/**
 * A utility entry in the list response.
 */
export interface UtilityEntry {
  /** Document title */
  title: string;
  /** Document description */
  description: string;
  /** URL to the documentation page */
  url: string;
  /** Category this utility belongs to */
  category: string;
}

/**
 * Result of the list_utilities operation.
 */
export interface ListUtilitiesResult {
  /** Grouped utility entries */
  categories: Array<{
    name: string;
    description: string;
    utilities: UtilityEntry[];
  }>;
}

/**
 * Handle the `list_utilities` MCP tool call.
 *
 * Lists all Tailwind CSS utility categories and their documentation pages.
 * Optionally filters by category name (case-insensitive).
 * Returns category metadata from the static mapping, enriched with
 * indexed document titles and descriptions when available.
 */
export async function handleListUtilities(
  input: ListUtilitiesInput,
  db: Database,
  defaultVersion: TailwindVersion,
): Promise<ListUtilitiesResult> {
  const version = input.version ?? defaultVersion;

  let categories: UtilityCategory[];
  if (input.category) {
    const match = findCategory(input.category);
    categories = match ? [match] : [];
  } else {
    categories = UTILITY_CATEGORIES;
  }

  return {
    categories: categories.map((cat) => ({
      name: cat.name,
      description: cat.description,
      utilities: cat.slugs.map((slug) => {
        const doc = db.getDoc(slug, version);
        return {
          title: doc?.title ?? slugToTitle(slug),
          description: doc?.description ?? "",
          url: doc?.url ?? `https://tailwindcss.com/docs/${slug}`,
          category: cat.name,
        };
      }),
    })),
  };
}

/**
 * Convert a slug to a human-readable title as fallback.
 */
function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Format the utility list as markdown for LLM consumption.
 */
export function formatUtilitiesList(result: ListUtilitiesResult): string {
  if (result.categories.length === 0) {
    return "No matching utility categories found.";
  }

  const lines: string[] = ["# Tailwind CSS Utility Categories\n"];

  for (const cat of result.categories) {
    lines.push(`## ${cat.name}`);
    lines.push(`${cat.description}\n`);

    for (const util of cat.utilities) {
      lines.push(
        `- [${util.title}](${util.url})${util.description ? ` — ${util.description}` : ""}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
