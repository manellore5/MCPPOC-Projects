# Implementation Plan — `findanadvisor` Elicitation Fallback

**PRD:** [`apps/findanadvisor/docs/prd/elicitation-fallback.md`](../prd/elicitation-fallback.md) — refer back for domain language, user stories, decisions, and rejected alternatives.

**Status:** Plan draft, awaiting approval. Nothing is committed.

---

## 1. Objective

Make `show_advisor_form` a dual-mode MCP tool that branches on the connected client's declared `elicitation` capability:

- **Elicitation-capable clients (Claude Desktop, etc.):** issue a single `elicitInput` request carrying the full `InvestorProfile` JSON Schema. On `accept`, return `structuredContent: { userProfile }` + a text confirmation. On any non-`accept` outcome (decline / cancel), return a soft text message with no `structuredContent` and no `isError`.
- **Non-elicitation clients (Nanobot today):** return the existing `ui://findanadvisor/advisor-form` resource exactly as today. Bit-for-bit unchanged.

All work is TDD: each new branch is added test-first, the existing iframe-branch tests stay green throughout as the regression guarantee.

---

## 2. Technical approach (summary)

| Concern                           | Approach                                                                                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch discriminator              | `server.server.getClientCapabilities()?.elicitation` — present (any value) → elicitation; absent → iframe. Captured at tool-handler invocation time (post-handshake snapshot).                     |
| Elicitation request               | Single `server.server.elicitInput({ message, requestedSchema })` call carrying the full 5-field profile schema. Multi-field; Claude Desktop renders as a paginated wizard.                         |
| `requestedSchema` source of truth | Derived at module-load time from the existing `InvestorProfileSchema` Zod object in `server/src/data/schema.ts` via `zod-to-json-schema` so wizard fields can never drift from iframe form fields. |
| Response shape on `accept`        | `structuredContent: { userProfile }` + text block confirming by name. No call to the matcher (symmetric with the iframe path which also only collects).                                            |
| Response shape on non-`accept`    | `content[]` with one text block; no `structuredContent`, no `isError`.                                                                                                                             |
| Iframe-branch behavior            | Untouched. Existing code path moved into an `if (no elicitation cap)` arm. Existing tests act as the regression suite.                                                                             |
| Test harness extension            | `setupMcpClient(opts)` gains an `elicitation?: { handler }` option. When set, the test `Client` declares `capabilities.elicitation = {}` and registers `handler` to respond to `ElicitRequest`.    |

### What this is NOT

- Not changing `match_advisors`, the matcher, the data loader, the API, the React form, or `nanobot.yaml`.
- Not introducing host-name detection, env-var branch overrides, or sampling/roots capability handling.
- Not hosting the iframe form anywhere durable — `localhost:5173` requirement stays.

---

## 3. File-level changes

```
apps/findanadvisor/
├── server/
│   ├── src/
│   │   └── mcp/
│   │       └── tools/
│   │           └── show-advisor-form.ts       ← MODIFIED: add capability branch + elicitation arm
│   ├── tests/
│   │   ├── helpers/
│   │   │   └── mcp-client.ts                  ← MODIFIED: add elicitation opt-in to setupMcpClient
│   │   └── mcp/
│   │       └── show-advisor-form.test.ts      ← MODIFIED: add elicitation tests; keep iframe tests as regression
│   └── package.json                           ← MODIFIED: add zod-to-json-schema dep
└── docs/
    ├── prd/elicitation-fallback.md            ← ALREADY EXISTS
    ├── plans/elicitation-fallback.md          ← THIS FILE
    └── issues/elicitation-fallback/           ← Step 3 will populate
```

No new files. No deletions. Production code change is confined to one file (`show-advisor-form.ts`).

---

## 4. Dependencies

### Added to `apps/findanadvisor/package.json`

| Package              | Type    | Why                                                                                                                                                                                                |
| -------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zod-to-json-schema` | runtime | Convert the existing `InvestorProfileSchema` Zod object into a JSON Schema for the `requestedSchema` field of the elicitation request. Avoids hand-maintaining a second copy of the profile shape. |

No other new packages. `@modelcontextprotocol/sdk` is already at `^1.24.3`, which exposes elicitation on both server and client sides.

### Why not hand-write the JSON Schema

The schema is small (5 fields), so hand-writing is tempting. Rejected because:

1. The Zod schema is the existing source of truth (used by `match_advisors` for input validation) — drift would silently break the wizard or the matcher boundary.
2. `zod-to-json-schema` is ~7 KB, zero-dependency, well-maintained, and produces JSON Schema draft-7 which Claude Desktop renders cleanly.
3. Adding a sync test for hand-written drift costs about the same in code as just using the package.

---

## 5. Risks & mitigations

| Risk                                                                                                                                                               | Severity | Mitigation                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MCP SDK `elicitInput` signature differs from assumption (e.g. it lives at `server.elicitInput` vs `server.server.elicitInput`)                                     | Medium   | Verify in Task 1 by reading `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js`. If the surface differs from this plan, update Task 1's adapter without rewriting later tasks — they only depend on the result shape.                                                    |
| `getClientCapabilities()` returns `undefined` mid-handler if called before handshake completes                                                                     | Low      | Tool handlers only run _after_ handshake by protocol guarantee. Defensive: treat `undefined` and missing `elicitation` field identically — fall through to iframe branch. Test asserts both.                                                                                         |
| `zod-to-json-schema` output uses a JSON Schema dialect (`$ref`, `definitions`, `additionalProperties: false`) that Claude Desktop's wizard renderer doesn't handle | Medium   | Configure the converter with `target: "openApi3"` or `target: "jsonSchema7"` plus `$refStrategy: "none"` so the output is a flat inline schema. Manual smoke (Task 5) confirms wizard renders. Fallback: hand-write the schema with a Zod-derived shape test.                        |
| `elicitInput` returns an unknown future `action` value (spec evolves)                                                                                              | Low      | Branch on `action === "accept"` strictly; everything else → soft cancel. Documented in PRD. No breakage.                                                                                                                                                                             |
| Elicitation-capable test client doesn't actually trigger the `elicitInput` flow because the SDK requires extra setup beyond declaring the capability               | Medium   | Read SDK client docs in Task 0; the SDK should support `client.setRequestHandler(ElicitRequestSchema, handler)`. If not, replace with a lower-level transport interceptor. Acceptance for Task 0 is "the test handler is invoked at least once when the elicitation tool is called." |
| Claude Desktop ignores or partially renders a multi-field schema (e.g. only renders enum fields, drops string/number fields)                                       | Medium   | Manual smoke (Task 5) confirms all 5 fields appear and submit cleanly. If a field is skipped: file as a separate issue, not a fix in this plan.                                                                                                                                      |
| Iframe-branch regression — refactoring shared code accidentally changes the response shape Nanobot expects                                                         | High     | Existing 4 iframe-branch tests are the regression suite. They run unchanged through every task; any failure stops the task.                                                                                                                                                          |
| `JSON.stringify` of `userProfile` in the confirmation text leaks an ugly format into the chat                                                                      | Low      | Format the text manually: `Got profile for <name>: <city>, $<budget>, interested in <…>, risk <…>.` Not a JSON dump.                                                                                                                                                                 |

---

## 6. Task breakdown (vertical tracer-bullet slices, dependency-ordered)

Each task is a tracer bullet: failing test first → minimum production code → refactor → green. No batching. No "write all tests upfront."

### Task 0 — **SDK reconnaissance** [AFK]

- Read `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts` and `…/server/index.d.ts` to confirm:
  - The exact method signature for issuing an elicitation request from the server side.
  - How to read declared client capabilities from the server side after handshake.
- Read `…/client/index.d.ts` to confirm:
  - How a `Client` declares `elicitation` capability at construction.
  - How to register a handler that responds to elicitation requests on the client side.
- Document findings as a 5-line comment block in `server/tests/helpers/mcp-client.ts` (will be removed at end of feature).
- **Depends on:** nothing.
- **Acceptance:** A short note (in conversation, not committed) confirming the API surface matches plan §2 — or a flagged delta the user signs off on before Task 1.

### Task 1 — **Test harness: elicitation-capable client variant** [AFK]

- Extend `setupMcpClient(opts)` in `server/tests/helpers/mcp-client.ts` to accept:
  ```ts
  opts.elicitation?: {
    handler: (request: ElicitRequest) => Promise<ElicitResult>;
  }
  ```
- When `opts.elicitation` is set: construct the `Client` with `capabilities: { elicitation: {} }` and `setRequestHandler(ElicitRequestSchema, opts.elicitation.handler)` before connecting.
- TDD: red test asserts that, given a recording handler, calling any tool that issues `elicitInput` causes the handler to be invoked exactly once with the expected `requestedSchema`. Make the test red first (no production code change yet).
- Then implement the harness extension — green.
- **Depends on:** Task 0.
- **Acceptance:** Harness test is green; existing iframe-branch tests still pass without modification.

### Task 2 — **Elicitation branch happy path: accept → structured profile** [AFK]

- Add a Zod-derived JSON schema constant at top of `show-advisor-form.ts`: `const PROFILE_REQUESTED_SCHEMA = zodToJsonSchema(InvestorProfileSchema, { target: "jsonSchema7", $refStrategy: "none" });`
- Add the capability-detection branch: if `getClientCapabilities()?.elicitation` is truthy → call `elicitInput({ message, requestedSchema: PROFILE_REQUESTED_SCHEMA })`; otherwise → existing iframe code path (untouched).
- TDD: red test — `setupMcpClient({ elicitation: { handler: () => ({ action: "accept", content: VALID_PROFILE }) } })` → call `show_advisor_form` → assert `structuredContent.userProfile` deep-equals `VALID_PROFILE` and `content[0].type === "text"` with name in the text.
- Implement just enough to make it pass.
- **Depends on:** Task 1.
- **Acceptance:** Happy-path test green; all 4 existing iframe-branch tests still green.

### Task 3 — **Elicitation request schema shape test** [AFK]

- TDD: red test — recording handler captures the `requestedSchema` argument; assert it has the 5 expected properties with correct `type`, correct `enum`s for location/investmentTypes/riskLevel, `minimum: 100` on budget, `minLength: 1` on name, `minItems: 1` on investmentTypes, and a `required` array containing all 5 field names.
- If the test fails because `zod-to-json-schema` output doesn't match, adjust converter options (`target`, `$refStrategy`, etc.) until shape matches. If no option configuration works, fall back to hand-written schema (per §4 risk row).
- **Depends on:** Task 2.
- **Acceptance:** Schema-shape test green.

### Task 4 — **Cancel and decline paths: soft text** [AFK]

- TDD red #1: handler returns `{ action: "decline" }` → assert tool result has no `structuredContent`, has `content[0].type === "text"` matching `/canceled/i`, and has no `isError` set.
- TDD red #2: same shape for `{ action: "cancel" }`.
- Make both green by treating `action !== "accept"` as soft cancel.
- **Depends on:** Task 2.
- **Acceptance:** Both cancel-path tests green; happy-path and schema-shape tests still green; iframe-branch tests still green.

### Task 5 — **Manual smoke (HITL)** [HITL]

Manual checklist run by the user (no automation):

1. **Build:** `npm run build:server --workspace apps/findanadvisor` produces a fresh `server/dist/mcp/index.js`.
2. **Restart Claude Desktop** fully (quit from system tray; relaunch).
3. **Verify connector:** Settings → Local MCP servers → `findanadvisor` shows `running`.
4. **Happy path:** Open a new chat. Prompt: _"Help me find a financial advisor."_ Confirm a multi-step wizard appears with all 5 fields. Fill it. Submit. Confirm Claude follows up with `match_advisors` and returns ranked advisors.
5. **Cancel path:** Repeat. Close the wizard mid-flow. Confirm Claude responds with a soft acknowledgment, no error, no apology spiral.
6. **Nanobot regression:** `npm run dev:client` (Vite must be up). `npm run nanobot`. Ask the agent to find an advisor. Confirm the iframe form still renders and submitting still produces matches via the existing flow.

- **Depends on:** Tasks 1–4.
- **Acceptance:** User signs off on all 6 steps.

---

## 7. Execution order / parallelism

Tasks are dependency-linear. No parallelism opportunities — each task touches the same file (`show-advisor-form.ts` or its test). Recommended order: **0 → 1 → 2 → 3 → 4 → 5**.

Total tasks: **6**. Estimated tracer bullets: **5** (Tasks 0–4). HITL checkpoint: **1** (Task 5).

---

## 8. Testing strategy (brief)

Full matrix in PRD §Testing Decisions. At the plan level:

- **TDD non-negotiable.** One failing test → minimum production code → refactor.
- **Reuses existing harness.** No new test framework, no new patterns. The only addition is an opt-in `elicitation` config on `setupMcpClient`.
- **Iframe-branch tests are the regression suite.** All 4 existing tests must stay green untouched throughout. Any task that breaks them stops.
- **No Playwright / E2E.** Wizard rendering is Claude Desktop's job; testing it is out of scope. Manual smoke is the only acceptance for the rendered UX.
- **No mocked MCP clients.** Real SDK Client class talking to a real subprocess server, exactly as today.

---

## 9. Out of scope for this plan

- Renaming `show_advisor_form`.
- Hosting the iframe form on a durable URL (removing the `localhost:5173` Vite dependency).
- Capability detection for sampling, roots, or any non-elicitation feature.
- Configurable preference order if a host declares both `elicitation` and `mcp-ui` rendering — current design always prefers elicitation when available.
- Per-field elicitation (one `elicitInput` per field). Single multi-field schema only.
- E2E or Playwright coverage of the Claude Desktop wizard.
- Changes to `match_advisors`, the matcher, the data loader, the API, the React form, or `nanobot.yaml`.

---

## 10. Validation gates per task

Every tracer-bullet task must pass these before moving on:

1. **Tests pass:** `npm test --workspace apps/findanadvisor` is green (new tests + existing iframe-branch tests).
2. **Type check:** `npm run typecheck --workspace apps/findanadvisor` is clean.
3. **Lint:** `npm run lint --workspace apps/findanadvisor` is clean.
4. **Issue marked done** in `apps/findanadvisor/docs/issues/elicitation-fallback/<feature-file>.md` (Step 3 output).
5. **Implementation notes** captured in the issue file (what was built, any deviations from plan, any SDK surface deltas from Task 0).

No commits during implementation per `CLAUDE.md` no-commits-yet rule. Commits only when the user explicitly asks.

---

## 11. Open questions requiring confirmation before Step 3 (Issues)

Two small ones — answer inline or say "your call" and I'll pick:

1. **`zod-to-json-schema` vs hand-written schema.** Plan defaults to the package (one new dep, no drift risk). Acceptable, or hand-write with a sync test instead?
2. **Issue file format.** Per your memory ("Consolidate issues into one file"), Step 3 will produce a single `apps/findanadvisor/docs/issues/elicitation-fallback/elicitation-fallback.md` with each task as a `##` section, not 6 separate files. Confirming this is still your preference.

If both answers are "as planned," I move to Step 3 on your approval.
