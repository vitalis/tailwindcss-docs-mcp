# tailwindcss-docs-mcp

[![tailwindcss-docs-mcp](https://img.shields.io/npm/v/tailwindcss-docs-mcp?label=tailwindcss-docs-mcp&labelColor=1a1a1a&color=4169E1&style=for-the-badge&logo=npm&logoColor=fff)](https://www.npmjs.com/package/tailwindcss-docs-mcp)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind%20CSS-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=fff&labelColor=1a1a1a)](https://tailwindcss.com/docs)
[![Tailwind CSS v3](https://img.shields.io/badge/Tailwind%20CSS-v3-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=fff&labelColor=1a1a1a)](https://v3.tailwindcss.com/docs)

Local semantic search for Tailwind CSS documentation via Model Context Protocol. Downloads the official docs, embeds them locally, and gives your assistant real search over real documentation. No API keys, no external services, everything on your machine. Just Node.js 18+.

## Getting Started

**Claude Code**

```bash
claude mcp add tailwindcss-docs-mcp -- npx -y tailwindcss-docs-mcp
```

**Other MCP clients** (Claude Desktop, Cursor, Windsurf, etc.)

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

The embedding model downloads on first boot (~30 seconds), the docs index automatically, and every Tailwind question hits the local index from then on. No setup, no commands to run.

**Using Tailwind v3?** Set `"env": { "TAILWIND_DOCS_MCP_DEFAULT_VERSION": "v3" }` in your config.

**Custom data directory?** Set `TAILWIND_DOCS_MCP_PATH` (default: `~/.tailwindcss-docs-mcp`).

## What It Does

Your assistant gets four tools — `search_docs`, `fetch_docs`, `list_utilities`, and `check_status` — and calls them automatically when you ask Tailwind questions.

Search is hybrid: semantic vectors and full-text keywords run in parallel, merged with reciprocal rank fusion. Class names like `text-lg` or `mx-auto` are automatically expanded to their CSS properties. Both Tailwind v3 and v4 are indexed independently and switchable per query. Everything runs locally via [snowflake-arctic-embed-xs](https://huggingface.co/Snowflake/snowflake-arctic-embed-xs) and SQLite — nothing leaves your machine.

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

[![GitHub Issues](https://img.shields.io/github/issues/vitalis/tailwindcss-docs-mcp?label=open%20an%20issue&labelColor=1a1a1a&color=238636&style=for-the-badge&logo=github&logoColor=fff)](https://github.com/vitalis/tailwindcss-docs-mcp/issues)

## Acknowledgments

[![inspired by HexDocs MCP](https://img.shields.io/badge/inspired%20by-HexDocs%20MCP-6e5494?style=for-the-badge&logo=github&logoColor=fff&labelColor=1a1a1a)](https://github.com/bradleygolden/hexdocs-mcp)

## License

[![license MIT](https://img.shields.io/badge/license-MIT-F5A623?style=for-the-badge&labelColor=1a1a1a)](LICENSE)
