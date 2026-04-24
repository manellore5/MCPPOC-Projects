# Advisor Matching (Nanobot Edition) — PRD

> **Note**: This is a distinct PRD from `advisor-matching.md`. Both live under the same app (`findvisor`) but describe different architectural variants. Key differences vs. the original:
>
> | Aspect                | `advisor-matching.md` (v1)                             | `advisor-matching-nanobot.md` (this)                 |
> | --------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
> | MCP transport         | HTTP streamable (separate process)                     | stdio (Fastify spawns as subprocess)                 |
> | Project layout        | `src/{ui,api,mcp,data}/`                               | `client/` + `server/` sibling folders                |
> | Location filtering    | Proximity-based (nearby cities)                        | Exact match against 8 fixed cities                   |
> | Dataset size          | 10–15 advisors                                         | ~20 advisors, full coverage matrix                   |
> | MCP surface           | `match_advisors` + `get_advisors` + resources + prompt | `match_advisors` + `show_advisor_form` only          |
> | Input validation      | Zod everywhere                                         | Fastify's built-in JSON schema                       |
> | Risk level on advisor | Single value (must equal investor's)                   | List of accepted levels (investor's must be in list) |
> | Chat UI               | None                                                   | Nanobot agent with MCP-UI iframe form embed          |

## Problem Statement

People looking for a financial advisor have no lightweight way to narrow down compatible options based on their own profile. They want to enter a few simple inputs — location, budget, investment interests, risk tolerance — and get a short, ranked list of advisors who actually fit. They also want this available as both a standalone web form AND inside an AI chat agent, so an LLM-driven workflow can drive the matching conversationally.

## Solution

Build **Findvisor (Nanobot Edition)** — a full-stack TypeScript app with three front doors into the same pure matching engine:

1. A **React (Vite) web form** where an investor submits a profile and sees the top 3 advisors as cards.
2. A **Fastify REST API** (`POST /api/match-advisors`) that validates input and delegates matching to an MCP subprocess.
3. An **MCP server over stdio** exposing `match_advisors` and `show_advisor_form` tools. A **Nanobot agent** (configured via `nanobot.yaml`) connects to this MCP server and can embed the React form in its chat UI via an MCP-UI iframe resource. When the form is embedded, submitting posts the profile back to the parent Nanobot window so the agent picks it up as the next user turn.

The **ranking logic** lives in a pure matcher module with zero framework dependencies. It filters by location, expertise overlap, and risk level, then ranks by `0.6 * budgetFit + 0.4 * normalizedRating` and returns the top 3.

## User Stories

### Standalone web flow

1. As an investor, I want to enter my name in the form, so that my match results feel personalized.
2. As an investor, I want to pick my location from a dropdown of 8 US cities, so that I cannot submit an unsupported location.
3. As an investor, I want to enter my investable budget as a number (minimum $100, no upper limit), so that the matcher can compute budget fit.
4. As an investor, I want to select one or more investment types from a fixed list (stocks, bonds, real estate, crypto, mutual funds), so that I only see advisors who cover at least one of my interests.
5. As an investor, I want to pick my risk level from a dropdown (low, medium, high), so that only advisors who accept my risk profile are considered.
6. As an investor, I want the submit button to call `POST /api/match-advisors` with my profile, so that I get matches without refreshing.
7. As an investor, I want to see the top 3 matched advisors as cards showing name, location, expertise, rating, and accepted budget range, so that I can compare them at a glance.
8. As an investor, I want form validation to block submission when any required field is missing or invalid, so that I never submit a bad request.
9. As an investor, I want a clear loading state while matches are being computed, so that I know the app is working.
10. As an investor, I want a clear error message if the API call fails, so that I know to retry or check my inputs.

### MCP tooling

11. As an MCP client, I want a `match_advisors(userProfile, advisors?)` tool that returns the top 3 matches, so that I can invoke the matcher from any MCP-compatible host.
12. As an MCP client, I want `match_advisors` to fall back to the built-in dataset when the `advisors` parameter is omitted, so that the simplest call form just works.
13. As an MCP client, I want `match_advisors` to accept a custom advisors list, so that I can test matching against my own dataset.
14. As an MCP client, I want a `show_advisor_form` tool that returns an MCP-UI iframe resource pointing at the Vite form (with `?embedded=1`), so that I can render the form inside my chat UI.
15. As an MCP client, I want both tools to return structured output validated against a schema, so that my host can consume them safely.

### Nanobot chat flow

16. As a Nanobot user, I want to chat with an `advisor-finder` agent, so that I can find an advisor conversationally instead of filling out a web form cold.
17. As a Nanobot user, I want the agent to render the advisor form as an iframe inside the chat, so that I can enter my profile without leaving the conversation.
18. As a Nanobot user, I want submitting the embedded form to post my profile back to Nanobot as a prompt message, so that the agent picks it up as my next turn.
19. As a Nanobot user, I want the agent to call `match_advisors` with my profile automatically and respond with the top 3 matches in chat, so that I don't need to ask twice.
20. As a developer, I want `nanobot.yaml` to register only the `advisor-finder` agent and to run with `--exclude-built-in-agents`, so that no other agents clutter the chat.
21. As a developer, I want the Nanobot agent to point at the local MCP server over stdio, so that everything runs locally with no network calls to a separate MCP endpoint.
22. As a developer, I want the Nanobot agent to use an OpenAI-compatible endpoint with a configurable model (default: Gemini 2.5 Flash Lite), so that I can swap models without changing code.

### Developer experience

23. As a developer, I want the project structured as `apps/findvisor/client/` and `apps/findvisor/server/` sibling folders, so that the two runtimes are clearly separated.
24. As a developer, I want a Vite proxy forwarding `/api` to the Fastify server in dev, so that the frontend can call the backend without CORS or hardcoded URLs.
25. As a developer, I want a root script that runs both frontend and backend together using `concurrently`, so that `npm run dev` starts everything.
26. As a developer, I want Fastify to spawn the MCP server as a subprocess at startup, so that the REST layer has no knowledge of MCP internals beyond the client handle.
27. As a developer, I want POST bodies validated via Fastify's built-in JSON schema (no extra validation libraries), so that the server stays lean.
28. As a developer, I want the matcher to be a pure module with no framework dependencies, so that it can be unit-tested in isolation and reused across REST, MCP, and tests.
29. As a developer, I want about 20 mock advisors in a local JSON file — a mix of specialists and generalists — so that every combination of location + investment type + risk level returns at least one match.

## Implementation Decisions

### Project structure

All code lives under `apps/findvisor/`:

```
apps/findvisor/
├── client/                     # React + Vite frontend
│   ├── src/
│   ├── index.html
│   └── vite.config.ts          # /api proxy to Fastify in dev
├── server/                     # Fastify backend + MCP server
│   ├── src/
│   │   ├── api/                # Fastify routes and JSON schemas
│   │   ├── mcp/                # MCP server (stdio) with tools
│   │   ├── matcher/            # Pure ranking module (zero framework deps)
│   │   └── data/               # Mock advisor JSON + loader
├── nanobot.yaml                # advisor-finder agent config
├── package.json                # Root script runs client + server
└── docs/                       # PRD, plans, issues
```

### Modules

1. **Matcher module** (`server/src/matcher/`) — Deep module.
   - Single exported function: `matchAdvisors(profile, advisors)` returning `MatchResult[]`.
   - Internal helpers: `filterByLocation`, `filterByExpertise`, `filterByRisk`, `budgetFit`, `normalizeRating`, `weightedScore`, `rankAndTake3`.
   - Pure: no I/O, no framework imports, no logging. Deterministic given inputs.

2. **Data module** (`server/src/data/`).
   - Loads the 20-advisor JSON file once at startup.
   - Exports a single `getAdvisors()` function returning a validated, frozen array.
   - JSON is curated so every (location × investment type × risk level) combination has at least one match.

3. **MCP server module** (`server/src/mcp/`).
   - Entry point: stdio transport.
   - Tool `match_advisors(userProfile, advisors?)`:
     - `userProfile`: name, location, budget, investmentTypes, riskLevel.
     - `advisors`: optional — if omitted, uses the built-in dataset.
     - Calls `matchAdvisors()` from the matcher module.
     - Returns both `structuredContent` (typed matches) and `content[]` (human-readable text).
   - Tool `show_advisor_form()`:
     - Returns an MCP-UI iframe resource pointing at the Vite form URL with `?embedded=1`.
     - Form URL is configurable (default: `http://localhost:5173?embedded=1`).

4. **API module** (`server/src/api/`).
   - Fastify instance.
   - Route `POST /api/match-advisors`:
     - Body validated via Fastify's built-in JSON schema (no Zod/Ajv wrappers added as deps; Fastify ships with Ajv).
     - Delegates to the MCP subprocess via an MCP client.
     - Returns `{ matches: MatchResult[] }` as JSON.
   - On startup, spawns the MCP server as a child process and connects an MCP client to it over stdio.

5. **Client module** (`client/src/`).
   - React + Vite SPA.
   - `AdvisorForm` component: name input, location select (8 cities), budget number input, investment types multi-select, risk level select.
   - `ResultsList` component: renders top 3 match cards.
   - Routing: reads `?embedded=1` query param. If set, submit handler posts to `window.parent` via `postMessage` with a serialized prompt (e.g. `"Find me advisors for this profile: {json}"`); otherwise, calls `POST /api/match-advisors`.
   - Vite proxy: `/api` → `http://localhost:3000` (Fastify) in dev.

6. **Nanobot config** (`nanobot.yaml`).
   - Registers a single agent: `advisor-finder`.
   - Model: OpenAI-compatible endpoint, default model `gemini-2.5-flash-lite` (or any model via `OPENAI_BASE_URL` + `OPENAI_API_KEY`).
   - MCP servers: one entry pointing at the local MCP server binary over stdio.
   - Launched with `--exclude-built-in-agents`.

### Data contracts

- **InvestorProfile**: `{ name: string, location: Location, budget: number (min 100), investmentTypes: InvestmentType[] (min 1), riskLevel: RiskLevel }`
- **Advisor**: `{ id: string, name: string, location: Location, expertise: InvestmentType[], riskLevels: RiskLevel[], rating: number (1-5), budgetMin: number, budgetMax: number }`
- **MatchResult**: `{ advisor: Advisor, score: number, budgetFit: number, normalizedRating: number }`
- **Location** enum: `"Minneapolis" | "New York" | "San Francisco" | "Chicago" | "Los Angeles" | "Denver" | "Miami" | "Boston"`
- **InvestmentType** enum: `"stocks" | "bonds" | "real_estate" | "crypto" | "mutual_funds"`
- **RiskLevel** enum: `"low" | "medium" | "high"`

### Ranking formula

```
budgetFit =
  1.0                                       if budgetMin ≤ budget ≤ budgetMax
  1.0 - (budgetMin - budget) / budgetMin    if budget < budgetMin   (clamped to [0, 1])
  1.0 - (budget - budgetMax) / budgetMax    if budget > budgetMax   (clamped to [0, 1])

normalizedRating = (rating - 1) / 4          // 1-5 scale mapped to 0-1

score = 0.6 * budgetFit + 0.4 * normalizedRating
```

Return top 3 by `score` descending. If fewer than 3 advisors pass filters, return whatever qualifies.

### API contract

- `POST /api/match-advisors`
  - Request: `InvestorProfile` (JSON)
  - 200: `{ matches: MatchResult[] }`
  - 400: `{ error: string }` (validation error from Fastify JSON schema)
  - 500: `{ error: string }` (MCP subprocess or matcher failure)

### Nanobot flow

1. User opens Nanobot chat.
2. User asks: "Help me find a financial advisor."
3. Agent calls `show_advisor_form` MCP tool → gets iframe resource → Nanobot renders it.
4. User fills the form; submit posts `window.parent.postMessage({ type: "prompt", text: "..." })`.
5. Nanobot consumes the prompt as the user's next turn.
6. Agent calls `match_advisors` with the parsed profile.
7. Agent summarizes the top 3 matches in chat.

### Defaults / assumptions (made because no clarification was given)

- **Nanobot** assumed to be an MCP-aware agent runtime that reads `nanobot.yaml` with `agents:` and `mcpServers:` sections and supports a `--exclude-built-in-agents` CLI flag.
- **Model default**: `gemini-2.5-flash-lite` via OpenAI-compatible endpoint. User's original spec said "Gemini 2.5 Flash Lite or any other anthropic via the OpenAI-compatible endpoint"; interpreted as "any model via the OpenAI-compatible endpoint," with Gemini 2.5 Flash Lite as the default.
- **8 cities**: picked for geographic spread — Minneapolis, New York, San Francisco, Chicago, Los Angeles, Denver, Miami, Boston.

## Testing Decisions

### Testing philosophy

Good tests exercise a module's public interface with realistic inputs and assert observable behavior — not internal calls, not private state. Tests should continue to pass through refactors that don't change what the module promises.

### Modules and boundaries

| Module              | Approach     | Boundary                                        | What to test                                                                                                                                                                                                       |
| ------------------- | ------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Matcher             | Unit         | `matchAdvisors()`                               | Filter correctness (location, expertise overlap, risk in list); budget fit scoring (inside range, below, above, clamped to 0); rating normalization; weighted score; top-3 ordering; fewer than 3 qualifying; ties |
| Data                | Unit         | `getAdvisors()`                                 | JSON parses, schema validates, dataset covers every (location × type × risk) combo                                                                                                                                 |
| MCP Server          | Integration  | MCP client ↔ stdio server                       | `match_advisors` with and without `advisors` arg returns correct structured output; `show_advisor_form` returns a valid MCP-UI iframe resource                                                                     |
| API                 | Integration  | HTTP request ↔ response, MCP subprocess running | `POST /api/match-advisors` happy path; invalid body → 400 with schema error; MCP failure → 500                                                                                                                     |
| Client              | Unit + E2E   | Component render + full browser flow            | Form validation; standalone submit calls `/api/match-advisors`; embedded mode (`?embedded=1`) posts to parent via `postMessage`; results cards render                                                              |
| Nanobot integration | Manual smoke | End-to-end chat                                 | Agent renders iframe, form submit reaches agent as prompt, `match_advisors` returns matches in chat                                                                                                                |

### TDD

Red/Green/Refactor is mandatory for every module. One failing test → minimal code to pass → refactor. Build vertical tracer bullets through each module before going wide.

### Testing stack

- **Vitest** for unit + integration
- **Playwright** for client E2E (standalone and embedded modes — the latter via a harness page that hosts the form in an iframe and listens for `postMessage`)
- **Nanobot integration** smoke-tested manually (documented in the repo); automating Nanobot is out of scope.

### Prior art

Follow test patterns from `apps/mcp-ui`: Vitest `globalSetup` for spawning servers, Playwright for browser flows, `@epic-web/invariant` for runtime assertions.

## Out of Scope

- User authentication, accounts, or sessions.
- Persistent database (mock JSON only).
- Real advisor data or third-party data sources.
- Advisor onboarding or profile editing.
- Messaging, scheduling, or payments between investors and advisors.
- Real geolocation or distance calculations (exact city match only).
- Production deployment, hosting, or CI/CD.
- Automated tests for the Nanobot chat itself (manual smoke only).
- Multi-agent Nanobot configurations (single agent only, `--exclude-built-in-agents`).
- Any UI framework beyond plain React components (no component library required).

## Domain Terms

Key domain terms used in this PRD (see `CONTEXT.md` for the full glossary):

- **Advisor**: Financial advisor with location, expertise, risk levels accepted, rating, and budget range.
- **Investor**: Person submitting a profile to find advisors.
- **Budget**: Investor's total investable amount (min $100, no cap).
- **Investment Type**: Financial instrument category; called "expertise" on the advisor side.
- **Risk Level**: low / medium / high. Investor has one; advisor has a list.
- **Match**: Ranked recommendation pairing an investor with a compatible advisor.
- **Budget Fit**: 0-1 score, 1.0 inside range, linear decay outside.
- **Weighted Score**: `0.6 * budgetFit + 0.4 * normalizedRating`.
- **Nanobot**: Agent runtime configured via `nanobot.yaml`.
- **MCP-UI iframe resource**: Iframe resource returned by `show_advisor_form`.
- **Embedded mode**: Form behavior when loaded with `?embedded=1` — posts profile to parent window instead of calling the API.

## Further Notes

- The matcher is the deepest module in the system — build and test it first (vertical tracer bullet #1).
- The mock dataset is a deliberate coverage matrix, not a realistic distribution. Each of 8 locations × 5 investment types × 3 risk levels should have at least one advisor combining that triple.
- `?embedded=1` is intentionally a simple query flag rather than a separate route — same form, two submit behaviors.
- The Fastify server owns the MCP subprocess lifecycle: spawn on startup, kill on shutdown. Fastify talks to the MCP server via an in-process MCP client over the child's stdio.
- Nanobot connects to the same MCP server independently — it does NOT go through Fastify. (Two MCP clients, one stdio server process... TBD whether stdio-over-subprocess allows two clients. If not, the MCP server may need to support being spawned twice — once by Fastify, once by Nanobot — each owning its own subprocess.)
