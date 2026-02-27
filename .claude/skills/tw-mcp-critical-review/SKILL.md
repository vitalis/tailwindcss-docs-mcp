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

3. **Produce consolidated summary** (see format below).

## Agent Prompt Rules

**CRITICAL: Include these rules in EVERY agent prompt to prevent noise.**

Each agent prompt MUST include the following section verbatim:

```
## What to Report

Only report issues that meet ALL of these criteria:
1. **Demonstrably wrong** — you can show it produces incorrect behavior, crashes, data loss, or security vulnerability
2. **Reproducible** — you can describe concrete steps or inputs that trigger the issue
3. **Not a trade-off** — the current approach was not an intentional design choice with documented rationale

## What NOT to Report

Do NOT report any of the following. These are explicitly banned:
- "Consider adding..." / "Could be improved by..." — speculative improvements
- Performance optimizations for code that handles < 10,000 items (premature optimization)
- Missing tests for private/internal functions — only flag missing tests for PUBLIC API
- "This could break if..." with hypothetical future scenarios that don't exist today
- Code style preferences already handled by the project's linter (Biome)
- Suggesting abstractions, wrappers, or classes for code that works fine as-is
- Duplicated findings from previous review rounds that were evaluated and accepted
- "Add a comment explaining..." — if the code is clear, it doesn't need a comment
- Alternative approaches that are equally valid but not better ("you could also do X")
- Module-level state that is intentional and correctly managed (e.g., caches, singletons)
- Missing error handling for errors that cannot occur in practice

## Severity Calibration

- **CRITICAL**: Currently broken in production. Data loss, security hole, crash. Must have reproduction steps.
- **MAJOR**: Demonstrable bug or correctness issue with concrete example. NOT "this might cause problems someday."
- **MINOR**: Real code smell with a clear fix, NOT a suggestion or preference.

## Hard Limits

- Maximum 3 MAJOR issues per agent. If you find more, keep only the top 3 by impact.
- Maximum 5 MINOR issues per agent. If you find more, keep only the top 5.
- If you find 0 issues, return APPROVE with "No issues found." Do NOT invent issues to fill the template.
- It is BETTER to return APPROVE than to pad findings with noise.
```

## Consolidated Summary Format

```
## Critical Review Summary

### Architecture: [ALIGNED / DRIFT DETECTED]
[Only genuine architectural misalignment]

### Code Quality: [APPROVE / REQUEST CHANGES]
[Only demonstrable bugs or correctness issues]

### Test Coverage: [SUFFICIENT / GAPS FOUND]
[Only missing tests for public API with real risk]

### Search Quality: [ACCEPTABLE / NEEDS TUNING]
[Only measurable search quality problems]

### Blockers
[List any CRITICAL-severity issues, or "None"]

### Action Items
[Deduplicated, prioritized list — max 5 items total across all agents]
```

## Success Criteria

- [ ] All 4 review perspectives completed
- [ ] No BLOCKER issues remain unaddressed
- [ ] Search quality top-3 recall > 80%
- [ ] Architecture doc matches implementation
