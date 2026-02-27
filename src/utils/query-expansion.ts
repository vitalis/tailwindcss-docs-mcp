/**
 * Query expansion for Tailwind CSS class name queries.
 *
 * Detects Tailwind class names in search queries and appends their canonical
 * CSS property names. This bridges the vocabulary gap between abbreviated
 * class prefixes (e.g., "mx-auto") and documentation titles (e.g., "Margin").
 */

/** Regex to detect Tailwind class names: hyphenated lowercase tokens like text-lg, grid-cols-3 */
const TAILWIND_CLASS_RE = /\b[a-z]+(?:-[a-z0-9]+)+\b/g;

/** Font size suffixes used by Tailwind's text-{size} utilities */
const TEXT_SIZE_RE = /^text-(xs|sm|base|lg|xl|\d+xl)$/;

/** Color name prefixes used by Tailwind's text-{color} utilities */
const TEXT_COLOR_RE =
  /^text-(inherit|current|transparent|black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)/;

/**
 * Map of Tailwind class prefixes to their CSS property expansion terms.
 * Each value is a space-separated string of terms to append to the query.
 */
const PREFIX_MAP = new Map<string, string>([
  // ── Multi-segment prefixes ─────────────────────────────────────
  ["grid-cols", "grid template columns"],
  ["grid-rows", "grid template rows"],
  ["auto-cols", "grid auto columns"],
  ["auto-rows", "grid auto rows"],
  ["col-span", "grid column"],
  ["row-span", "grid row"],
  ["space-x", "space between horizontal"],
  ["space-y", "space between vertical"],
  ["min-w", "min-width"],
  ["max-w", "max-width"],
  ["min-h", "min-height"],
  ["max-h", "max-height"],

  // ── Single-segment prefixes ────────────────────────────────────
  // Spacing
  ["px", "padding"],
  ["py", "padding"],
  ["pt", "padding"],
  ["pr", "padding"],
  ["pb", "padding"],
  ["pl", "padding"],
  ["ps", "padding"],
  ["pe", "padding"],
  ["mx", "margin"],
  ["my", "margin"],
  ["mt", "margin"],
  ["mr", "margin"],
  ["mb", "margin"],
  ["ml", "margin"],
  ["ms", "margin"],
  ["me", "margin"],

  // Typography
  ["font", "font"],
  ["tracking", "letter spacing"],
  ["leading", "line height"],

  // Grid & Flex
  ["gap", "gap"],

  // Background
  ["bg", "background"],

  // Borders
  ["rounded", "border radius"],

  // Effects
  ["shadow", "box shadow"],

  // Sizing
  ["w", "width"],
  ["h", "height"],
  ["size", "size"],

  // Position
  ["z", "z-index"],
  ["inset", "position"],
]);

/**
 * Disambiguate `text-` class names which map to different CSS properties
 * depending on the suffix (font size vs text color).
 *
 * Returns null for unrecognized variants (text-center, text-wrap, etc.)
 * where expansion could hurt more than help.
 */
function resolveTextClass(className: string): string | null {
  if (TEXT_SIZE_RE.test(className)) return "font size";
  if (TEXT_COLOR_RE.test(className)) return "text color";
  return null;
}

/**
 * Resolve expansion terms for a single Tailwind class name.
 *
 * Tries progressively shorter hyphen-delimited prefixes (longest first):
 *   "grid-cols-3" → tries "grid-cols" (match!) → "grid template columns"
 *   "text-lg"     → tries "text" (conditional) → checks size regex → "font size"
 *
 * Returns null if no expansion applies.
 */
function resolveExpansion(className: string): string | null {
  const parts = className.split("-");

  for (let len = parts.length - 1; len >= 1; len--) {
    const prefix = parts.slice(0, len).join("-");

    // Special case: text- requires disambiguation
    if (prefix === "text") return resolveTextClass(className);

    const terms = PREFIX_MAP.get(prefix);
    if (terms) return terms;
  }

  return null;
}

/**
 * Expand a search query by mapping detected Tailwind class name prefixes
 * to their canonical CSS property names.
 *
 * Expansion terms are appended to the original query, preserving all original
 * tokens. Duplicate terms (already present in the query) are not added.
 *
 * Returns the original query unchanged when no Tailwind class names are detected.
 *
 * @example
 * expandQuery("tailwind text-lg class")
 * // → "tailwind text-lg class font size"
 *
 * expandQuery("mx-auto centering")
 * // → "mx-auto centering margin"
 *
 * expandQuery("how to center a div")
 * // → "how to center a div" (unchanged — no class names)
 */
export function expandQuery(query: string): string {
  const classNames = query.match(TAILWIND_CLASS_RE);
  if (!classNames) return query;

  const existingTerms = new Set(query.toLowerCase().split(/\s+/).filter(Boolean));
  const expansionTerms: string[] = [];

  for (const className of classNames) {
    const terms = resolveExpansion(className);
    if (!terms) continue;

    for (const term of terms.split(/\s+/)) {
      const lower = term.toLowerCase();
      if (lower && !existingTerms.has(lower)) {
        expansionTerms.push(lower);
        existingTerms.add(lower);
      }
    }
  }

  if (expansionTerms.length === 0) return query;
  return `${query} ${expansionTerms.join(" ")}`;
}
