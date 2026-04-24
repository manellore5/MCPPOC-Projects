import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupMcpClient, type TestMcpClient } from "../helpers/mcp-client.js";

type ResourceBlock = {
  type: "resource";
  resource: { uri: string; mimeType: string; text: string };
};
type TextBlock = { type: "text"; text: string };
type ContentBlock = ResourceBlock | TextBlock;

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
    expect(textBlock).toMatch(/advisor profile form/i);
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
