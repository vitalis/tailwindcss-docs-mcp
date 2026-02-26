---
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task, WebFetch, WebSearch
---

# Search Quality Check

Run the search quality integration tests and verify retrieval accuracy.

## Steps

1. **Run search quality tests:**

```bash
bun test test/integration/search-quality.test.ts
```

2. **Run hybrid search tests:**

```bash
bun test test/integration/hybrid-search.test.ts
```

3. **Manual spot checks** — run these queries against the MCP server and verify results make sense:

| Query                           | Expected top result       |
| ------------------------------- | ------------------------- |
| "how to add horizontal padding" | padding doc               |
| "responsive grid"               | grid-template-columns doc |
| "px-4" (exact class)            | padding doc (keyword hit) |
| "center a div"                  | flexbox or grid doc       |
| "dark mode"                     | dark-mode doc             |

4. **Output format:**

```
SEARCH QUALITY RESULTS:
[ ] Quality tests: PASS/FAIL (X/Y queries returned correct top result)
[ ] Hybrid tests: PASS/FAIL
[ ] Spot checks: describe any unexpected results

Top-3 recall: X% (target: >80%)
Average top-1 similarity: X.XX (target: >0.5)

VERDICT: ACCEPTABLE / NEEDS TUNING
```

## Additional Context

$ARGUMENTS
