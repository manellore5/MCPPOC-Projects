---
name: do-work
description: "Execute implementation tasks end-to-end: verify PRD/plan/issues exist, choose execution mode (AFK ralph loop or issue-by-issue), analyze dependencies, implement using TDD Red/Green/Refactor with vertical slices, validate, and commit. Use when user wants to do work, build a feature, fix a bug, or implement tasks."
---

# Do Work

Execute approved issues using disciplined engineering practices.

## Pre-Implementation Checklist

Before writing any code, verify:

- [ ] PRD exists and is approved (`apps/<app>/docs/prd/<feature>.md`)
- [ ] Plan exists and is approved (`apps/<app>/docs/plans/<feature>.md`)
- [ ] Issues exist and are approved (`apps/<app>/docs/issues/<feature>/`)
- [ ] Dependencies between issues are identified

If any are missing, **stop and inform the user**. Do not proceed without the full chain.

## Execution Mode

**Always ask the user before starting implementation:**

> How would you like to execute?
>
> **Option A: AFK Ralph Loop** — Run all tasks autonomously in a loop. All tasks run as AFK (away from keyboard) except 1 HITL (human-in-the-loop) checkpoint task for final review.
>
> **Option B: Issue-by-Issue** — Execute one issue at a time, present results after each, and wait for user approval before moving to the next.

## Dependency Analysis

Before executing in either mode:

1. **Read all issue files** in `docs/issues/<feature>/`
2. **Build a dependency graph** — check each issue's `Dependencies` field
3. **Determine execution order** — topological sort, leaves first
4. **Flag circular dependencies** — report to user if found
5. **Group parallelizable issues** — identify independent issues that could run concurrently

Present the execution order to the user before starting.

## Workflow Per Issue

### 1. Understand the task

Read the issue file and any referenced plan or PRD. Explore the codebase to understand the relevant files, patterns, and conventions. If the task is ambiguous, ask the user to clarify scope before proceeding.

### 2. TDD — mandatory for ALL code

TDD applies to **everything** — backend, frontend, MCP tools, resources, utilities. No exceptions. Use the `/tdd` skill for the full Red/Green/Refactor workflow, philosophy, and guidelines.

#### Step A: Ensure test infrastructure exists

Before any issue work, check for test setup:

- Look for existing test files (`*.test.ts`, `*.test.tsx`, `*.spec.ts`)
- Check for vitest config, test utilities, fixtures, global setup
- If **no test infrastructure exists**, create it first as a prerequisite slice:
  1. Add vitest config (+ playwright config if E2E needed)
  2. Create test helper/setup files (e.g., `setupClient()` for MCP, test DB factory)
  3. Write a smoke test to verify the runner works
  4. Commit this as its own step before any issue work

#### Step B: Implement each issue using `/tdd` skill

For each issue, invoke the `/tdd` skill to drive implementation:

1. **Plan** — confirm with user which behaviors to test from the acceptance criteria
2. **Tracer bullet** — one failing test → minimal code to pass → repeat
3. **Refactor** — clean up while all tests are green

Never write tests in bulk. Never implement layer-by-layer. Always vertical slices.

#### MCP-specific test patterns

| Code Type         | Test Approach                                     | Example                                                        |
| ----------------- | ------------------------------------------------- | -------------------------------------------------------------- |
| MCP tools         | Call tool, assert `structuredContent` + `content` | `client.callTool({ name: 'create_entry', arguments: {...} })`  |
| MCP resources     | Read resource, assert contents                    | `client.readResource({ uri: 'epicme://entries/1' })`           |
| MCP prompts       | Get prompt, assert messages                       | `client.getPrompt({ name: 'suggest_tags', arguments: {...} })` |
| Database/services | CRUD operations, assert through public interface  | `db.createEntry({...})` → `db.getEntry(id)`                    |
| API/Worker routes | HTTP request, assert response                     | `fetch('/mcp', { method: 'POST', ... })`                       |
| React components  | Render, assert output + interactions              | `render(<Component />)` → assert DOM                           |
| UI resources      | Assert HTML/remoteDom output content              | Assert `htmlString` contains expected markup                   |
| Utilities/helpers | Input → output                                    | `createText({...})` → assert content block                     |

#### Vertical slice example

For an issue "Add create_entry tool":

```
Slice 1: Red   → test: calling create_entry returns structuredContent with entry
         Green → add Zod schema + registerTool + DB insert + return
         Refactor → extract createText helper, apply annotations

Slice 2: Red   → test: create_entry with tags returns entry with tags attached
         Green → add tag association logic
         Refactor → extract createEntryResourceLink helper

Slice 3: Red   → test: create_entry with invalid input returns error
         Green → add Zod validation error handling
         Refactor → clean up error messages
```

### 3. Implement

Follow the `mcp-ui-project-standards` skill for coding conventions:

- File organization by concern
- Import order conventions
- Tool annotations with `satisfies ToolAnnotations`
- Structured output + content return pattern
- Zod schemas with `.describe()` on all fields
- `invariant()` for assertions, never raw throws
- Helper functions for content formatting

### 4. Validate

Run the feedback loops and fix any issues. Repeat until all pass cleanly:

```
typecheck
lint
test
```

### 5. Mark issue done

**This step is mandatory — never skip it.** After validation passes:

1. Open the issue file (`docs/issues/<feature>/XX-task-name.md`)
2. Change status from `[ ] Todo` or `[~] In Progress` to `[x] Done`
3. Check off each acceptance criterion that was met: `- [x] Criterion`
4. Fill in the **Implementation Notes** section with:
   - Files created/modified
   - Key decisions made
   - Any deviations from the plan
   - Test coverage summary

### 6. Report

- **Issue-by-Issue mode:** Summarize what was done and wait for user approval before next issue.
- **AFK mode:** Log progress and continue to next issue.

## AFK Ralph Loop Mode

When running in AFK mode:

- Process all issues sequentially in dependency order
- Log progress after each issue completion
- **Pause only at the designated HITL checkpoint** (typically the last issue or a user-specified issue)
- At the HITL checkpoint: present a summary of all completed work, test results, and any decisions made
- If a blocking error occurs that cannot be resolved, pause and notify the user

## Issue File Format

Issues should track their status:

```markdown
# Issue Title

**Status:** [ ] Todo | [~] In Progress | [x] Done
**Depends on:** #01, #02 (or "None")
**Complexity:** S / M / L

## Description

...

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Implementation Notes

(filled in during/after implementation)
```
