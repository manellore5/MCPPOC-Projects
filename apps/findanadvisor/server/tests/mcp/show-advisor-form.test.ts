import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { INVESTMENT_TYPES, LOCATIONS, RISK_LEVELS } from "../../src/matcher/types.js";
import { setupMcpClient, type TestMcpClient } from "../helpers/mcp-client.js";

type ResourceBlock = {
  type: "resource";
  resource: { uri: string; mimeType: string; text: string };
};
type TextBlock = { type: "text"; text: string };
type ContentBlock = ResourceBlock | TextBlock;

const VALID_PROFILE = {
  name: "Alex",
  location: "Minneapolis",
  budget: 5000,
  investmentTypes: ["stocks", "bonds"],
  riskLevel: "medium",
};

type ShowFormResult = {
  structured: { url: string };
  resource: ResourceBlock["resource"] | undefined;
  textBlock: string | undefined;
};

async function callShowForm(harness: TestMcpClient): Promise<ShowFormResult> {
  const result = await harness.client.callTool({
    name: "show_advisor_form",
    arguments: {},
  });
  const content = result.content as ContentBlock[];
  const resourceBlock = content.find((c): c is ResourceBlock => c.type === "resource");
  const textBlock = content.find((c): c is TextBlock => c.type === "text");
  return {
    structured: result.structuredContent as { url: string },
    resource: resourceBlock?.resource,
    textBlock: textBlock?.text,
  };
}

describe("MCP tool: show_advisor_form — default URL", () => {
  let harness: TestMcpClient;

  beforeAll(async () => {
    harness = await setupMcpClient();
  }, 30000);

  afterAll(async () => {
    await harness.close();
  });

  it("returns an MCP-UI iframe resource with the default URL", async () => {
    const { resource } = await callShowForm(harness);
    expect(resource).toBeDefined();
    expect(resource?.mimeType).toBe("text/uri-list");
    expect(resource?.uri).toBe("ui://findanadvisor/advisor-form");
    expect(resource?.text).toBe("http://localhost:5173?embedded=1");
  });

  it("returns structuredContent with the URL", async () => {
    const { structured } = await callShowForm(harness);
    expect(structured.url).toBe("http://localhost:5173?embedded=1");
  });

  it("returns a human-readable text block as a fallback for non-MCP-UI hosts", async () => {
    const { textBlock } = await callShowForm(harness);
    expect(textBlock).toBeDefined();
    expect(textBlock?.length ?? 0).toBeGreaterThan(0);
  });

  it("includes a descriptive (non-imperative) field schema in the text block", async () => {
    const { textBlock } = await callShowForm(harness);
    expect(textBlock).toBeDefined();
    // Mentions every field name
    for (const field of ["name", "location", "budget", "investmentTypes", "riskLevel"]) {
      expect(textBlock).toContain(field);
    }
    // Lists every allowed enum value
    for (const value of [...LOCATIONS, ...INVESTMENT_TYPES, ...RISK_LEVELS]) {
      expect(textBlock).toContain(value);
    }
    // Must NOT contain imperative directives that trigger Claude's prompt-injection detection.
    // UX guidance belongs in the tool *description*, not the tool *response*.
    expect(textBlock).not.toMatch(/^(do not|begin|ask|use|render|wait)\b/im);
    expect(textBlock).not.toMatch(/STRONGLY PREFERRED|CRITICAL|MUST|REQUIRED:/);
  });
});

describe("MCP tool: show_advisor_form — env override", () => {
  let harness: TestMcpClient;

  beforeAll(async () => {
    harness = await setupMcpClient({
      env: { FINDANADVISOR_FORM_URL: "http://example.com/form?embedded=1" },
    });
  }, 30000);

  afterAll(async () => {
    await harness.close();
  });

  it("uses FINDANADVISOR_FORM_URL when set", async () => {
    const { resource, structured } = await callShowForm(harness);
    expect(resource?.text).toBe("http://example.com/form?embedded=1");
    expect(structured.url).toBe("http://example.com/form?embedded=1");
  });
});

describe("MCP tool: show_advisor_form — elicitation branch (Issue #03)", () => {
  let harness: TestMcpClient | undefined;

  afterEach(async () => {
    if (harness) {
      await harness.close();
      harness = undefined;
    }
  });

  it("returns the collected profile as structuredContent on accept", async () => {
    harness = await setupMcpClient({
      env: { FINDANADVISOR_PREFER_ELICITATION: "1" },
      elicitation: {
        handler: async () => ({ action: "accept", content: { ...VALID_PROFILE } }),
      },
    });
    const result = await harness.client.callTool({ name: "show_advisor_form", arguments: {} });
    expect(result.structuredContent).toEqual({ userProfile: { ...VALID_PROFILE } });
  }, 30000);

  it("includes a human-readable text confirmation that mentions the user's name", async () => {
    harness = await setupMcpClient({
      env: { FINDANADVISOR_PREFER_ELICITATION: "1" },
      elicitation: {
        handler: async () => ({ action: "accept", content: { ...VALID_PROFILE } }),
      },
    });
    const result = await harness.client.callTool({ name: "show_advisor_form", arguments: {} });
    const content = result.content as ContentBlock[];
    const textBlock = content.find((c): c is TextBlock => c.type === "text");
    expect(textBlock).toBeDefined();
    expect(textBlock?.text).toContain(VALID_PROFILE.name);
    expect(textBlock?.text).not.toMatch(/\{|\}/);
  }, 30000);
});

describe("MCP tool: show_advisor_form — cancel and decline (Issue #05)", () => {
  let harness: TestMcpClient | undefined;

  afterEach(async () => {
    if (harness) {
      await harness.close();
      harness = undefined;
    }
  });

  for (const action of ["decline", "cancel"] as const) {
    it(`returns soft text with no structuredContent and no isError when the user ${action}s`, async () => {
      harness = await setupMcpClient({
        env: { FINDANADVISOR_PREFER_ELICITATION: "1" },
        elicitation: { handler: async () => ({ action }) },
      });
      const result = await harness.client.callTool({
        name: "show_advisor_form",
        arguments: {},
      });
      expect(result.structuredContent).toBeUndefined();
      expect(result.isError).toBeFalsy();
      const content = result.content as ContentBlock[];
      const textBlock = content.find((c): c is TextBlock => c.type === "text");
      expect(textBlock).toBeDefined();
      expect(textBlock?.text).toMatch(/canceled/i);
    }, 30000);
  }
});

describe("MCP tool: show_advisor_form — requestedSchema shape (Issue #04)", () => {
  let harness: TestMcpClient | undefined;

  afterEach(async () => {
    if (harness) {
      await harness.close();
      harness = undefined;
    }
  });

  it("sends a requestedSchema matching the InvestorProfile shape with enums sourced from the matcher constants", async () => {
    let captured: Record<string, unknown> | undefined;
    harness = await setupMcpClient({
      env: { FINDANADVISOR_PREFER_ELICITATION: "1" },
      elicitation: {
        handler: async (request) => {
          // Form-mode params have requestedSchema; URL-mode does not.
          const params = request.params as { requestedSchema?: Record<string, unknown> };
          captured = params.requestedSchema;
          return { action: "accept", content: { ...VALID_PROFILE } };
        },
      },
    });
    await harness.client.callTool({ name: "show_advisor_form", arguments: {} });

    expect(captured).toBeDefined();
    const schema = captured as {
      type: string;
      properties: Record<string, Record<string, unknown>>;
      required?: string[];
    };

    expect(schema.type).toBe("object");
    expect(Object.keys(schema.properties).sort()).toEqual([
      "budget",
      "investmentTypes",
      "location",
      "name",
      "riskLevel",
    ]);
    expect(schema.required?.slice().sort()).toEqual([
      "budget",
      "investmentTypes",
      "location",
      "name",
      "riskLevel",
    ]);

    expect(schema.properties.name).toMatchObject({ type: "string", minLength: 1 });

    expect(schema.properties.location).toMatchObject({ type: "string" });
    expect(schema.properties.location.enum).toEqual([...LOCATIONS]);

    expect(schema.properties.budget).toMatchObject({ type: "number", minimum: 100 });

    expect(schema.properties.investmentTypes).toMatchObject({ type: "array", minItems: 1 });
    const items = schema.properties.investmentTypes.items as {
      type: string;
      enum: string[];
    };
    expect(items.type).toBe("string");
    expect(items.enum).toEqual([...INVESTMENT_TYPES]);

    expect(schema.properties.riskLevel).toMatchObject({ type: "string" });
    expect(schema.properties.riskLevel.enum).toEqual([...RISK_LEVELS]);
  }, 30000);
});
