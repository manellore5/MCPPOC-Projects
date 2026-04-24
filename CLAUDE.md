# Project Development Workflow

This project follows a strict, sequential workflow for all new features, enhancements, and major bug fixes. **Do not skip steps.** Each step must be completed and acknowledged before moving to the next.

## Workflow Steps

### Step 1: PRD (Product Requirements Document)

**Skill:** `/write-a-prd` (uses `/domain-model` as sub-skill)

- Gather requirements from the user
- Run `/domain-model` to stress-test language against CONTEXT.md, sharpen terms, update glossary, create ADRs for significant decisions
- Interview the user relentlessly, identify deep modules
- Create a PRD document at `apps/<app-name>/docs/prd/<feature-name>.md`
- The PRD must include: problem statement, user stories, implementation decisions, **testing decisions**, scope (in/out), and domain terms
- **Ask the user to review and approve the PRD before proceeding**

### Step 2: Implementation Plan

**Skill:** `/write-a-plan`

- Based on the approved PRD, create a detailed implementation plan
- Store the plan at `apps/<app-name>/docs/plans/<feature-name>.md`
- The plan must include: technical approach, file changes, dependencies, risks, and task breakdown
- Reference the PRD: link back to `docs/prd/<feature-name>.md`
- **Ask the user to review and approve the plan before proceeding**

### Step 3: Issues

**Skill:** `/plan-to-issues`

- Based on the approved plan (which references the PRD), create local issue files
- Store issues at `apps/<app-name>/docs/issues/<feature-name>/`
- Each issue should be a separate markdown file: `01-<task-name>.md`, `02-<task-name>.md`, etc.
- Each issue must include: title, description, acceptance criteria, dependencies on other issues, and estimated complexity
- **Present the full list of issues to the user and ask for approval before proceeding**

### Step 4: Implementation

**Skills:** `/do-work` (with optional `/loop` for AFK mode)

- Only after all issues are approved, begin implementation
- **Before starting, ask the user which execution mode they prefer:**
  - **Option A: AFK Ralph Loop** — Run all tasks autonomously via `/loop` + `/do-work`. All tasks are AFK except 1 HITL (human-in-the-loop) checkpoint for final review
  - **Option B: Issue-by-Issue** — Execute one issue at a time, present results, wait for approval before the next
- **Analyze dependencies** between issues (topological sort) and present execution order before starting
- **TDD is mandatory for ALL code** (backend, frontend, MCP tools, utilities):
  - If no test infrastructure exists: set it up first as a prerequisite slice (vitest config, helpers, smoke test)
  - Implement every issue using Red/Green/Refactor — one failing test at a time, vertical slices through all layers
  - Never batch tests upfront. Write one test → make it pass → refactor → next test
- Use the `mcp-ui-project-standards` skill for coding conventions
- Work through issues in dependency order
- After completing each issue, mark it as done in the issue file
- Run validation (`typecheck`, `lint`, `test`) after each issue
- Do **not** commit — no CI/CD is configured yet. Code stays uncommitted until the user explicitly requests a commit
- **Ask the user for input when encountering ambiguity or design decisions**

## Rules

1. **Strict ordering:** Steps 1 → 2 → 3 → 4 must be followed in sequence. Never jump to implementation without a PRD, plan, and issues.
2. **User approval gates:** Each step requires explicit user approval before moving to the next step. Do not assume approval.
3. **Local issues:** Issues are stored as local markdown files in the app's `docs/issues/` directory, not on GitHub.
4. **One app at a time:** When working on a feature, all docs go under that app's `docs/` folder.
5. **Reference chain:** Plans reference PRDs. Issues are created from plans (not PRDs directly). Plans contain the task breakdown that becomes issues.
6. **Coding standards:** Always use the `mcp-ui-project-standards` skill when writing code. Follow patterns from `epicweb-dev/mcp-ui` and `epicweb-dev/advanced-mcp-features`.

## Directory Structure

```
apps/<app-name>/
├── docs/
│   ├── prd/
│   │   └── <feature-name>.md
│   ├── plans/
│   │   └── <feature-name>.md
│   └── issues/
│       └── <feature-name>/
│           ├── 01-<task-name>.md
│           ├── 02-<task-name>.md
│           └── ...
└── src/ (or worker/, app/, etc.)
```

## Quick Reference

| Step         | Skill                          | Output Location           | Gate                       |
| ------------ | ------------------------------ | ------------------------- | -------------------------- |
| 1. PRD       | `/write-a-prd`                 | `apps/<app>/docs/prd/`    | User approval              |
| 2. Plan      | `/write-a-plan`                | `apps/<app>/docs/plans/`  | User approval              |
| 3. Issues    | `/plan-to-issues`              | `apps/<app>/docs/issues/` | User approval              |
| 4. Implement | `/do-work` (+ `/loop` for AFK) | Source code               | TDD + validation per issue |
