# Advisor Match Platform

A platform that matches investors with financial advisors based on profile compatibility. Exposed via a React web form, a REST API, an MCP server over stdio, and an optional Nanobot chat interface that can embed the web form.

## Language

**Advisor**:
A financial advisor (person) with one or more specialties, serving clients within a specific location and budget range. Advisors may be **specialists** (single expertise) or **generalists** (multiple expertise). The dataset is curated so every combination of location + investment type + risk level returns at least one advisor.
_Avoid_: consultant, agent, planner

**Investor**:
A person seeking a financial advisor, characterized by their location, budget, investment preferences, and risk tolerance.
_Avoid_: user (in domain context), client, customer

**Budget**:
The investor's total investable amount (portfolio size). Minimum $100, no upper limit. Advisors define a minimum and maximum budget range they accept.
_Avoid_: fee, cost, price

**Investment Type**:
A broad category of financial instrument. Values: stocks, bonds, real estate, crypto, mutual funds. Both investors and advisors can have multiple. (Referred to as "expertise" on the advisor side.)
_Avoid_: asset class (too academic), product

**Risk Level**:
Risk tolerance category: low, medium, high. Investors have exactly one. Advisors may accept multiple risk levels (an advisor is eligible for a match if the investor's risk level is one of the advisor's accepted levels).
_Avoid_: risk score, risk profile

**Match**:
A ranked recommendation pairing an investor with compatible advisors. Filtered by exact location, investment type overlap, and risk level, then ranked by a weighted score.
_Avoid_: connection, assignment, binding

**Rating**:
An advisor's quality score (1-5 scale). Used as a ranking signal, not a filter. Normalized to 0-1 before contributing to the final score.
_Avoid_: score, rank

**Budget Fit**:
A 0-1 score representing how well the investor's budget fits within an advisor's accepted range. 1.0 if the budget is inside [budgetMin, budgetMax]; linear decay outside the range (clamped at 0).
_Avoid_: budget score, fit score

**Weighted Score**:
The final ranking value for a match: `0.6 * budgetFit + 0.4 * normalizedRating`.
_Avoid_: total score, match score

**Nanobot**:
An agent runtime configured via `nanobot.yaml`. It connects to MCP servers and exposes the tools/resources as a chat-driven agent. The Findvisor `nanobot.yaml` registers an advisor-finder agent that points at the local MCP server over stdio. Run with `--exclude-built-in-agents` so only the advisor-finder is loaded.
_Avoid_: chatbot, assistant (too generic)

**MCP-UI iframe resource**:
A resource returned by the `show_advisor_form` MCP tool. Points at the Vite-served React form with `?embedded=1`. The Nanobot chat renders it as an iframe inside the conversation.
_Avoid_: widget, embed

**Embedded mode**:
The React form behavior when loaded with `?embedded=1`. Instead of POSTing directly to the REST API, the form posts the investor profile back to the parent window (the Nanobot chat) as a prompt message using `window.parent.postMessage`. The Nanobot agent then picks it up as the next user turn and calls `match_advisors` itself.
_Avoid_: chat mode, iframe mode

## Relationships

- An **Investor** submits a profile to find **Matches**
- A **Match** pairs one **Investor** with one **Advisor**, ranked by **Weighted Score**
- An **Advisor** has one or more **Investment Types** as expertise
- An **Advisor** defines a **Budget** range (min/max) for accepted clients
- An **Advisor** operates in a specific **location** (one of 8 US cities)
- An **Advisor** accepts one or more **Risk Levels**; the investor's risk level must be among them
- Results return up to 3 **Matches** (top 3 by weighted score)
- The **MCP server** exposes 2 tools: `match_advisors` and `show_advisor_form`
- The **Fastify API** spawns the MCP server as a subprocess at startup
- The **Nanobot agent** connects to the same MCP server over stdio

## Fixed enums

**Locations** (8 US cities): Minneapolis, New York, San Francisco, Chicago, Los Angeles, Denver, Miami, Boston.

**Investment Types**: stocks, bonds, real_estate, crypto, mutual_funds.

**Risk Levels**: low, medium, high.

## Example dialogue

> **Dev:** "Do we filter matches by exact location or proximity?"
> **Domain expert:** "Exact location match. 8 fixed cities, dropdown — if you're in Minneapolis we only show Minneapolis advisors. Keep it simple."

> **Dev:** "What if the investor's budget is below the advisor's minimum?"
> **Domain expert:** "Still eligible — but the budget fit score decays linearly the further outside the range you are. Rating picks up the slack in the weighted score."

> **Dev:** "If an Investor selects stocks and bonds, does the Advisor need to cover both?"
> **Domain expert:** "At least one overlap is enough to qualify. Overlap count doesn't affect ranking — only budget fit and rating do."

> **Dev:** "How does the Nanobot chat trigger a match?"
> **Domain expert:** "The agent calls `show_advisor_form` → Nanobot renders the form in an iframe → user fills it → form posts the profile back via postMessage → Nanobot treats that as the next user turn → agent calls `match_advisors` with the profile."

## Flagged ambiguities

- "budget" — clarified as investor's portfolio size, not advisor fees; minimum $100, no cap
- "risk level" — investor has one, advisor accepts a list; match if investor's is in advisor's list
- "location" — exact match against a fixed 8-city dropdown (NOT proximity)
- "investment type" — multi-select on both sides; at least one overlap required, doesn't affect rank
- "expertise" — synonymous with investment type on the advisor side
- "embedded" — refers to the form's `?embedded=1` postMessage mode, used inside Nanobot chat
