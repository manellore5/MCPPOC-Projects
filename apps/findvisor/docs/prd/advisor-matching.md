# Advisor Matching — PRD

## Problem Statement

Investors looking for financial advisors have no easy way to find compatible matches based on their specific needs. An investor in Minneapolis with a $500K portfolio interested in stocks and real estate shouldn't have to manually sift through advisors — they need a system that filters by proximity, investment type overlap, and risk tolerance, then ranks the best fits by budget compatibility and advisor quality.

## Solution

Build **Findvisor**, a full-stack TypeScript application that matches investors with financial advisors. An investor fills out a profile form (name, location, budget, investment types, risk level), submits it, and instantly sees their top 2–3 matched advisors ranked by compatibility.

The matching engine runs as a standalone MCP server exposing tools, resources, and prompts — keeping domain logic decoupled from both the REST API layer and the UI. The Fastify API calls the MCP tool internally, and the React frontend consumes the API.

## User Stories

1. As an investor, I want to enter my name on the profile form, so that my match results are personalized.
2. As an investor, I want to enter my location (US city), so that I am matched with advisors near me.
3. As an investor, I want to enter my total investable budget, so that advisors who accept my portfolio size are prioritized.
4. As an investor, I want to select one or more investment types (stocks, bonds, real estate, crypto, mutual funds), so that I find advisors who specialize in my areas of interest.
5. As an investor, I want to select my risk level (low, medium, high), so that I am paired with advisors who share my risk tolerance.
6. As an investor, I want to submit my profile and see my top matched advisors, so that I can quickly identify who to work with.
7. As an investor, I want to see a minimum of 2 and maximum of 3 matched advisors, so that I have meaningful choices without being overwhelmed.
8. As an investor, I want matches filtered by location proximity (not exact city), so that I see advisors in nearby cities too.
9. As an investor, I want matches filtered by at least one investment type overlap, so that every recommended advisor covers something I care about.
10. As an investor, I want matches filtered by matching risk level, so that every recommended advisor aligns with my risk tolerance.
11. As an investor, I want matches ranked by budget fit, so that advisors whose accepted range best fits my portfolio appear higher.
12. As an investor, I want matches ranked by advisor rating, so that higher-quality advisors are surfaced when budget fit is similar.
13. As an investor, I want to see each matched advisor's name, location, specialties, rating, and budget range, so that I can evaluate them at a glance.
14. As an investor, I want form validation on all required fields, so that I cannot submit an incomplete profile.
15. As an investor, I want clear error messages when no matches are found, so that I understand why and can adjust my criteria.
16. As an MCP client, I want to call the `match_advisors` tool with an investor profile, so that I can integrate matching into any MCP-compatible workflow.
17. As an MCP client, I want to call the `get_advisors` tool, so that I can retrieve the full list of available advisors.
18. As an MCP client, I want to read the `findvisor://advisors` resource, so that I can browse all advisors without calling a tool.
19. As an MCP client, I want to read the `findvisor://advisors/{id}` resource, so that I can inspect a single advisor's full profile.
20. As an MCP client, I want to use the `find_advisor` prompt, so that I get a guided experience for building an investor profile and finding matches.
21. As a developer, I want mock advisor data stored in a local JSON file, so that the app works without a database.
22. As a developer, I want the MCP server to run as a standalone HTTP streamable server, so that any MCP client can connect to it.
23. As a developer, I want the MCP matching logic fully separated from the Fastify REST layer, so that each can evolve independently.
24. As a developer, I want a single script to start both frontend and backend locally, so that setup is frictionless.
25. As a developer, I want Zod schemas validating all inputs and outputs, so that type safety is enforced at runtime boundaries.

## Implementation Decisions

### Modules

1. **Data Module** (`src/data/`)
   - Loads and provides access to the mock advisor dataset (10–15 advisors in a JSON file)
   - Exports typed accessor functions with Zod-validated output
   - Deep module: simple interface (get all, get by ID), encapsulates data loading and validation

2. **Matching Engine Module** (`src/matching/`)
   - Pure function: takes an investor profile and advisor list, returns ranked matches
   - Filter pipeline: location proximity → investment type overlap (at least 1) → risk level equality
   - Ranking: budget fit score + advisor rating
   - Enforces min 2, max 3 result constraint
   - Deep module: single `matchAdvisors(profile, advisors)` function encapsulating all filter/rank logic

3. **MCP Server Module** (`src/mcp/`)
   - Standalone MCP server using `@modelcontextprotocol/sdk` with HTTP streamable transport
   - Registers tool: `match_advisors` (calls matching engine), `get_advisors` (returns all advisors)
   - Registers resources: `findvisor://advisors` (list), `findvisor://advisors/{id}` (single)
   - Registers prompt: `find_advisor` (guided matching flow)
   - Returns both `structuredContent` and `content[]` from tools
   - Zod schemas for all tool inputs/outputs

4. **API Module** (`src/api/`)
   - Fastify server with `POST /match-advisors` endpoint
   - Connects to MCP server as a client, calls `match_advisors` tool
   - Validates request body with Zod
   - Keeps REST concerns (routing, HTTP status codes, serialization) separate from matching logic

5. **UI Module** (`src/ui/`)
   - React (Vite) single-page application
   - Profile form: name, location (dropdown of US cities), budget (number), investment types (multi-select checkboxes), risk level (radio buttons)
   - Results display: card layout showing matched advisors with name, location, specialties, rating, budget range
   - Form validation before submission
   - Loading and error states

### Schemas

- **InvestorProfile**: name (string), location (string), budget (number, minimum $100, no upper limit), investmentTypes (array of enum), riskLevel (enum)
- **Advisor**: id (string), name (string), location (string), specialties (array of investment type enum), rating (number 1-5), budgetMin (number), budgetMax (number), riskLevel (enum)
- **MatchResult**: advisor (Advisor), score (number), matchReasons (array of string)
- **Investment Type enum**: stocks, bonds, real_estate, crypto, mutual_funds
- **Risk Level enum**: low, medium, high

### API Contract

- `POST /match-advisors`
  - Request body: `InvestorProfile`
  - Response: `{ matches: MatchResult[] }`
  - Error responses: 400 (validation), 404 (no matches found meeting minimum threshold)

### Architecture

- MCP server runs as a separate process on its own port
- Fastify API connects to MCP server as a client via HTTP streamable transport
- React frontend calls Fastify API via fetch
- All three processes started via a single npm script using concurrently

## Testing Decisions

### Testing Philosophy

Good tests verify external behavior through public interfaces, not implementation details. A test should break only when the feature it describes breaks, not when internal code is refactored.

### Modules and Boundaries

| Module          | Approach    | Boundary                             | What to test                                                                                                             |
| --------------- | ----------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Data            | Unit        | Exported accessor functions          | Returns valid typed data, handles missing/malformed JSON                                                                 |
| Matching Engine | Unit        | `matchAdvisors()` function           | Filtering logic (proximity, overlap, risk), ranking order, min/max constraints, edge cases (no matches, exactly 2, ties) |
| MCP Server      | Integration | MCP client ↔ server over transport   | Tool calls return correct structured output, resources resolve, prompt returns expected messages                         |
| API             | Integration | HTTP request ↔ response              | Endpoint returns matches for valid input, validates bad input, handles MCP client errors                                 |
| UI              | Unit + E2E  | Component rendering + full form flow | Form validation, form submission triggers API call, results render correctly, error/loading states display               |

### Testing Stack

- **Unit tests**: Vitest
- **Integration tests**: Vitest with real MCP client/server connections and real HTTP requests
- **E2E tests**: Playwright for full browser-based form submission flow
- **TDD**: All modules built using Red/Green/Refactor — tests written before implementation code

### Prior Art

- Follow test patterns from `apps/mcp-ui` — Vitest with `globalSetup.ts` for server lifecycle, Playwright for E2E

## Out of Scope

- User authentication or accounts
- Persistent database (using local JSON file)
- Real advisor data or third-party data sources
- Advisor onboarding or profile management
- Chat or messaging between investors and advisors
- Payment processing or fee calculation
- Deployment to production (local development only)
- CI/CD pipeline
- Real geolocation or distance calculation (simplified proximity model)
- Advisor availability or scheduling

## Domain Terms

Key domain terms used in this PRD (reference CONTEXT.md for full glossary):

- **Advisor**: A financial advisor with specialties, location, budget range, and risk level
- **Investor**: A person seeking a financial advisor, characterized by location, budget, investment preferences, and risk tolerance
- **Budget**: The investor's total investable amount; advisors define a min/max range they accept
- **Investment Type**: Broad category of financial instrument (stocks, bonds, real estate, crypto, mutual funds)
- **Risk Level**: Risk tolerance category (low, medium, high); must match between investor and advisor
- **Match**: A ranked recommendation pairing an investor with compatible advisors
- **Rating**: An advisor's quality score (1–5); used for ranking, not filtering

## Further Notes

- Location proximity is simplified for the MVP — a hardcoded proximity map of nearby US cities rather than real geolocation. Cities in the dataset: Minneapolis, St. Paul, Chicago, New York, Newark, Jersey City, Los Angeles, San Francisco, Houston, Dallas, Denver, Seattle, Miami, Boston, Atlanta.
- The matching engine is the core deep module — it should be thoroughly tested with edge cases before any other module is built.
- The MCP server exposes the full matching capability (tools, resources, prompts) so that any MCP-compatible client can use Findvisor, not just the bundled React UI.
- Advisor mock data should be realistic and cover diverse combinations of specialties, locations, budget ranges, ratings, and risk levels to properly exercise the matching logic.
