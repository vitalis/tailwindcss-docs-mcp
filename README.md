# tailwindcss-docs-mcp

[![npm version](https://img.shields.io/npm/v/tailwindcss-docs-mcp)](https://www.npmjs.com/package/tailwindcss-docs-mcp)
[![npm downloads](https://img.shields.io/npm/dm/tailwindcss-docs-mcp)](https://www.npmjs.com/package/tailwindcss-docs-mcp)
[![license](https://img.shields.io/npm/l/tailwindcss-docs-mcp)](LICENSE)

LLMs hallucinate Tailwind classes. This MCP server fixes that.

It downloads the official Tailwind CSS docs, embeds them locally with a 22M-param model, and gives your AI assistant hybrid search over the real documentation. No API keys, no external services, everything on your machine.

## Quick start

Add to your MCP client config and you're done:

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

> "Fetch the Tailwind CSS docs"

That indexes the documentation once. After that, every Tailwind question hits the local index.

<details>
<summary><strong>Claude Code</strong></summary>

```bash
claude mcp add tailwindcss-docs-mcp -- npx -y tailwindcss-docs-mcp
```

</details>

<details>
<summary><strong>VS Code</strong></summary>

Add to your `settings.json`:

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
<summary><strong>Cursor / Windsurf</strong></summary>

Add `.mcp.json` to your project root:

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
<summary><strong>Tailwind v3</strong></summary>

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

## Why this exists

AI coding assistants confidently generate Tailwind classes that don't exist, mix up v3 and v4 syntax, and miss utilities that would solve the problem in one class. This server gives them the actual docs to search instead of guessing.

## Features

- **Hybrid search** -- semantic vectors + FTS5 keywords, merged with reciprocal rank fusion
- **Query expansion** -- understands class names (`text-lg` resolves to "font size", `mx-auto` to "margin")
- **Tailwind v3 + v4** -- both versions indexed and searchable independently
- **Fully local** -- ONNX embeddings (snowflake-arctic-embed-xs, 384 dims), SQLite storage, zero network calls at search time
- **Incremental indexing** -- SHA-256 per chunk, only re-embeds what changed
- **Zero config** -- just `npx` and go. Requires Node.js 18+, nothing else

## Tools

| Tool             | What it does                                                            |
| ---------------- | ----------------------------------------------------------------------- |
| `search_docs`    | Hybrid semantic + keyword search. Params: `query`, `version`, `limit`   |
| `fetch_docs`     | Download and index docs. Run once per version, `force: true` to refresh |
| `list_utilities` | Browse utility categories (Layout, Spacing, Typography, ...)            |
| `check_status`   | Index state, model status, last updated                                 |

All tools accept an optional `version` parameter (`"v3"` or `"v4"`, defaults to `"v4"`).

## How it works

MDX files are fetched from the [tailwindcss.com](https://github.com/tailwindlabs/tailwindcss.com) repo, chunked by heading hierarchy (~500 tokens, code blocks intact), and embedded with [snowflake-arctic-embed-xs](https://huggingface.co/Snowflake/snowflake-arctic-embed-xs) via ONNX. Chunks and vectors go into SQLite with FTS5.

At search time, cosine similarity and FTS5 run in parallel. Results are merged with reciprocal rank fusion. Queries containing Tailwind class names get automatic keyword boosting.

## Configuration

| Variable                            | Default                   | Description              |
| ----------------------------------- | ------------------------- | ------------------------ |
| `TAILWIND_DOCS_MCP_DEFAULT_VERSION` | `v4`                      | Default Tailwind version |
| `TAILWIND_DOCS_MCP_PATH`            | `~/.tailwindcss-docs-mcp` | Data directory           |

## First run

The embedding model (~27 MB) downloads automatically on first boot and takes about 30 seconds. The server starts immediately -- tools return a status message until the model is ready. After that, the model loads from cache instantly.

## Troubleshooting

| Message                            | Fix                                                     |
| ---------------------------------- | ------------------------------------------------------- |
| "Embedding model is initializing"  | Model still downloading. Wait ~30 seconds.              |
| "Index not built for this version" | Tell your assistant to fetch the docs first.            |
| Wrong version results              | Set `TAILWIND_DOCS_MCP_DEFAULT_VERSION` in your config. |

## Development

```bash
git clone https://github.com/vitalis/tailwindcss-docs-mcp.git
cd tailwindcss-docs-mcp
bun install
bun run test            # vitest
bun run build           # tsc
bunx biome check src/   # lint
```

## Acknowledgments

Inspired by [HexDocs MCP](https://github.com/bradleygolden/hexdocs-mcp).

## License

[MIT](LICENSE)
