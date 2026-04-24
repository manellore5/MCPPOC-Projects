import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerMatchAdvisorsTool } from "./tools/match-advisors.js";
import { registerShowAdvisorFormTool } from "./tools/show-advisor-form.js";

export function createFindanadvisorServer(): McpServer {
  const server = new McpServer(
    { name: "findanadvisor", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  registerMatchAdvisorsTool(server);
  registerShowAdvisorFormTool(server);
  return server;
}

async function main(): Promise<void> {
  const server = createFindanadvisorServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`[findanadvisor-mcp] fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
