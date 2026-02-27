# tailwindcss-docs-mcp

[![npm](https://img.shields.io/npm/v/tailwindcss-docs-mcp)](https://www.npmjs.com/package/tailwindcss-docs-mcp)
[![npm downloads](https://img.shields.io/npm/dm/tailwindcss-docs-mcp)](https://www.npmjs.com/package/tailwindcss-docs-mcp)
[![license](https://img.shields.io/npm/l/tailwindcss-docs-mcp)](LICENSE)

Local semantic search over the Tailwind CSS docs for AI assistants. Runs entirely on your machine — no API keys, no external services.

## Highlights

- **Hybrid search** — semantic vectors + full-text keywords, fused with reciprocal rank fusion
- **Understands class names** — `text-lg` resolves to "font size", `mx-auto` to "margin"
- **Tailwind v3 + v4** — both versions indexed and searchable
- **Fully local** — 22M-param ONNX embeddings, SQLite storage, nothing leaves your machine
- **Just Node.js 18+** — no Ollama, no Python, no database setup

## Getting started

Install by adding to your MCP client config:

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

Then tell your assistant:

1. _"Fetch the Tailwind CSS docs"_ — indexes the documentation (one-time)
2. _"How do I center a div with Tailwind?"_ — searches the local index

The embedding model (~27 MB) downloads on first boot. The server is ready in about 30 seconds.

<details>
<summary><b>Claude Code</b></summary><br>

```bash
claude mcp add tailwindcss-docs-mcp -- npx -y tailwindcss-docs-mcp
```

</details>

<details>
<summary><b>VS Code</b></summary><br>

Add to `settings.json`:

```json
{
  "mcp": {
    "servers": {
      "tailwindcss-docs-mcp": {
        "command": "npx",
        "args": ["-y", "tailwindcss-docs-mcp"]
      }
    }
  }
}
```

</details>

<details>
<summary><b>Cursor / Windsurf</b></summary><br>

Add to `.mcp.json` in your project root:

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

<details>
<summary><b>Using Tailwind v3?</b></summary><br>

```json
{
  "mcpServers": {
    "tailwindcss-docs-mcp": {
      "command": "npx",
      "args": ["-y", "tailwindcss-docs-mcp"],
      "env": { "TAILWIND_DOCS_MCP_DEFAULT_VERSION": "v3" }
    }
  }
}
```

</details>

## Tools

The server exposes four MCP tools:

- **`search_docs`** — hybrid semantic + keyword search over indexed documentation
- **`fetch_docs`** — download and index docs (once per version; `force: true` to refresh)
- **`list_utilities`** — browse utility categories (Layout, Spacing, Typography, etc.)
- **`check_status`** — embedding model status, index state, last updated time

All tools accept an optional `version` parameter (`"v3"` or `"v4"`, defaults to `"v4"`).

<details>
<summary><b>Parameter reference</b></summary><br>

**search_docs** — `query` (string, required), `version` (string), `limit` (number, 1-20, default 5)

**fetch_docs** — `version` (string), `force` (boolean, default false)

**list_utilities** — `category` (string), `version` (string)

**check_status** — `version` (string)

</details>

## How it works

Documentation is fetched from the [tailwindcss.com](https://github.com/tailwindlabs/tailwindcss.com) GitHub repo, parsed from MDX, split into chunks by heading hierarchy (~500 tokens each, code blocks kept intact), and embedded with [`snowflake-arctic-embed-xs`](https://huggingface.co/Snowflake/snowflake-arctic-embed-xs) (384 dims, ONNX). Everything is stored in a local SQLite database with FTS5.

Search runs semantic cosine similarity and FTS5 keyword matching in parallel, then merges results with reciprocal rank fusion. Queries containing Tailwind class names (like `px-4` or `grid-cols-3`) get automatic keyword boosting.

## Configuration

| Variable                            | Default                   | Description              |
| ----------------------------------- | ------------------------- | ------------------------ |
| `TAILWIND_DOCS_MCP_DEFAULT_VERSION` | `v4`                      | Default Tailwind version |
| `TAILWIND_DOCS_MCP_PATH`            | `~/.tailwindcss-docs-mcp` | Data directory           |

## Troubleshooting

- **"Embedding model is initializing"** — Model is still downloading. Wait ~30 seconds.
- **"Index not built for this version"** — Run `fetch_docs` first.
- **Wrong version results** — Set `TAILWIND_DOCS_MCP_DEFAULT_VERSION` in your MCP config.

## Development

```bash
git clone https://github.com/vitalis/tailwindcss-docs-mcp.git && cd tailwindcss-docs-mcp
bun install
bun run test            # Vitest
bun run build           # TypeScript
bunx biome check src/   # Lint
```

## Contributing

Contributions welcome — [open an issue](https://github.com/vitalis/tailwindcss-docs-mcp/issues) to discuss before submitting a PR.

## Acknowledgments

Inspired by [HexDocs MCP](https://github.com/bradleygolden/hexdocs-mcp) for Elixir documentation.

## License

[MIT](LICENSE)
