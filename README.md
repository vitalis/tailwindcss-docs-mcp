# tailwindcss-docs-mcp

[![npm version](https://img.shields.io/npm/v/tailwindcss-docs-mcp)](https://www.npmjs.com/package/tailwindcss-docs-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Local semantic search for Tailwind CSS documentation via [Model Context Protocol](https://modelcontextprotocol.io).

LLMs hallucinate Tailwind classes. This MCP server downloads the docs once, embeds them locally with ONNX, and gives your AI instant semantic search — no API keys, no external services, no per-query costs.

## Installation

```json
{
  "mcpServers": {
    "tailwindcss-docs-mcp": {
      "command": "npx",
      "args": ["-y", "tailwindcss-docs-mcp"]
    }
  }
}
```

<details>
<summary>Claude Code</summary>

```bash
claude mcp add tailwindcss-docs-mcp -- npx -y tailwindcss-docs-mcp
```

</details>

<details>
<summary>Cursor / Windsurf</summary>

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "tailwindcss-docs-mcp": {
      "command": "npx",
      "args": ["-y", "tailwindcss-docs-mcp"]
    }
  }
}
```

</details>

### First run

On first boot the embedding model (~27 MB) downloads in the background. The server is usable immediately — tools that need embeddings will return a status message until the model is ready. Use `check_status` to verify.

Then ask your assistant: _"Fetch the Tailwind CSS docs"_ — this downloads and indexes the documentation. You only need to do this once.

### Example prompts

- _"How do I center a div with Tailwind?"_
- _"Show me the grid layout utilities"_
- _"What's the dark mode configuration in v4?"_
- _"Search for responsive padding classes"_

## Tools

### `fetch_docs`

Download and index Tailwind CSS documentation. Run once, re-run with `force: true` to refresh.

| Parameter | Type      | Default | Description                        |
| --------- | --------- | ------- | ---------------------------------- |
| `version` | `string`  | `"v4"`  | `"v3"` or `"v4"`                   |
| `force`   | `boolean` | `false` | Re-download even if already cached |

### `search_docs`

Semantic + keyword hybrid search. Returns relevant snippets with code examples and deep links.

| Parameter | Type     | Default | Description                   |
| --------- | -------- | ------- | ----------------------------- |
| `query`   | `string` | —       | Natural language search query |
| `version` | `string` | `"v4"`  | `"v3"` or `"v4"`              |
| `limit`   | `number` | `5`     | Results to return (1–20)      |

### `list_utilities`

Browse all utility categories (Layout, Spacing, Typography, etc.).

| Parameter  | Type     | Default | Description             |
| ---------- | -------- | ------- | ----------------------- |
| `category` | `string` | —       | Filter by category name |
| `version`  | `string` | `"v4"`  | `"v3"` or `"v4"`        |

### `check_status`

Check index state — doc counts, embedding model status, last indexed time.

| Parameter | Type     | Default | Description                             |
| --------- | -------- | ------- | --------------------------------------- |
| `version` | `string` | —       | Check specific version, or omit for all |

## How It Works

```
GitHub → Fetch MDX → Parse → Chunk by heading → Embed (ONNX) → SQLite
                                                                  ↓
                                          search_docs → Hybrid Search
                                                        Semantic + FTS5
                                                        Rank Fusion
```

- **Hybrid search** — cosine similarity on embeddings + FTS5 keyword match, fused via reciprocal rank fusion. Semantic handles _"how to center a div"_, keywords handle exact classes like `grid-cols-3`.
- **Incremental re-indexing** — SHA-256 content hashing per chunk. Unchanged content skips re-embedding.
- **In-process embeddings** — `snowflake-arctic-embed-xs` (22M params, 384 dims) runs locally via ONNX. No external calls.
- **Auto model management** — the embedding model (~27 MB) downloads on first boot and caches locally. Server starts immediately; model loads in background.

## Configuration

| Variable                            | Default                   | Description                                                                                            |
| ----------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `TAILWIND_DOCS_MCP_DEFAULT_VERSION` | `v4`                      | Set to `v3` for Tailwind 3.x projects                                                                  |
| `TAILWIND_DOCS_MCP_PATH`            | `~/.tailwindcss-docs-mcp` | Data directory                                                                                         |
| `GITHUB_TOKEN`                      | —                         | Recommended. Without it, GitHub API limits you to 60 requests/hour — not enough for a full docs fetch. |

<details>
<summary>Using with Tailwind CSS v3</summary>

```json
{
  "mcpServers": {
    "tailwindcss-docs-mcp": {
      "command": "npx",
      "args": ["-y", "tailwindcss-docs-mcp"],
      "env": {
        "TAILWIND_DOCS_MCP_DEFAULT_VERSION": "v3"
      }
    }
  }
}
```

</details>

## Development

```bash
git clone https://github.com/vitalis/tailwindcss-docs-mcp.git
cd tailwindcss-docs-mcp
bun install
bun run test                   # Vitest
bun run build                  # TypeScript
bunx biome check src/ test/    # Lint
```

## Acknowledgments

Inspired by [HexDocs MCP](https://github.com/bradleygolden/hexdocs-mcp), which does the same for Elixir/Hex documentation.

## License

[MIT](LICENSE)
