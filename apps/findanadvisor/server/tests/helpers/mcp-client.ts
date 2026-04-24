import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = dirname(fileURLToPath(import.meta.url));
const mcpEntry = resolve(here, "..", "..", "src", "mcp", "index.ts");

export type TestMcpClient = {
  client: Client;
  stderr: { collected: string };
  close: () => Promise<void>;
};

export async function setupMcpClient(
  overrides: { env?: Record<string, string> } = {},
): Promise<TestMcpClient> {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ...overrides.env,
  };
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", mcpEntry],
    stderr: "pipe",
    env,
  });
  const stderrBuffer = { collected: "" };
  const client = new Client({ name: "findanadvisor-test", version: "0.1.0" });
  await client.connect(transport);
  // Hook stderr after connect (transport sets up the child process on connect).
  const stderrStream = transport.stderr as NodeJS.ReadableStream | null | undefined;
  if (stderrStream) {
    if ("setEncoding" in stderrStream) {
      (
        stderrStream as NodeJS.ReadableStream & {
          setEncoding: (enc: string) => void;
        }
      ).setEncoding("utf8");
    }
    stderrStream.on("data", (chunk) => {
      stderrBuffer.collected += String(chunk);
    });
  }
  return {
    client,
    stderr: stderrBuffer,
    close: async () => {
      await client.close();
    },
  };
}
