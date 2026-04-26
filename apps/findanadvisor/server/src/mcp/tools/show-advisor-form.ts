import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  INVESTMENT_TYPES,
  LOCATIONS,
  RISK_LEVELS,
  type InvestorProfile,
} from "../../matcher/types.js";

const DEFAULT_FORM_URL = "http://localhost:5173?embedded=1";
const RESOURCE_URI = "ui://findanadvisor/advisor-form";

export const PROFILE_REQUESTED_SCHEMA = {
  type: "object" as const,
  properties: {
    name: { type: "string" as const, title: "Your name", minLength: 1 },
    location: { type: "string" as const, title: "City", enum: [...LOCATIONS] },
    budget: { type: "number" as const, title: "Investable budget (USD)", minimum: 100 },
    investmentTypes: {
      type: "array" as const,
      title: "Investment types",
      minItems: 1,
      items: { type: "string" as const, enum: [...INVESTMENT_TYPES] },
    },
    riskLevel: { type: "string" as const, title: "Risk tolerance", enum: [...RISK_LEVELS] },
  },
  required: ["name", "location", "budget", "investmentTypes", "riskLevel"],
};

function getFormUrl(): string {
  return process.env.FINDANADVISOR_FORM_URL ?? DEFAULT_FORM_URL;
}

function buildFallbackInstructions(url: string): string {
  return [
    `Advisor profile form opened (URL: ${url}).`,
    "",
    "Profile shape (InvestorProfile):",
    `- name: string, non-empty`,
    `- location: enum, one of: ${LOCATIONS.join(", ")}`,
    `- budget: number, USD, minimum 100`,
    `- investmentTypes: array of enum, one or more of: ${INVESTMENT_TYPES.join(", ")}`,
    `- riskLevel: enum, one of: ${RISK_LEVELS.join(", ")}`,
  ].join("\n");
}

function buildIframeResponse() {
  const url = getFormUrl();
  return {
    structuredContent: { url },
    content: [
      {
        type: "resource" as const,
        resource: { uri: RESOURCE_URI, mimeType: "text/uri-list", text: url },
      },
      { type: "text" as const, text: buildFallbackInstructions(url) },
    ],
  };
}

function formatProfileSummary(profile: InvestorProfile): string {
  const interests = profile.investmentTypes.join(", ");
  return `Got profile for ${profile.name}: ${profile.location}, $${profile.budget.toLocaleString()}, interested in ${interests}, risk ${profile.riskLevel}.`;
}

export function registerShowAdvisorFormTool(server: McpServer): void {
  server.registerTool(
    "show_advisor_form",
    {
      title: "Collect investor profile",
      description: [
        "Collects an InvestorProfile from the user. The profile has 5 fields: name (string), location (enum of 8 cities), budget (number ≥ 100), investmentTypes (array of 1+ enums), riskLevel (enum of low/medium/high). After all 5 are collected, call `match_advisors` with them as `userProfile`.",
        "",
        "Default collection method: ask the user one field per assistant turn, in this order: name → location → budget → investmentTypes → riskLevel. Each question is its own standalone assistant turn — never bundle into a paginated wizard.",
        "",
        "Per-field UI guidance:",
        "- name: plain prose question, free-text input.",
        "- location: single-select picker showing all 8 cities verbatim — do not truncate to a subset and do not add an 'Other' option (the field is a closed enum; an out-of-list value will fail downstream matching).",
        "- budget: if you render a bucket picker, the lowest bucket must start at $100 (the schema minimum); never start at $1,000 or higher. Suggested buckets: $100-$10,000, $10,000-$100,000, $100,000-$1,000,000, $1,000,000+, Other (free-text numeric). 'Other' is acceptable here because budget is a number field — any amount ≥ $100 is valid.",
        "- investmentTypes: multi-select picker showing all 5 types verbatim; user picks one or more.",
        "- riskLevel: single-select picker showing all 3 values verbatim (low / medium / high).",
        "",
        "Optional iframe path: this tool also returns an mcp-ui iframe resource pointing at a hosted React form. Hosts that render mcp-ui (e.g. Nanobot) may show the form inline. If the host's agent is configured to defer to the form (Nanobot's system prompt is), wait for the user's submission and skip the chat questions. Hosts that ignore mcp-ui resources (e.g. Claude Desktop) should proceed straight to the chat collection path above.",
      ].join("\n"),
      inputSchema: {},
    },
    async () => {
      const preferElicitation = process.env.FINDANADVISOR_PREFER_ELICITATION === "1";
      const supportsElicitation = Boolean(server.server.getClientCapabilities()?.elicitation);
      if (!preferElicitation || !supportsElicitation) {
        return buildIframeResponse();
      }
      const elicitResult = await server.server.elicitInput({
        message: "Tell me about yourself so I can find an advisor.",
        requestedSchema: PROFILE_REQUESTED_SCHEMA,
      });
      if (elicitResult.action !== "accept" || !elicitResult.content) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Profile collection canceled — let me know if you'd like to try again or share details directly.",
            },
          ],
        };
      }
      const userProfile = elicitResult.content as unknown as InvestorProfile;
      return {
        structuredContent: { userProfile },
        content: [{ type: "text" as const, text: formatProfileSummary(userProfile) }],
      };
    },
  );
}
