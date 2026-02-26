/**
 * A single utility category with its documentation pages.
 */
export interface UtilityCategory {
  name: string;
  description: string;
  slugs: string[];
}

/**
 * Tailwind CSS utility categories mapped from the official documentation structure.
 *
 * Each category groups related utility classes by their purpose.
 * Slugs correspond to documentation page slugs (e.g., "padding" -> tailwindcss.com/docs/padding).
 */
export const UTILITY_CATEGORIES: UtilityCategory[] = [
  {
    name: "Layout",
    description: "Utilities for controlling layout behavior: display, position, overflow, z-index",
    slugs: [
      "aspect-ratio",
      "container",
      "columns",
      "break-after",
      "break-before",
      "break-inside",
      "box-decoration-break",
      "box-sizing",
      "display",
      "float",
      "clear",
      "isolation",
      "object-fit",
      "object-position",
      "overflow",
      "overscroll-behavior",
      "position",
      "top-right-bottom-left",
      "visibility",
      "z-index",
    ],
  },
  {
    name: "Flexbox & Grid",
    description: "Utilities for flexbox and CSS grid layouts",
    slugs: [
      "flex-basis",
      "flex-direction",
      "flex-wrap",
      "flex",
      "flex-grow",
      "flex-shrink",
      "order",
      "grid-template-columns",
      "grid-column",
      "grid-template-rows",
      "grid-row",
      "grid-auto-flow",
      "grid-auto-columns",
      "grid-auto-rows",
      "gap",
      "justify-content",
      "justify-items",
      "justify-self",
      "align-content",
      "align-items",
      "align-self",
      "place-content",
      "place-items",
      "place-self",
    ],
  },
  {
    name: "Spacing",
    description: "Utilities for padding, margin, and space between elements",
    slugs: ["padding", "margin", "space"],
  },
  {
    name: "Sizing",
    description: "Utilities for width, height, and min/max sizing",
    slugs: ["width", "min-width", "max-width", "height", "min-height", "max-height", "size"],
  },
  {
    name: "Typography",
    description: "Utilities for font, text, and content styling",
    slugs: [
      "font-family",
      "font-size",
      "font-smoothing",
      "font-style",
      "font-weight",
      "font-variant-numeric",
      "letter-spacing",
      "line-clamp",
      "line-height",
      "list-style-image",
      "list-style-position",
      "list-style-type",
      "text-align",
      "text-color",
      "text-decoration",
      "text-decoration-color",
      "text-decoration-style",
      "text-decoration-thickness",
      "text-underline-offset",
      "text-transform",
      "text-overflow",
      "text-wrap",
      "text-indent",
      "vertical-align",
      "whitespace",
      "word-break",
      "hyphens",
      "content",
    ],
  },
  {
    name: "Backgrounds",
    description: "Utilities for background colors, images, gradients, and positioning",
    slugs: [
      "background-attachment",
      "background-clip",
      "background-color",
      "background-origin",
      "background-position",
      "background-repeat",
      "background-size",
      "background-image",
      "gradient-color-stops",
    ],
  },
  {
    name: "Borders",
    description: "Utilities for border width, color, style, and radius",
    slugs: [
      "border-radius",
      "border-width",
      "border-color",
      "border-style",
      "divide-width",
      "divide-color",
      "divide-style",
      "outline-width",
      "outline-color",
      "outline-style",
      "outline-offset",
      "ring-width",
      "ring-color",
      "ring-offset-width",
      "ring-offset-color",
    ],
  },
  {
    name: "Effects",
    description: "Utilities for shadows, opacity, and blend modes",
    slugs: ["box-shadow", "box-shadow-color", "opacity", "mix-blend-mode", "background-blend-mode"],
  },
  {
    name: "Filters",
    description: "Utilities for blur, brightness, contrast, and other filters",
    slugs: [
      "blur",
      "brightness",
      "contrast",
      "drop-shadow",
      "grayscale",
      "hue-rotate",
      "invert",
      "saturate",
      "sepia",
      "backdrop-blur",
      "backdrop-brightness",
      "backdrop-contrast",
      "backdrop-grayscale",
      "backdrop-hue-rotate",
      "backdrop-invert",
      "backdrop-opacity",
      "backdrop-saturate",
      "backdrop-sepia",
    ],
  },
  {
    name: "Tables",
    description: "Utilities for table layout and border behavior",
    slugs: ["border-collapse", "border-spacing", "table-layout", "caption-side"],
  },
  {
    name: "Transitions & Animation",
    description: "Utilities for transitions, transforms, and animations",
    slugs: [
      "transition-property",
      "transition-duration",
      "transition-timing-function",
      "transition-delay",
      "animation",
    ],
  },
  {
    name: "Transforms",
    description: "Utilities for scale, rotate, translate, and skew",
    slugs: ["scale", "rotate", "translate", "skew", "transform-origin"],
  },
  {
    name: "Interactivity",
    description: "Utilities for cursor, user select, scroll behavior, and pointer events",
    slugs: [
      "accent-color",
      "appearance",
      "cursor",
      "caret-color",
      "pointer-events",
      "resize",
      "scroll-behavior",
      "scroll-margin",
      "scroll-padding",
      "scroll-snap-align",
      "scroll-snap-stop",
      "scroll-snap-type",
      "touch-action",
      "user-select",
      "will-change",
    ],
  },
  {
    name: "SVG",
    description: "Utilities for SVG fill and stroke",
    slugs: ["fill", "stroke", "stroke-width"],
  },
  {
    name: "Accessibility",
    description: "Utilities for screen readers",
    slugs: ["screen-readers"],
  },
];

/**
 * Find a category by name (case-insensitive).
 */
export function findCategory(name: string): UtilityCategory | undefined {
  const lower = name.toLowerCase();
  return UTILITY_CATEGORIES.find((c) => c.name.toLowerCase() === lower);
}

/**
 * Find which category a doc slug belongs to.
 * @internal Used only in tests.
 */
export function categoryForSlug(slug: string): UtilityCategory | undefined {
  return UTILITY_CATEGORIES.find((c) => c.slugs.includes(slug));
}
