---
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task, WebFetch, WebSearch
---

# Code Review (Diff Only)

Review only the changes between the current branch and main.

## Instructions

1. **Get changed files:**

```bash
git diff --name-only main...HEAD -- '*.ts'
```

2. **Get the diff:**

```bash
git diff main...HEAD -- '*.ts'
```

3. **Review the diff** using the same criteria as the full code review (architecture alignment, TypeScript quality, pipeline correctness, search quality, testing).

4. **Run verification:**

```bash
bun run build
bun test
bunx biome check src/
```

5. **Output:** Same format as the full code review, but only for changed files.

## Additional Context

$ARGUMENTS
