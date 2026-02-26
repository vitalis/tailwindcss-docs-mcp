# tailwindcss-docs-mcp

Local semantic search for Tailwind CSS documentation via [Model Context Protocol](https://modelcontextprotocol.io).

LLMs hallucinate Tailwind classes. This MCP server downloads the docs once, embeds them locally with ONNX, and gives your AI instant semantic search — no API keys, no external services, no per-query costs.

## Setup

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

Or with Claude Code:

```bash
claude mcp add tailwindcss-docs-mcp -- npx -y tailwindcss-docs-mcp
```

Then ask your assistant: _"Fetch the Tailwind CSS docs"_ — this indexes ~189 pages in ~30 seconds. You only need to do this once.

## Tools

| Tool             | Description                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `fetch_docs`     | Download and index Tailwind CSS documentation. Run once, re-run with `force: true` to refresh. |
| `search_docs`    | Semantic + keyword hybrid search. Returns relevant snippets with code examples and deep links. |
| `list_utilities` | Browse all utility categories (Layout, Spacing, Typography, etc.).                             |
| `check_status`   | Check index state — doc counts, embedding model status, last indexed time.                     |

All tools accept an optional `version` parameter (`"v3"` or `"v4"`, defaults to v4).

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

| Variable                            | Default                   | Description                             |
| ----------------------------------- | ------------------------- | --------------------------------------- |
| `TAILWIND_DOCS_MCP_DEFAULT_VERSION` | `v4`                      | Set to `v3` for Tailwind 3.x projects   |
| `TAILWIND_DOCS_MCP_PATH`            | `~/.tailwindcss-docs-mcp` | Data directory                          |
| `GITHUB_TOKEN`                      | —                         | Optional. Avoids GitHub API rate limits |

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

MIT
