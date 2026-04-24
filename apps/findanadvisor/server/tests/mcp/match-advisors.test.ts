import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupMcpClient, type TestMcpClient } from "../helpers/mcp-client.js";

let harness: TestMcpClient;

beforeAll(async () => {
  harness = await setupMcpClient();
}, 30000);

afterAll(async () => {
  await harness.close();
});

type Match = {
  advisor: { id: string; name: string; location: string };
  score: number;
  budgetFit: number;
  normalizedRating: number;
};

type MatchAdvisorsStructured = {
  matches: Match[];
};

async function callMatch(
  userProfile: unknown,
  advisors?: unknown,
): Promise<{
  structured: MatchAdvisorsStructured;
  contentText: string;
  isError: boolean | undefined;
}> {
  const result = await harness.client.callTool({
    name: "match_advisors",
    arguments: { userProfile, ...(advisors !== undefined ? { advisors } : {}) },
  });
  const contentArr = result.content as Array<{ type: string; text?: string }>;
  const textBlock = contentArr.find((c) => c.type === "text");
  return {
    structured: result.structuredContent as MatchAdvisorsStructured,
    contentText: textBlock?.text ?? "",
    isError: result.isError as boolean | undefined,
  };
}

const validProfile = {
  name: "Alice",
  location: "Minneapolis",
  budget: 100000,
  investmentTypes: ["stocks", "bonds"],
  riskLevel: "medium",
};

describe("MCP tool: match_advisors — built-in dataset", () => {
  it("returns top 1–3 matches without the advisors arg", async () => {
    const { structured, isError } = await callMatch(validProfile);
    expect(isError).toBeFalsy();
    expect(structured.matches.length).toBeGreaterThanOrEqual(1);
    expect(structured.matches.length).toBeLessThanOrEqual(3);
  });

  it("responds with both structuredContent and content[] text", async () => {
    const { structured, contentText } = await callMatch(validProfile);
    expect(structured.matches).toBeDefined();
    expect(contentText).toMatch(/Expertise:/);
  });

  it("ranks by score descending", async () => {
    const { structured } = await callMatch(validProfile);
    for (let i = 0; i < structured.matches.length - 1; i += 1) {
      expect(structured.matches[i].score).toBeGreaterThanOrEqual(structured.matches[i + 1].score);
    }
  });
});

describe("MCP tool: match_advisors — custom advisors arg", () => {
  it("uses the provided advisors when given a valid array", async () => {
    const customAdvisor = {
      id: "custom-1",
      name: "Custom Advisor",
      location: "Minneapolis",
      expertise: ["stocks"],
      riskLevels: ["medium"],
      rating: 5,
      budgetMin: 1000,
      budgetMax: 200000,
    };
    const { structured } = await callMatch(validProfile, [customAdvisor]);
    expect(structured.matches).toHaveLength(1);
    expect(structured.matches[0].advisor.id).toBe("custom-1");
  });

  it("drops malformed advisors silently and proceeds with survivors", async () => {
    const good = {
      id: "good-1",
      name: "Good Advisor",
      location: "Minneapolis",
      expertise: ["stocks"],
      riskLevels: ["medium"],
      rating: 4,
      budgetMin: 1000,
      budgetMax: 200000,
    };
    const badMissingRating = { ...good, id: "bad-1", rating: undefined };
    const badBudgetOrder = {
      ...good,
      id: "bad-2",
      budgetMin: 200000,
      budgetMax: 1000,
    };
    const before = harness.stderr.collected.length;
    const { structured } = await callMatch(validProfile, [good, badMissingRating, badBudgetOrder]);
    expect(structured.matches).toHaveLength(1);
    expect(structured.matches[0].advisor.id).toBe("good-1");
    // Give the child's stderr a tick to flush.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const afterLog = harness.stderr.collected.slice(before);
    expect(afterLog).toMatch(/dropped 2 of 3 advisors/);
  });

  it("returns an error response when every advisor is invalid (min-1 safety net)", async () => {
    const bad1 = { id: "b1" };
    const bad2 = { nope: true };
    const result = await harness.client.callTool({
      name: "match_advisors",
      arguments: { userProfile: validProfile, advisors: [bad1, bad2] },
    });
    expect(result.isError).toBe(true);
  });
});

describe("MCP tool: match_advisors — input validation", () => {
  it("rejects a profile with an invalid location enum", async () => {
    const result = await harness.client.callTool({
      name: "match_advisors",
      arguments: {
        userProfile: { ...validProfile, location: "Nowhere" },
      },
    });
    expect(result.isError).toBe(true);
  });

  it("rejects a profile with budget below the 100 minimum", async () => {
    const result = await harness.client.callTool({
      name: "match_advisors",
      arguments: { userProfile: { ...validProfile, budget: 50 } },
    });
    expect(result.isError).toBe(true);
  });
});
