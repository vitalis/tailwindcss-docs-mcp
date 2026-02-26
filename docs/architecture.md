# tailwindcss-docs-mcp — Architecture Document

Local semantic search for Tailwind CSS documentation via Model Context Protocol.

## Problem

LLMs hallucinate Tailwind CSS classes. Existing MCP servers either use keyword search (not semantic) or make network requests on every query. There is no official `llms.txt` — [Adam Wathan declined](https://github.com/tailwindlabs/tailwindcss.com/pull/2388) to provide one. We want the hexdocs-mcp pattern: **fetch once, embed locally, search forever from disk**.

## Prior Art

Two existing projects informed our architecture — one for the MCP tool design, the other for the embedding approach.

### hexdocs-mcp — MCP tool design reference

[hexdocs-mcp](https://github.com/bradleygolden/hexdocs-mcp) proved that "fetch once, embed locally, search from disk" works well as an MCP server for developer documentation. We adopt its **tool surface** (`fetch_docs`, `search_docs`, `check_status`) and its **content hashing** pattern (SHA-256 per chunk for incremental re-indexing).

We diverge from hexdocs-mcp on infrastructure. hexdocs-mcp requires [Ollama](https://ollama.com) as an external service for embeddings (`mxbai-embed-large`, 1024 dims) and uses [sqlite-vec](https://github.com/asg017/sqlite-vec) for vector indexing. These choices make sense for hexdocs-mcp — it indexes arbitrary Hex packages, potentially tens of thousands of chunks, where a dedicated vector index and a high-dimensional model pay off.

For a single library (~800 chunks), both are unnecessary overhead:

- **Ollama** requires a separate running process, a ~670 MB model download, and introduces a runtime dependency that can fail independently ("Ollama not running" is the most common hexdocs-mcp issue)
- **sqlite-vec** requires platform-specific native binaries and adds build complexity for what amounts to a linear scan over 800 rows

Sources: [hexdocs-mcp changelog](https://github.com/bradleygolden/hexdocs-mcp/blob/main/CHANGELOG.md), [Elixir Forum announcement](https://elixirforum.com/t/hexdocs-mcp-local-semantic-search-for-hex-package-docs/69952).

### Anchor — embedding approach reference

[Anchor](https://github.com/vitalis/anchor) demonstrates that in-process embeddings with no external services are practical for small-to-medium document collections:

- **In-process ONNX model** via `@huggingface/transformers` — the embedding model loads directly into the Node.js/Bun process. No Ollama, no API calls, no separate service to manage. Anchor uses `all-MiniLM-L6-v2`; we upgrade to `snowflake-arctic-embed-xs` (same size, +20% retrieval quality — see Phase 4).
- **Plain SQLite with BLOB storage** — embeddings stored as `Float32Array` buffers. No vector extensions. Cosine similarity computed in application code over a linear scan.
- **Hybrid search** — keyword (SQL LIKE) + semantic (cosine similarity) with score fusion, covering both exact class names and conceptual queries.

At ~800 chunks, linear cosine similarity over 384-dim vectors completes in single-digit milliseconds. The simplicity tradeoff is correct for our scale.

### What we take from each

| Concern                                  | Source      | Why                                                                           |
| ---------------------------------------- | ----------- | ----------------------------------------------------------------------------- |
| MCP tool surface and names               | hexdocs-mcp | Proven UX, users of hexdocs-mcp will recognize the pattern                    |
| Content hashing for incremental re-index | hexdocs-mcp | Avoids re-embedding unchanged docs on refresh                                 |
| Chunking by headings                     | hexdocs-mcp | Simple, effective for structured documentation                                |
| In-process ONNX embeddings               | Anchor      | Zero external dependencies, deterministic, we upgrade the model (see Phase 4) |
| Plain SQLite + BLOB vectors              | Anchor      | No native extensions to build/ship, trivial at our scale                      |
| Hybrid keyword + semantic search         | Anchor      | Essential for Tailwind — class names need keyword, concepts need semantic     |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code / Cursor                       │
│                    (MCP Client)                               │
└──────────────────────┬──────────────────────────────────────┘
                       │ MCP Protocol (stdio)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  tailwindcss-docs-mcp                         │
│                  (TypeScript MCP Server)                      │
│                                                               │
│  Tools:                                                       │
│    ├── fetch_docs      → download + chunk + embed + store     │
│    ├── search_docs     → hybrid semantic + keyword search     │
│    ├── list_utilities  → browse utility categories             │
│    └── check_status    → verify index state                   │
│                                                               │
│  Pipeline:                                                    │
│    GitHub ──→ MDX Parser ──→ Chunker ──→ ONNX ──→ SQLite     │
│    (once)    (strip JSX)   (heading)  (in-proc)  (BLOB)      │
│                                                               │
│  Runtime: Bun or Node.js                                     │
└─────────────────────────────────────────────────────────────┘
         │                                       │
         ▼                                       ▼
   ┌──────────┐                          ┌──────────────┐
   │  GitHub   │                          │   SQLite     │
   │  (fetch)  │                          │   (local)    │
   │           │                          │              │
   │ tailwind- │                          │ ~/.tailwind- │
   │ labs/     │                          │ css-docs-mcp/│
   │ tailwind- │                          │ docs.db      │
   │ css.com   │                          │              │
   └──────────┘                          └──────────────┘

No external services. Embedding model (snowflake-arctic-embed-xs, 22M params,
384 dims, ONNX) runs in-process via @huggingface/transformers.
```

---

## Data Pipeline

### Phase 1: Fetch

Download the raw MDX documentation files from GitHub.

**Source**: `https://github.com/tailwindlabs/tailwindcss.com`
**Path**: `src/pages/docs/*.mdx` (~189 files)
**Method**: GitHub API (`GET /repos/{owner}/{repo}/contents/{path}`) or `git clone --depth 1 --sparse`

```typescript
interface FetchOptions {
  version: "v3" | "v4"; // maps to branch: master (v3) or next (v4)
  force: boolean; // re-fetch even if cached
}

// Output: raw MDX files stored in ~/.tailwindcss-docs-mcp/raw/{version}/*.mdx
```

**Version mapping**:

| Tailwind Version | Branch     | Docs path         |
| ---------------- | ---------- | ----------------- |
| v3 (current)     | `master`   | `src/pages/docs/` |
| v4 (next)        | Check repo | `src/pages/docs/` |

**Cache**: Store fetched MDX files on disk. Re-fetch only when `force: true` or when a new version tag is detected via GitHub API.

### Phase 2: Parse MDX → Clean Markdown

Strip JSX components, imports, and React-specific syntax to produce clean, searchable text.

**MDX patterns to handle**:

`````mdx
// 1. Imports (REMOVE)
import { TipGood, TipBad } from '@/components/Tip'
import utilities from 'utilities?plugin=padding'

// 2. JSX components (REMOVE or extract text content)

<TipGood>Use utility classes for spacing</TipGood>
<SnippetGroup>...</SnippetGroup>

// 3. Code blocks with metadata (KEEP, strip metadata syntax)

````js {{ filename: 'tailwind.config.js' }}
module.exports = { ... }
```​

// 4. Standard markdown (KEEP as-is)
## Basic usage
### Adding padding to a single side
````
`````

**Parser strategy**:

```typescript
function parseMdx(raw: string): CleanDocument {
  return pipe(raw, [
    stripFrontmatter, // extract title, description → metadata
    stripImportStatements, // remove `import ... from ...` lines
    stripJsxComponents, // remove <Component> tags, keep inner text
    normalizeCodeBlocks, // strip {{ filename: '...' }} metadata
    preserveMarkdownStructure, // keep headings, lists, code, links
  ]);
}
```

**Implementation**: Regex-based pipeline — strips frontmatter, imports, exports, JSX components, and code block metadata via targeted regular expressions. No AST parser needed since Tailwind docs follow a consistent MDX structure.

**Output per file**:

```typescript
interface CleanDocument {
  slug: string; // "padding", "flex-direction", "dark-mode"
  title: string; // from frontmatter
  description: string; // from frontmatter
  content: string; // clean markdown
  url: string; // "https://tailwindcss.com/docs/padding"
  version: string; // "v3" or "v4"
}
```

### Phase 3: Chunk

Split each document into semantically meaningful chunks that preserve context.

**Strategy**: Heading-based splitting with overlap.

```typescript
interface Chunk {
  id: string; // hash of content for dedup
  docSlug: string; // parent document slug
  heading: string; // nearest parent heading (e.g., "## Basic usage > ### Padding a single side")
  content: string; // chunk text
  url: string; // deep link: "https://tailwindcss.com/docs/padding#basic-usage"
  version: string;
  tokenCount: number; // for context window awareness
}
```

**Chunking rules**:

1. **Split on `##` headings** — each `##` section becomes one or more chunks
2. **Max chunk size**: ~500 tokens (matches hexdocs-mcp's approach)
3. **Code blocks stay intact** — never split a code block across chunks
4. **Heading breadcrumb**: Include the heading hierarchy in each chunk for context (`## Basic usage > ### Horizontal padding`)
5. **Overlap**: Include the parent `##` heading text in each sub-chunk for retrieval quality

**Expected output**: ~189 docs × ~3-5 chunks each = **~600-900 chunks** total.

### Phase 4: Embed

Generate vector embeddings for each chunk using an in-process ONNX model.

**Model**: [`snowflake-arctic-embed-xs`](https://huggingface.co/Snowflake/snowflake-arctic-embed-xs) (22M params, 384 dimensions) via `@huggingface/transformers`.

**Why this model over `all-MiniLM-L6-v2`**: Same size (22M params, 384 dims), but **+20% better retrieval quality** on [MTEB benchmarks](https://huggingface.co/spaces/mteb/leaderboard) (NDCG@10: 50.15 vs 41.95). `snowflake-arctic-embed-xs` is literally fine-tuned from `all-MiniLM-L6-v2` specifically for retrieval — it's the same model made better at the task we need. Apache-2.0 licensed.

**Why not a larger model**: Higher-dimensional models like `mxbai-embed-large` (1024 dims, ~670 MB) or `snowflake-arctic-embed-l` (334M params) improve retrieval quality at scale but are overkill for ~800 chunks. The xs model is small enough to download on first run without the user noticing.

**Why in-process (not Ollama)**: Ollama is an external service that must be installed, running, and have the correct model pulled. For a developer tool that should "just work" after `bun install`, an in-process ONNX model eliminates an entire failure class. The model downloads once on first run and caches locally.

**Query prefix**: `snowflake-arctic-embed-xs` requires prepending `"Represent this sentence for searching relevant passages: "` to queries (not to documents). This is handled internally by the search tool.

**Embedding input format**: Prepend the heading breadcrumb to content for better retrieval. Searching "how to add horizontal padding" should find the chunk with heading "## Basic usage > ### Horizontal padding" even if the body text doesn't repeat those words.

**Performance estimate**:

- ~800 chunks × ~500 tokens each
- In-process ONNX on M-series Mac: ~50-100ms per embedding
- **Total indexing time: ~10-20 seconds** (first run includes model download)

### Phase 5: Store

Persist chunks and embeddings in plain SQLite. No vector extensions.

**Why plain SQLite (not sqlite-vec)**: At ~800 chunks with 384-dim vectors, a linear scan with cosine similarity completes in single-digit milliseconds. sqlite-vec adds platform-specific native binaries and build complexity for an index structure that only pays off at tens of thousands of rows. Plain SQLite with BLOB-stored vectors is simpler to build, ship, and debug.

**Schema**:

```sql
-- Metadata
CREATE TABLE docs (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  version TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  UNIQUE(slug, version)
);

-- Chunks with text content and embeddings
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY,
  doc_id INTEGER NOT NULL REFERENCES docs(id),
  heading TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,  -- SHA-256 for incremental re-indexing
  embedding BLOB,             -- Float32Array as binary (384 dims × 4 bytes = 1,536 bytes)
  url TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  UNIQUE(doc_id, heading, content_hash)
);

-- Full-text search for keyword queries (exact class names like px-4, grid-cols-3)
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  heading, content,
  content='chunks',
  content_rowid='id'
);

-- Index status
CREATE TABLE index_status (
  version TEXT PRIMARY KEY,
  doc_count INTEGER,
  chunk_count INTEGER,
  embedding_model TEXT,
  embedding_dimensions INTEGER,
  indexed_at TEXT NOT NULL
);
```

Embeddings live in the `chunks` table directly as BLOBs — no separate table, no virtual table. Cosine similarity is computed in application code by loading all embeddings into memory on startup (~1.2 MB for 800 chunks × 384 dims × 4 bytes).

**Storage location**: `~/.tailwindcss-docs-mcp/` (configurable via `TAILWIND_DOCS_MCP_PATH`).

**Expected database size**: ~1.2 MB vectors + ~1 MB text + FTS index ≈ **~3 MB total**.

---

## MCP Tool Definitions

### Tool 1: `fetch_docs`

Download, parse, chunk, embed, and store Tailwind CSS documentation.

```json
{
  "name": "fetch_docs",
  "description": "Download and index Tailwind CSS documentation for local semantic search. Only needs to be run once per version. Re-run with force=true to refresh.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "version": {
        "type": "string",
        "enum": ["v3", "v4"],
        "default": "v3",
        "description": "Tailwind CSS major version"
      },
      "force": {
        "type": "boolean",
        "default": false,
        "description": "Force re-download and re-index even if already cached"
      }
    }
  }
}
```

**Returns**: Status message with doc count, chunk count, and indexing time.

### Tool 2: `search_docs`

Semantic search across indexed Tailwind CSS documentation.

```json
{
  "name": "search_docs",
  "description": "Search Tailwind CSS documentation using natural language. Returns the most relevant documentation snippets with code examples. Requires fetch_docs to be run first.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Natural language search query (e.g., 'how to add responsive padding', 'dark mode configuration', 'grid layout with gaps')"
      },
      "version": {
        "type": "string",
        "enum": ["v3", "v4"],
        "default": "v3",
        "description": "Tailwind CSS major version to search"
      },
      "limit": {
        "type": "number",
        "default": 5,
        "minimum": 1,
        "maximum": 20,
        "description": "Maximum number of results to return"
      }
    },
    "required": ["query"]
  }
}
```

**Returns**: Array of results, each containing:

```typescript
interface SearchResult {
  score: number; // cosine similarity (0-1)
  heading: string; // chunk heading breadcrumb
  content: string; // chunk content (clean markdown)
  url: string; // deep link to tailwindcss.com
  docTitle: string; // parent document title
}
```

**Search strategy**: Hybrid search for best results.

1. **Semantic search**: embed query → cosine similarity against in-memory chunk embeddings
2. **Keyword search** via FTS5: exact match for class names (e.g., `px-4`, `grid-cols-3`)
3. **Merge and rank**: Combine results, dedup by chunk ID, sort by fused score

The hybrid approach matters because semantic search excels at "how do I center a div" but keyword search is better for "what does `space-x-4` do".

### Tool 3: `list_utilities`

Browse available utility categories without searching.

```json
{
  "name": "list_utilities",
  "description": "List all Tailwind CSS utility categories with descriptions. Useful for discovering what utilities are available.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "category": {
        "type": "string",
        "description": "Filter by category (e.g., 'layout', 'spacing', 'typography', 'flexbox'). Omit to list all categories."
      },
      "version": {
        "type": "string",
        "enum": ["v3", "v4"],
        "default": "v3"
      }
    }
  }
}
```

**Returns**: List of doc titles, descriptions, and URLs grouped by category.

### Tool 4: `check_status`

Check indexing status without triggering any work.

```json
{
  "name": "check_status",
  "description": "Check the current index status for Tailwind CSS documentation. Shows which versions are indexed, chunk counts, and when they were last updated.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "version": {
        "type": "string",
        "enum": ["v3", "v4"],
        "description": "Check specific version. Omit to check all."
      }
    }
  }
}
```

**Returns**: Index metadata (doc count, chunk count, model used, last indexed timestamp).

---

## Project Structure

```
tailwindcss-docs-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── server.ts             # Tool registration and dispatch
│   ├── tools/
│   │   ├── fetch-docs.ts     # fetch_docs tool implementation
│   │   ├── search-docs.ts    # search_docs tool implementation
│   │   ├── list-utilities.ts # list_utilities tool implementation
│   │   └── check-status.ts   # check_status tool implementation
│   ├── pipeline/
│   │   ├── fetcher.ts        # GitHub API download
│   │   ├── parser.ts         # MDX → clean markdown
│   │   ├── chunker.ts        # Heading-based splitting
│   │   └── embedder.ts       # In-process ONNX embedding
│   ├── storage/
│   │   ├── database.ts       # SQLite setup + schema DDL
│   │   └── search.ts         # Hybrid semantic + keyword search
│   └── utils/
│       ├── config.ts         # Environment variables
│       ├── similarity.ts     # Cosine similarity
│       └── categories.ts     # Utility category mapping
├── package.json
├── tsconfig.json
├── bunfig.toml
├── README.md
└── LICENSE
```

**Estimated codebase**: ~1,000-1,500 lines of TypeScript.

---

## Why Bun

[Bun](https://bun.sh) is the development runtime. Two reasons:

1. **Built-in SQLite** — `bun:sqlite` eliminates the `better-sqlite3` native addon, which requires node-gyp and a C compiler to install. One fewer build dependency, faster installs, no platform-specific compilation failures.
2. **Built-in TypeScript** — no separate compile step during development. `bun run src/index.ts` works directly.

End users do **not** need Bun. The package publishes compiled JavaScript to npm, runnable via `npx` (Node.js) or `bunx` (Bun). The SQLite driver falls back to `better-sqlite3` when `bun:sqlite` is unavailable, so the published package works on Node.js without modification.

---

## Dependencies

| Package                     | Purpose                          | Notes                                     |
| --------------------------- | -------------------------------- | ----------------------------------------- |
| `@modelcontextprotocol/sdk` | MCP server framework             | Core                                      |
| `@huggingface/transformers` | In-process ONNX embeddings       | Successor to `@xenova/transformers` (v3+) |
| `better-sqlite3`            | SQLite driver (Node.js fallback) | Not needed when running under Bun         |
| `zod`                       | Schema validation                | Input validation for MCP tool parameters  |
| `octokit`                   | GitHub API client                | Fetch docs from tailwindlabs repo         |

**Runtime dependencies**: None. No external services required. The ONNX embedding model downloads automatically on first use (~27 MB, cached locally).

---

## Configuration

| Environment Variable                | Default                   | Description              |
| ----------------------------------- | ------------------------- | ------------------------ |
| `TAILWIND_DOCS_MCP_PATH`            | `~/.tailwindcss-docs-mcp` | Data directory           |
| `TAILWIND_DOCS_MCP_DEFAULT_VERSION` | `v3`                      | Default Tailwind version |

---

## Installation

### Claude Code

```bash
# Via npx (Node.js)
claude mcp add tailwindcss-docs-mcp -- npx -y tailwindcss-docs-mcp

# Via bunx (Bun)
claude mcp add tailwindcss-docs-mcp -- bunx tailwindcss-docs-mcp

# From source (development)
claude mcp add tailwindcss-docs-mcp -- bun run /path/to/tailwindcss-docs-mcp/src/index.ts
```

### Project `.mcp.json`

```json
{
  "mcpServers": {
    "tailwindcss-docs-mcp": {
      "command": "bunx",
      "args": ["tailwindcss-docs-mcp"],
      "env": {
        "TAILWIND_DOCS_MCP_DEFAULT_VERSION": "v4"
      }
    }
  }
}
```

For Node.js users, replace `"command": "bunx"` with `"command": "npx"` and `"args"` with `["-y", "tailwindcss-docs-mcp"]`.

### First run

```
1. Server starts → checks for index
2. No index found → prompts "Run fetch_docs to index Tailwind CSS documentation"
3. User/LLM calls fetch_docs → downloads ~189 MDX files, parses, chunks, embeds
4. First embedding triggers model download (~27 MB, one-time)
5. Index complete → search_docs available
6. Subsequent starts → index loaded from disk, zero network, instant search
```

---

## Search Quality Considerations

### Why hybrid search matters for Tailwind

- **Semantic**: "how to make a responsive grid" → finds `grid-template-columns` + `responsive-design` docs
- **Keyword**: "gap-4" → exact match in utility class tables
- **Combined**: "add spacing between flex items" → semantic finds `gap` + `space-between`, keyword catches specific class names mentioned in examples

### Embedding input optimization

Prepend metadata to improve retrieval:

```typescript
function buildEmbeddingInput(chunk: Chunk): string {
  return [
    `Tailwind CSS: ${chunk.docTitle}`, // library context
    chunk.heading, // section context
    chunk.content, // actual content
  ].join("\n\n");
}
```

### Result formatting

Return results in a format that's immediately useful to LLMs:

`````markdown
## Padding — Basic usage > Adding horizontal padding

Use `px-*` utilities to add horizontal padding:

````html
<div class="px-8">px-8 adds 2rem of horizontal padding</div>
```​ Utilities: `px-0`, `px-1`, `px-2`, `px-4`, `px-6`, `px-8`... [View full
docs →](https://tailwindcss.com/docs/padding#adding-horizontal-padding)
````
`````

---

## Implementation Phases

### Phase 1: Core (MVP)

- [ ] MCP server scaffold with `@modelcontextprotocol/sdk`
- [ ] `fetch_docs`: download MDX from GitHub API
- [ ] MDX parser: strip JSX, extract clean markdown
- [ ] Chunker: heading-based splitting
- [ ] Embedder: in-process ONNX via `@huggingface/transformers` (`snowflake-arctic-embed-xs`)
- [ ] SQLite storage with BLOB embeddings
- [ ] `search_docs`: hybrid semantic + keyword search
- [ ] `check_status`: index metadata

### Phase 2: Polish

- [ ] `list_utilities`: category browser
- [ ] Auto-detect version from project's `package.json` (look for `tailwindcss` dependency)
- [ ] Graceful error handling (no index, network errors, model download failures)
- [ ] `bun:sqlite` / `better-sqlite3` runtime detection

### Phase 3: Distribution

- [ ] Publish to npm (`tailwindcss-docs-mcp`), runnable via `bunx` or `npx`
- [ ] README with installation instructions for Claude Code, Cursor, VS Code
- [ ] GitHub Actions CI

---

## Test Plan

Testing framework: [Vitest](https://vitest.dev/) (fast, native TypeScript, Bun-compatible).

### Unit Tests

#### MDX Parser (`pipeline/parser.test.ts`)

The parser is the most complex custom code. Every MDX pattern we encounter in the Tailwind docs must have a corresponding test case.

| Test                                | Input                                                 | Expected                          |
| ----------------------------------- | ----------------------------------------------------- | --------------------------------- |
| Strips import statements            | `import { Tip } from '@/components/Tip'\n\n## Usage`  | `## Usage`                        |
| Strips JSX self-closing tags        | `<TipGood />\n\nSome text`                            | `Some text`                       |
| Extracts text from JSX wrappers     | `<TipGood>Use padding utilities</TipGood>`            | `Use padding utilities`           |
| Strips nested JSX components        | `<SnippetGroup><Snippet>...</Snippet></SnippetGroup>` | Content only, no tags             |
| Preserves code blocks               | ` ```js\nmodule.exports = {}\n``` `                   | Unchanged                         |
| Strips code block metadata          | ` ```js {{ filename: 'tailwind.config.js' }}\n... `   | ` ```js\n... `                    |
| Extracts frontmatter                | `---\ntitle: Padding\n---`                            | `{ title: "Padding", ... }`       |
| Preserves markdown structure        | Headings, lists, links, tables                        | Unchanged                         |
| Handles empty files                 | Empty string                                          | Empty CleanDocument with defaults |
| Handles files with only frontmatter | Frontmatter, no body                                  | CleanDocument with empty content  |

**Test data**: Use real MDX snippets from the Tailwind docs repo as fixtures. Store in `test/fixtures/mdx/` — at minimum: `padding.mdx`, `dark-mode.mdx`, `grid-template-columns.mdx` (these cover the most MDX patterns).

#### Chunker (`pipeline/chunker.test.ts`)

| Test                               | Validates                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| Splits on `##` headings            | Each `##` section becomes a separate chunk                                        |
| Respects max token limit           | Chunks exceeding ~500 tokens are split further at `###` boundaries                |
| Never splits code blocks           | A code block that pushes a chunk over the limit stays intact                      |
| Builds heading breadcrumbs         | `## Basic usage > ### Horizontal padding` preserved in chunk metadata             |
| Includes parent heading overlap    | Sub-chunks include the parent `##` heading text                                   |
| Generates correct deep-link URLs   | `padding` + `## Basic usage` → `https://tailwindcss.com/docs/padding#basic-usage` |
| Handles documents with no headings | Entire content becomes a single chunk                                             |
| Generates stable content hashes    | Same content always produces the same SHA-256 hash                                |
| Detects changed content            | Modified content produces a different hash                                        |

#### Embedder (`pipeline/embedder.test.ts`)

| Test                                  | Validates                                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| Generates 384-dim vectors             | Output is a `Float32Array` of length 384                                                  |
| Deterministic output                  | Same input text always produces the same embedding                                        |
| Prepends query prefix for search      | Query strings get `"Represent this sentence for searching relevant passages: "` prepended |
| Does not prepend prefix for documents | Document chunks are embedded without the query prefix                                     |
| Handles empty strings                 | Returns a valid vector (not NaN, not error)                                               |
| Handles long text (>512 tokens)       | Truncates gracefully, returns valid vector                                                |
| Batch embedding                       | Multiple texts embedded in one call produce correct-length results                        |

**Note**: Embedder tests require the ONNX model. On CI, either download the model in setup or mock `@huggingface/transformers` with a fake that returns fixed-length random vectors. Unit tests should not depend on model quality — that's what integration tests are for.

#### Cosine Similarity (`utils/similarity.test.ts`)

| Test                             | Validates                               |
| -------------------------------- | --------------------------------------- |
| Identical vectors → 1.0          | `cosine([1,0,0], [1,0,0]) === 1.0`      |
| Orthogonal vectors → 0.0         | `cosine([1,0,0], [0,1,0]) === 0.0`      |
| Opposite vectors → -1.0          | `cosine([1,0], [-1,0]) === -1.0`        |
| Handles zero vectors             | Returns 0 or NaN, does not throw        |
| Handles high-dimensional vectors | 384-dim vectors compute correctly       |
| Float precision                  | Results within expected epsilon (±1e-6) |

#### Storage (`storage/database.test.ts`)

| Test                                         | Validates                                                  |
| -------------------------------------------- | ---------------------------------------------------------- |
| Creates schema on init                       | All tables and indexes exist after migration               |
| Inserts and retrieves docs                   | Round-trip: insert doc → query by slug → matches           |
| Inserts and retrieves chunks with embeddings | BLOB storage and retrieval preserves Float32Array exactly  |
| Content hash dedup                           | Inserting a chunk with the same hash is a no-op            |
| Content hash update                          | Changed hash triggers re-embedding                         |
| Deletes orphaned chunks                      | Chunks from removed docs are cleaned up on re-index        |
| FTS index stays in sync                      | Inserting/deleting chunks updates the FTS5 index           |
| Index status tracking                        | `index_status` table records correct counts and timestamps |

Use an in-memory SQLite database (`:memory:`) for all storage tests — fast, isolated, no cleanup.

### Integration Tests

#### Search Quality (`search/search-quality.test.ts`)

These tests verify that the full pipeline (chunk → embed → store → search) returns relevant results. They run against a small fixture set of real Tailwind docs (~5-10 pages).

| Query                             | Expected top result contains            |
| --------------------------------- | --------------------------------------- |
| `"how to add horizontal padding"` | `padding` doc, `px-*` utilities         |
| `"responsive grid with gaps"`     | `grid-template-columns` or `gap` doc    |
| `"dark mode configuration"`       | `dark-mode` doc                         |
| `"px-4"` (exact class name)       | `padding` doc (keyword search)          |
| `"space-x-4"` (exact class name)  | `space` doc (keyword search)            |
| `"center a div"` (conceptual)     | `flexbox`, `grid`, or `align-items` doc |
| `"make text bold"`                | `font-weight` doc                       |

**Scoring thresholds**: Top result must have cosine similarity > 0.5. The correct doc must appear in the top 3 results. These thresholds are starting points — adjust after measuring real performance.

**Setup**: Run the full pipeline once in `beforeAll` against the fixture docs. Tests query against the same index.

#### Hybrid Search Fusion (`search/hybrid-search.test.ts`)

| Test                                | Validates                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------- |
| Semantic-only query returns results | `"how to center content"` finds relevant docs                              |
| Keyword-only query returns results  | `"grid-cols-3"` finds exact match via FTS                                  |
| Hybrid deduplicates                 | A chunk found by both semantic and keyword appears once with fused score   |
| Hybrid ranks correctly              | A chunk matching both semantic and keyword scores higher than either alone |
| Empty query returns empty results   | No crash, no results                                                       |
| Query with no matches returns empty | Obscure query returns `[]`, not an error                                   |

#### Incremental Re-indexing (`pipeline/incremental.test.ts`)

| Test                                       | Validates                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| Unchanged docs skip re-embedding           | Call `fetch_docs` twice — second call embeds zero chunks                        |
| Modified doc re-embeds only changed chunks | Change one section → only that chunk's hash changes → only that chunk re-embeds |
| Deleted doc removes chunks                 | Remove a fixture doc → its chunks and embeddings are gone                       |
| New doc adds chunks                        | Add a fixture doc → new chunks appear in index                                  |
| Index status updates                       | `indexed_at` timestamp changes after re-index                                   |

### MCP Tool Tests

#### Tool Protocol (`tools/tools.test.ts`)

Test each MCP tool via the `@modelcontextprotocol/sdk` test client — verify the tool accepts valid input, rejects invalid input, and returns correctly structured responses.

| Test                                     | Validates                                               |
| ---------------------------------------- | ------------------------------------------------------- |
| `fetch_docs` with default params         | Returns success with doc/chunk counts                   |
| `fetch_docs` with `force: true`          | Re-indexes even when index exists                       |
| `fetch_docs` with invalid version        | Returns error message, does not crash                   |
| `search_docs` with valid query           | Returns array of `SearchResult` objects                 |
| `search_docs` before indexing            | Returns helpful error: "Run fetch_docs first"           |
| `search_docs` with empty query           | Returns empty results or validation error               |
| `search_docs` respects `limit` param     | `limit: 2` returns at most 2 results                    |
| `list_utilities` without category filter | Returns all categories                                  |
| `list_utilities` with category filter    | Returns only matching category                          |
| `check_status` with no index             | Returns "not indexed" status                            |
| `check_status` after indexing            | Returns correct doc/chunk counts, model name, timestamp |

### Edge Cases & Error Handling

| Test                                     | Validates                                                 |
| ---------------------------------------- | --------------------------------------------------------- |
| GitHub API rate limit                    | Returns clear error, does not crash server                |
| GitHub API network failure               | Returns clear error, preserves existing index             |
| Corrupt database file                    | Detects corruption, recreates database                    |
| Missing model on first run (no internet) | Returns clear error explaining model download requirement |
| Concurrent `fetch_docs` calls            | Second call waits or returns "indexing in progress"       |
| Very large MDX file (>100KB)             | Parses and chunks without memory issues                   |
| MDX with invalid syntax                  | Parser handles gracefully, skips or warns                 |
| Database locked by another process       | Returns clear error, does not hang                        |

### Test File Structure

```

test/
├── fixtures/
│ └── mdx/ # Real MDX snippets from Tailwind docs
│ ├── padding.mdx
│ ├── dark-mode.mdx
│ ├── grid-template-columns.mdx
│ ├── flex-direction.mdx
│ └── font-weight.mdx
├── unit/
│ ├── parser.test.ts
│ ├── chunker.test.ts
│ ├── embedder.test.ts
│ ├── similarity.test.ts
│ └── database.test.ts
├── integration/
│ ├── search-quality.test.ts
│ ├── hybrid-search.test.ts
│ └── incremental.test.ts
├── tools/
│ └── tools.test.ts
└── setup.ts # Shared fixtures, model mock, temp DB helpers

```

### CI Strategy

- **Unit tests**: Run on every push. Mock the embedding model (return deterministic fake vectors). Fast — under 5 seconds.
- **Integration tests**: Run on PR and main. Download the real ONNX model (cache in CI). Slower — 30-60 seconds including model download.
- **Search quality tests**: Run on PR only. Use real model + real fixture docs. Flag regressions if top-3 recall drops below threshold.

### What We Don't Test

- **Tailwind docs content correctness** — we index what they publish, not what's correct
- **Embedding model quality** — that's Snowflake's responsibility; we test our retrieval pipeline, not the model itself
- **MCP protocol spec compliance** — that's `@modelcontextprotocol/sdk`'s responsibility
- **SQLite correctness** — that's SQLite's responsibility; we test our schema and queries

---

## Future Extensions

- **DaisyUI docs**: Same pipeline, different source (`daisyui.com/docs/`)
- **Tailwind UI examples**: If licensed, index component examples
- **Multi-library**: Generalize to index any CSS framework docs (Bootstrap, etc.)
- **Incremental updates**: Detect GitHub repo changes, re-index only modified files
- **v4 migration guide**: Special-purpose search tool for v3→v4 migration

---

## License Considerations

The [tailwindcss.com repository](https://github.com/tailwindlabs/tailwindcss.com) is **publicly accessible but not open-source licensed**. It is intellectual property of Tailwind Labs Inc. This tool fetches and indexes the docs locally for personal/developer use (similar to how a browser caches web pages). The tool itself should be MIT licensed; it does not redistribute Tailwind's documentation.

---

## Agents, Commands & Skills

This project uses **global TypeScript agents** from `~/.claude/agents/` plus project-specific commands and a critical review skill. No project-level agents are needed — the globals read the project's `CLAUDE.md` for context at runtime.

### Global Agents

These 4 agents live at `~/.claude/agents/` and are available to all TypeScript projects:

| Agent              | Focus                                           |
| ------------------ | ----------------------------------------------- |
| `ts-architect`     | Architecture coordination, delegation, review   |
| `ts-developer`     | TypeScript implementation, tests, pipeline code |
| `ts-qa-developer`  | Test strategy, integration/E2E tests, fixtures  |
| `ts-code-reviewer` | Code quality review (types, async, errors, DRY) |

The architect delegates implementation to the developer, QA to the QA developer, and code review to the reviewer. All agents read the project's `CLAUDE.md` for project-specific context (architecture doc path, stack, conventions).

### Commands

Copy these into `.claude/commands/` when the project is created.

#### `code-review.md`

```markdown
---
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task, WebFetch, WebSearch
---

# Code Review

Complete a code review of all TypeScript code on the current branch.

## Instructions

1. **Get current branch and all source files:**

\`\`\`bash
git rev-parse --abbrev-ref HEAD
\`\`\`

Review all files in:

- `src/**/*.ts` — Application code
- `test/**/*.ts` — Test files

2. **For each module, review for:**

### Architecture Alignment

- Implementation matches the architecture doc
- MCP tool schemas match the defined JSON schemas
- Embedding model used correctly (query prefix on searches, not documents)
- Content hashing for incremental re-indexing

### TypeScript Quality

- Strict types (no unnecessary `any`)
- Proper async/await usage
- Clean error handling with informative messages
- No circular imports

### Pipeline Correctness

- MDX parser strips all JSX/imports, preserves markdown and code blocks
- Chunker respects heading boundaries and max token limits
- Code blocks never split across chunks
- Content hashes are deterministic (same input → same hash)
- BLOB storage preserves Float32Array precision

### Search Quality

- Cosine similarity computes correctly
- FTS5 index stays in sync with chunks table
- Hybrid search deduplicates and fuses scores
- Query prefix applied to search queries only

### Testing

- All public functions have tests
- Success and error paths covered
- Fixtures use real MDX from Tailwind docs
- Integration tests verify search quality

3. **Run verification:**

\`\`\`bash
bun run build
bun test
bunx biome check src/
\`\`\`

4. **Output format:**

For each issue:
\`\`\`

## [SEVERITY] Issue Title

**File:** path/to/file.ts:line_number
**Category:** Architecture | TypeScript | Pipeline | Search | Testing
**Description:** What the issue is
**Suggestion:** How to improve
\`\`\`

Severity: BLOCKER > MAJOR > MINOR > INFO

5. **Summary:**

\`\`\`
| Severity | Count |
|----------|-------|
| BLOCKER | X |
| MAJOR | X |
| MINOR | X |
| INFO | X |

**Files Reviewed:** X
**Tests:** PASS / FAIL
**Types:** PASS / FAIL
**Lint:** PASS / FAIL

**Recommendation:** APPROVE / APPROVE WITH SUGGESTIONS / REQUEST CHANGES
\`\`\`

## Additional Context

$ARGUMENTS
```

#### `code-review-diff.md`

```markdown
---
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task, WebFetch, WebSearch
---

# Code Review (Diff Only)

Review only the changes between the current branch and main.

## Instructions

1. **Get changed files:**

\`\`\`bash
git diff --name-only main...HEAD -- '\*.ts'
\`\`\`

2. **Get the diff:**

\`\`\`bash
git diff main...HEAD -- '\*.ts'
\`\`\`

3. **Review the diff** using the same criteria as the full code review (architecture alignment, TypeScript quality, pipeline correctness, search quality, testing).

4. **Run verification:**

\`\`\`bash
bun run build
bun test
bunx biome check src/
\`\`\`

5. **Output:** Same format as the full code review, but only for changed files.

## Additional Context

$ARGUMENTS
```

#### `search-quality.md`

```markdown
---
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task, WebFetch, WebSearch
---

# Search Quality Check

Run the search quality integration tests and verify retrieval accuracy.

## Steps

1. **Run search quality tests:**

\`\`\`bash
bun test test/integration/search-quality.test.ts
\`\`\`

2. **Run hybrid search tests:**

\`\`\`bash
bun test test/integration/hybrid-search.test.ts
\`\`\`

3. **Manual spot checks** — run these queries against the MCP server and verify results make sense:

| Query                           | Expected top result       |
| ------------------------------- | ------------------------- |
| "how to add horizontal padding" | padding doc               |
| "responsive grid"               | grid-template-columns doc |
| "px-4" (exact class)            | padding doc (keyword hit) |
| "center a div"                  | flexbox or grid doc       |
| "dark mode"                     | dark-mode doc             |

4. **Output format:**

\`\`\`
SEARCH QUALITY RESULTS:
[ ] Quality tests: PASS/FAIL (X/Y queries returned correct top result)
[ ] Hybrid tests: PASS/FAIL
[ ] Spot checks: describe any unexpected results

Top-3 recall: X% (target: >80%)
Average top-1 similarity: X.XX (target: >0.5)

VERDICT: ACCEPTABLE / NEEDS TUNING
\`\`\`

## Additional Context

$ARGUMENTS
```

---

### Skills

#### `tw-mcp-critical-review` (`.claude/skills/tw-mcp-critical-review/SKILL.md`)

```markdown
---
name: tw-mcp-critical-review
description: "Critical code review for tailwindcss-docs-mcp. Runs architect + code reviewer + QA + search quality in parallel. Use when 'critical review', 'full review', or 'review everything'."
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task, WebFetch, WebSearch
---

# Critical Code Review

Run a comprehensive review using multiple specialist agents in parallel.

## Workflow

1. **Launch 4 agents in parallel:**

| Agent              | Focus                                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| `ts-architect`     | Architecture alignment — does the implementation match the architecture doc? |
| `ts-code-reviewer` | Code quality — TypeScript patterns, pipeline correctness, test coverage      |
| `ts-qa-developer`  | Test strategy review — coverage gaps, fixture quality, flaky tests           |
| Search quality     | Run `/search-quality` command for retrieval accuracy                         |

2. **Collect results** from all 4 agents.

3. **Produce consolidated summary:**

\`\`\`

## Critical Review Summary

### Architecture: [ALIGNED / DRIFT DETECTED]

[Key findings from ts-architect]

### Code Quality: [APPROVE / REQUEST CHANGES]

[Key findings from ts-code-reviewer]

### Test Coverage: [SUFFICIENT / GAPS FOUND]

[Key findings from ts-qa-developer]

### Search Quality: [ACCEPTABLE / NEEDS TUNING]

[Key findings from search quality check]

### Blockers

[List any BLOCKER-severity issues]

### Action Items

[Prioritized list of changes needed]
\`\`\`

## Success Criteria

- [ ] All 4 review perspectives completed
- [ ] No BLOCKER issues remain unaddressed
- [ ] Search quality top-3 recall > 80%
- [ ] Architecture doc matches implementation
```

---

### Directory Structure

When the project is created, the `.claude/` directory should look like:

```
tailwindcss-docs-mcp/
├── .claude/
│   ├── CLAUDE.md                          # Project context, stack, conventions
│   ├── commands/
│   │   ├── code-review.md                 # Full code review
│   │   ├── code-review-diff.md            # Diff-only review
│   │   └── search-quality.md              # Search retrieval check
│   └── skills/
│       └── tw-mcp-critical-review/
│           └── SKILL.md                   # Multi-agent critical review
├── src/
│   └── ...
└── test/
    └── ...
```

No `.claude/agents/` directory needed — the project uses global agents from `~/.claude/agents/`.

### Agent Interaction Map

```
                      ts-architect
                   (coordinate, review)
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   ts-developer    ts-qa-developer  ts-code-reviewer
   (write code)    (test strategy)  (review quality)
```

The architect delegates implementation to ts-developer, test strategy to ts-qa-developer, and code review to ts-code-reviewer. The critical review skill runs all four in parallel for comprehensive coverage.

---

## References

- [hexdocs-mcp — GitHub](https://github.com/bradleygolden/hexdocs-mcp) — MCP tool design reference
- [hexdocs-mcp — Changelog](https://github.com/bradleygolden/hexdocs-mcp/blob/main/CHANGELOG.md) — documents embedding model switch, sqlite-vec adoption, Elixir migration
- [hexdocs-mcp — Elixir Forum announcement](https://elixirforum.com/t/hexdocs-mcp-local-semantic-search-for-hex-package-docs/69952) — author's rationale for Ollama, chunking strategy, and future plans
- [Anchor — GitHub](https://github.com/vitalis/anchor) — embedding approach reference (in-process ONNX, plain SQLite vectors)
- [MCP Tools specification](https://modelcontextprotocol.io/docs/concepts/tools)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [tailwindcss.com docs source](https://github.com/tailwindlabs/tailwindcss.com/tree/master/src/pages/docs)
- [@huggingface/transformers](https://github.com/huggingface/transformers.js) — in-process ONNX inference for JavaScript (v3+, successor to `@xenova/transformers`)
- [snowflake-arctic-embed-xs](https://huggingface.co/Snowflake/snowflake-arctic-embed-xs) — 22M params, 384-dim retrieval-optimized embedding model
- [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard) — embedding model benchmarks
- [Bun](https://bun.sh) — development runtime with built-in SQLite and TypeScript
