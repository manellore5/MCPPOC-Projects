# Findanadvisor — Architecture (ELI5)

> Written to be understandable by someone who hasn't seen the code. Read top-to-bottom or jump via the TOC.

## Contents

1. [One-sentence version](#one-sentence-version)
2. [Cast of characters (4 programs + 1 brain)](#the-cast-of-characters-4-programs--1-brain)
3. [Where each piece lives in the code](#where-is-each-piece-in-the-code)
4. [What MCP actually means here](#what-does-mcp-even-mean-here-the-part-that-sounds-scarier-than-it-is)
5. [How MCP is spawned — twice](#who-calls-the-mcp-server-two-callers-independently)
6. [Flow #1: web form (no AI)](#flow-1-web-form-no-ai)
7. [Flow #2: Nanobot chat (with Claude Sonnet)](#flow-2-nanobot-chat-with-claude-sonnet)
8. [Nanobot configuration — every knob explained](#how-is-nanobot-configured-every-knob-explained)
9. [Mental models](#three-mental-models-that-might-click)
10. [What's NOT here](#whats-not-here-on-purpose)
11. [Debugging cheat-sheet](#debugging-cheat-sheet)

---

## One-sentence version

A web form and a chat agent both ask the **same "matching brain"** to pick the best financial advisors for someone's profile. The brain lives in a tiny program called an **MCP server**, and everything else — the form, the API, the chat — just calls it.

---

## The cast of characters (4 programs + 1 brain)

Think of it as a little town with four buildings and one expert who works in all of them.

| Name            | What it is             | Plain-English job                                          | Lives on                      |
| --------------- | ---------------------- | ---------------------------------------------------------- | ----------------------------- |
| **React form**  | A web page             | The form you fill in ("Alice, Denver, $50k, crypto, high") | port **5173**                 |
| **Fastify API** | A web server           | A waiter who takes your form order and asks the expert     | port **3000**                 |
| **MCP server**  | The expert's clipboard | Actually ranks advisors for a profile                      | no port — talks through pipes |
| **Nanobot**     | A chatbot              | A friendly agent that can also ask the expert              | port **8080**                 |
| **Matcher**     | A pure function        | The expert's "rules of thumb" — filter + score + rank      | `server/src/matcher/`         |

**The "brain" is the matcher.** It's ~60 lines of pure TypeScript, no frameworks. It takes `(profile, list of advisors)` and returns the top 1–3. That's it.

Every other component is just a different way to _reach_ the matcher:

- Form → Fastify → MCP → matcher → back out
- Nanobot → MCP → matcher → back out

---

## Where is each piece in the code?

```
apps/findanadvisor/
├── client/                       ← REACT FORM (port 5173)
│   ├── index.html
│   ├── vite.config.ts            ← Says "proxy /api to port 3000"
│   └── src/
│       ├── App.tsx               ← Picks "standalone or embedded?" based on URL
│       ├── components/
│       │   ├── AdvisorForm.tsx   ← THE FORM — 5 fields + Find Advisor button
│       │   ├── ResultsList.tsx   ← Shows the 1–3 cards after clicking
│       │   └── AdvisorCard.tsx   ← One card
│       ├── api.ts                ← fetch('/api/match-advisors')
│       └── postMessageBridge.ts  ← Tells Nanobot "I'm an iframe, my size is X"
│
├── server/                       ← FASTIFY + MCP + MATCHER
│   └── src/
│       ├── index.ts              ← FASTIFY ENTRY (port 3000)
│       ├── api/
│       │   ├── app.ts            ← Fastify routes + JSON schema validation
│       │   ├── mcp-client.ts     ← Fastify's way to TALK to MCP (over stdio)
│       │   └── schemas/investor-profile.ts
│       ├── mcp/                  ← MCP SERVER (the brain's clipboard)
│       │   ├── index.ts          ← MCP entrypoint — listens on stdin/stdout
│       │   └── tools/
│       │       ├── match-advisors.ts     ← TOOL #1 — "do the matching"
│       │       └── show-advisor-form.ts  ← TOOL #2 — "tell me the form URL"
│       ├── matcher/              ← THE BRAIN (pure, no deps)
│       │   ├── index.ts          ← matchAdvisors(profile, advisors)
│       │   └── types.ts          ← TypeScript types + enum arrays
│       └── data/
│           ├── advisors.json     ← 20 fake advisors (curated)
│           ├── loader.ts         ← Reads the JSON, validates, caches
│           └── schema.ts         ← Zod schemas for validation
│
├── nanobot.yaml                  ← NANOBOT CONFIG (1 agent + 1 MCP server)
├── .env                          ← Your ANTHROPIC_API_KEY (gitignored)
├── .env.example                  ← Template, committed
└── package.json                  ← `npm run dev` + `npm run nanobot`
```

---

## What does "MCP" even mean here? (the part that sounds scarier than it is)

**MCP = Model Context Protocol.** Ignore the jargon. It's a **contract between two programs** so one of them can offer "tools" that the other can call. Nothing magical.

We built **one MCP server** that offers **two tools**:

### Tool 1: `match_advisors`

- **Input:** an investor profile (and optionally a custom list of advisors)
- **Output:** the top 1–3 matches with scores
- **Implementation:** calls the pure `matchAdvisors()` matcher with the dataset
- **File:** `server/src/mcp/tools/match-advisors.ts`

### Tool 2: `show_advisor_form`

- **Input:** nothing
- **Output:** a little note that says _"Hey host, please render an iframe pointing at `http://localhost:5173?embedded=1`"_
- **Implementation:** returns an MCP-UI `externalUrl` resource
- **File:** `server/src/mcp/tools/show-advisor-form.ts`

### The server itself

- **File:** `server/src/mcp/index.ts`
- **Package:** `@modelcontextprotocol/sdk`
- **Transport:** stdin/stdout (no network port) — whoever spawns this server as a child process talks to it through pipes.

**Nothing else is installed.** No MCP "UI libraries" (we mimic the protocol ourselves in React), no `@mcp-ui/server` (the `show_advisor_form` tool just returns the raw JSON shape that MCP-UI hosts understand).

---

## Who calls the MCP server? Two callers, independently.

This is the key "aha" moment. **The MCP server is spawned TWICE at runtime** — once by Fastify, once by Nanobot — and neither knows about the other.

```
                            ┌─────────────────┐
                            │  advisors.json  │
                            │   (the data)    │
                            └─────┬───────────┘
                                  │ read once at startup
                                  ▼
                          ┌──────────────────┐
                          │ matchAdvisors()  │ ← the pure brain
                          │ (server/src/     │
                          │  matcher/)       │
                          └──┬───────────────┘
                             │
                             │ imported by
                ┌────────────┴────────────┐
                │                         │
      ┌─────────▼──────────┐    ┌─────────▼──────────┐
      │ MCP subprocess #1  │    │ MCP subprocess #2  │
      │ (owned by Fastify) │    │ (owned by Nanobot) │
      └─────────▲──────────┘    └─────────▲──────────┘
                │ stdio                   │ stdio
                │                         │
      ┌─────────┴────────┐       ┌────────┴────────┐
      │     Fastify      │       │     Nanobot     │
      │   (port 3000)    │       │   (port 8080)   │
      └─────────▲────────┘       └────────▲────────┘
                │ HTTP /api               │ HTTP + chat UI
                │                         │
      ┌─────────┴─────────────────────────┴────────┐
      │          React form in browser             │
      │     (served by Vite on port 5173;          │
      │      also rendered as iframe in Nanobot)   │
      └─────────────────────────────────────────────┘
```

---

## Flow #1: Web form (no AI)

You go to **http://localhost:5173**. Just you and the form.

1. **You fill in the form** → click **Find Advisor**.
2. The React form calls **`fetch('/api/match-advisors', { method: 'POST', body: profile })`**.
3. The Vite dev server (port 5173) proxies `/api/*` → port 3000 (Fastify). _(That's what `client/vite.config.ts` does.)_
4. **Fastify** validates the body using **Ajv / JSON schema**. If the body's bad, it returns 400 without bothering the MCP server.
5. If good, Fastify sends an MCP message over stdin to its **MCP subprocess**: _"call `match_advisors` with this profile."_
6. The **MCP server** deserializes the request, calls **`matchAdvisors()`** (the pure matcher) with the built-in dataset.
7. The matcher filters (location, expertise overlap, risk), scores (`0.6 * budgetFit + 0.4 * rating`), sorts desc, returns top 1–3.
8. MCP server writes the result back to stdout. Fastify reads it. Fastify returns `{ matches: [...] }` as JSON to the browser.
9. React renders the **cards** below the form.

Round-trip time: ~100ms locally. No AI involved.

---

## Flow #2: Nanobot chat (with Claude Sonnet)

You go to **http://localhost:8080**. Nanobot loaded your `nanobot.yaml` on startup.

**Setup (once, at `npm run nanobot` time):**

- Nanobot reads `nanobot.yaml`, sees **1 agent** (`advisor-finder`) and **1 MCP server definition** (`findanadvisor-mcp`).
- Nanobot **spawns** the MCP server using `npx tsx ./server/src/mcp/index.ts`. That's its OWN subprocess, separate from Fastify's.
- Nanobot asks the MCP server _"what tools do you have?"_ → gets back `[match_advisors, show_advisor_form]`.
- Nanobot now knows: _"Claude Sonnet can call these two tools whenever it wants."_

**At conversation time:**

1. You type: _"Help me find a financial advisor."_
2. Nanobot forwards that + the agent's system prompt + the tool list to **Anthropic's API** (using your `ANTHROPIC_API_KEY` from `.env`).
3. Claude Sonnet reads its instructions: _"When asked for an advisor, call `show_advisor_form`."_ It returns a "tool call" instead of plain text.
4. Nanobot sees the tool call, writes to its MCP subprocess's stdin: _"call `show_advisor_form`."_
5. MCP server replies with an iframe resource (URL + `ui://findanadvisor/advisor-form` + mime `text/uri-list`).
6. Nanobot recognizes the MCP-UI iframe shape → **renders an iframe pointing at `http://localhost:5173?embedded=1`** inside the chat.
7. Your browser loads that URL (which is Vite, same process as flow #1, just with `?embedded=1` in the URL).
8. The React app sees `?embedded=1`, flips on embedded mode, sends two MCP-UI lifecycle messages (`ui-lifecycle-iframe-ready`, `ui-size-change`) so Nanobot can size the iframe properly.
9. You fill in the form → click **Find Advisor**.
10. Here's the subtle part: instead of using the chat/agent route, the form just calls **`fetch('/api/match-advisors')` directly** (exactly like flow #1). Vite proxies to Fastify → Fastify's MCP child → matcher → matches.
11. React renders the cards inside the iframe.

**Why step 10 isn't "ask Claude again":** the original plan was for the form submit to post a _prompt_ back to Nanobot → Nanobot re-asks Claude → Claude calls `match_advisors`. But Nanobot's MCP-UI host doesn't listen for custom "prompt" messages (the MCP-UI spec only defines `ui-lifecycle-*`, `ui-size-change`, `tool`, `link`). So we took the pragmatic route: the form calls the REST API directly and renders results inside the iframe. Same result for the user, fewer moving parts.

---

## How is Nanobot configured? Every knob explained.

### `nanobot.yaml` (one file, does everything)

```yaml
publish:
  entrypoint:
    - advisor-finder # "start with this agent"

agents:
  advisor-finder: # agent id
    name: Advisor Finder # display name in chat UI
    model: claude-sonnet-4-6 # which LLM (Nanobot auto-picks Anthropic)
    maxTokens: 2048 # cap per response
    mcpServers: # which MCP servers this agent can call
      - findanadvisor-mcp
    instructions: | # the system prompt (what the agent should do)
      When the user asks for an advisor, call show_advisor_form.
      When you receive a profile, call match_advisors with no `advisors` arg.
      Render the response as markdown.
      Don't invent advisors.
      (...etc)

mcpServers:
  findanadvisor-mcp: # MCP server id
    command: npx # what to run
    args: # with these args
      - tsx
      - ./server/src/mcp/index.ts # this is OUR mcp server source file
```

### `.env` (gitignored — holds your secrets)

```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

### `package.json` — the script that ties it all together

```json
"nanobot": "dotenv -e .env -- \"%USERPROFILE%\\nanobot\\nanobot.exe\" run --config ./nanobot.yaml --exclude-built-in-agents"
```

Plain English: _"load `.env` into this process's environment, then run `nanobot.exe` with our config, and don't load any of Nanobot's default demo agents."_

---

## Three mental models that might click

### 1. The MCP server is a library that speaks over pipes

- It's functionally the same as calling `matchAdvisors()` directly.
- We put it behind stdio so any language/runtime (Fastify Node, Nanobot Go) can use it.
- The REST API layer and the chat agent layer both just shell out to the same "library."

### 2. Fastify is just one of two ways to reach the matcher

- Another MCP client (like Claude Desktop, Cursor, Goose) could skip Fastify entirely and connect straight to the MCP server.
- We could delete Fastify and the CLI-MCP path would still work.
- We could delete Nanobot and the web form would still work.

### 3. The React form is also just "one of many UIs"

- It could be a CLI, a mobile app, a Slack bot — anything that can POST to `/api/match-advisors` OR speak MCP.
- We deliberately kept matching logic OUT of React to prove this (the matcher is pure TS, no React, no Node-specific code).

---

## What's NOT here (on purpose)

- **No database.** 20 advisors in a JSON file.
- **No authentication.** Everyone gets the same dataset.
- **No MCP-UI libraries.** We hand-roll the `text/uri-list` iframe response and the `ui-lifecycle-*` / `ui-size-change` messages.
- **No session/state.** Each request is independent.
- **No deploy target.** All `localhost`.
- **No automated browser tests.** Vitest + jsdom + RTL for components; chat smoke test is manual.

---

## Debugging cheat-sheet

| Problem                              | Check                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| Form submit does nothing             | Browser DevTools Console — sandbox/CSP errors are the usual culprit               |
| Fastify returns 500                  | `npm run dev` terminal — Fastify logs every request                               |
| MCP server crashes                   | Same terminal — MCP server writes to stderr (`[findanadvisor-mcp] fatal: ...`)    |
| Nanobot doesn't see the tool         | Look at Nanobot's startup log — it prints the parsed config and tool registration |
| Claude says "I don't have that tool" | Check `ANTHROPIC_API_KEY` is loaded; check `mcpServers` in `nanobot.yaml`         |
| Cards don't render in iframe         | Nanobot might not resize; check `ui-size-change` is firing in browser console     |

---

**Cross-references:**

- [`docs/prd/advisor-matching.md`](../docs/prd/advisor-matching.md) — product spec (what we're building and why)
- [`docs/plans/advisor-matching.md`](../docs/plans/advisor-matching.md) — implementation plan (how it was broken into tracer bullets)
- [`docs/issues/advisor-matching.md`](../docs/issues/advisor-matching.md) — the 13 issues with acceptance criteria and implementation notes
- [`README.md`](../README.md) — quick-start (scripts, env setup, ports)
