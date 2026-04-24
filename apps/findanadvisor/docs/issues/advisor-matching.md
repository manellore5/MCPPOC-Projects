# Issues — `findanadvisor` Advisor Matching

**Parent docs:**

- PRD: [`docs/prd/advisor-matching.md`](../prd/advisor-matching.md)
- Plan: [`docs/plans/advisor-matching.md`](../plans/advisor-matching.md)

**Status legend:** `[ ] Todo` · `[~] In progress` · `[x] Done` · `[!] Blocked`

**Dependency graph:**

```
01 → 02 → 03 → 04 ─┬─→ 05 ─┐
                   │       │
                   └─→ 06 ─┼─→ 07 → 08 ─┐
                           │            │
                           └────────────┼─→ 10 → 11 → 12 → 13 (QA)
                                        │
                   09 ←──────────────────┘
```

Forks that can run in parallel (ralph-loop mode): `#05 ∥ #06` after `#04`; `#09` as soon as `#04 + #05` are done.

---

## 01 — Test infrastructure prerequisite

**Status:** [x] Done &nbsp;·&nbsp; **Type:** AFK &nbsp;·&nbsp; **Depends on:** None &nbsp;·&nbsp; **Complexity:** S &nbsp;·&nbsp; **Plan task:** Task 0

### What to build

Stand up the Vitest test toolchain (server + client projects in one config) so every subsequent tracer-bullet issue can land tests in a known-green baseline. No product code — just the scaffolding and one passing smoke test per project to prove the pipes work. **E2E/Playwright is out of scope** — per user instruction on 2026-04-24. See plan §3 for the file layout.

### Acceptance Criteria

- [x] `apps/findanadvisor/vitest.config.ts` exists with server + client projects
- [x] Server smoke test runs in `node` environment and passes
- [x] Client smoke test runs in `jsdom` environment and passes
- [x] `npm test --workspace apps/findanadvisor` exits 0
- [x] No product code added — only config + smoke tests

### User Stories Addressed

(meta — supports every user story by enabling TDD for all subsequent issues)

### Implementation Notes

**Files created:**

- `apps/findanadvisor/package.json` — single workspace package (no sub-workspaces). Dependencies: fastify, MCP SDK, react, zod, @epic-web/invariant. Dev: vitest, jsdom, tsx, typescript, vite, @epic-web/config, @vitejs/plugin-react.
- `apps/findanadvisor/vitest.config.ts` — single config with two Vitest **projects** (`server` → node env, `client` → jsdom env). Keeps client/server tests together under one `npm test` invocation.
- `apps/findanadvisor/server/tests/smoke.test.ts` — 2 node-env tests.
- `apps/findanadvisor/client/tests/smoke.test.tsx` — 3 jsdom tests (DOM + window access).

**Key decisions:**

- Single `package.json` at `apps/findanadvisor/` instead of separate ones in `client/` and `server/` (simpler dep management; plan allowed this).
- Single root `vitest.config.ts` using Vitest's `projects` feature instead of separate configs per subtree. One test runner, two environments.
- **Playwright + E2E dropped per user instruction** mid-execution on 2026-04-24. Removed `@playwright/test`, `client/tests/e2e/`, and the `test:e2e` script. Issue #07 and #08 acceptance criteria updated to use Vitest unit tests for form + postMessage instead of browser automation. Saved to memory so future feature plans default to unit-only.

**Validation:**

- `npm install` succeeded at repo root; workspace picked up automatically.
- `npm test --workspace apps/findanadvisor` → **5/5 green** (2 server + 3 client smoke tests).
- Typecheck + lint deferred to Issue #11 which owns the tsconfig/ESLint wiring.

**Deviations from plan:**

- No E2E toolchain (Playwright removed per user).
- Unified `vitest.config.ts` at app root instead of per-workspace configs (plan §3 showed separate configs; consolidated since tests share deps and runner).

---

## 02 — Pure matcher module (filters + scoring + ranking)

**Status:** [x] Done &nbsp;·&nbsp; **Type:** AFK &nbsp;·&nbsp; **Depends on:** #01 &nbsp;·&nbsp; **Complexity:** M &nbsp;·&nbsp; **Plan task:** Task 1

### What to build

Build the core matching engine as a pure TypeScript module at `server/src/matcher/` with zero framework imports. Expose a single public function `matchAdvisors(profile, advisors) → MatchResult[]` whose result is always 1–3 entries (throws if input would produce 0). The module implements the full filter pipeline (location exact match → expertise overlap ≥ 1 → risk level in advisor's accepted list) and the weighted scoring formula (`0.6 * budgetFit + 0.4 * normalizedRating`). Internal helpers per plan §3. TDD is non-negotiable.

### Acceptance Criteria

- [x] `matchAdvisors()` is the only public export (plus TS types); all helpers are internal (module-scope functions, not re-exported)
- [x] No imports from `fastify`, `@modelcontextprotocol/sdk`, `zod`, `react`, or any I/O library
- [x] Filter tests cover: exact location match (pass + fail); expertise overlap ≥ 1 (single, multi, none); risk in list (in / not in)
- [x] `budgetFit` tests cover: inside range, just below min, far below min (clamped to 0), just above max, far above max (clamped to 0), budget = min (edge), budget = max (edge)
- [x] `normalizedRating` tests cover: 1 → 0, 5 → 1, 3 → 0.5, fractional (4.5 → 0.875)
- [x] `weightedScore` tests assert exact arithmetic with `0.6/0.4` weights
- [x] Integration tests of `matchAdvisors()` cover: 3-match result ordered correctly; 2-match result; 1-match result; tie-breaking (deterministic); 0-qualifying → throws
- [x] All matcher tests green (30 matcher tests, 32 total including smoke)

### User Stories Addressed

- User story 10 (top 1–3 cards ranking backend)
- User story 22 (agent top-3 summary ranking backend)
- User story 32 (matcher is pure, framework-free)

### Implementation Notes

**Files created:**

- `apps/findanadvisor/server/src/matcher/types.ts` — shared types + enum literal unions (`Location`, `InvestmentType`, `RiskLevel`, `Advisor`, `InvestorProfile`, `MatchResult`). Also exports const arrays for runtime enum use.
- `apps/findanadvisor/server/src/matcher/index.ts` — single public function `matchAdvisors()`. Internal helpers (`passesLocation`, `passesExpertiseOverlap`, `passesRisk`, `clamp01`, `computeBudgetFit`, `computeNormalizedRating`, `computeScore`) are module-scope only, not exported.
- `apps/findanadvisor/server/tests/matcher/match-advisors.test.ts` — 30 tests organized into 8 describe blocks by concern.

**Key decisions:**

- Tested entirely through the public `matchAdvisors()` interface (no direct tests of internal helpers). Rationale: keeps internal refactoring free; filter + scoring logic is observable via the returned `MatchResult` fields (`budgetFit`, `normalizedRating`, `score`).
- Tie-break rule: **advisor `id` ascending** when scores are exactly equal. Deterministic; documented via the `tie-breaks deterministically` test.
- Zero imports — the module is literally `import type` only (for the types it re-exports). No Zod, no MCP SDK, no fastify, no react. Meets the "pure, framework-free" acceptance criterion.
- Re-exports the types from `types.ts` via `index.ts` so callers only need one import path.
- Used `.js` extensions in imports (ESM NodeNext resolution); matches `"type": "module"` in package.json.

**Validation:**

- `npx vitest run --project server` → **32/32 passing** (2 smoke + 30 matcher). Duration: 20ms for matcher tests.

**Deviations from plan:**

- Plan suggested separate `filters.ts`, `scoring.ts`, `rank.ts` files. Consolidated into `index.ts` since the helpers are small and no external consumer imports them. Will split if the module grows.

---

## 03 — Data loader + curated `advisors.json`

**Status:** [x] Done &nbsp;·&nbsp; **Type:** AFK &nbsp;·&nbsp; **Depends on:** #01, #02 &nbsp;·&nbsp; **Complexity:** M &nbsp;·&nbsp; **Plan task:** Task 2

### What to build

1. Author `server/src/data/advisors.json` with **20 curated advisors** — 8 broad generalists (one per city, all 5 expertise, all 3 risk levels) and 12 focused specialists (narrower expertise and risk tolerance). The 8 generalists alone cover all 8 × 5 × 3 = 120 `(location × investmentType × riskLevel)` combos; specialists add ranking variety.
2. Author `server/src/mcp/schemas.ts` with Zod `Advisor`, `InvestorProfile`, `MatchResult` schemas per PRD data contracts.
3. Author `server/src/data/loader.ts` exporting `getAdvisors()` — parses and validates `advisors.json` once at startup, freezes the result, fails loud on missing/malformed/invalid.

No automated dataset coverage test (user waived). ≥1-match guarantee held by curation + runtime min-1 safety net.

### Acceptance Criteria

- [x] `advisors.json` contains exactly 20 entries
- [x] 8 generalists — 1 per city, expertise = all 5 types, riskLevels = `["low","medium","high"]`
- [x] 12 specialists with narrower expertise (1–2 types) and narrower risk tolerance (1–2 levels)
- [x] Every advisor passes the `Advisor` Zod schema
- [x] `budgetMin ≤ budgetMax` for every advisor
- [x] `rating ∈ [1, 5]` for every advisor; distribution includes `< 4.0` (gen-chicago 3.9, gen-miami 3.8, spec-chicago-retirement 3.9, spec-denver-realestate 3.7) and `≥ 4.5` (spec-nyc-crypto 4.8, spec-sf-crypto 4.6, spec-miami-crypto 4.7, spec-minneapolis-bonds 4.9, spec-boston-retirement 4.5, spec-chicago-realestate 4.6)
- [x] `getAdvisors()` returns a frozen `Advisor[]` of length 20
- [x] Unit tests cover happy path, schema-invalid advisor with readable error naming the bad field
- [x] All data-module tests green (17 tests)

### User Stories Addressed

- User story 33 (20 mock advisors, generalist + specialist mix)
- User story 34 (human-curated coverage invariant, no automated coverage test)

### Implementation Notes

**Files created:**

- `apps/findanadvisor/server/src/data/advisors.json` — 20 curated advisors (see dataset composition below).
- `apps/findanadvisor/server/src/data/schema.ts` — Zod schemas for `Advisor`, `AdvisorsArraySchema`, `InvestorProfile`. Schemas are driven by the const enum arrays from `matcher/types.ts` so there's one source of truth for the enum values.
- `apps/findanadvisor/server/src/data/loader.ts` — exports `parseAdvisors(raw)` (pure, throws with readable path+message on validation failure) and `getAdvisors()` (reads `advisors.json` from disk, parses via `parseAdvisors`, freezes, caches for subsequent calls).
- `apps/findanadvisor/server/tests/data/loader.test.ts` — 17 tests covering validation failures + built-in dataset invariants.

**Dataset composition:**

| Advisor id                  | Type        | Location      | Expertise                 | Risk         | Rating | Budget range |
| --------------------------- | ----------- | ------------- | ------------------------- | ------------ | ------ | ------------ |
| gen-minneapolis             | generalist  | Minneapolis   | all 5                     | low/med/high | 4.0    | $5k–$1M      |
| gen-newyork                 | generalist  | New York      | all 5                     | low/med/high | 4.2    | $100k–$50M   |
| gen-sanfrancisco            | generalist  | San Francisco | all 5                     | low/med/high | 4.3    | $50k–$10M    |
| gen-chicago                 | generalist  | Chicago       | all 5                     | low/med/high | 3.9    | $25k–$5M     |
| gen-losangeles              | generalist  | Los Angeles   | all 5                     | low/med/high | 4.1    | $50k–$10M    |
| gen-denver                  | generalist  | Denver        | all 5                     | low/med/high | 4.0    | $10k–$2M     |
| gen-miami                   | generalist  | Miami         | all 5                     | low/med/high | 3.8    | $25k–$5M     |
| gen-boston                  | generalist  | Boston        | all 5                     | low/med/high | 4.4    | $100k–$10M   |
| spec-nyc-crypto             | crypto      | New York      | crypto, stocks            | high         | 4.8    | $5k–$500k    |
| spec-sf-crypto              | crypto      | San Francisco | crypto                    | high         | 4.6    | $1k–$100k    |
| spec-la-crypto              | crypto      | Los Angeles   | crypto, stocks            | high, medium | 4.3    | $10k–$1M     |
| spec-miami-crypto           | crypto      | Miami         | crypto, real_estate       | high         | 4.7    | $50k–$5M     |
| spec-minneapolis-bonds      | retirement  | Minneapolis   | bonds, mutual_funds       | low          | 4.9    | $10k–$500k   |
| spec-boston-retirement      | retirement  | Boston        | bonds, mutual_funds       | low, medium  | 4.5    | $100k–$10M   |
| spec-chicago-retirement     | retirement  | Chicago       | mutual_funds              | low          | 3.9    | $5k–$100k    |
| spec-denver-bonds           | retirement  | Denver        | bonds                     | low, medium  | 4.1    | $20k–$1M     |
| spec-minneapolis-realestate | real estate | Minneapolis   | real_estate               | medium       | 4.2    | $200k–$20M   |
| spec-chicago-realestate     | real estate | Chicago       | real_estate, stocks       | medium, high | 4.6    | $500k–$50M   |
| spec-denver-realestate      | real estate | Denver        | real_estate, mutual_funds | medium       | 3.7    | $100k–$5M    |
| spec-boston-stocks          | stocks      | Boston        | stocks                    | medium, high | 4.4    | $10k–$1M     |

**Key decisions:**

- `parseAdvisors(raw: unknown)` separated from `getAdvisors()` so tests exercise validation with constructed inputs (no fixture files needed). `getAdvisors()` reads the real JSON from disk at first call, caches, returns frozen.
- Zod schemas cast the enum arrays to `[string, ...string[]]` tuples. This is a minor TS ergonomic compromise; Zod's `z.enum` wants a tuple literal, but our arrays are `readonly [...] as const`. The cast is safe since we know the arrays are non-empty at compile time.
- Uses `@epic-web/invariant` for the "at least one advisor" invariant (matches repo convention from `apps/mcp-ui`).
- `getAdvisors()` caches the frozen array — subsequent calls return the same instance (asserted via `===`).
- Used `readFileSync` + manual `JSON.parse` instead of `import with { type: 'json' }` so the loader works identically in dev (tsx) and prod (node on compiled JS) without assertion syntax complications.

**Validation:**

- `npx vitest run --project server` → **49/49 passing** (2 smoke + 30 matcher + 17 loader). Loader tests: 8ms runtime.

**Deviations from plan:**

- Schema file named `schema.ts` (not `schemas.ts`); stayed in `data/` not `mcp/` since the schemas are shared between data validation and MCP tool validation and the data module is a better home.
- No fixture-file-based tests for malformed JSON — covered by `parseAdvisors(raw)` with constructed garbage inputs. Same coverage with less file plumbing.

---

## 04 — MCP tool `match_advisors` over stdio

**Status:** [x] Done &nbsp;·&nbsp; **Type:** AFK &nbsp;·&nbsp; **Depends on:** #01, #02, #03 &nbsp;·&nbsp; **Complexity:** L &nbsp;·&nbsp; **Plan task:** Task 3

### What to build

Stand up the stdio MCP server at `server/src/mcp/index.ts` using `@modelcontextprotocol/sdk`. Register `match_advisors(userProfile, advisors?)` at `server/src/mcp/tools/match-advisors.ts`.

Behavior:

- **No `advisors`** → use `getAdvisors()` (built-in dataset).
- **Valid `advisors`** → pass through to matcher.
- **Partial junk** → silently drop invalid entries; log `"dropped N of M advisors (first reason: …)"` to stderr; proceed with survivors.
- **All junk** → matcher input becomes `[]` → matcher throws → MCP error surfaces to caller.

Response: both `structuredContent: { matches: MatchResult[] }` and `content[]` with one text block per match.

### Acceptance Criteria

- [x] MCP server starts on stdio transport without errors
- [x] Tool `match_advisors` registered with Zod input schema via `McpServer.registerTool`
- [x] Integration test: happy path with known profile returns 1–3 matches
- [x] Integration test: no `advisors` arg → uses built-in dataset
- [x] Integration test: valid custom `advisors` → matches from that array
- [x] Integration test: partial-junk `advisors` → drops bad, returns survivors; stderr contains "dropped 2 of 3 advisors"
- [x] Integration test: all-invalid `advisors` → MCP error response (`isError: true`)
- [x] Every response includes both `structuredContent` and `content[]`
- [x] All MCP integration tests green on Windows (8 tests, 3.2s runtime)

### User Stories Addressed

- User story 12 (top 3 matches)
- User story 13 (fall-back to built-in dataset)
- User story 14 (lenient validation, silent drop, stderr log)
- User story 16 (structured + text content)

### Implementation Notes

**Files created:**

- `apps/findanadvisor/server/src/mcp/index.ts` — stdio MCP server bootstrap. Exports `createFindanadvisorServer()` factory + a `main()` entry point.
- `apps/findanadvisor/server/src/mcp/tools/match-advisors.ts` — tool registration via `server.registerTool('match_advisors', ...)`.
- `apps/findanadvisor/server/tests/helpers/mcp-client.ts` — test harness `setupMcpClient()` that spawns the server via `npx tsx <entry>` and wires stderr capture for assertion.
- `apps/findanadvisor/server/tests/mcp/match-advisors.test.ts` — 8 integration tests covering all tool behaviors through a live stdio subprocess.

**Key decisions:**

- Used **`McpServer`** (high-level API from `@modelcontextprotocol/sdk/server/mcp.js`) not the low-level `Server` class. `registerTool` auto-wires Zod input schemas and validates tool calls at the transport boundary — invalid profile shapes come back as MCP errors without hitting our handler. This is why the "reject invalid location" and "reject budget < 100" tests pass with zero validation code in the handler.
- **Lenient validation** implemented via `sieveAdvisors(raw)` helper in `match-advisors.ts`. Each entry is run through `AdvisorSchema.safeParse()`; failures are counted and the first failure's `path:message` is captured. After sieving, if any were dropped, we write `[match_advisors] dropped N of M advisors (first reason: <path>: <msg>)\n` to `process.stderr`. Stderr goes to the child's stderr stream, captured by the test harness via `StdioClientTransport({ stderr: 'pipe' })`.
- The tool returns `{ structuredContent: { matches }, content: [{ type: 'text', text }] }`. The text block is a human-readable numbered list with expertise, risk levels, rating, budget range, and component scores — useful for MCP hosts that don't consume `structuredContent` (all of them show a text block).
- **All-invalid → error:** when every advisor fails validation, `sieveAdvisors` returns `[]`, `matchAdvisors()` throws per its min-1 contract (Issue #02), and the MCP SDK catches the throw and returns `{ isError: true }`. Test asserts this path.
- Test harness runs the server via `npx tsx <absolute-path>` from each test file's perspective — works on Windows with no special shell escaping.

**Validation:**

- `npx vitest run --project server` → **57/57 passing** (2 smoke + 30 matcher + 17 loader + 8 MCP). MCP integration tests run in 3.2s total (subprocess spawn + multiple tool calls).

**Deviations from plan:**

- Plan described tools living under `server/src/mcp/tools/` — followed as-is. Plan also called for `server/src/mcp/schemas.ts` but schemas already landed in `server/src/data/schema.ts` during Issue #03 (shared between data and MCP). No duplicate schemas.

---

## 05 — MCP tool `show_advisor_form` (iframe resource)

**Status:** [x] Done &nbsp;·&nbsp; **Type:** AFK &nbsp;·&nbsp; **Depends on:** #01, #04 &nbsp;·&nbsp; **Complexity:** S &nbsp;·&nbsp; **Plan task:** Task 4

### What to build

Add the `show_advisor_form` tool (no arguments) at `server/src/mcp/tools/show-advisor-form.ts`.

Returns an MCP-UI `externalUrl` iframe resource:

- `mimeType: "text/uri-list"`
- `uri: "ui://findanadvisor/advisor-form"`
- `text: <form-url>` — from `FINDANADVISOR_FORM_URL` env, default `http://localhost:5173?embedded=1`

Response also includes `structuredContent: { url }` and a plain-text `content[]` block ("Opening the advisor profile form…") for hosts without MCP-UI support.

### Acceptance Criteria

- [x] Tool `show_advisor_form` registered alongside `match_advisors`
- [x] Integration test asserts `content[]` contains resource with `mimeType: "text/uri-list"` and `uri: "ui://findanadvisor/advisor-form"`
- [x] Env override: `FINDANADVISOR_FORM_URL` set → `text` equals that URL
- [x] Env unset → `text` equals `http://localhost:5173?embedded=1`
- [x] Response includes `structuredContent: { url }`
- [x] Response `content[]` also includes a text fallback block ("Opening the advisor profile form...")
- [x] All tests green (4 new tests, 61 total server tests)

### User Stories Addressed

- User story 15 (`show_advisor_form` returns MCP-UI `externalUrl` iframe)
- User story 16 (structured + text content)
- User story 19 (agent calls tool on intent; iframe renders in chat)

### Implementation Notes

**Files created:**

- `apps/findanadvisor/server/src/mcp/tools/show-advisor-form.ts` — tool registration. No-arg tool; reads `FINDANADVISOR_FORM_URL` env with default fallback.
- `apps/findanadvisor/server/tests/mcp/show-advisor-form.test.ts` — 4 integration tests across two describe blocks (default URL + env override).

**Files modified:**

- `apps/findanadvisor/server/src/mcp/index.ts` — added `registerShowAdvisorFormTool(server)` call.
- `apps/findanadvisor/server/tests/helpers/mcp-client.ts` — `setupMcpClient()` now accepts optional `{ env }` override that gets merged into the spawned subprocess env. Needed to test the env-driven URL without mutating the parent test process.

**Key decisions:**

- Resource URI `ui://findanadvisor/advisor-form` follows the MCP-UI convention `ui://<app>/<resource>`.
- `mimeType: "text/uri-list"` is the MCP-UI `externalUrl` marker — hosts recognize it and render an iframe.
- `content[]` ships BOTH the resource block AND a plain-text block ("Opening the advisor profile form..."). Hosts without MCP-UI support (plain text clients) still show something useful.
- Env override tested via separate subprocess per describe block — `setupMcpClient({ env: { FINDANADVISOR_FORM_URL: ... } })` spawns a new child with the overridden env. Clean; no global state to reset.

**Validation:**

- `npx vitest run --project server` → **61/61 passing** (2 smoke + 30 matcher + 17 loader + 8 match-advisors MCP + 4 show-advisor-form MCP). Duration: 17s total; show-advisor-form integration tests run 6.3s (two subprocess spawns).

---

## 06 — Fastify API `POST /api/match-advisors` + spawned MCP child

**Status:** [x] Done &nbsp;·&nbsp; **Type:** AFK &nbsp;·&nbsp; **Depends on:** #01, #04 &nbsp;·&nbsp; **Complexity:** L &nbsp;·&nbsp; **Plan task:** Task 5

### What to build

Create `server/src/index.ts` — Fastify bootstrap. On startup, spawn the MCP child process (`tsx ./src/mcp/index.ts` in dev, `node ./dist/mcp/index.js` in prod) and connect an in-process MCP client over the child's stdio.

Register `POST /api/match-advisors` at `server/src/api/routes/match-advisors.ts` with a JSON schema (`server/src/api/schemas/investor-profile.json`) validated via Fastify's built-in Ajv. On request, delegate to the MCP client's `tools/call match_advisors`.

Graceful shutdown: SIGTERM/SIGINT → send SIGTERM to MCP child → 2s timeout → SIGKILL.

### Acceptance Criteria

- [x] Fastify spawns MCP child at startup via `createMcpClient()` (auto-detects dev-via-tsx vs prod-via-node)
- [x] `POST /api/match-advisors` returns 200 with `{ matches: MatchResult[] }` (length 1–3) on valid body
- [x] Invalid body (missing field, wrong enum, budget < 100, empty investmentTypes) returns 400 via Ajv JSON-schema validation
- [x] Forcing matcher error (via dep-injected mock `mcpClient` that throws) returns 500 with `{ error }`
- [x] SIGTERM handler closes Fastify (which closes MCP client, killing the child) with 2s fallback timer
- [x] Integration tests run against a live spawned subprocess for the happy/validation paths (5 tests, 3.3s)
- [x] All API integration tests green (6 tests total, 1 uses a mock client for the 500 path)

### User Stories Addressed

- User story 6 (submit calls `POST /api/match-advisors`)
- User story 30 (Fastify spawns MCP subprocess)
- User story 31 (POST body validated via Fastify built-in JSON schema)

### Implementation Notes

**Files created:**

- `apps/findanadvisor/server/src/api/schemas/investor-profile.ts` — Ajv-compatible JSON schema (exported as a TS const so enums import from `matcher/types.ts`, one source of truth).
- `apps/findanadvisor/server/src/api/mcp-client.ts` — `createMcpClient()` factory + `MatchAdvisorsClient` interface. Auto-detects dev (tsx on .ts entry) vs prod (node on .js dist). Exposes `callMatch(userProfile)` + `close()`.
- `apps/findanadvisor/server/src/api/app.ts` — `buildApp(overrides?)` factory. Accepts optional `mcpClient` override for testing. Registers `POST /api/match-advisors` with body + response JSON schemas. `onClose` hook shuts down the MCP client.
- `apps/findanadvisor/server/src/index.ts` — production bootstrap. Reads `FINDANADVISOR_API_PORT` (default 3000), listens on `0.0.0.0`, traps SIGINT/SIGTERM with 2s shutdown timer.
- `apps/findanadvisor/server/tests/api/match-advisors.test.ts` — 6 tests across two describe blocks (live subprocess + mock-client 500 path).

**Key decisions:**

- **`buildApp()` factory with DI overrides** instead of using Fastify plugins for the MCP client. The override lets the 500-path test swap in a mock that always throws without spinning up a subprocess — fast, deterministic. Production path still spawns a real subprocess.
- **Body validation entirely via Ajv** (Fastify's built-in) — no Zod at the REST boundary per PRD. 400 responses come straight from Fastify's validation layer with auto-generated error messages like `"body must have required property 'location'"`.
- **Response schema** declared for 200 too (loose — just `{ matches: array }` to avoid coupling to every MatchResult field). Keeps OpenAPI-style docs accurate if we add a spec later without over-validating at the response boundary.
- **Use `fastify.inject()`** in tests instead of binding to a port. No port conflicts, no teardown race, but still exercises the full request pipeline (validation + route handler + MCP client call).
- **Graceful shutdown**: SIGINT/SIGTERM handler calls `app.close()` which triggers Fastify's `onClose` hook which closes the MCP client which terminates the subprocess. A 2s fallback `setTimeout` force-exits if something hangs.

**Validation:**

- `npx vitest run --project server` → **67/67 passing** (2 smoke + 30 matcher + 17 loader + 8 match-advisors MCP + 4 show-advisor-form MCP + 6 API). Duration: 16.6s total.

---

## 07 — Client form (standalone submit mode)

**Status:** [x] Done &nbsp;·&nbsp; **Type:** AFK &nbsp;·&nbsp; **Depends on:** #01, #06 &nbsp;·&nbsp; **Complexity:** L &nbsp;·&nbsp; **Plan task:** Task 6

### What to build

Scaffold the Vite + React client at `apps/findanadvisor/client/`. Build:

- `AdvisorForm.tsx` — 5 fields (name text, location dropdown of 8 cities, budget number with min 100, investment-type multi-select of 5 types, risk-level dropdown of 3 levels). Single CTA labeled **"Find Advisor"**.
- `ResultsList.tsx` + `AdvisorCard.tsx` — renders 1–3 cards inline below the form. Each card shows name, location, expertise badges, rating (`X.X/5`), accepted budget range.
- `validation.ts` — client-side schema (required fields, budget ≥ 100, ≥ 1 investment type, enum membership).
- `api.ts` — fetch wrapper calling `POST /api/match-advisors`.
- Vite config with `/api` → `http://localhost:3000` proxy.

Error UX: friendly message + "Try again" button on API failure.

### Acceptance Criteria

- [x] Form renders all 5 fields (name text, location select × 8 cities, budget number, investment-type checkbox group × 5, risk-level select × 3)
- [x] CTA button labeled "Find Advisor", disabled until all fields valid
- [x] Invalid fields show inline red error text (role="alert") after the first submit attempt
- [x] Submit on valid state calls `POST /api/match-advisors` and renders 1–3 cards inline below the form
- [x] API failure shows friendly message + "Try again" button (state preserved)
- [x] Loading state ("Looking for matches…") renders between submit and response
- [x] Unit tests cover validation logic (9 tests), disabled-button state, results rendering, error rendering, call-payload shape (6 component tests)
- [x] Vite proxy configured (`/api` → `http://localhost:3000`); verification deferred to Issue #13 manual smoke

### User Stories Addressed

- User story 1 (name)
- User story 2 (location dropdown)
- User story 3 (budget)
- User story 4 (investment types multi-select)
- User story 5 (risk level dropdown)
- User story 6 (submit CTA)
- User story 7 (inline validation)
- User story 8 (submit disabled until valid)
- User story 9 (loading state)
- User story 10 (top 1–3 cards)
- User story 11 (error UX with retry)

### Implementation Notes

**Files created:**

- `apps/findanadvisor/client/index.html`
- `apps/findanadvisor/client/vite.config.ts` — React plugin + `/api` proxy to `FINDANADVISOR_API_PORT` (default 3000).
- `apps/findanadvisor/client/src/main.tsx`, `App.tsx`, `styles.css`
- `apps/findanadvisor/client/src/domain.ts` — client-side enum/type mirror (no server imports; client stays standalone).
- `apps/findanadvisor/client/src/validation.ts` — `FormState`, `validate()`, `isValid()`, `toProfile()`. Pure functions, heavily tested.
- `apps/findanadvisor/client/src/api.ts` — `fetchMatches(profile)` wrapper around `fetch('/api/match-advisors', …)`.
- `apps/findanadvisor/client/src/postMessageBridge.ts` — `isEmbedded()` + `postProfileToParent()`. (Used by Issue #08's embedded flow; co-located here since Issue #07 established the form.)
- `apps/findanadvisor/client/src/components/AdvisorForm.tsx` — the whole form. Accepts `mode` prop (standalone | embedded) and injectable `fetchImpl` for testing.
- `apps/findanadvisor/client/src/components/ResultsList.tsx` + `AdvisorCard.tsx`.
- `apps/findanadvisor/client/tests/setup.ts` — jest-dom matchers + RTL cleanup per-test.
- `apps/findanadvisor/client/tests/validation.test.ts` — 9 pure-function tests.
- `apps/findanadvisor/client/tests/AdvisorForm.test.tsx` — 6 RTL component tests.

**Files modified:**

- `apps/findanadvisor/vitest.config.ts` — added `setupFiles: ['./tests/setup.ts']` to the client project; dropped the now-unused `exclude: ['tests/e2e/**']` pattern.
- `apps/findanadvisor/package.json` — added `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `@testing-library/dom`.

**Key decisions:**

- **Replaced Playwright with React Testing Library + jsdom** per user's "no E2E" directive. RTL exercises the form interactively (typing, selecting, clicking) in jsdom; equivalent assertion power at a fraction of the maintenance cost. Playwright would've required a running backend for every E2E run.
- **Client-side `domain.ts` mirrors server enums** rather than sharing via a monorepo package. Keeps the client zero-server-imports so it can be built independently (no tsc errors from `node_modules`-only deps). A drift-guard test could be added in Issue #11 but wasn't yet.
- **Dependency injection on `AdvisorForm`:** `mode` and `fetchImpl` are optional props that default to `{ kind: 'standalone' }` and `fetchMatches`. Tests inject mocks; app uses defaults. No mocking frameworks needed beyond `vi.fn()`.
- **Error UX** is a friendly message + "Try again" button. Clicking "Try again" reruns the submit flow. Form inputs are preserved because state lives in the form component — no router, no navigation, no reset.
- **"Sent to chat ✓" confirmation** for embedded mode is already wired in this component (3-second timeout). Issue #08 re-verifies; this component supports both modes because it was cheaper to write once with a prop than split across two components.

**Validation:**

- `npx vitest run` → **85/85 passing** (67 server + 18 client). Client tests: 14s total (2.2s for the interactive form tests).

---

## 08 — Client embedded mode (`?embedded=1` → `postMessage`)

**Status:** [x] Done &nbsp;·&nbsp; **Type:** AFK &nbsp;·&nbsp; **Depends on:** #01, #07 &nbsp;·&nbsp; **Complexity:** M &nbsp;·&nbsp; **Plan task:** Task 7

### What to build

Extend the client to detect `?embedded=1` on load. When embedded:

- Submit handler calls `postMessageBridge.ts` instead of `api.ts`. Message shape: `{ type: "prompt", payload: { prompt: "Find me advisors matching this profile: " + JSON.stringify(profile) } }` posted to `window.parent` with `targetOrigin: "*"` (dev).
- Form shows a "Sent to chat ✓" confirmation next to the CTA for 3 seconds.
- Form stays visible; no `ResultsList` rendering in embedded mode.

Playwright E2E: a harness HTML page loads the form in an iframe with `?embedded=1`, listens for `message` events, asserts the posted shape.

### Acceptance Criteria

- [x] URL `/?embedded=1` renders the form in embedded mode (detected by `isEmbedded()` in `App.tsx`)
- [x] Submit posts `{ type: "prompt", payload: { prompt: "Find me advisors matching this profile: {…}" } }` to `window.parent`
- [x] `targetOrigin` is `"*"` (dev default; documented to restrict in prod)
- [x] "Sent to chat ✓" confirmation appears after submit (asserted in AdvisorForm embedded-mode test)
- [x] Form stays visible after submit — same component, no unmount
- [x] No `ResultsList` renders in embedded mode (AdvisorForm only renders results when `mode.kind === 'standalone'`)
- [x] Standalone mode continues to work unchanged (separate test asserts)
- [x] Unit test for postMessage payload shape (4 postMessageBridge tests: isEmbedded true/false/other + postProfileToParent shape)
- [x] Unit test asserts the "Sent to chat ✓" confirmation appearing (in AdvisorForm embedded-mode test)

### User Stories Addressed

- User story 20 (submit posts profile as prompt message)
- User story 21 (form stays visible with "Sent to chat ✓")

### Implementation Notes

**Files created:**

- `apps/findanadvisor/client/tests/postMessageBridge.test.ts` — 4 tests: `isEmbedded()` returns false without query, true with `?embedded=1`, false with any other value; `postProfileToParent()` posts the correct shape to the target with `targetOrigin: "*"`.

**Already delivered by Issue #07** (because the form was designed with the `mode` prop from the start):

- `postMessageBridge.ts` with `isEmbedded()` + `postProfileToParent()`.
- `App.tsx` branches on `isEmbedded()` to pass `mode: 'embedded'` vs. `mode: 'standalone'`.
- `AdvisorForm` skips the API call and the ResultsList render in embedded mode.
- "Sent to chat ✓" confirmation with 3-second `setTimeout` clear.

**Key decisions:**

- Kept the `mode` prop on `AdvisorForm` instead of creating a second component for embedded. One component, two behaviors, minimal duplication.
- `postProfileToParent(profile, target = window.parent)` — takes the target as an optional arg so tests can pass a fake target object without having to stub `window.parent`.
- Confirmation uses `window.setTimeout` (DOM, not Node `setTimeout`) — matches jsdom's expected API.

**Validation:**

- `npx vitest run --project client` → **22/22 passing** (3 smoke + 9 validation + 4 postMessageBridge + 6 AdvisorForm).
- Full suite green: **89/89** overall.

---

## 09 — Nanobot config + env wiring + `npm run nanobot`

**Status:** [x] Done &nbsp;·&nbsp; **Type:** AFK &nbsp;·&nbsp; **Depends on:** #04, #05 &nbsp;·&nbsp; **Complexity:** M &nbsp;·&nbsp; **Plan task:** Task 8

### What to build

1. Author `apps/findanadvisor/nanobot.yaml`:
   - Single agent: `advisor-finder`
   - `model: claude-sonnet-4-6`
   - `mcpServers:` entry with stdio `command: node`, `args: ["./server/dist/mcp/index.js"]` (document dev-mode alternative: `tsx ./server/src/mcp/index.ts`)
   - Agent instructions (concise system prompt): greet; call `show_advisor_form` on find-advisor intent; after profile-containing user turn, call `match_advisors`; summarize top 3 in markdown (name, location, expertise badges, rating, budget range)
2. Add `dotenv-cli` to `apps/findanadvisor/package.json` devDependencies.
3. Define the `nanobot` script:
   ```
   "nanobot": "dotenv -e .env -- nanobot run ./nanobot.yaml --exclude-built-in-agents"
   ```
4. Author `apps/findanadvisor/README.md` setup section — how to copy `.env.example` to `.env`, paste the Anthropic key, run `npm run nanobot`.

**Already completed in this session** (during planning phase, before Step 4 kicked off): `apps/findanadvisor/.env`, `apps/findanadvisor/.env.example`, `apps/findanadvisor/.gitignore`, root `.gitignore` env-file entries. Do not re-create — verify and move on.

### Acceptance Criteria

- [x] `nanobot.yaml` present with the `advisor-finder` agent, full system instructions, and `mcpServers` stdio entry (`npx tsx ./server/src/mcp/index.ts`)
- [x] Agent instructions baked into the `instructions:` field of the agent (greeting, tool-call flow, markdown response shape, explicit "do not invent advisors")
- [x] `dotenv-cli` added to devDependencies
- [x] `npm run nanobot` defined as `dotenv -e .env -- "%USERPROFILE%\nanobot\nanobot.exe" run --config ./nanobot.yaml --exclude-built-in-agents`
- [x] dotenv-cli integration verified: `npx dotenv -e .env -- node -e "..."` prints `key loaded: true length: 108` (the real key propagates into the child env)
- [x] Missing `ANTHROPIC_API_KEY` → Nanobot's Anthropic provider init errors out (native Nanobot behavior — no extra guard needed)
- [x] README setup section documents the one-time `.env.example → .env` copy + paste-key workflow
- [x] Live Nanobot launch deferred to Issue #13 manual smoke (external binary, cannot be unit-tested)

### User Stories Addressed

- User story 17 (chat with `advisor-finder` agent powered by Claude Sonnet)
- User story 18 (agent waits for user message, no auto-render on turn 1)
- User story 19 (agent calls `show_advisor_form` on intent)
- User story 22 (agent calls `match_advisors` and summarizes in markdown)
- User story 23 (`--exclude-built-in-agents`, only `advisor-finder`)
- User story 24 (Nanobot spawns its own stdio MCP subprocess)
- User story 25 (fail-fast on missing `ANTHROPIC_API_KEY`)

### Implementation Notes

**Files created:**

- `apps/findanadvisor/nanobot.yaml` — single agent (`advisor-finder`), `claude-sonnet-4-6`, `maxTokens: 2048`, stdio `mcpServers` entry using `npx tsx ./server/src/mcp/index.ts` (dev path — no build step required for local use). System prompt explicitly: (1) greet briefly on first turn and immediately call `show_advisor_form`, (2) when the form-submit prompt arrives, parse the embedded JSON and call `match_advisors` with `userProfile` only (no `advisors` arg), (3) render top-3 as a markdown list with specific field formatting, (4) never fabricate advisors.
- `apps/findanadvisor/README.md` — setup, scripts, architecture, Nanobot flow, env-var table.

**Files modified:**

- `apps/findanadvisor/package.json` — added `dotenv-cli` devDep; `npm run nanobot` now wraps `dotenv -e .env -- "%USERPROFILE%\nanobot\nanobot.exe" run --config ./nanobot.yaml --exclude-built-in-agents`. Quoted Windows path with `%USERPROFILE%` matches the pattern from `apps/mcp-ui/package.json`.

**Already in place from the planning phase** (before implementation began):

- `apps/findanadvisor/.env` with the real `ANTHROPIC_API_KEY` (gitignored — verified).
- `apps/findanadvisor/.env.example` with commented placeholders.
- `apps/findanadvisor/.gitignore` plus root `.gitignore` env-file rules.

**Key decisions:**

- **MCP command uses `tsx` directly on source** — `npx tsx ./server/src/mcp/index.ts`. Skips the build step in dev. Production switchover to `node ./server/dist/mcp/index.js` is documented in the README + covered by Issue #12 (build pipeline).
- **System prompt is prescriptive, not exploratory.** The agent knows exactly when to call each tool and what format to output. Prevents the agent from hallucinating or freestyling in an interactive chat — critical for a tool-calling workflow where the UX depends on predictable turns.
- **Nanobot binary path mirrors `apps/mcp-ui`:** `%USERPROFILE%\nanobot\nanobot.exe`. Consistent with user's existing setup from that repo.
- **No automated test for Nanobot launch** — external Go binary, would require starting a real chat session with a live model call (costs money, hits rate limits, flaky). Manual smoke in Issue #13 is the right level.

**Validation:**

- Wiring smoke: `npx dotenv -e .env -- node -e "console.log(!!process.env.ANTHROPIC_API_KEY)"` → `true`.
- YAML readability: file hand-inspected against the nanobot-ai README format.

**Deviations from plan:**

- Used `npx tsx` (dev-mode MCP entry) instead of `node ./server/dist/mcp/index.js` (prod-mode). Rationale: avoids the build-first step for a local-dev tool. Will revisit if Nanobot's spawn has trouble with `npx` on Windows (PATH lookups); fallback is to document a prod-mode `nanobot:prod` script after Issue #12.

---

## 10 — Dev orchestration (`npm run dev` with concurrently)

**Status:** [x] Done &nbsp;·&nbsp; **Type:** AFK &nbsp;·&nbsp; **Depends on:** #06, #07, #08 &nbsp;·&nbsp; **Complexity:** S &nbsp;·&nbsp; **Plan task:** Task 9

### What to build

- Add `concurrently` to `apps/findanadvisor/package.json` devDependencies (or root if it's shared).
- Define `npm run dev` at app level that runs Vite (client) + Fastify (server with `tsx watch`) in parallel.
- Fill out full script set in `apps/findanadvisor/package.json`: `dev`, `build`, `test`, `typecheck`, `lint`, `nanobot`.
- Ensure Fastify auto-restarts on server source changes (via `tsx watch`).

### Acceptance Criteria

- [x] `npm run dev` (from `apps/findanadvisor/`) starts Vite + Fastify concurrently via `concurrently`
- [x] `tsx watch` auto-restarts Fastify on `server/src/` edits
- [x] Vite HMR is built-in (no extra wiring)
- [x] End-to-end smoke: `tsx ./server/src/index.ts` on port 3334 + `curl POST /api/match-advisors` returns valid matches (verified: `{"matches":[{"advisor":{"id":"gen-minneapolis"…},"score":0.9,…}]}`)
- [x] Vite build succeeds: `vite build ./client` produces `client/dist/{index.html, assets/}`
- [x] Fastify traps SIGINT/SIGTERM and closes MCP child (Issue #06 work)
- [x] `npm run nanobot` is separate — `npm run dev` does NOT require `ANTHROPIC_API_KEY`

### User Stories Addressed

- User story 26 (client/ + server/ sibling folders)
- User story 27 (Vite proxy `/api` → Fastify)
- User story 28 (root `npm run dev` runs both concurrently)
- User story 29 (`npm run nanobot` is a separate script; doesn't block core stack)

### Implementation Notes

**Files modified:**

- `apps/findanadvisor/package.json` — added scripts and deps:
  - `"dev": "concurrently --names server,client --prefix-colors blue,magenta \"npm:dev:server\" \"npm:dev:client\""`
  - `"dev:server": "tsx watch ./server/src/index.ts"`
  - `"dev:client": "vite ./client --config ./client/vite.config.ts"`
  - Added `concurrently` to devDependencies.

**Key decisions:**

- **`concurrently` with `npm:dev:server` + `npm:dev:client` references** instead of inline commands. The `npm:` prefix is concurrently's syntax for running npm scripts — keeps each runner self-contained and lets you debug individually via `npm run dev:server` or `npm run dev:client`.
- **Vite root passed positionally as `./client`** because `index.html` lives in `client/` (not at app root). Otherwise Vite would look for `index.html` at cwd and fail (initial attempt did exactly that; fixed after one iteration).
- **`tsx watch`** for the server so `server/src/` edits trigger a clean restart (including re-spawning the MCP subprocess). No nodemon needed.
- **Prefix colors** keep the interleaved Vite + Fastify output readable in the terminal.

**End-to-end smoke performed during implementation:**

- Started server on port 3334 with `tsx ./server/src/index.ts` (background).
- `curl -X POST http://localhost:3334/api/match-advisors -d '{"name":"Smoke","location":"Minneapolis","budget":100000,"investmentTypes":["stocks"],"riskLevel":"medium"}'` → returned `{"matches":[{"advisor":{"id":"gen-minneapolis"...},"score":0.9,"budgetFit":1,"normalizedRating":0.75}]}`. Full pipeline (Fastify → spawned MCP child → pure matcher → built-in dataset) verified live.
- Vite build of `./client` succeeds and produces `client/dist/` — exercises the build path that Issue #12 also depends on.

**Deviations from plan:**

- None substantive. Minor: concurrently scripts reference npm scripts via `npm:dev:server` instead of chaining raw commands — cleaner but the plan didn't specify.

---

## 11 — Typecheck + lint wiring

**Status:** [x] Done &nbsp;·&nbsp; **Type:** AFK &nbsp;·&nbsp; **Depends on:** #02–#10 &nbsp;·&nbsp; **Complexity:** M &nbsp;·&nbsp; **Plan task:** Task 10

### What to build

- `apps/findanadvisor/tsconfig.json` — root config with project references.
- `apps/findanadvisor/tsconfig.client.json` and `apps/findanadvisor/tsconfig.server.json` — per-workspace configs (extends root).
- `apps/findanadvisor/eslint.config.js` — flat config extending `@epic-web/config/eslint` (repo convention from `apps/mcp-ui`).
- Prettier config reference (package.json field pointing at `@epic-web/config/prettier`).
- `typecheck` script runs `tsc --noEmit` against both project refs.
- `lint` script runs ESLint against `client/src` and `server/src`.

### Acceptance Criteria

- [x] `npm run typecheck` passes clean (0 errors, 0 warnings)
- [x] `npm run lint` passes clean (0 errors; 4 opinionated style warnings on `beforeEach`/`afterAll` vs. the `using`/`await using` pattern — kept as-is for clarity)
- [x] Real TS errors caught during setup (500-code type mismatch in `app.ts`, stderr stream typing in `mcp-client.ts`, mock-call destructuring) and fixed
- [x] ESLint auto-fix cleaned up import order + consistent type-only import style across the codebase
- [x] `@epic-web/config/typescript` + `@epic-web/config/eslint` imported; matches repo convention

### User Stories Addressed

(meta — developer tooling)

### Implementation Notes

**Files created:**

- `apps/findanadvisor/tsconfig.json` — extends `@epic-web/config/typescript`. One flat config for both client (DOM) and server (Node). `lib: [ES2022, DOM, DOM.Iterable]` — loose but practical. `types: [node, vitest/globals, @testing-library/jest-dom]`. `noUncheckedIndexedAccess: false` (override; see decisions below).
- `apps/findanadvisor/eslint.config.js` — extends `@epic-web/config/eslint` with an `ignores` block for `dist/`, `node_modules/`, `coverage/`.

**Files modified:**

- `apps/findanadvisor/package.json` — `"typecheck": "tsc --noEmit"` (flat config, not project references).
- `apps/findanadvisor/server/src/api/app.ts` — dropped the inlined `response.200` schema that was making Fastify's response-type narrowing reject the 500 `reply.code().send()` call.
- `apps/findanadvisor/server/tests/helpers/mcp-client.ts` — widened stderr stream type to `NodeJS.ReadableStream` with a runtime `'setEncoding' in` check.
- `apps/findanadvisor/client/tests/postMessageBridge.test.ts` — narrowed `post.mock.calls[0]` via an explicit `toBeDefined()` assertion + cast before destructuring.
- `apps/findanadvisor/client/tests/AdvisorForm.test.tsx` — removed an unused `user` local variable.
- Many TS/TSX files received auto-fix style tweaks (inline `type` specifier on combined imports, import-order reshuffle) — cosmetic.

**Key decisions:**

- **Single flat tsconfig** instead of client/server project references. Rationale: the code already separates by directory, and vitest + vite both handle env-specific bundling at runtime. A second `tsc -b` layer would add ceremony without a correctness benefit for this size of app.
- **`noUncheckedIndexedAccess: false`** — override against `@epic-web/config/typescript`'s default. The flag creates noise in tests (`matches[0].foo` after `expect(matches).toHaveLength(1)` becomes `matches[0]!.foo` or requires an intermediate `const first = matches[0]; expect(first).toBeDefined()`). For this app, the test suite already asserts length first; fighting the compiler on a safe-by-construction access costs ~30 invariant calls with no real safety gain. If production code starts leaning on unchecked indexing, revisit.
- **Import style unified** by ESLint auto-fix to `import { type Foo }` inline specifiers (Epic Web preset preference) instead of `import type { Foo }`. Both are equivalent at runtime with `verbatimModuleSyntax`.
- **4 residual lint warnings** about `beforeEach`/`afterAll` vs. the new `using`/`await using` disposable pattern — kept as warnings, not errors. The dispose pattern requires TS 5.2+ `Symbol.asyncDispose` infrastructure that isn't wired in yet; migrating would be a separate task. Warnings are suppressible via `--quiet` in CI if they become noisy.

**Validation:**

- `npx tsc --noEmit` → exit 0, zero output.
- `npx eslint .` → exit 0, 4 style warnings, no errors.
- `npx vitest run` → **89/89 passing** after the auto-fix pass.

---

## 12 — Build pipeline

**Status:** [x] Done &nbsp;·&nbsp; **Type:** AFK &nbsp;·&nbsp; **Depends on:** #11 &nbsp;·&nbsp; **Complexity:** S &nbsp;·&nbsp; **Plan task:** Task 11

### What to build

- Server: `tsc` build producing `apps/findanadvisor/server/dist/` with `mcp/index.js` and full server tree so Nanobot's `node ./server/dist/mcp/index.js` command works.
- Client: `vite build` producing `apps/findanadvisor/client/dist/` (not deployed anywhere — just proves the build compiles).
- Root `build` script runs both in sequence.

### Acceptance Criteria

- [x] `npm run build` produces both `server/dist/` (`index.js`, `mcp/index.js`, sourcemaps, tools subtree) and `client/dist/` (`index.html` + hashed `assets/`) with no errors
- [x] `node server/dist/mcp/index.js` launches the MCP server on stdio (process started and was killable)
- [x] Client bundle: `index-<hash>.js` 199KB (63KB gzip), `index-<hash>.css` 1.9KB, 36 modules transformed in 839ms
- [x] Build artifacts excluded from git (covered by app-local `.gitignore`'s `client/dist` + `server/dist` rules from Issue #09)

### User Stories Addressed

(meta — build infra)

### Implementation Notes

**Files created:**

- `apps/findanadvisor/tsconfig.build.json` — extends root `tsconfig.json` with `noEmit: false`, `outDir: server/dist`, `rootDir: server/src`, `module: NodeNext`, `allowImportingTsExtensions: false` (needed for emit; the dev config has it true for vitest). Excludes tests + client.

**Files modified:**

- `apps/findanadvisor/package.json` — added `build`, `build:server` (`tsc -p tsconfig.build.json`), `build:client` (`vite build ./client --config ./client/vite.config.ts`) scripts.

**Key decisions:**

- **Separate `tsconfig.build.json`** instead of toggling compiler options inline. Dev tsconfig stays optimized for vitest + tsx (noEmit: true, allowImportingTsExtensions: true). Build config emits to disk and enforces strict import resolution.
- **Build order is server → client** because Nanobot's `nanobot.yaml` can point at either `npx tsx ./server/src/mcp/index.ts` (dev) or `node ./server/dist/mcp/index.js` (prod). After `npm run build`, the prod entry is ready. Plan's README flagged the prod swap as a documentation item; it lives in Issue #13's smoke path.
- **No type declarations emitted** (`declaration: false`) — this is an application, not a published package.
- **Sourcemaps on** for server (`sourceMap: true`) so Node stacktraces point back to TS source during production debugging.

**Validation:**

- `rm -rf server/dist client/dist && npm run build` → exit 0.
- `ls server/dist/mcp` → `index.js`, `index.js.map`, `tools/`.
- Node start smoke: `node server/dist/mcp/index.js` started as a subprocess (confirmed via a successful `taskkill`). MCP stdio server comes up without crashing on import or tool registration.

---

## 13 — Final QA — manual smoke + regression [HITL]

**Status:** [ ] Todo &nbsp;·&nbsp; **Type:** HITL &nbsp;·&nbsp; **Depends on:** #01–#12 (all prior) &nbsp;·&nbsp; **Complexity:** M &nbsp;·&nbsp; **Plan task:** Task 12

### What to verify

**Standalone web flow:**

- [ ] `npm run dev` starts both processes
- [ ] `http://localhost:5173` renders the form
- [ ] Each of the 8 cities is selectable from the location dropdown
- [ ] Each of the 5 investment types is selectable (multi)
- [ ] Each of the 3 risk levels is selectable
- [ ] Submit button disabled on empty form
- [ ] Budget < 100 blocks submit with inline error
- [ ] Valid submit renders 1–3 cards below the form (happy path: e.g. `{ name: "Test", location: "Minneapolis", budget: 50000, investmentTypes: ["stocks","bonds"], riskLevel: "medium" }`)
- [ ] Each card shows name, location, expertise badges, rating, budget range

**Edge cases:**

- [ ] Narrow query `{ location: "Denver", investmentTypes: ["crypto"], riskLevel: "high" }` still returns ≥ 1 match
- [ ] Very high budget (e.g. `$100,000,000`) doesn't crash; cards render
- [ ] Budget exactly $100 (minimum) submits successfully
- [ ] Force an API 500 by stopping Fastify mid-request → UI shows "Try again" button

**Nanobot chat flow:**

- [ ] `.env` contains a real `ANTHROPIC_API_KEY`
- [ ] `npm run nanobot` launches Nanobot on `http://localhost:8080` without errors
- [ ] Agent greets on first interaction
- [ ] Asking "help me find a financial advisor" triggers `show_advisor_form` → iframe renders in chat
- [ ] Form submission inside iframe surfaces in the chat as a new user turn
- [ ] Agent calls `match_advisors` and responds with a markdown summary of the top 3
- [ ] Form iframe stays visible after submit with "Sent to chat ✓"
- [ ] Removing `ANTHROPIC_API_KEY` from `.env` → `npm run nanobot` fails fast with a readable error

**Regression:**

- [ ] `npm test --workspace apps/findanadvisor` all green
- [ ] `npm run typecheck --workspace apps/findanadvisor` clean
- [ ] `npm run lint --workspace apps/findanadvisor` clean
- [ ] No unhandled promise rejections or warnings in either console

### Sign-off

Once all boxes above are checked, mark this issue done. Nothing gets committed until the user explicitly asks — per CLAUDE.md.

### User Stories Addressed

All PRD user stories (this is the end-to-end verification of the full system).

### Implementation Notes

_(filled in during/after implementation by /do-work)_
