# findanadvisor

A full-stack TypeScript advisor-matching app with three entry points into one pure matcher:

1. **Web form** (React + Vite) — `http://localhost:5173`
2. **REST API** (Fastify) — `POST /api/match-advisors` on `http://localhost:3000`
3. **MCP server over stdio** with two tools: `match_advisors` and `show_advisor_form`. An optional **Nanobot chat agent** (Claude Sonnet) consumes this MCP server.

See [`docs/prd/advisor-matching.md`](docs/prd/advisor-matching.md) for the full specification.

---

## Prerequisites

- Node.js ≥ 22.12
- A Nanobot binary installed at `%USERPROFILE%\nanobot\nanobot.exe` (Windows) — only required if you want the chat agent.

---

## One-time setup

From the repo root:

```bash
npm install
```

Copy the env template and fill in your Anthropic API key (only needed if you'll use `npm run nanobot`):

```bash
cp apps/findanadvisor/.env.example apps/findanadvisor/.env
# then edit apps/findanadvisor/.env and paste your key after ANTHROPIC_API_KEY=
```

`.env` is gitignored; `.env.example` is committed as the template.

Get an Anthropic API key at [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys).

---

## Scripts (run from `apps/findanadvisor/`)

| Script               | What it does                                                                         |
| -------------------- | ------------------------------------------------------------------------------------ |
| `npm test`           | Runs the full Vitest suite (server + client projects).                               |
| `npm run test:watch` | Watch mode for local TDD.                                                            |
| `npm run dev`        | Wired in issue #10 — runs Vite + Fastify concurrently.                               |
| `npm run typecheck`  | `tsc -b` across project refs (wired in issue #11).                                   |
| `npm run lint`       | ESLint (wired in issue #11).                                                         |
| `npm run nanobot`    | Loads `.env`, then runs the Nanobot chat agent. Launches on `http://localhost:8080`. |

---

## Architecture at runtime

- **`npm run dev`** (normal development): Vite (port 5173) + Fastify (port 3000). Fastify spawns its own MCP subprocess over stdio.
- **`npm run nanobot`** (separate): launches Nanobot (port 8080). Nanobot spawns its own independent MCP subprocess per `nanobot.yaml`. It does _not_ go through Fastify.

The two commands are independent — they don't share process state, and `npm run dev` doesn't need `ANTHROPIC_API_KEY`.

---

## Nanobot chat flow

1. Run `npm run dev` in one terminal (so the form is served at `http://localhost:5173`).
2. Run `npm run nanobot` in another terminal.
3. Open `http://localhost:8080`.
4. Chat: _"Help me find a financial advisor."_
5. Agent calls `show_advisor_form` → iframe of the form renders in chat.
6. Fill the form, hit **Find Advisor** → profile posts back as a prompt.
7. Agent calls `match_advisors` → top 3 matches appear as markdown.

---

## Environment variables

Documented in [`.env.example`](.env.example). Summary:

| Variable                    | Required for                | Default                            |
| --------------------------- | --------------------------- | ---------------------------------- |
| `ANTHROPIC_API_KEY`         | `npm run nanobot`           | — (fail-fast)                      |
| `FINDANADVISOR_FORM_URL`    | MCP `show_advisor_form` URL | `http://localhost:5173?embedded=1` |
| `FINDANADVISOR_API_PORT`    | Fastify listen port         | `3000`                             |
| `FINDANADVISOR_CLIENT_PORT` | Vite dev port               | `5173`                             |
