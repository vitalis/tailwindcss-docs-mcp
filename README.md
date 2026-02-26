# tailwindcss-docs-mcp

Local semantic search for Tailwind CSS documentation via [Model Context Protocol](https://modelcontextprotocol.io).

LLMs hallucinate Tailwind CSS classes. There is no official `llms.txt`. This MCP server downloads the Tailwind docs once, embeds them locally, and provides instant semantic search from disk — no network requests on every query, no external services.

**Fetch once. Embed locally. Search forever.**

## Quick Start

### 1. Add the MCP server

```bash
# Claude Code
claude mcp add tailwindcss-docs-mcp -- npx -y tailwindcss-docs-mcp

# Or with Bun
claude mcp add tailwindcss-docs-mcp -- bunx tailwindcss-docs-mcp
```

### 2. Index the docs (one-time, ~30 seconds)

Ask your AI assistant to run:

> "Fetch the Tailwind CSS docs so we can search them"

This calls `fetch_docs`, which downloads ~189 MDX files from GitHub, parses them, splits them into chunks, and generates embeddings. The embedding model (~27 MB) downloads automatically on first run.

### 3. Search

> "How do I add responsive padding in Tailwind?"
>
> "What does `space-x-4` do?"
>
> "Show me dark mode configuration options"

The assistant uses `search_docs` to find the most relevant documentation snippets with code examples and direct links to tailwindcss.com.

## MCP Client Setup

### Claude Code (CLI)

```bash
claude mcp add tailwindcss-docs-mcp -- npx -y tailwindcss-docs-mcp
```

### Project-level `.mcp.json`

```json
{
  "mcpServers": {
    "tailwindcss-docs-mcp": {
      "command": "npx",
      "args": ["-y", "tailwindcss-docs-mcp"],
      "env": {
        "TAILWIND_DOCS_MCP_DEFAULT_VERSION": "v4"
      }
    }
  }
}
```

### From source (development)

```bash
claude mcp add tailwindcss-docs-mcp -- bun run /path/to/tailwindcss-docs-mcp/src/index.ts
```

## Tools

### `fetch_docs`

Download and index Tailwind CSS documentation. Run once per version. Re-run with `force: true` to refresh.

| Parameter | Type             | Default | Description                             |
| --------- | ---------------- | ------- | --------------------------------------- |
| `version` | `"v3"` \| `"v4"` | `"v3"`  | Tailwind CSS major version              |
| `force`   | `boolean`        | `false` | Re-download and re-index even if cached |

The pipeline: download MDX from GitHub → strip JSX/imports → split on headings → embed with ONNX model → store in SQLite. Unchanged chunks are skipped on re-index (SHA-256 content hashing).

### `search_docs`

Search documentation using natural language. Returns relevant snippets with code examples and links.

| Parameter | Type             | Default      | Description                    |
| --------- | ---------------- | ------------ | ------------------------------ |
| `query`   | `string`         | _(required)_ | Natural language query         |
| `version` | `"v3"` \| `"v4"` | `"v3"`       | Tailwind CSS version to search |
| `limit`   | `number`         | `5`          | Max results (1-20)             |

Each result includes:

- **Score** — relevance score normalized to 0-1 (top result = 1.0)
- **Heading** — section breadcrumb (e.g., "Basic usage > Horizontal padding")
- **Content** — clean markdown with code examples
- **URL** — deep link to tailwindcss.com

**How search works:** Hybrid strategy combining semantic search (cosine similarity on embeddings) with keyword search (FTS5 full-text index). Results are merged via reciprocal rank fusion. This matters for Tailwind because semantic search handles "how to center a div" while keyword search handles exact class names like `grid-cols-3`.

### `list_utilities`

Browse available utility categories and their documentation pages.

| Parameter  | Type             | Default | Description                                                            |
| ---------- | ---------------- | ------- | ---------------------------------------------------------------------- |
| `category` | `string`         | _(all)_ | Filter by category (e.g., `"Layout"`, `"Spacing"`, `"Flexbox & Grid"`) |
| `version`  | `"v3"` \| `"v4"` | `"v3"`  | Tailwind CSS version                                                   |

### `check_status`

Check index state — doc count, chunk count, embedding model, last indexed time.

| Parameter | Type             | Default | Description                   |
| --------- | ---------------- | ------- | ----------------------------- |
| `version` | `"v3"` \| `"v4"` | _(all)_ | Check specific version or all |

## Configuration

| Environment Variable                | Default                   | Description                                                     |
| ----------------------------------- | ------------------------- | --------------------------------------------------------------- |
| `TAILWIND_DOCS_MCP_PATH`            | `~/.tailwindcss-docs-mcp` | Data directory                                                  |
| `TAILWIND_DOCS_MCP_DEFAULT_VERSION` | `v3`                      | Default Tailwind version                                        |
| `GITHUB_TOKEN`                      | _(none)_                  | Optional. Prevents GitHub API rate limiting during `fetch_docs` |

**Data directory:**

```
~/.tailwindcss-docs-mcp/
├── docs.db              # SQLite database (~3 MB) — chunks, embeddings, FTS5 index
└── raw/
    └── v3/*.mdx         # Cached MDX files from GitHub
```

## How It Works

```
  GitHub                      Local Pipeline                        SQLite
┌──────────┐    ┌──────┐    ┌───────┐    ┌───────┐    ┌───────┐    ┌──────┐
│ tailwind │───>│Fetch │───>│ Parse │───>│ Chunk │───>│ Embed │───>│Store │
│ css.com  │    │ MDX  │    │ MDX→MD│    │by ##  │    │ ONNX  │    │ BLOB │
└──────────┘    └──────┘    └───────┘    └───────┘    └───────┘    └──────┘
                                                                       │
                                                                       v
                                                        ┌──────────────────┐
                                  search_docs ────────> │  Hybrid Search   │
                                                        │ Semantic + FTS5  │
                                                        │  Rank Fusion     │
                                                        └──────────────────┘
```

1. **Fetch** — Download raw MDX from `tailwindlabs/tailwindcss.com` via GitHub Git Tree API. Files cached on disk.
2. **Parse** — Strip JSX components, imports, exports, and code block metadata. Output: clean markdown.
3. **Chunk** — Split on `##` headings, ~500 token max per chunk, preserving heading breadcrumbs.
4. **Embed** — Generate 384-dimensional vectors using `snowflake-arctic-embed-xs` (22M params, in-process ONNX). No external services.
5. **Store** — SQLite with BLOB vector storage (1,536 bytes per chunk) and FTS5 full-text index.
6. **Search** — Hybrid: cosine similarity on embeddings + FTS5 keyword match, fused via reciprocal rank fusion (RRF, K=60).

**Why `snowflake-arctic-embed-xs`?** Same size as `all-MiniLM-L6-v2` but +20% better retrieval quality (NDCG@10: 50.15 vs 41.95). Fine-tuned specifically for retrieval. Apache 2.0 licensed.

**Scale:** ~189 docs, ~800 chunks, ~3 MB database. Linear cosine similarity over 384-dim vectors completes in single-digit milliseconds.

## Development

### Prerequisites

- [Bun](https://bun.sh) (dev runtime — built-in SQLite + TypeScript)
- Node.js 18+ (for published package compatibility)

### Setup

```bash
git clone https://github.com/vitalis/tailwindcss-docs-mcp.git
cd tailwindcss-docs-mcp
bun install
```

### Commands

```bash
bun test                       # Run all tests (168 pass, ~300ms)
bun run build                  # TypeScript type check
bunx biome check src/ test/    # Lint + format check
bunx biome check --write src/  # Auto-fix
```

### Project Structure

```
src/
├── index.ts               # Entry point
├── server.ts              # MCP tool registration
├── pipeline/
│   ├── fetcher.ts         # GitHub API download
│   ├── parser.ts          # MDX → clean markdown
│   ├── chunker.ts         # Heading-based splitting
│   └── embedder.ts        # ONNX embeddings
├── storage/
│   ├── database.ts        # SQLite schema + queries
│   └── search.ts          # Hybrid search + RRF fusion
├── tools/
│   ├── fetch-docs.ts      # fetch_docs handler
│   ├── search-docs.ts     # search_docs handler
│   ├── list-utilities.ts  # list_utilities handler
│   └── check-status.ts    # check_status handler
└── utils/
    ├── config.ts          # Env vars + config
    ├── similarity.ts      # Cosine similarity
    └── categories.ts      # Utility category map
```

### Key Conventions

- **Query prefix** — `snowflake-arctic-embed-xs` requires `"Represent this sentence for searching relevant passages: "` prepended to search queries (not documents). Handled by `EmbedOptions.isQuery`.
- **Content hashing** — SHA-256 per chunk. Unchanged chunks skip re-embedding on refresh.
- **BLOB vectors** — `Float32Array` stored as BLOB in SQLite (384 dims x 4 bytes = 1,536 bytes).
- **Runtime detection** — `bun:sqlite` when running under Bun, `better-sqlite3` for Node.js. Automatic.
- **FTS5 tokenchars** — Hyphen preserved as a token character so `px-4` and `grid-cols-3` match as single tokens.

### Dependencies

| Package                     | Purpose                                   |
| --------------------------- | ----------------------------------------- |
| `@modelcontextprotocol/sdk` | MCP server framework                      |
| `@huggingface/transformers` | In-process ONNX embeddings                |
| `better-sqlite3`            | SQLite for Node.js (not needed under Bun) |
| `octokit`                   | GitHub API client                         |
| `zod`                       | Input schema validation                   |

No external runtime services required. The ONNX model (~27 MB) downloads on first `fetch_docs` and caches locally.

## Version Mapping

| Tailwind Version | GitHub Branch | Status    |
| ---------------- | ------------- | --------- |
| v3               | `master`      | Supported |
| v4               | `next`        | Supported |

## License

MIT
