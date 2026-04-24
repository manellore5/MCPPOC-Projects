---
name: write-a-prd
description: Create a PRD through user interviews, domain modeling, and codebase exploration. Produces a local PRD document with problem statement, user stories, implementation decisions, and testing decisions. Use when user wants to create a PRD, define requirements, or start a new feature.
---

# Write a PRD

## Process

### 1. Gather requirements

Ask the user for a long, detailed description of the problem they want to solve and any potential ideas for solutions.

### 2. Domain modeling (sub-skill: `/domain-model`)

Invoke the `/domain-model` skill to stress-test the plan against the project's domain language:

- Challenge terms against existing CONTEXT.md glossary
- Sharpen fuzzy or overloaded language into precise canonical terms
- Discuss concrete scenarios that probe edge cases
- Cross-reference user statements with actual code
- Update CONTEXT.md inline as terms are resolved
- Create ADRs sparingly for hard-to-reverse, surprising trade-offs

This step ensures the PRD uses consistent, precise language that aligns with the codebase.

### 3. Explore the codebase

Explore the repo to verify assertions and understand the current state of the code.

### 4. Interview the user

Interview the user relentlessly about every aspect of this plan until you reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one.

### 5. Identify modules

Sketch out the major modules you will need to build or modify to complete the implementation. Actively look for opportunities to extract deep modules that can be tested in isolation.

A deep module (as opposed to a shallow module) is one which encapsulates a lot of functionality in a simple, testable interface which rarely changes.

Check with the user that these modules match their expectations. Check with the user which modules they want tests written for, and at what boundary.

### 6. Write the PRD

Once you have a complete understanding of the problem and solution, write the PRD using the template below. Store it at `apps/<app>/docs/prd/<feature-name>.md`.

**Ask the user to review and approve the PRD before proceeding to the next workflow step.**

<prd-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested and at what boundary
- Prior art for the tests (i.e. similar types of tests in the codebase)
- Testing approach per module (unit, integration, E2E)

## Out of Scope

A description of the things that are out of scope for this PRD.

## Domain Terms

Key domain terms used in this PRD (reference CONTEXT.md for full glossary):

- **Term**: Definition

## Further Notes

Any further notes about the feature.

</prd-template>
