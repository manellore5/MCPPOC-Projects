import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const DEFAULT_FORM_URL = "http://localhost:5173?embedded=1";
const RESOURCE_URI = "ui://findanadvisor/advisor-form";

function getFormUrl(): string {
  return process.env.FINDANADVISOR_FORM_URL ?? DEFAULT_FORM_URL;
}

export function registerShowAdvisorFormTool(server: McpServer): void {
  server.registerTool(
    "show_advisor_form",
    {
      title: "Show the advisor profile form",
      description:
        "Returns an MCP-UI iframe resource pointing at the Findanadvisor profile form. The host (e.g., Nanobot) renders the iframe in chat; the form posts the investor profile back as a prompt message when submitted.",
      inputSchema: {},
    },
    async () => {
      const url = getFormUrl();
      return {
        structuredContent: { url },
        content: [
          {
            type: "resource",
            resource: {
              uri: RESOURCE_URI,
              mimeType: "text/uri-list",
              text: url,
            },
          },
          {
            type: "text",
            text: "Opening the advisor profile form...",
          },
        ],
      };
    },
  );
}
