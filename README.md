# tailwindcss-docs-mcp

[![npm version](https://img.shields.io/npm/v/tailwindcss-docs-mcp)](https://www.npmjs.com/package/tailwindcss-docs-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Local semantic search for Tailwind CSS documentation via [Model Context Protocol](https://modelcontextprotocol.io).

LLMs hallucinate Tailwind classes. This MCP server downloads the official docs once, embeds them locally with a 22M-parameter ONNX model, and gives your AI assistant instant hybrid search — no API keys, no external services, no per-query costs. Everything runs on your machine.

## Features

- **Zero configuration** — install, run, done. No API keys, no Ollama, no database setup.
- **Hybrid search** — semantic similarity + FTS5 keyword matching, combined with reciprocal rank fusion for consistently relevant results.
- **Query expansion** — understands Tailwind class names. Searching `text-lg` automatically includes "font size"; `mx-auto` includes "margin".
- **Tailwind v3 + v4** — full documentation for both major versions, switchable per query.
- **Fully local embeddings** — `snowflake-arctic-embed-xs` (22M params, 384 dims) runs in-process via ONNX. Nothing leaves your machine.
- **Incremental indexing** — SHA-256 content hashing per chunk. Only changed content gets re-embedded on refresh.

## Requirements

- **Node.js 18+**

That's it. No Ollama, no Python, no external services. The embedding model (~27 MB) downloads automatically on first run.

## Installation

Add to your MCP client configuration:

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
<summary>VS Code</summary>

Add to your user or workspace `settings.json`:

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

<details>
<summary>Tailwind CSS v3</summary>

Set the default version via environment variable:

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

### Getting started

On first boot the embedding model downloads in the background (~30 seconds). The server is usable immediately — tools that need embeddings return a status message until the model is ready.

The first time you ask a Tailwind question, your assistant will automatically call `fetch_docs` to download and index the documentation. This happens once — subsequent queries use the local index.

**Example prompts:**

- _"How do I center a div with Tailwind?"_
- _"Show me the grid layout utilities"_
- _"What's the dark mode configuration in v4?"_
- _"Search for responsive padding classes"_

## Tools

### `search_docs`

Search indexed documentation using natural language. Returns relevant snippets with code examples and deep links to tailwindcss.com.

| Parameter | Type     | Default | Description                   |
| --------- | -------- | ------- | ----------------------------- |
| `query`   | `string` | —       | Natural language search query |
| `version` | `string` | `"v4"`  | `"v3"` or `"v4"`              |
| `limit`   | `number` | `5`     | Results to return (1-20)      |

### `fetch_docs`

Download and index Tailwind CSS documentation. Run once per version. Re-run with `force: true` to refresh after Tailwind releases.

| Parameter | Type      | Default | Description                        |
| --------- | --------- | ------- | ---------------------------------- |
| `version` | `string`  | `"v4"`  | `"v3"` or `"v4"`                   |
| `force`   | `boolean` | `false` | Re-download even if already cached |

### `list_utilities`

Browse all utility categories (Layout, Spacing, Typography, Flexbox & Grid, etc.).

| Parameter  | Type     | Default | Description             |
| ---------- | -------- | ------- | ----------------------- |
| `category` | `string` | —       | Filter by category name |
| `version`  | `string` | `"v4"`  | `"v3"` or `"v4"`        |

### `check_status`

Check index state — document counts, embedding model status, and last indexed time.

| Parameter | Type     | Default | Description                             |
| --------- | -------- | ------- | --------------------------------------- |
| `version` | `string` | —       | Check specific version, or omit for all |

## How it works

```
GitHub MDX ─→ Parse ─→ Chunk by heading ─→ Embed (ONNX) ─→ SQLite
                                                              │
                                              search_docs ◄───┘
                                              ├─ Semantic: cosine similarity
                                              ├─ Keyword: FTS5 full-text
                                              └─ Reciprocal rank fusion
```

1. **Fetch** — downloads MDX source files from the `tailwindcss.com` GitHub repo (v3: `master` branch, v4: `next` branch).
2. **Chunk** — splits documents by heading hierarchy (`##` → `###` → paragraphs), keeping code blocks intact. ~500 tokens per chunk.
3. **Embed** — generates 384-dim vectors using `snowflake-arctic-embed-xs` running locally via ONNX. No external API calls.
4. **Search** — runs semantic similarity and FTS5 keyword search in parallel, merges results with reciprocal rank fusion. Class-name queries get boosted keyword weight.

## Configuration

| Variable                            | Default                   | Description                            |
| ----------------------------------- | ------------------------- | -------------------------------------- |
| `TAILWIND_DOCS_MCP_DEFAULT_VERSION` | `v4`                      | Default Tailwind version for all tools |
| `TAILWIND_DOCS_MCP_PATH`            | `~/.tailwindcss-docs-mcp` | Data directory (database + cache)      |

## Troubleshooting

**"Embedding model is initializing"** — The ONNX model (~27 MB) is still downloading. Wait ~30 seconds and try again, or use `check_status` to monitor progress.

**"Index not built for this version"** — Documentation hasn't been fetched yet. Ask your assistant _"Fetch the Tailwind CSS v4 docs"_ or call `fetch_docs` directly.

**Getting v3 results when you expect v4** — Set the default version in your MCP config (see [Tailwind CSS v3](#installation) above) or pass `version: "v4"` explicitly in your query.

## Development

```bash
git clone https://github.com/vitalis/tailwindcss-docs-mcp.git
cd tailwindcss-docs-mcp
bun install

bun run test                    # Run tests (Vitest)
bun run build                   # TypeScript type check
bunx biome check src/ test/     # Lint + format check
```

## Contributing

Contributions are welcome! Please open an [issue](https://github.com/vitalis/tailwindcss-docs-mcp/issues) to discuss what you'd like to change before submitting a pull request.

## Acknowledgments

Inspired by [HexDocs MCP](https://github.com/bradleygolden/hexdocs-mcp), which provides the same semantic search experience for Elixir/Hex documentation.

## License

[MIT](LICENSE)
