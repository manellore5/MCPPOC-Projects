# Plan to Issues

Break an approved implementation plan into independently-implementable local issues using vertical slices (tracer bullets).

## Process

### 1. Locate the plan and PRD

- Read the plan at `apps/<app>/docs/plans/<feature>.md`
- Read the referenced PRD at `apps/<app>/docs/prd/<feature>.md` for context
- The plan's task breakdown is the primary source for issues — the PRD provides the "why"

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code.

### 3. Draft vertical slices

Break the plan's tasks into **tracer bullet** issues. Each issue is a thin vertical slice that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

Slices may be 'HITL' or 'AFK'. HITL slices require human interaction, such as an architectural decision or a design review. AFK slices can be implemented and merged without human interaction. Prefer AFK over HITL where possible.

<vertical-slice-rules>
- Each slice delivers a narrow but COMPLETE path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Prefer many thin slices over few thick ones
- Each slice must be testable — include test expectations in acceptance criteria
</vertical-slice-rules>

Always create a final QA issue with a detailed manual QA plan for all items that require human verification. This QA issue should be the last item in the dependency graph, blocked by all other slices. It should be HITL.

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each slice, show:

- **Title**: short descriptive name
- **Type**: HITL / AFK
- **Blocked by**: which other slices (if any) must complete first
- **User stories covered**: which user stories from the PRD this addresses
- **Plan tasks covered**: which tasks from the plan this implements

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the dependency relationships correct?
- Should any slices be merged or split further?
- Are the correct slices marked as HITL and AFK?

Iterate until the user approves the breakdown.

### 5. Create local issue files

For each approved slice, create a markdown file at `apps/<app>/docs/issues/<feature>/`.

Name files in dependency order: `01-<task-name>.md`, `02-<task-name>.md`, etc.

<issue-template>
# <Issue Title>

**Status:** [ ] Todo
**Type:** AFK / HITL
**Depends on:** #01, #02 (or "None")
**Complexity:** S / M / L

## Parent

- PRD: `docs/prd/<feature>.md`
- Plan: `docs/plans/<feature>.md`

## What to build

A concise description of this vertical slice. Describe the end-to-end behavior, not layer-by-layer implementation. Reference specific sections of the plan rather than duplicating content.

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## User Stories Addressed

Reference by number from the PRD:

- User story 3
- User story 7

## Implementation Notes

(filled in during/after implementation by do-work skill)
</issue-template>

Do NOT modify the PRD or plan files.
