# tailwindcss-docs-mcp

[![tailwindcss-docs-mcp](https://img.shields.io/npm/v/tailwindcss-docs-mcp?label=tailwindcss-docs-mcp&labelColor=283C67&color=729AD1&style=for-the-badge&logo=npm&logoColor=fff)](https://www.npmjs.com/package/tailwindcss-docs-mcp)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind%20CSS-v4-283C67?style=for-the-badge&logo=tailwindcss&logoColor=fff)](https://tailwindcss.com/docs)
[![Tailwind CSS v3](https://img.shields.io/badge/Tailwind%20CSS-v3-283C67?style=for-the-badge&logo=tailwindcss&logoColor=fff)](https://v3.tailwindcss.com/docs)

## LLMs Hallucinate Tailwind Classes. This Fixes That.

Your AI assistant just confidently suggested `bg-opacity-50` — a class that hasn't existed since Tailwind v3. It also recommended `flex-gap-4`, which was never a thing. It's not searching documentation. It's guessing from training data.

This MCP server downloads the official Tailwind CSS docs, embeds them locally, and gives your assistant real search over real documentation. No API keys, no external services, everything on your machine. Just Node.js 18+.

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

[![GitHub Issues](https://img.shields.io/github/issues/vitalis/tailwindcss-docs-mcp?label=open%20an%20issue&labelColor=283C67&color=729AD1&style=for-the-badge&logo=github&logoColor=fff)](https://github.com/vitalis/tailwindcss-docs-mcp/issues)

## Acknowledgments

[![inspired by HexDocs MCP](https://img.shields.io/badge/inspired%20by-HexDocs%20MCP-283C67?style=for-the-badge&logo=github&logoColor=fff)](https://github.com/bradleygolden/hexdocs-mcp)

## License

[![license MIT](https://img.shields.io/badge/license-MIT-283C67?style=for-the-badge)](LICENSE)
