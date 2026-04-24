# Advisor Matching — PRD (`findanadvisor`)

> **Provenance:** This PRD was produced through a one-question-at-a-time grilling session (see `CONTEXT.md` for the resolved domain glossary). Every "Implementation Decision" below is traceable to a specific grill-question answer and represents a deliberate trade-off, not a default.

## Problem Statement

People looking for a financial advisor have no lightweight way to narrow the field to a short, ranked list that actually fits their profile. They want to enter five inputs — location, name, budget, investment types, risk tolerance — and see 1–3 matched advisors ranked by how well the advisor's accepted budget range and rating fit them.

They also want this matcher available inside an **AI chat agent** so a Claude-driven conversation can drive the matching via MCP tools — rendering the same form as an embedded iframe inside the chat, and picking up the user's submitted profile as the next conversational turn.

## Solution

Build **findanadvisor** — a full-stack TypeScript application with three entry points into one pure matcher:

1. A **React (Vite) web form** rendered as a standalone page. User fills it, clicks **"Find Advisor"**, and sees the top 3 matched advisors as cards below the form.
2. A **Fastify REST API** (`POST /api/match-advisors`) that validates the submitted profile via Fastify's built-in JSON schema and delegates matching to an MCP subprocess it owns.
3. An **MCP server over stdio** exposing two tools — `match_advisors` and `show_advisor_form`. A **Nanobot agent** (configured via `nanobot.yaml`, running Claude Sonnet) connects to this MCP server as a second stdio subprocess. When the user asks to find an advisor, the agent calls `show_advisor_form`, Nanobot renders the Vite form as an MCP-UI iframe, the user submits, the form `postMessage`s the profile back to Nanobot as a prompt, and the agent calls `match_advisors` to produce a markdown summary in the chat.

**Ranking logic** lives in a pure matcher module with zero framework dependencies. It filters by exact location, investment-type overlap (≥1), and whether the investor's risk level is in the advisor's accepted list — then ranks the survivors by `0.6 · budgetFit + 0.4 · normalizedRating`, returning up to 3 matches (minimum 1, guaranteed by dataset curation).

## User Stories

### Standalone web form

1. As an investor, I want to enter my name in a text field, so the results feel personalized.
2. As an investor, I want to pick my location from a dropdown of 8 US cities, so I can't submit an unsupported city.
3. As an investor, I want to enter my investable budget as a number (minimum $100, no upper limit), so the matcher can compute a budget-fit score.
4. As an investor, I want to select one or more investment types (stocks, bonds, real estate, crypto, mutual funds), so I only see advisors who cover at least one of my interests.
5. As an investor, I want to pick my risk level (low, medium, high) from a dropdown, so only advisors who accept my risk profile are considered.
6. As an investor, I want the submit CTA labeled **"Find Advisor"**, so the action is unambiguous.
7. As an investor, I want the form to show inline per-field validation errors, so I know exactly what to fix before submit.
8. As an investor, I want the submit button disabled until all required fields are valid, so I can't send a bad request.
9. As an investor, I want to see a loading state while matches are being computed, so I know the app is working.
10. As an investor, I want to see 1–3 top matched advisors as cards showing name, location, expertise badges, rating (`X.X/5`), and accepted budget range, so I can compare them at a glance.
11. As an investor, I want a friendly error message with a "Try again" button if the API call fails, so I know to retry without losing my inputs.

### MCP tooling (stdio)

12. As an MCP client, I want a `match_advisors(userProfile, advisors?)` tool that returns up to 3 matches ranked by weighted score, so I can invoke the matcher from any MCP-compatible host.
13. As an MCP client, I want `match_advisors` to fall back to the built-in 20-advisor dataset when the `advisors` parameter is omitted, so the simplest call form just works.
14. As an MCP client, I want to pass a custom `advisors` array and have the tool **silently drop** any malformed entries (logging count + first failure to stderr), so partial-junk input still gets me a usable answer.
15. As an MCP client, I want a `show_advisor_form()` tool that returns an MCP-UI `externalUrl` iframe resource (`mimeType: text/uri-list`, URI `ui://findanadvisor/advisor-form`) pointing at the Vite form with `?embedded=1`, so my chat UI can render the form inline.
16. As an MCP client, I want every tool response to include both `structuredContent` (typed) and `content[]` (human-readable text fallback), so even hosts that don't implement MCP-UI show something useful.

### Nanobot chat flow

17. As a Nanobot user, I want to chat with an `advisor-finder` agent powered by Claude Sonnet, so I can find an advisor conversationally.
18. As a Nanobot user, I want the agent to wait for me to ask (it doesn't auto-render on turn 1), so the chat starts with a greeting.
19. As a Nanobot user, I want the agent to call `show_advisor_form` when I ask to find an advisor, so an embedded iframe of the form appears in chat.
20. As a Nanobot user, I want submitting the embedded form to `postMessage` my profile back to Nanobot as a prompt, so the agent picks it up as my next turn.
21. As a Nanobot user, I want the form to stay visible after submit with a **"Sent to chat ✓"** confirmation, so I can tweak my profile and resubmit without asking the agent to re-render the form.
22. As a Nanobot user, I want the agent to call `match_advisors` with my profile and respond with a short markdown summary of the top 3, so I don't need to ask twice.
23. As a developer, I want `nanobot.yaml` to register only the `advisor-finder` agent and run with `--exclude-built-in-agents`, so no other agents clutter the chat.
24. As a developer, I want the Nanobot agent to connect to a fresh stdio subprocess of the same MCP server that Fastify owns independently, so MCP logic is shared at the artifact level but process-isolated at runtime.
25. As a developer, I want Nanobot to fail fast at startup with a clear error when `ANTHROPIC_API_KEY` is missing, so I know immediately what's wrong.

### Developer experience

26. As a developer, I want the project structured as `apps/findanadvisor/client/` and `apps/findanadvisor/server/` sibling folders, so the two runtimes are clearly separated.
27. As a developer, I want a Vite proxy forwarding `/api` to Fastify (port 3000) in dev, so the frontend calls the backend without CORS or hardcoded URLs.
28. As a developer, I want a root script `npm run dev` that runs Vite + Fastify concurrently, so I can start the stack with one command.
29. As a developer, I want a separate `npm run nanobot` script that launches Nanobot against `nanobot.yaml`, so the optional chat agent doesn't block the core REST/UI stack.
30. As a developer, I want Fastify to spawn the MCP server as a child process at startup and connect an in-process MCP client over stdio, so the REST layer has no knowledge of MCP internals beyond the client handle.
31. As a developer, I want POST bodies validated via Fastify's built-in Ajv-backed JSON schema (no Zod/Ajv deps added at the REST boundary), so the server stays lean.
32. As a developer, I want the matcher to be a pure module with no framework dependencies, so it can be unit-tested in isolation and reused across REST, MCP, and tests.
33. As a developer, I want 20 mock advisors in a local JSON file — 8 broad generalists (one per city) + 12 focused specialists — so every `(location × investment type × risk level)` triple hits at least one advisor.
34. As a developer, I want a dataset coverage invariant held by human curation (no automated coverage test), so editing the JSON stays fast; the runtime "min 1 match" safety net is the only guard.

## Implementation Decisions

### Project structure

```
apps/findanadvisor/
├── client/                          # React + Vite frontend
│   ├── src/
│   │   ├── AdvisorForm.tsx          # Shared form (standalone + embedded)
│   │   ├── ResultsList.tsx          # Top-3 cards
│   │   ├── api.ts                   # fetch wrapper for /api/match-advisors
│   │   └── postMessageBridge.ts     # ?embedded=1 → window.parent.postMessage
│   ├── index.html
│   └── vite.config.ts               # Proxy /api → http://localhost:3000
├── server/                          # Fastify + MCP server
│   ├── src/
│   │   ├── api/                     # Fastify routes, JSON schemas, MCP client
│   │   ├── mcp/                     # stdio MCP server, tools, Zod schemas
│   │   │   ├── index.ts             # Shared entrypoint (Fastify + Nanobot)
│   │   │   └── tools/
│   │   │       ├── match-advisors.ts
│   │   │       └── show-advisor-form.ts
│   │   ├── matcher/                 # Pure ranking module (zero framework deps)
│   │   └── data/
│   │       └── advisors.json        # 20 curated advisors
├── nanobot.yaml                     # advisor-finder agent config
├── .env.example                     # Anthropic key slot + optional Gemini
├── package.json                     # npm run dev + npm run nanobot
└── docs/
    ├── prd/advisor-matching.md      # ← this file
    ├── plans/
    └── issues/
```

### Modules

1. **Matcher module** (`server/src/matcher/`) — Deep module, pure, framework-free.
   - Single exported function: `matchAdvisors(profile, advisors)` → `MatchResult[]` of length 1–3.
   - Internal helpers: `filterByLocation`, `filterByExpertiseOverlap`, `filterByRiskInList`, `budgetFit`, `normalizeRating`, `weightedScore`, `rankAndTakeUpTo3`.
   - Deterministic, no I/O, no logging, no imports from Fastify/Zod/MCP SDK.

2. **Data module** (`server/src/data/`).
   - Loads `advisors.json` once at startup.
   - Parses and validates the full array against the Advisor Zod schema; invalid file = hard crash at startup (fail loud).
   - Exports `getAdvisors()` returning a frozen, typed `Advisor[]`.

3. **MCP server module** (`server/src/mcp/`).
   - Entry: `index.ts` using `@modelcontextprotocol/sdk` with stdio transport.
   - Tool `match_advisors(userProfile, advisors?)`:
     - Input schema validated with Zod inside the MCP tool registration.
     - If `advisors` omitted → uses built-in dataset (already pre-validated).
     - If `advisors` provided → **lenient validation**: for each entry, try to parse against Advisor schema; drop invalid entries silently; log `"dropped N of M advisors: <first reason>"` to stderr. If all entries are invalid (effective input `[]`), matcher returns `[]` → tool throws, satisfying the min-1 safety net (Fastify surfaces as 500).
     - Delegates to pure `matchAdvisors()`.
     - Response: both `structuredContent: { matches: MatchResult[] }` (typed) and `content[]` (a human-readable text block per match).
   - Tool `show_advisor_form()` (no arguments):
     - Reads `FINDANADVISOR_FORM_URL` env var (default: `http://localhost:5173?embedded=1`).
     - Returns MCP-UI `externalUrl` iframe resource: `mimeType: text/uri-list`, `uri: ui://findanadvisor/advisor-form`, `text: <url>`.
     - Response also includes `structuredContent: { url }` and a plain text `content[]` block ("Opening the advisor profile form...").

4. **API module** (`server/src/api/`).
   - Fastify instance; Ajv-backed JSON schema on `POST /api/match-advisors`.
   - At startup: `spawn("tsx", ["server/src/mcp/index.ts"])` in dev or `spawn("node", ["server/dist/mcp/index.js"])` in prod. Connects an MCP client over the child's stdio.
   - On shutdown: gracefully SIGTERMs the MCP child; hard-kills after 2s timeout.
   - Request: `InvestorProfile` JSON → delegates to `match_advisors` over MCP → 200 with `{ matches: MatchResult[] }` (length 1–3). 400 on JSON-schema validation failure. 500 on MCP/subprocess/matcher failure.

5. **Client module** (`client/src/`).
   - Single-page React + Vite app. Root route renders `AdvisorForm` + conditional `ResultsList` below it.
   - **Standalone mode** (default): form submit calls `POST /api/match-advisors` via fetch; renders `ResultsList` with the returned matches inline below the form.
   - **Embedded mode** (`?embedded=1`): form submit calls `window.parent.postMessage({ type: "prompt", payload: { prompt: "Find me advisors matching this profile: " + JSON.stringify(profile) } }, "*")`. Form stays visible; a "Sent to chat ✓" confirmation appears next to the CTA for 3 seconds. No local `ResultsList` rendering in embedded mode.
   - Vite proxy: `/api` → `http://localhost:3000`.

6. **Nanobot config** (`nanobot.yaml`).
   - One agent entry: `advisor-finder`.
   - Model: `claude-sonnet-4-6` (native Anthropic endpoint, auto-selected by model name).
   - `mcpServers`: one entry with stdio command `node ./server/dist/mcp/index.js` (or `tsx ./server/src/mcp/index.ts` in dev).
   - Agent instructions (short system prompt): greet the user, on intent-to-find-advisor call `show_advisor_form`, after receiving a profile-containing user turn call `match_advisors`, format the top 3 as a concise markdown list (name, location, expertise badges, rating, budget range).
   - Launched via `npm run nanobot` which runs `nanobot run ./nanobot.yaml --exclude-built-in-agents`.

### Data contracts

**`InvestorProfile`**

```ts
{
  name: string;                      // non-empty
  location: Location;                // enum, one of 8 cities
  budget: number;                    // min 100, no max
  investmentTypes: InvestmentType[]; // min 1 entry
  riskLevel: RiskLevel;              // single value
}
```

**`Advisor`**

```ts
{
  id: string;                        // stable identifier
  name: string;
  location: Location;                // one of 8 cities
  expertise: InvestmentType[];       // min 1 entry
  riskLevels: RiskLevel[];           // ≥1 accepted level
  rating: number;                    // 1–5, floats allowed
  budgetMin: number;
  budgetMax: number;                 // budgetMin ≤ budgetMax
}
```

**`MatchResult`**

```ts
{
  advisor: Advisor;
  score: number; // 0–1
  budgetFit: number; // 0–1
  normalizedRating: number; // 0–1
}
```

**Enums**

- `Location`: `"Minneapolis" | "New York" | "San Francisco" | "Chicago" | "Los Angeles" | "Denver" | "Miami" | "Boston"`
- `InvestmentType`: `"stocks" | "bonds" | "real_estate" | "crypto" | "mutual_funds"`
- `RiskLevel`: `"low" | "medium" | "high"`

### Ranking formula

```
// Budget fit: 1.0 inside range, linear decay outside, clamped to [0, 1]
if budgetMin ≤ budget ≤ budgetMax:
    budgetFit = 1.0
elif budget < budgetMin:
    budgetFit = clamp(1.0 - (budgetMin - budget) / budgetMin, 0, 1)
else:  // budget > budgetMax
    budgetFit = clamp(1.0 - (budget - budgetMax) / budgetMax, 0, 1)

// Rating normalized from 1–5 to 0–1
normalizedRating = (rating - 1) / 4

// Weighted score
score = 0.6 * budgetFit + 0.4 * normalizedRating
```

Filter pipeline applied before ranking:

1. `advisor.location === profile.location` (exact)
2. `profile.investmentTypes.some(t => advisor.expertise.includes(t))` (≥1 overlap)
3. `advisor.riskLevels.includes(profile.riskLevel)`

Then: `rank desc by score → take up to 3 → assert length ≥ 1`.

### REST API contract

`POST /api/match-advisors`

- **Request:** `InvestorProfile` (JSON body)
- **200:** `{ matches: MatchResult[] }` — array length 1, 2, or 3
- **400:** `{ error: string }` — JSON-schema validation failure (Fastify/Ajv)
- **500:** `{ error: string }` — MCP subprocess or matcher failure, including the min-1 safety net

### MCP ↔ Nanobot flow (chat)

1. User opens Nanobot chat at `http://localhost:8080`.
2. User asks: "Help me find a financial advisor."
3. Agent calls `show_advisor_form` → receives iframe resource → Nanobot renders iframe pointing at `http://localhost:5173?embedded=1`.
4. User fills form and clicks **Find Advisor**. Form calls `window.parent.postMessage({ type: "prompt", payload: { prompt: "Find me advisors matching this profile: {...}" } }, "*")`. Form shows "Sent to chat ✓" for 3s; stays visible.
5. Nanobot ingests the prompt as the next user turn.
6. Agent calls `match_advisors` with the parsed profile.
7. Agent renders the top 3 matches as markdown in the chat (name, location, expertise badges, rating, budget range).

### Ports and dev orchestration

- **Vite (client):** `5173`
- **Fastify (REST API):** `3000`
- **Nanobot (chat UI):** `8080`
- **MCP server:** stdio subprocess — no port

- `npm run dev` → runs Vite + Fastify concurrently. Fastify spawns its own MCP subprocess; no API key needed.
- `npm run nanobot` → runs `nanobot run ./nanobot.yaml --exclude-built-in-agents`. Requires `ANTHROPIC_API_KEY`. Nanobot spawns its own MCP subprocess via `nanobot.yaml`.
- The two npm scripts are independent — Nanobot doesn't talk to Fastify; it talks to its own MCP subprocess.

### Secrets / env

Committed: `.env.example`:

```
# Required for Nanobot chat (npm run nanobot)
ANTHROPIC_API_KEY=sk-ant-...

# Optional override for the form URL inside MCP-UI iframe resource
# FINDANADVISOR_FORM_URL=http://localhost:5173?embedded=1
```

Gitignored: `.env` — user's real key. Loaded via `dotenv-cli` wrapper in `npm run nanobot`.

## Testing Decisions

### Testing philosophy

Tests exercise each module's **public interface** with realistic inputs and assert observable behavior. They do not mock internal helpers, do not assert on private state, and continue to pass through refactors that don't change the module's contract.

### TDD

Red/Green/Refactor is **mandatory** for every module. One failing test → minimal code to pass → refactor. Tracer bullets are vertical (thin slice through all layers) before the stack goes wide.

### Modules and boundaries

| Module            | Approach     | Boundary                                         | What to test                                                                                                                                                                                                                                                                  |
| ----------------- | ------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Matcher**       | Unit         | `matchAdvisors()`                                | Location filter (exact match); expertise overlap (≥1); risk in list; budget fit scoring (inside range, below min, above max, clamped to 0); rating normalization; weighted score; top-3 ordering; ties; 1-match and 2-match cases; min-1 invariant throws when input is empty |
| **Data**          | Unit         | `getAdvisors()`                                  | JSON parses successfully; full array passes Advisor Zod schema at startup; malformed file crashes startup with readable error                                                                                                                                                 |
| **MCP Server**    | Integration  | MCP client ↔ stdio server                        | `match_advisors` with no `advisors` arg uses built-in data; with valid `advisors` passes through; with partial-junk drops invalid entries and logs count; with all-invalid throws; `show_advisor_form` returns well-formed MCP-UI iframe resource with the configured URL     |
| **API**           | Integration  | HTTP request/response with a live MCP subprocess | `POST /api/match-advisors` happy path returns `{ matches: MatchResult[] }`; body-validation failure returns 400; MCP throw returns 500; 1-match, 2-match, 3-match shapes                                                                                                      |
| **Client**        | Unit + E2E   | Component render + browser flow                  | Form field validation (inline errors); submit button disabled until valid; standalone submit calls `/api/match-advisors` and renders cards; embedded mode (`?embedded=1`) posts to parent via `postMessage` and shows "Sent to chat ✓"; API-failure UI renders "Try again"    |
| **Nanobot agent** | Manual smoke | End-to-end chat                                  | Agent greets; calls `show_advisor_form` on intent; iframe renders; form submit reaches agent as prompt; `match_advisors` response is summarized in markdown                                                                                                                   |

### Testing stack

- **Vitest** — unit + integration. Global setup spawns the MCP subprocess once for MCP/API integration tests.
- **Playwright** — client E2E. Separate spec for standalone submit flow and for embedded-mode `postMessage` flow (via a harness page that hosts the iframe and listens).
- **Nanobot integration** — manual smoke, documented in the repo. Automating Nanobot is out of scope.

### Prior art

Test patterns from `apps/mcp-ui` in this monorepo (Vitest `globalSetup` for server lifecycle, Playwright for E2E). No code is copied — just the shape.

## Out of Scope

- Authentication, accounts, sessions, or any notion of "logged-in user" — each form submission is stateless.
- Persistent database. Mock JSON only; no reads or writes at runtime beyond the startup load.
- Real advisor data or external data sources.
- Advisor onboarding, profile editing, or CRUD operations.
- Messaging, scheduling, or payments between investors and advisors.
- Real geolocation or distance calculations — location is exact match against 8 fixed cities.
- Production deployment, hosting, or CI/CD pipelines.
- Automated tests for the Nanobot chat itself (manual smoke only).
- Multi-agent Nanobot configurations. Single agent only; `--exclude-built-in-agents` enforced.
- Dataset coverage _test_ (user chose curation over test — see user story #34).
- UI component library or design system — plain React components with minimal CSS.
- Internationalization, accessibility beyond sensible defaults (labels, keyboard nav), dark mode.
- Surfacing dropped-advisor counts to the MCP caller (per user's Option C in Q9 — stderr log only).

## Domain Terms

Key terms used in this PRD — see `CONTEXT.md` for the full glossary:

- **Advisor**: financial advisor with location, expertise, accepted risk levels, rating, budget range.
- **Investor**: person submitting a profile (the chat user or web-form user).
- **Budget**: investor's total investable amount; min $100, no cap.
- **Investment Type**: financial instrument category; called "expertise" on the advisor side.
- **Risk Level**: `low` / `medium` / `high`. Investor has one; advisor accepts a list.
- **Match**: ranked recommendation pairing an investor with a compatible advisor.
- **Budget Fit**: 0–1 score, 1.0 inside range, linear decay outside, clamped.
- **Weighted Score**: `0.6 · budgetFit + 0.4 · normalizedRating`.
- **Nanobot**: the `nanobot-ai/nanobot` Go binary — MCP host / chat runtime configured via `nanobot.yaml`.
- **MCP-UI iframe resource**: `externalUrl` resource returned by `show_advisor_form`.
- **Embedded mode**: form behavior when loaded with `?embedded=1` — posts profile to parent via `window.parent.postMessage` instead of calling the REST API.

## Further Notes

- The matcher is the deepest module — build and test it first (tracer bullet #1).
- The 20-advisor dataset is a deliberate coverage matrix. The 8 generalists alone are sufficient for the 120-combo coverage guarantee; the 12 specialists exist for realism and ranking variety.
- `?embedded=1` is a query flag on the same route, not a separate page. Same form, two submit behaviors.
- Fastify owns its MCP subprocess lifecycle (spawn at startup, kill on shutdown). Nanobot independently spawns its own MCP subprocess via `nanobot.yaml`. Two processes at runtime.
- The `OPENAI_*` env vars are not used for this app. Claude Sonnet is invoked via the native Anthropic endpoint auto-selected by the model name in `nanobot.yaml`. Documenting only `ANTHROPIC_API_KEY`.
- Lenient validation of the custom `advisors` argument means malformed input is silently fault-tolerant. If future Jared-the-MCP-client complains about silent drops, revisit Q9.
