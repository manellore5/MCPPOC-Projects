# Elicitation Fallback for `show_advisor_form` — PRD (`findanadvisor`)

> **Provenance:** This PRD was produced through a one-question-at-a-time grilling session conducted in plain text (4 questions, all answered). Every "Implementation Decision" below is traceable to a specific grill-question answer and represents a deliberate trade-off, not a default. Reference: see `apps/findanadvisor/docs/prd/advisor-matching.md` for the original feature this extends.

## Problem Statement

The `show_advisor_form` MCP tool returns an `mcp-ui` iframe resource (`ui://findanadvisor/advisor-form`) that **only renders in MCP hosts that implement the `mcp-ui` resource convention** — currently Nanobot. In Claude Desktop (the first non-Nanobot host we're targeting as part of the "Tier 0 — move off Nanobot" effort), the resource block is silently ignored. Claude noticed this at runtime and gracefully fell back to a free-form text/elicitation conversation, which works but is unguided, lossy, and bypasses the structured `InvestorProfile` contract that downstream `match_advisors` expects.

Users on elicitation-capable hosts (Claude Desktop and any future MCP client that declares the `elicitation` capability during the handshake) deserve a first-class, schema-driven wizard experience equivalent to the iframe form — without breaking the existing Nanobot iframe path.

## Solution

Make `show_advisor_form` a **dual-mode tool** that detects the calling client's declared capabilities at MCP handshake time and chooses one branch:

1. **Elicitation branch** — if the client declares the MCP `elicitation` capability (Claude Desktop and similar): the tool issues a single `elicitInput` request carrying the full `InvestorProfile` JSON Schema. The host renders this as a multi-step wizard. On `accept`, the tool returns the collected profile back to the caller as `structuredContent: { userProfile }` plus a human-readable text confirmation. On `decline` / `cancel` / any non-`accept` outcome, the tool returns a soft text message ("Profile collection canceled — let me know if you'd like to try again or share details directly.") with no `userProfile` payload and no error flag.

2. **Iframe branch** — if the client does **not** declare the `elicitation` capability (Nanobot today, and any current/legacy MCP host): the tool returns the existing `ui://findanadvisor/advisor-form` resource pointing at the Vite form, exactly as it does today. **No behavior change.**

In both branches, the tool's role stays narrow — it only **collects** the profile. Claude (or whatever LLM is driving the host) is still responsible for making the follow-up `match_advisors` call. This keeps both paths symmetric: the iframe `postMessage`s a profile-bearing prompt back into the chat; the elicitation branch returns a profile-bearing tool result. Either way, the next step is the LLM deciding to call `match_advisors`.

## User Stories

### Claude Desktop user (elicitation-capable host)

1. As a Claude Desktop user, when I ask Claude to find me a financial advisor, I want it to call `show_advisor_form` and have a multi-step wizard appear in the chat, so I can fill in my profile via native UI controls instead of typing JSON.
2. As a Claude Desktop user, I want the wizard to show one question per step (location, name, budget, investment types, risk level), with native pickers for the enums and number/text inputs for the rest, so I can't enter invalid data.
3. As a Claude Desktop user, when I submit the wizard, I want Claude to immediately follow up with the matched advisors, so the whole flow takes one tool call to fill in + one follow-up to match.
4. As a Claude Desktop user, if I close or cancel the wizard, I want Claude to acknowledge that gracefully and ask me what I'd like to do next, instead of treating it as an error or apologizing repeatedly.

### Nanobot user (iframe host) — regression guarantee

5. As a Nanobot user, I want every behavior from the original `show_advisor_form` PRD (User Stories #19–22 in `advisor-matching.md`) to keep working **unchanged** — iframe renders, form submits via `postMessage`, agent picks up the profile and calls `match_advisors`, etc. This change must not regress the Nanobot path in any observable way.

### MCP client / developer

6. As an MCP client author, I want `show_advisor_form` to honor whatever capability my client declared at handshake time (`elicitation` or not), so I get the experience I asked for without configuration.
7. As a developer, I want a single source of truth for the `InvestorProfile` schema used by both branches (the same Zod schema already used by `match_advisors`), so the wizard fields can never drift from the iframe form fields.
8. As a developer, I want the `FINDANADVISOR_FORM_URL` env override to keep working in the iframe branch exactly as today, so my non-elicitation deployments are unaffected.
9. As a developer, I want the dual-mode logic covered by integration tests using the same in-process MCP client harness already in `server/tests/helpers/mcp-client.ts`, so I can refactor the tool internals without breaking either branch.

## Implementation Decisions

### Q1 — Branching mechanism: detect client capabilities at handshake (chosen: **a**)

The tool branches on whether the connected MCP client declared the `elicitation` capability during the `initialize` handshake. The MCP SDK exposes this via `server.server.getClientCapabilities()` (or equivalent on the registered tool's request context).

- If `capabilities.elicitation` is present (any value, even `{}`) → **elicitation branch**.
- If absent or `undefined` → **iframe branch**.

No host-name detection, no User-Agent sniffing, no env override for the branch selector. The capability declaration is the discriminator.

**Rejected alternative (Q1 option b):** "Always return both — iframe resource + immediately fire elicitation." Rejected because Nanobot users would see a redundant text prompt under the rendered form, and elicitation-capable users would see an unrendered `resource` block in their transcript.

### Q2 — Post-collection behavior: symmetric (chosen: **a**)

In the elicitation branch, after `elicitInput` returns with `action: "accept"`, the tool returns:

```ts
{
  structuredContent: { userProfile: InvestorProfile },
  content: [{ type: "text", text: "Got profile for <name>: <location>, $<budget>, …" }],
}
```

The tool does **not** call the matcher itself. The LLM driving the host (Claude in Claude Desktop) sees the structured payload + confirmation text and decides to call `match_advisors` next. This matches the Nanobot iframe path, which also only collects (the iframe `postMessage`s a profile-bearing prompt into the chat; Nanobot's agent decides to call `match_advisors`).

**Rejected alternative (Q2 option b):** "Have `show_advisor_form` call the matcher directly and return ranked advisors in the same response." Rejected because it breaks symmetry with the iframe path and gives the tool secret double duty.

### Q3 — Cancel/decline handling: soft text (chosen: **a**)

If `elicitInput` returns with `action !== "accept"` (decline, cancel, abort, or any future non-accept outcome), the tool returns:

```ts
{
  content: [
    {
      type: "text",
      text: "Profile collection canceled — let me know if you'd like to try again or share details directly.",
    },
  ],
}
```

No `structuredContent`, no `isError: true`. The LLM sees a polite text result and naturally picks up the conversation.

**Rejected alternatives:**

- **Option b** (`isError: true` MCP error) — rejected because Claude treats it as a failure and may apologize/retry, which is the wrong UX for "user changed their mind."
- **Option c** (empty `structuredContent` with `canceled: true` flag) — rejected as over-engineered; nothing downstream needs the flag.

### Q4 — Scope decisions

- **Tool name:** keep `show_advisor_form`. Rename ("collect_advisor_profile" or similar) is bikeshedding and out of scope.
- **`localhost:5173` Vite-dev-server requirement for the iframe branch:** out of scope. Iframe path still requires `npm run dev:client` to be running for the form to actually load. Hosting the form somewhere durable is a separate Tier.
- **Generality:** the design targets **any** MCP client that declares the `elicitation` capability, not just Claude Desktop. The branch logic is host-agnostic.
- **Backward compatibility:** **hard requirement.** Existing Nanobot iframe path must continue to work bit-for-bit unchanged. A regression test in `server/tests/mcp/show-advisor-form.test.ts` asserting the iframe-branch response shape is mandatory.

### Tool response shapes (consolidated reference)

**Elicitation branch — accept:**

```ts
{
  structuredContent: {
    userProfile: {
      name: string,
      location: Location,                  // enum of 8
      budget: number,                      // ≥ 100
      investmentTypes: InvestmentType[],   // ≥ 1
      riskLevel: RiskLevel,                // single
    },
  },
  content: [
    { type: "text", text: "Got profile for <name>: <location>, $<budget>, interests: <…>, risk: <…>." },
  ],
}
```

**Elicitation branch — decline / cancel / any non-accept:**

```ts
{
  content: [
    { type: "text", text: "Profile collection canceled — let me know if you'd like to try again or share details directly." },
  ],
}
```

**Iframe branch (unchanged from today):**

```ts
{
  structuredContent: { url: <FINDANADVISOR_FORM_URL or default> },
  content: [
    { type: "resource", resource: { uri: "ui://findanadvisor/advisor-form", mimeType: "text/uri-list", text: <url> } },
    { type: "text", text: "Opening the advisor profile form..." },
  ],
}
```

### Elicitation request shape

A single `elicitInput` call carrying a JSON Schema for the full `InvestorProfile`. The schema is derived from the same `InvestorProfileSchema` Zod object already exported by `server/src/data/schema.ts` (so wizard fields and iframe form fields can never drift). The host (Claude Desktop) renders the multi-field schema as a paginated wizard automatically.

```ts
{
  message: "Tell me about yourself so I can find an advisor.",
  requestedSchema: {
    type: "object",
    properties: {
      name:            { type: "string", minLength: 1, title: "Your name" },
      location:        { type: "string", enum: [...LOCATIONS], title: "City" },
      budget:          { type: "number", minimum: 100, title: "Investable budget (USD)" },
      investmentTypes: { type: "array", items: { type: "string", enum: [...INVESTMENT_TYPES] }, minItems: 1, title: "Investment types" },
      riskLevel:       { type: "string", enum: [...RISK_LEVELS], title: "Risk tolerance" },
    },
    required: ["name", "location", "budget", "investmentTypes", "riskLevel"],
  },
}
```

### Files changed

| File                                                  | Change                                                                                                                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/src/mcp/tools/show-advisor-form.ts`           | Add capability-detection branch; keep existing iframe behavior intact; add elicitation request + accept/cancel handling.                                    |
| `server/tests/mcp/show-advisor-form.test.ts`          | Add elicitation-branch tests (accept + cancel); keep existing iframe tests (regression).                                                                    |
| `server/tests/helpers/mcp-client.ts`                  | Add an opt-in `withElicitation` setup variant that declares `capabilities.elicitation` on the test client and registers a configurable elicitation handler. |
| `apps/findanadvisor/docs/prd/elicitation-fallback.md` | This file.                                                                                                                                                  |

No changes to: `match_advisors`, the matcher module, the data module, the React form, the Fastify API, `nanobot.yaml`, or any client-side code.

## Testing Decisions

### Testing philosophy

Tests exercise each module's **public interface** with realistic inputs and assert observable behavior. They do not mock internal helpers, do not assert on private state, and continue to pass through refactors that don't change the module's contract. (Same philosophy as `advisor-matching.md`.)

### TDD

Red/Green/Refactor is **mandatory**. One failing test → minimal code to pass → refactor. The elicitation branch is implemented as a vertical slice on top of the existing iframe-only tool — the iframe branch already has full test coverage, so the new branch is added test-first without disturbing existing tests.

### Test matrix

| Test                                                               | Branch              | Setup                                                                        | Assertion                                                                                                                                               |
| ------------------------------------------------------------------ | ------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Returns iframe resource for clients that don't declare elicitation | Iframe (regression) | Default test client (no `elicitation` capability)                            | `content[]` includes `ui://findanadvisor/advisor-form` resource block + text fallback; `structuredContent.url` matches default or env override          |
| `FINDANADVISOR_FORM_URL` env override still works                  | Iframe (regression) | Default test client + env var                                                | Resource and `structuredContent.url` reflect the override                                                                                               |
| Returns iframe text-block fallback for non-MCP-UI hosts            | Iframe (regression) | Default test client                                                          | Text block exists matching `/advisor profile form/i`                                                                                                    |
| Issues elicitation request with full `InvestorProfile` schema      | Elicitation         | Test client with `capabilities.elicitation = {}` and a recording handler     | Handler is invoked exactly once; `requestedSchema` matches the InvestorProfile shape (5 fields, correct enums, correct required list, correct minimums) |
| Returns structured profile on `accept`                             | Elicitation         | Elicitation handler returns `{ action: "accept", content: <valid profile> }` | Tool result has `structuredContent.userProfile` deep-equal to the submitted profile; text block confirms by name                                        |
| Returns soft text on `decline`                                     | Elicitation         | Elicitation handler returns `{ action: "decline" }`                          | Tool result has no `structuredContent`; text block matches `/canceled/i`; result has no `isError`                                                       |
| Returns soft text on `cancel`                                      | Elicitation         | Elicitation handler returns `{ action: "cancel" }`                           | Same shape as decline test                                                                                                                              |

### Testing stack

- **Vitest** — same as today. Reuses the existing `setupMcpClient` harness in `server/tests/helpers/mcp-client.ts`, extended with an opt-in `elicitation` config.
- **No Playwright, no E2E.** The wizard UI itself is rendered by Claude Desktop, not by us; testing Claude Desktop's wizard rendering is out of scope. Manual smoke verification (open Claude Desktop, ask Claude to find an advisor, complete the wizard) is the only acceptance test for the rendered UX.
- **No mocked MCP clients.** Tests use the real MCP SDK Client class talking to a real subprocess server, exactly as today.

### Manual smoke acceptance

A separate manual checklist will be appended to the implementation issue:

1. **Claude Desktop:** Restart Claude Desktop with `findanadvisor` configured. Start a new chat. Prompt: "Help me find a financial advisor." Confirm a wizard appears. Fill it out. Confirm Claude follows up with `match_advisors` and returns ranked advisors.
2. **Claude Desktop cancel path:** Repeat the above but close the wizard mid-flow. Confirm Claude responds with a soft acknowledgment and offers to retry or take details directly.
3. **Nanobot:** `npm run nanobot`. Ask the agent to find an advisor. Confirm the iframe form still renders (with `npm run dev:client` running). Submit the form. Confirm `match_advisors` runs and the matches appear.

## Out of Scope

- Renaming `show_advisor_form` to anything else.
- Hosting the iframe form somewhere durable (i.e., removing the `localhost:5173` Vite dev-server requirement for the iframe branch).
- Capability detection for non-elicitation features (sampling, roots, etc.).
- A configurable preference order for hosts that hypothetically declare both capabilities — current design always prefers elicitation when available; if a host adds `mcp-ui` rendering AND elicitation, the elicitation branch wins (revisit if a real host does this).
- Changes to the React form, Fastify API, matcher module, data module, or `match_advisors` tool.
- Changes to `nanobot.yaml` or anything in the Nanobot agent configuration.
- E2E or Playwright tests for the Claude Desktop wizard rendering. Manual smoke only.
- Surfacing per-field elicitation (one `elicitInput` per field). Single multi-field schema only — Claude Desktop renders this natively as a wizard.
- Backward-compat shims for hosts that declare `elicitation` but don't implement it correctly. If a host lies, it lies; we'll patch reactively.

## Domain Terms

Key terms used in this PRD — most carry over from `advisor-matching.md`. New / sharpened terms for this PRD:

- **Elicitation** — the MCP protocol method by which a server requests structured input from the user via the host. Capability is declared by the client at `initialize`. SDK method: `server.elicitInput({ message, requestedSchema })` returning `{ action: "accept" | "decline" | "cancel", content?: object }`.
- **Elicitation-capable host** — any MCP client that declares `capabilities.elicitation` during the `initialize` handshake. Claude Desktop is the canonical example as of this PRD; any other future host that declares the capability gets the same wizard treatment.
- **Iframe branch** — the existing `show_advisor_form` behavior: returns a `ui://findanadvisor/advisor-form` resource pointing at the Vite form. Used for non-elicitation-capable hosts (Nanobot today).
- **Elicitation branch** — the new `show_advisor_form` behavior: issues a single `elicitInput` call carrying the full `InvestorProfile` schema, then returns the collected profile (or soft-cancel text) to the LLM.
- **Dual-mode tool** — an MCP tool whose response shape branches on the connected client's declared capabilities, rather than always returning the same response.
- **Soft cancel** — a tool result that conveys "the user backed out" via plain text in `content[]`, without setting `isError: true` and without a `structuredContent` payload.

## Further Notes

- The Vite-dev-server-at-localhost-5173 dependency for the iframe branch is a known wart. It's preserved exactly as today (in scope: no behavior change; out of scope: fixing it). A future Tier should host the form on a durable URL (Cloudflare Pages, Vercel, etc.) so the iframe branch works without a local dev server.
- The branch-selection signal is the client's declared capabilities, captured at `initialize` time. If a client somehow changes its capabilities mid-session (the spec doesn't allow this, but defensive note), the tool will use whatever the SDK exposes at the moment of the tool call, which is the post-handshake snapshot.
- `elicitInput` semantics per MCP spec: the host MAY return `action: "accept"` with `content` matching the requested schema, OR `action: "decline"` (user said no), OR `action: "cancel"` (user dismissed). All three are "user decided"; only `accept` carries data. The tool treats decline and cancel identically (soft text). Future actions added by the spec also fall into the soft-text branch unless we decide otherwise.
- Schema reuse: the `InvestorProfile` JSON Schema sent in the elicitation request is generated from the same Zod schema (`InvestorProfileSchema` in `server/src/data/schema.ts`) that `match_advisors` already validates inputs against. No hand-maintained second copy.
- The 4-grill-question provenance:
  - **Q1 → branching mechanism:** capability detection (a).
  - **Q2 → post-collection:** symmetric, return-and-let-Claude-match (a).
  - **Q3 → cancel UX:** soft text (a).
  - **Q4 → scope:** keep tool name, leave Vite dependency, generalize to any elicitation-capable host, hard backward-compat with regression test.
