import { createHash } from "node:crypto";
import type { CleanDocument } from "./parser.js";

/**
 * A chunk of documentation content with metadata for embedding and retrieval.
 */
export interface Chunk {
  /** SHA-256 hash of content for deduplication and incremental re-indexing */
  id: string;
  /** Parent document slug (e.g., "padding") */
  docSlug: string;
  /** Heading breadcrumb (e.g., "## Basic usage > ### Padding a single side") */
  heading: string;
  /** Chunk text content (clean markdown) */
  content: string;
  /** Deep link URL (e.g., "https://tailwindcss.com/docs/padding#basic-usage") */
  url: string;
  /** Tailwind CSS version */
  version: string;
  /** Approximate token count for context window awareness */
  tokenCount: number;
}

/**
 * Options for the chunking process.
 */
export interface ChunkOptions {
  /** Maximum tokens per chunk (default: 500) */
  maxTokens?: number;
}

/** Default maximum tokens per chunk */
const DEFAULT_MAX_TOKENS = 500;

/**
 * Split a clean document into semantically meaningful chunks.
 *
 * Chunking rules:
 * 1. Split on `##` headings — each `##` section becomes one or more chunks
 * 2. Max chunk size: ~500 tokens (configurable)
 * 3. Code blocks stay intact — never split a code block across chunks
 * 4. Heading breadcrumb: include heading hierarchy in each chunk
 * 5. Overlap: include parent `##` heading text in sub-chunks
 */
export function chunkDocument(doc: CleanDocument, options?: ChunkOptions): Chunk[] {
  const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const content = doc.content.trim();

  if (!content) return [];

  const sections = splitOnHeadingLevel(content, 2);
  const chunks: Chunk[] = [];

  for (const section of sections) {
    chunkSection(doc, section, maxTokens, chunks);
  }

  return chunks;
}

/** Process a single ## section, splitting further if needed. */
function chunkSection(doc: CleanDocument, section: string, maxTokens: number, out: Chunk[]): void {
  const h2Heading = extractHeading(section, 2);

  if (estimateTokens(section) <= maxTokens) {
    out.push(buildChunk(doc, h2Heading || "", section.trim(), h2Heading || ""));
    return;
  }

  const sectionBody = h2Heading ? section.slice(section.indexOf("\n") + 1).trim() : section;
  const subsections = splitOnHeadingLevel(sectionBody, 3);

  for (const sub of subsections) {
    chunkSubsection(doc, sub, h2Heading, maxTokens, out);
  }
}

/** Process a single ### subsection within a ## section. */
function chunkSubsection(
  doc: CleanDocument,
  sub: string,
  h2Heading: string | null,
  maxTokens: number,
  out: Chunk[],
): void {
  const h3Heading = extractHeading(sub, 3);
  const breadcrumb = [h2Heading, h3Heading].filter(Boolean).join(" > ");
  const chunkContent = h2Heading ? `${h2Heading}\n\n${sub.trim()}` : sub.trim();

  if (estimateTokens(chunkContent) <= maxTokens) {
    out.push(buildChunk(doc, breadcrumb, chunkContent, breadcrumb));
    return;
  }

  const parts = splitByParagraphs(sub, maxTokens);
  for (const part of parts) {
    const partContent = h2Heading ? `${h2Heading}\n\n${part.trim()}` : part.trim();
    out.push(buildChunk(doc, breadcrumb, partContent, breadcrumb));
  }
}

function buildChunk(
  doc: CleanDocument,
  breadcrumb: string,
  content: string,
  headingForAnchor: string,
): Chunk {
  const lastHeading = headingForAnchor.split(" > ").pop() || "";
  const anchor = headingToAnchor(lastHeading);
  const url = anchor ? `${doc.url}#${anchor}` : doc.url;

  return {
    id: contentHash(content),
    docSlug: doc.slug,
    heading: breadcrumb,
    content,
    url,
    version: doc.version,
    tokenCount: estimateTokens(content),
  };
}

function splitOnHeadingLevel(content: string, level: number): string[] {
  const prefix = "#".repeat(level);
  const regex = new RegExp(`(?=^${prefix} )`, "gm");
  return content.split(regex).filter((s) => s.trim());
}

/** Check if adding a piece to the accumulator would exceed the token limit. */
function wouldExceedLimit(current: string, addition: string, maxTokens: number): boolean {
  return estimateTokens(`${current}\n\n${addition}`) > maxTokens;
}

/** Append a piece to the accumulator, or start fresh. */
function appendOrStart(current: string, piece: string): string {
  return current ? `${current}\n\n${piece}` : piece;
}

/** Split content into paragraph-sized parts, never breaking code blocks. */
function splitByParagraphs(content: string, maxTokens: number): string[] {
  const segments = content.split(/(```[\s\S]*?```)/);
  const parts: string[] = [];
  let current = "";

  for (const segment of segments) {
    if (segment.startsWith("```")) {
      current = processCodeBlock(segment, current, maxTokens, parts);
    } else {
      current = processTextBlock(segment, current, maxTokens, parts);
    }
  }
  if (current.trim()) parts.push(current.trim());

  return parts;
}

function processCodeBlock(
  block: string,
  current: string,
  maxTokens: number,
  parts: string[],
): string {
  if (!wouldExceedLimit(current, block, maxTokens)) {
    return appendOrStart(current, block);
  }
  if (current.trim()) parts.push(current.trim());
  return block;
}

function processTextBlock(
  block: string,
  current: string,
  maxTokens: number,
  parts: string[],
): string {
  const paragraphs = block.split(/\n\n+/);
  let acc = current;

  for (const para of paragraphs) {
    if (!para.trim()) continue;
    if (!wouldExceedLimit(acc, para, maxTokens)) {
      acc = appendOrStart(acc, para);
    } else {
      if (acc.trim()) parts.push(acc.trim());
      acc = para;
    }
  }

  return acc;
}

function extractHeading(text: string, level: number): string | null {
  const prefix = "#".repeat(level);
  const firstLine = text.split("\n")[0].trim();
  return firstLine.startsWith(`${prefix} `) ? firstLine : null;
}

/**
 * Generate a SHA-256 content hash for a chunk.
 *
 * Used for incremental re-indexing: unchanged content produces
 * the same hash, so we can skip re-embedding.
 */
export function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Estimate the token count for a string.
 *
 * Uses a simple heuristic: ~4 characters per token for English text.
 * This is intentionally approximate — exact tokenization is model-dependent
 * and not worth the overhead for chunk size estimation.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Convert a heading string into a URL-safe anchor fragment.
 *
 * "## Basic usage" -> "basic-usage"
 * "### Adding horizontal padding" -> "adding-horizontal-padding"
 */
export function headingToAnchor(heading: string): string {
  return heading
    .replace(/^#+\s*/, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
