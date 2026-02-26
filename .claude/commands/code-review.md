---
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task, WebFetch, WebSearch
---

# Code Review

Complete a code review of all TypeScript code on the current branch.

## Instructions

1. **Get current branch and all source files:**

```bash
git rev-parse --abbrev-ref HEAD
```

Review all files in:

- `src/**/*.ts` — Application code
- `test/**/*.ts` — Test files

2. **For each module, review for:**

### Architecture Alignment

- Implementation matches the architecture doc
- MCP tool schemas match the defined JSON schemas
- Embedding model used correctly (query prefix on searches, not documents)
- Content hashing for incremental re-indexing

### TypeScript Quality

- Strict types (no unnecessary `any`)
- Proper async/await usage
- Clean error handling with informative messages
- No circular imports

### Pipeline Correctness

- MDX parser strips all JSX/imports, preserves markdown and code blocks
- Chunker respects heading boundaries and max token limits
- Code blocks never split across chunks
- Content hashes are deterministic (same input → same hash)
- BLOB storage preserves Float32Array precision

### Search Quality

- Cosine similarity computes correctly
- FTS5 index stays in sync with chunks table
- Hybrid search deduplicates and fuses scores
- Query prefix applied to search queries only

### Testing

- All public functions have tests
- Success and error paths covered
- Fixtures use real MDX from Tailwind docs
- Integration tests verify search quality

3. **Run verification:**

```bash
bun run build
bun test
bunx biome check src/
```

4. **Output format:**

For each issue:

```
## [SEVERITY] Issue Title

**File:** path/to/file.ts:line_number
**Category:** Architecture | TypeScript | Pipeline | Search | Testing
**Description:** What the issue is
**Suggestion:** How to improve
```

Severity: BLOCKER > MAJOR > MINOR > INFO

5. **Summary:**

```
| Severity | Count |
|----------|-------|
| BLOCKER | X |
| MAJOR | X |
| MINOR | X |
| INFO | X |

**Files Reviewed:** X
**Tests:** PASS / FAIL
**Types:** PASS / FAIL
**Lint:** PASS / FAIL

**Recommendation:** APPROVE / APPROVE WITH SUGGESTIONS / REQUEST CHANGES
```

## Additional Context

$ARGUMENTS
