# Implementation Plan — `findanadvisor` Advisor Matching

**PRD:** [`apps/findanadvisor/docs/prd/advisor-matching.md`](../prd/advisor-matching.md) — refer back for domain language, user stories, and decisions.

**Status:** Plan draft, awaiting approval. Nothing is committed.

---

## 1. Objective

Ship a working `findanadvisor` app that delivers the three entry points defined in the PRD — Vite web form, Fastify REST API, stdio MCP server — wired to a Nanobot chat agent powered by Claude Sonnet. All code is TDD-developed in vertical tracer-bullet slices; the pure matcher module is built and tested first; nothing proceeds to the next slice without green tests.

---

## 2. Technical approach (summary)

| Layer      | Tech                                | Key pattern                                                                                                                           |
| ---------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Matcher    | TypeScript, zero deps               | Pure functions; single public `matchAdvisors()` export; no I/O, no logging, no framework imports                                      |
| Data       | TypeScript, Zod                     | Parse `advisors.json` once at startup; freeze; fail-loud on schema errors                                                             |
| MCP server | `@modelcontextprotocol/sdk`, `zod`  | stdio transport; 2 tools; lenient validation of custom `advisors?` arg; structured + text content per response                        |
| API        | `fastify` (built-in Ajv)            | `POST /api/match-advisors`; spawns MCP subprocess; owns its lifecycle; 400 on schema errors; 500 on matcher/MCP errors                |
| Client     | `react`, `vite`                     | One SPA, one form component, two submit behaviors keyed on `?embedded=1`; Vite proxy for `/api`                                       |
| Chat agent | `nanobot` Go binary, `nanobot.yaml` | Claude Sonnet (`claude-sonnet-4-6`) via native Anthropic endpoint; stdio MCP subprocess spawned by Nanobot independently from Fastify |
| Secrets    | `dotenv-cli`                        | `.env` loaded by `npm run nanobot`; `.env.example` committed                                                                          |
| Tests      | `vitest`, `@playwright/test`        | Vitest for unit + integration; Playwright for E2E (standalone + embedded modes); Nanobot chat is manual smoke only                    |

### Two MCP subprocesses, one shared artifact

Per Q7 grilling decision: Fastify spawns its own MCP subprocess for REST; Nanobot spawns its own MCP subprocess via `nanobot.yaml`. Both processes execute the same entry — `server/dist/mcp/index.js` in prod, `server/src/mcp/index.ts` via `tsx` in dev. No shared state; matcher is pure; `advisors.json` is read-only.

### Ports (dev)

- Vite: `5173`
- Fastify: `3000`
- Nanobot: `8080` (only when `npm run nanobot` runs)

---

## 3. File-level changes

```
apps/findanadvisor/                             ← NEW APP
├── .env.example                                ← NEW (placeholder for ANTHROPIC_API_KEY)
├── .gitignore                                  ← NEW (app-local; excludes .env, dist, coverage)
├── package.json                                ← NEW (workspace package; scripts below)
├── tsconfig.json                               ← NEW (extends root; refs client + server)
├── tsconfig.client.json                        ← NEW
├── tsconfig.server.json                        ← NEW
├── nanobot.yaml                                ← NEW (advisor-finder agent config)
├── README.md                                   ← NEW (setup + .env workflow for humans)
│
├── client/                                     ← NEW
│   ├── index.html
│   ├── vite.config.ts                          ← Proxy /api → http://localhost:3000
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx                             ← Routes to form; reads ?embedded=1
│   │   ├── components/
│   │   │   ├── AdvisorForm.tsx
│   │   │   ├── ResultsList.tsx
│   │   │   └── AdvisorCard.tsx
│   │   ├── api.ts                              ← fetch wrapper
│   │   ├── postMessageBridge.ts                ← window.parent.postMessage(…)
│   │   └── validation.ts                       ← Client-side form validation
│   └── tests/
│       ├── unit/                               ← vitest component tests
│       └── e2e/                                ← Playwright specs
│           ├── standalone.spec.ts
│           └── embedded.spec.ts
│
├── server/                                     ← NEW
│   ├── src/
│   │   ├── index.ts                            ← Fastify bootstrap, spawns MCP child, registers routes
│   │   ├── api/
│   │   │   ├── routes/match-advisors.ts        ← POST /api/match-advisors
│   │   │   ├── schemas/investor-profile.json   ← Ajv JSON schema
│   │   │   └── mcp-client.ts                   ← Thin wrapper over MCP SDK client
│   │   ├── mcp/
│   │   │   ├── index.ts                        ← Stdio MCP server entry
│   │   │   ├── schemas.ts                      ← Zod for Advisor, InvestorProfile, MatchResult
│   │   │   └── tools/
│   │   │       ├── match-advisors.ts
│   │   │       └── show-advisor-form.ts
│   │   ├── matcher/
│   │   │   ├── index.ts                        ← Exports matchAdvisors()
│   │   │   ├── filters.ts                      ← filterByLocation/Expertise/Risk
│   │   │   ├── scoring.ts                      ← budgetFit, normalizeRating, weightedScore
│   │   │   └── rank.ts                         ← rankAndTakeUpTo3
│   │   └── data/
│   │       ├── advisors.json                   ← 20 advisors (8 generalists + 12 specialists)
│   │       └── loader.ts                       ← getAdvisors()
│   ├── tests/
│   │   ├── unit/
│   │   │   ├── matcher/                        ← Filters, scoring, ranking, edge cases
│   │   │   └── data/                           ← loader.ts
│   │   └── integration/
│   │       ├── mcp-server.test.ts              ← stdio client ↔ server
│   │       └── api.test.ts                     ← Fastify + spawned MCP subprocess
│   └── vitest.config.ts                        ← Global setup for MCP subprocess lifecycle
│
└── docs/
    ├── prd/advisor-matching.md                 ← ALREADY EXISTS
    ├── plans/advisor-matching.md               ← THIS FILE
    └── issues/advisor-matching/                ← Step 3 will populate
```

---

## 4. Dependencies

### Added to `apps/findanadvisor/server/package.json`

| Package                        | Why                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `fastify`                      | REST API                                                                                            |
| `@modelcontextprotocol/sdk`    | MCP server (stdio) + client (for Fastify to call the child)                                         |
| `zod`                          | Per-advisor lenient validation inside MCP tool; Advisor/InvestorProfile schemas for the data loader |
| `@epic-web/invariant`          | Runtime assertion helper (matches repo convention in `apps/mcp-ui`)                                 |
| `tsx` (dev)                    | Run TS directly in dev without a build step                                                         |
| `vitest` (dev)                 | Unit + integration tests                                                                            |
| `@playwright/test` (dev, root) | E2E                                                                                                 |
| `concurrently` (dev)           | `npm run dev` runs Vite + Fastify in parallel                                                       |
| `dotenv-cli` (dev)             | `npm run nanobot` loads `.env` before spawning Nanobot                                              |

### Added to `apps/findanadvisor/client/package.json`

| Package                        | Why                |
| ------------------------------ | ------------------ |
| `react`, `react-dom`           | UI                 |
| `vite`, `@vitejs/plugin-react` | Dev server + build |
| `typescript` (dev)             | Shared TS config   |

### External binary

- **Nanobot** — assumed already installed at `C:\Users\manel\nanobot\nanobot.exe`. `npm run nanobot` shells out to it; no Node dep.

### No new root-level deps beyond `@playwright/test` (if not already present).

---

## 5. Secrets / env strategy — answering the user's key question

**Goal:** write `ANTHROPIC_API_KEY` in one place, get automatic pickup on every `npm run nanobot`.

**Mechanism (baked into Task 11 below):**

1. **Committed:** `apps/findanadvisor/.env.example` with:

   ```
   # Required for `npm run nanobot` — chat agent uses Claude Sonnet via Anthropic.
   ANTHROPIC_API_KEY=

   # Optional override for the MCP-UI iframe URL returned by show_advisor_form.
   # Defaults to http://localhost:5173?embedded=1 if unset.
   # FINDANADVISOR_FORM_URL=
   ```

2. **Gitignored:** `apps/findanadvisor/.gitignore` (app-local) includes `.env`. Root `.gitignore` also gets an `.env` line as a belt-and-braces guard.
3. **User action (one-time):** after scaffold, the human runs `cp .env.example .env` inside `apps/findanadvisor/` and pastes the real key.
4. **Automatic pickup:** `npm run nanobot` is defined as:
   ```jsonc
   "nanobot": "dotenv -e .env -- nanobot run ./nanobot.yaml --exclude-built-in-agents"
   ```
   `dotenv-cli` reads `./.env` (cwd-relative to `apps/findanadvisor/`), exports vars into the process env, then execs `nanobot`. No code changes after the first setup.
5. **Fail-loud on missing key:** `nanobot.yaml` uses `claude-sonnet-4-6`, which auto-selects the Anthropic provider; Nanobot's provider init errors out if `ANTHROPIC_API_KEY` is unset. No special startup check needed from us.

---

## 6. Risks & mitigations

| Risk                                                                                                      | Severity   | Mitigation                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two MCP subprocesses (one for Fastify, one for Nanobot) create port/resource contention on shutdown       | Low        | Matcher is pure + data is read-only → no shared-state issues. Fastify traps SIGTERM/SIGINT and graceful-shutdowns its child with 2s kill timeout. Nanobot owns its own child's lifecycle.                                          |
| Nanobot's MCP-UI iframe rendering differs from expectations (CSP, sandbox flags, cross-origin)            | Medium     | Use canonical MCP-UI `externalUrl` resource shape (`mimeType: text/uri-list`, URI `ui://findanadvisor/advisor-form`). If Nanobot strips `postMessage`, falls back to `targetOrigin: "*"` plus a manual smoke-test step in Task 12. |
| Dataset curation drift breaks the ≥1-match guarantee (user waived the coverage test)                      | Medium     | Documented in PRD further notes. Runtime min-1 safety net throws 500 if broken. Re-litigate if it bites during QA.                                                                                                                 |
| `@modelcontextprotocol/sdk` stdio transport on Windows has edge cases around CRLF / child stdio buffering | Low-Medium | Use `node`/`tsx` directly (not shell wrappers); write stdio integration tests on Windows early (Task 5).                                                                                                                           |
| Claude Sonnet model name `claude-sonnet-4-6` differs from what Nanobot's provider registry expects        | Low        | Verify in first Nanobot smoke test (Task 12); fall back to `claude-3-5-sonnet-latest` if model lookup fails. Documented as a known fallback in the Nanobot config comments.                                                        |
| Lenient validation of custom `advisors?` silently drops bad entries → debugging confusion                 | Low        | Log `dropped N of M (first reason)` to stderr on every drop. Unit test explicitly covers the "all-invalid throws" path.                                                                                                            |
| Port 3000/5173/8080 already in use on dev machine                                                         | Low        | Document in README: run `netstat`/`lsof` to resolve. Ports are not configurable out of the box; will be if users complain.                                                                                                         |
| `dotenv-cli` not finding `.env` when run from monorepo root                                               | Low        | `npm run nanobot` uses `-e .env` relative to the package cwd (`apps/findanadvisor/`); `npm` always cds into the package before running scripts. Verified in task 11 smoke.                                                         |

---

## 7. Task breakdown (vertical tracer-bullet slices, dependency-ordered)

Each task is a self-contained tracer bullet that goes **red → green → refactor** through all relevant layers before merging into the next. Mark [HITL] for tasks needing a human checkpoint; [AFK] for tasks safe to run autonomously.

### Task 0 — **Prerequisite: Test infrastructure** [AFK]

- Set up `apps/findanadvisor/server/vitest.config.ts` (global setup placeholder).
- Set up `apps/findanadvisor/client/vitest.config.ts`.
- Add root `@playwright/test` + `apps/findanadvisor/client/tests/e2e/playwright.config.ts`.
- Write a single **smoke test per config** that asserts `1+1 === 2` so the toolchain is green.
- **Blocks:** every subsequent task.
- **Acceptance:** `npm test --workspace apps/findanadvisor` runs green; `npx playwright test --config apps/findanadvisor/client/tests/e2e/playwright.config.ts` runs green.

### Task 1 — **Tracer bullet: Matcher module (pure)** [AFK]

- Create `server/src/matcher/`, files per §3.
- TDD: write failing tests for each helper (`filterByLocation`, `filterByExpertiseOverlap`, `filterByRiskInList`, `budgetFit`, `normalizeRating`, `weightedScore`, `rankAndTakeUpTo3`) plus integration tests for the public `matchAdvisors()`.
- Cover all PRD edge cases: inside/below/above budget range; 1/2/3-match results; ties; empty input → throws.
- **Depends on:** Task 0.
- **Acceptance:** Matcher module is 100% covered by unit tests, all green, zero non-stdlib imports.

### Task 2 — **Tracer bullet: Data loader** [AFK]

- Create `server/src/data/advisors.json` with 20 advisors (8 generalists + 12 specialists) covering all 120 combos.
- Create `server/src/mcp/schemas.ts` with the Zod `Advisor` schema.
- Create `server/src/data/loader.ts` exporting `getAdvisors()` — validates, freezes, returns.
- TDD: tests for happy path, malformed file crashes with readable error.
- **Depends on:** Task 1.
- **Acceptance:** `getAdvisors()` returns a frozen, typed array of 20; malformed-JSON test passes; startup validation is fail-loud.

### Task 3 — **Tracer bullet: MCP tool `match_advisors`** [AFK]

- Create `server/src/mcp/index.ts` (stdio bootstrap) and `server/src/mcp/tools/match-advisors.ts`.
- Zod input schema for `{ userProfile, advisors? }`.
- Happy-path: no `advisors` → use built-in; valid `advisors` → pass through; partial junk → drop + stderr log; all junk → throw.
- Response shape: `structuredContent: { matches }` + `content[]` with one text block per match.
- TDD via MCP client-over-stdio integration tests (spawn the server from the test harness).
- **Depends on:** Task 1, Task 2.
- **Acceptance:** Integration tests cover all four argument shapes; stderr log asserted for "drop" path.

### Task 4 — **Tracer bullet: MCP tool `show_advisor_form`** [AFK]

- Create `server/src/mcp/tools/show-advisor-form.ts`.
- Reads `FINDANADVISOR_FORM_URL` from env with default `http://localhost:5173?embedded=1`.
- Returns MCP-UI `externalUrl` resource per PRD §Implementation Decisions.
- TDD: asserts returned `content[]` includes the `ui://findanadvisor/advisor-form` resource with correct mimeType and URL.
- **Depends on:** Task 3.
- **Acceptance:** Integration test spawns MCP server, calls `show_advisor_form`, asserts the resource shape matches MCP-UI spec exactly.

### Task 5 — **Tracer bullet: Fastify API + spawned MCP child** [AFK]

- Create `server/src/index.ts` — Fastify bootstrap that spawns the MCP child (`tsx ./src/mcp/index.ts` in dev).
- Create `server/src/api/routes/match-advisors.ts` with `POST /api/match-advisors`.
- JSON schema for `InvestorProfile` (Ajv via Fastify's `schema:` field).
- `mcp-client.ts` wraps the MCP SDK client to call the child.
- Graceful shutdown: SIGTERM → child gets SIGTERM → 2s timeout → SIGKILL.
- TDD: integration tests hit the endpoint, assert 200 happy path, 400 on invalid body, 500 on MCP throw (force-throw via invalid advisors input).
- **Depends on:** Task 3.
- **Acceptance:** `POST /api/match-advisors` round-trips through the MCP child; shutdown cleans up the child.

### Task 6 — **Tracer bullet: Client form (standalone mode)** [AFK]

- Create `client/` (Vite scaffold).
- `AdvisorForm.tsx` — 5 fields, per-field inline validation, "Find Advisor" CTA disabled until valid.
- `ResultsList.tsx` + `AdvisorCard.tsx` — renders 1–3 cards inline below form.
- `api.ts` — `POST /api/match-advisors` fetch wrapper.
- `validation.ts` — client-side schema (enum matches, budget ≥ 100, ≥1 investment type).
- Vite proxy `/api` → `http://localhost:3000`.
- TDD: component unit tests (validation logic, disabled-button state, results rendering). Playwright E2E for the full standalone submit flow.
- **Depends on:** Task 5.
- **Acceptance:** Standalone form submits; matches render as cards; invalid input blocks submit with inline errors.

### Task 7 — **Tracer bullet: Client embedded mode (`?embedded=1`)** [AFK]

- Add `postMessageBridge.ts` — posts `{ type: "prompt", payload: { prompt } }` to `window.parent`.
- Update `AdvisorForm.tsx` to branch on `?embedded=1`: skip `api.ts`, call the bridge instead; show "Sent to chat ✓" confirmation for 3s; form stays visible.
- Playwright E2E: harness HTML page hosts the iframe (`?embedded=1`), listens for `message` events, asserts shape.
- **Depends on:** Task 6.
- **Acceptance:** Embedded flow posts correct message shape; standalone flow still works unchanged.

### Task 8 — **Nanobot config + env wiring** [AFK]

- Create `apps/findanadvisor/nanobot.yaml` — single `advisor-finder` agent, `model: claude-sonnet-4-6`, `mcpServers:` entry with stdio `command: node args: ["./server/dist/mcp/index.js"]` (and a dev alt `tsx ./server/src/mcp/index.ts`).
- Agent instructions: concise system prompt per PRD §MCP ↔ Nanobot flow.
- Create `.env.example`, `.gitignore` (app-local), README setup section.
- Add `dotenv-cli` to devDependencies.
- Define `npm run nanobot` script per §5 of this plan.
- **Depends on:** Task 4 (for `show_advisor_form`), Task 3 (for `match_advisors`).
- **Acceptance:** `cp .env.example .env` + paste key + `npm run nanobot` launches Nanobot without errors. Model loads; tools register. (Manual smoke in Task 12.)

### Task 9 — **Dev orchestration: `npm run dev`** [AFK]

- Add `concurrently` to root (or app-level) devDependencies.
- Define `npm run dev` at app level running Vite (client workspace) + Fastify (server workspace) in parallel.
- Update `apps/findanadvisor/package.json` with `dev`, `build`, `test`, `typecheck`, `lint`, `nanobot` scripts.
- Ensure server auto-restarts on src changes via `tsx watch` or equivalent.
- **Depends on:** Tasks 5, 6, 7.
- **Acceptance:** `npm run dev --workspace apps/findanadvisor` starts both; form at `http://localhost:5173` submits to Fastify on `:3000` via proxy.

### Task 10 — **Typecheck + lint wiring** [AFK]

- `tsconfig.json` root + `tsconfig.client.json` + `tsconfig.server.json` project references.
- ESLint flat config extending the repo convention (`@epic-web/config/eslint`).
- Prettier config reference.
- `typecheck` script runs `tsc --noEmit` against both project refs.
- **Depends on:** Tasks 1–9.
- **Acceptance:** `npm run typecheck` and `npm run lint` in the app pass clean.

### Task 11 — **Build pipeline** [AFK]

- Server: `tsc` to `server/dist/` so `node ./server/dist/mcp/index.js` is runnable for Nanobot in prod mode.
- Client: `vite build` produces `client/dist/`.
- Add `build` npm script at app level.
- **Depends on:** Task 10.
- **Acceptance:** `npm run build` produces both outputs; Nanobot can point at `./server/dist/mcp/index.js`.

### Task 12 — **Final QA (HITL)** [HITL]

- Manual smoke: `npm run dev` → fill standalone form → top 3 cards render.
- Manual smoke: `npm run nanobot` (key present) → chat greets → ask for advisor → iframe renders → submit → matches appear as markdown in chat.
- Edge cases: budget < $100 blocks submit; budget > $10B renders correctly; Denver + crypto + high still returns ≥1 match.
- Regression: no TypeScript errors; all Vitest + Playwright tests green.
- **Depends on:** Every prior task.
- **Acceptance:** User signs off. Nothing is committed (per CLAUDE.md no-commits-yet rule) until the user asks.

---

## 8. Execution order / parallelism

All tasks are dependency-linear **except** these pairs can run in parallel if using ralph-loop mode:

- Task 4 (`show_advisor_form`) and Task 5 (Fastify API) — independent once Task 3 is done.
- Task 6 (client standalone) and Task 8 (Nanobot config) — independent once Tasks 3, 4, 5 are done.

Recommended execution order (serialized, safe): 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12.

---

## 9. Testing strategy (brief)

Full matrix in PRD §Testing Decisions. At the plan level:

- **TDD is non-negotiable.** Each tracer bullet writes a failing test first, makes it pass with minimum code, then refactors.
- **Matcher tested first, in isolation** — no MCP, no Fastify, no React involved in Task 1.
- **Integration tests own their subprocess lifecycle** — Vitest global setup spawns one MCP child per test file, tears down cleanly.
- **Playwright covers both submit modes** — standalone (real backend) and embedded (harness page).
- **Nanobot chat is manual smoke only** — automating a Go binary chat UI is out of scope.

---

## 10. Out of scope for this plan (deferred to a later iteration)

- Dataset coverage automated test (user waived).
- Surfacing dropped-advisor counts in MCP responses (user chose silent drop).
- Multi-agent Nanobot configurations.
- Production build/deploy pipeline.
- Authentication, persistence, real advisor data.
- UI polish (component library, dark mode, i18n).
- CI/CD (no GitHub Actions yet per current repo state).

---

## 11. Validation gates per task

Every tracer-bullet task must pass these before moving on:

1. **Tests pass:** `npm test` in affected workspace is green.
2. **Type check:** `npm run typecheck` clean.
3. **Lint:** `npm run lint` clean.
4. **Issue marked done** in `apps/findanadvisor/docs/issues/advisor-matching/NN-*.md` (Step 3 output).
5. **Implementation notes captured** in the issue file (what was built, any deviations from plan).

No commits during implementation — per CLAUDE.md, commits only happen when the user explicitly asks.

---

## 12. Open questions requiring confirmation before Step 3 (Issues)

None. The PRD grilling resolved all decisions; this plan is a faithful expansion of the PRD.

If you want to re-open any decision, now is a cheap time. After Step 3 (Issues), changes ripple into multiple issue files.
