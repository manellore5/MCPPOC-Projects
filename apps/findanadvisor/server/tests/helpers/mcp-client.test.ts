import { afterEach, describe, expect, it, vi } from "vitest";
import { setupMcpClient, type TestMcpClient } from "./mcp-client.js";

describe("setupMcpClient — elicitation opt-in (Issue #02)", () => {
  let harness: TestMcpClient | undefined;

  afterEach(async () => {
    if (harness) {
      await harness.close();
      harness = undefined;
    }
  });

  it("accepts an elicitation handler in the options and connects successfully", async () => {
    const handler = vi.fn();
    harness = await setupMcpClient({ elicitation: { handler } });
    expect(harness.client).toBeDefined();
    expect(handler).not.toHaveBeenCalled();
  }, 30000);
});
