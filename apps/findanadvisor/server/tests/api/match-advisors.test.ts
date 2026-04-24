import { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/api/app.js";
import { type MatchAdvisorsClient } from "../../src/api/mcp-client.js";

const validProfile = {
  name: "Alice",
  location: "Minneapolis",
  budget: 100000,
  investmentTypes: ["stocks", "bonds"],
  riskLevel: "medium",
};

describe("POST /api/match-advisors — live MCP subprocess", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it("returns 200 with a matches array of length 1–3 on a valid body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/match-advisors",
      payload: validProfile,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { matches: unknown[] };
    expect(Array.isArray(body.matches)).toBe(true);
    expect(body.matches.length).toBeGreaterThanOrEqual(1);
    expect(body.matches.length).toBeLessThanOrEqual(3);
  });

  it("returns 400 on a missing required field", async () => {
    const { location: _omit, ...withoutLocation } = validProfile;
    const res = await app.inject({
      method: "POST",
      url: "/api/match-advisors",
      payload: withoutLocation,
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when budget is below the 100 minimum", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/match-advisors",
      payload: { ...validProfile, budget: 50 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when location is not in the allowed enum", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/match-advisors",
      payload: { ...validProfile, location: "Nowhere" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when investmentTypes is empty", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/match-advisors",
      payload: { ...validProfile, investmentTypes: [] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/match-advisors — MCP error path", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const failingClient: MatchAdvisorsClient = {
      callMatch: async () => {
        throw new Error("simulated MCP tool failure");
      },
      close: async () => {
        /* noop */
      },
    };
    app = await buildApp({ mcpClient: failingClient });
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 500 with an error message when the MCP tool throws", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/match-advisors",
      payload: validProfile,
    });
    expect(res.statusCode).toBe(500);
    const body = res.json() as { error: string };
    expect(body.error).toMatch(/simulated MCP tool failure/);
  });
});
