# tailwindcss-docs-mcp

[![npm version](https://img.shields.io/npm/v/tailwindcss-docs-mcp)](https://www.npmjs.com/package/tailwindcss-docs-mcp)
[![license](https://img.shields.io/npm/l/tailwindcss-docs-mcp)](LICENSE)

## Real Docs, Not Hallucinations

> Your AI assistant just told you to use `bg-opacity-50`. That class hasn't existed since Tailwind v3.
> It also suggested `flex-gap-4`. That was never a thing.

LLMs confidently generate Tailwind classes that don't exist, mix up v3 and v4 syntax, and miss utilities that would solve the problem in one class. They're guessing from training data, not reading documentation.

This MCP server fixes that. It downloads the official Tailwind CSS docs, embeds them locally with a 22M-parameter model, and gives your assistant hybrid search over the real documentation. No API keys, no external services — everything on your machine.

## Getting Started

**Claude Code**

```bash
claude mcp add tailwindcss-docs-mcp -- npx -y tailwindcss-docs-mcp
```

**Codex / Other MCP Clients**

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

That's it. The embedding model downloads on first boot (~30 seconds), the docs index automatically, and every Tailwind question hits the local index from then on. Requires Node.js 18+.

**Using Tailwind v3?** Set `"env": { "TAILWIND_DOCS_MCP_DEFAULT_VERSION": "v3" }` in your MCP config.

## Overview

The server exposes four tools — `search_docs`, `fetch_docs`, `list_utilities`, and `check_status`. Your assistant discovers and calls them automatically.

Under the hood: MDX files from the [tailwindcss.com](https://github.com/tailwindlabs/tailwindcss.com) repo are chunked by heading, embedded with [snowflake-arctic-embed-xs](https://huggingface.co/Snowflake/snowflake-arctic-embed-xs) via ONNX, and stored in SQLite with FTS5. At search time, semantic similarity and keyword matching run in parallel and merge with reciprocal rank fusion. Queries like `text-lg` or `mx-auto` get automatic expansion to their CSS property names.

Both Tailwind v3 and v4 are fully supported, indexed independently, and switchable per query.

## Configuration

| Variable                            | Default                   | Description              |
| ----------------------------------- | ------------------------- | ------------------------ |
| `TAILWIND_DOCS_MCP_DEFAULT_VERSION` | `v4`                      | Default Tailwind version |
| `TAILWIND_DOCS_MCP_PATH`            | `~/.tailwindcss-docs-mcp` | Data directory           |

## Development

```bash
git clone https://github.com/vitalis/tailwindcss-docs-mcp.git
cd tailwindcss-docs-mcp
bun install
bun run test            # vitest
bun run build           # tsc
bunx biome check src/   # lint
```

## Getting Help

[![GitHub Issues](https://img.shields.io/github/issues/vitalis/tailwindcss-docs-mcp?labelColor=283C67&color=729AD1&style=for-the-badge&logo=github&logoColor=fff)](https://github.com/vitalis/tailwindcss-docs-mcp/issues)

## Acknowledgments

Inspired by [HexDocs MCP](https://github.com/bradleygolden/hexdocs-mcp).

## License

[MIT](LICENSE)
