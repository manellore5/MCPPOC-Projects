import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = dirname(fileURLToPath(import.meta.url));

function resolveMcpEntry(): { command: string; args: string[] } {
  // In dev (tsx), the source file exists and we invoke it via npx tsx.
  // In prod (node dist/...), the compiled file sits alongside this module.
  // We detect dev vs prod by looking at the extension of the current module URL.
  const isDev = import.meta.url.endsWith(".ts");
  if (isDev) {
    return {
      command: "npx",
      args: ["tsx", resolve(here, "..", "mcp", "index.ts")],
    };
  }
  return {
    command: process.execPath,
    args: [resolve(here, "..", "mcp", "index.js")],
  };
}

export type MatchAdvisorsClient = {
  callMatch: (userProfile: unknown) => Promise<unknown>;
  close: () => Promise<void>;
};

export async function createMcpClient(): Promise<MatchAdvisorsClient> {
  const { command, args } = resolveMcpEntry();
  const transport = new StdioClientTransport({
    command,
    args,
    stderr: "inherit",
    env: process.env as Record<string, string>,
  });
  const client = new Client({ name: "findanadvisor-api", version: "0.1.0" });
  await client.connect(transport);

  return {
    async callMatch(userProfile: unknown) {
      const result = await client.callTool({
        name: "match_advisors",
        arguments: { userProfile },
      });
      if (result.isError) {
        const contentArr = result.content as Array<{
          type: string;
          text?: string;
        }>;
        const text = contentArr
          .filter((c) => c.type === "text")
          .map((c) => c.text ?? "")
          .join(" ");
        throw new Error(text || "MCP tool returned an error");
      }
      return result.structuredContent;
    },
    async close() {
      await client.close();
    },
  };
}
