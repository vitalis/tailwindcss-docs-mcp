# tailwindcss-docs-mcp

Local semantic search for Tailwind CSS documentation via Model Context Protocol.

## Architecture

Full architecture document: `docs/architecture.md`

## Stack

- **Language**: TypeScript (strict mode, ES2022, NodeNext)
- **Dev runtime**: Bun (built-in SQLite, built-in TypeScript)
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Embeddings**: `@huggingface/transformers` (in-process ONNX)
- **Model**: `snowflake-arctic-embed-xs` (22M params, 384 dims)
- **Storage**: SQLite (`bun:sqlite` / `better-sqlite3` fallback)
- **Testing**: Vitest
- **Linting/Formatting**: Biome

## Quality Commands

```bash
bun test                    # Run all tests
bun run build               # TypeScript compilation
bunx biome check src/       # Lint + format check
bunx biome check --write src/ # Auto-fix lint/format
```

## Agents

Uses global ts-\* agents from `~/.claude/agents/`:

| Agent              | Focus                                           |
| ------------------ | ----------------------------------------------- |
| `ts-architect`     | Architecture coordination, delegation, review   |
| `ts-developer`     | TypeScript implementation, tests, pipeline code |
| `ts-qa-developer`  | Test strategy, integration/E2E tests, fixtures  |
| `ts-code-reviewer` | Code quality review (types, async, errors, DRY) |

## Key Conventions

- **Query prefix**: `snowflake-arctic-embed-xs` requires `"Represent this sentence for searching relevant passages: "` prepended to search queries (not documents)
- **Content hashing**: SHA-256 per chunk for incremental re-indexing (skip re-embedding unchanged content)
- **BLOB vector storage**: Float32Array stored as BLOB in SQLite (384 dims x 4 bytes = 1,536 bytes per chunk)
- **Hybrid search**: Semantic (cosine similarity) + Keyword (FTS5) with reciprocal rank fusion
- **Runtime detection**: `bun:sqlite` when running under Bun, `better-sqlite3` for Node.js

## MCP Tools

| Tool             | Purpose                                   |
| ---------------- | ----------------------------------------- |
| `fetch_docs`     | Download, parse, chunk, embed, store docs |
| `search_docs`    | Hybrid semantic + keyword search          |
| `list_utilities` | Browse utility categories                 |
| `check_status`   | Verify index state                        |

## Data Location

Default: `~/.tailwindcss-docs-mcp/` (configurable via `TAILWIND_DOCS_MCP_PATH`)

- `docs.db` — SQLite database with chunks, embeddings, FTS5 index
- `raw/{version}/*.mdx` — cached raw MDX files from GitHub
