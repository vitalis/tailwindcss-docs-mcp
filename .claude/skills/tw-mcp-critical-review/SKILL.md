---
name: tw-mcp-critical-review
description: "Critical code review for tailwindcss-docs-mcp. Runs architect + code reviewer + QA + search quality in parallel. Use when 'critical review', 'full review', or 'review everything'."
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task, WebFetch, WebSearch
---

# Critical Code Review

Run a comprehensive review using multiple specialist agents in parallel.

## Workflow

1. **Launch 4 agents in parallel:**

| Agent              | Focus                                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| `ts-architect`     | Architecture alignment — does the implementation match the architecture doc? |
| `ts-code-reviewer` | Code quality — TypeScript patterns, pipeline correctness, test coverage      |
| `ts-qa-developer`  | Test strategy review — coverage gaps, fixture quality, flaky tests           |
| Search quality     | Run `/search-quality` command for retrieval accuracy                         |

2. **Collect results** from all 4 agents.

3. **Produce consolidated summary:**

```
## Critical Review Summary

### Architecture: [ALIGNED / DRIFT DETECTED]

[Key findings from ts-architect]

### Code Quality: [APPROVE / REQUEST CHANGES]

[Key findings from ts-code-reviewer]

### Test Coverage: [SUFFICIENT / GAPS FOUND]

[Key findings from ts-qa-developer]

### Search Quality: [ACCEPTABLE / NEEDS TUNING]

[Key findings from search quality check]

### Blockers

[List any BLOCKER-severity issues]

### Action Items

[Prioritized list of changes needed]
```

## Success Criteria

- [ ] All 4 review perspectives completed
- [ ] No BLOCKER issues remain unaddressed
- [ ] Search quality top-3 recall > 80%
- [ ] Architecture doc matches implementation
