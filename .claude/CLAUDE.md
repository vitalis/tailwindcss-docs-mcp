# tailwindcss-docs-mcp

Local semantic search for Tailwind CSS documentation via Model Context Protocol.

## Stack

- **Language**: TypeScript (strict mode, ES2022, NodeNext)
- **Dev runtime**: Bun (built-in SQLite, built-in TypeScript)
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Embeddings**: `@huggingface/transformers` (in-process ONNX)
- **Model**: `snowflake-arctic-embed-xs` (22M params, 384 dims)
- **Storage**: SQLite (`bun:sqlite` / `better-sqlite3` fallback)
- **Testing**: Vitest
- **Linting/Formatting**: Biome
- **CI/CD**: GitHub Actions + release-please + npm publish

## Quality Commands

```bash
bun run test                    # Run all tests (Vitest, NOT bun test)
bun run build                   # TypeScript compilation
bunx biome check src/ test/     # Lint + format check
bunx biome check --write src/ test/  # Auto-fix lint/format
```

**Important**: Always use `bun run test` (Vitest), never `bun test` (Bun's built-in runner crashes on ONNX teardown).

## Workflow Rules

- **No direct pushes to main** — all changes go through feature branches and PRs
- **Branch naming**: `NNN-kebab-case-slug` (e.g., `008-add-caching`)
- **Commits**: Conventional commits, no Co-Authored-By
- **Merging**: Squash merge to main, delete feature branch after
- **Releases**: Automated via release-please — `feat:`/`fix:` commits trigger version bump PRs

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
- **Query expansion**: `src/utils/query-expansion.ts` maps Tailwind class prefixes to CSS property names (e.g., `text-lg` → `font size`, `mx-auto` → `margin`)
- **Runtime detection**: `bun:sqlite` when running under Bun, `better-sqlite3` for Node.js
- **Enum order in tool schemas**: List preferred default first in `z.enum()` — LLMs pick the first value when users omit the parameter
- **Biome formatting**: Always run `bunx biome check --write` after editing — Biome collapses multi-line expressions; CI will fail without this

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
