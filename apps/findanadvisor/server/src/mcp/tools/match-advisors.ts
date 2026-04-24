import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAdvisors } from "../../data/loader.js";
import { AdvisorSchema, InvestorProfileSchema } from "../../data/schema.js";
import { matchAdvisors } from "../../matcher/index.js";
import { type Advisor, type InvestorProfile, type MatchResult } from "../../matcher/types.js";

const inputShape = {
  userProfile: InvestorProfileSchema,
  advisors: z.array(z.unknown()).optional(),
} as const;

function sieveAdvisors(raw: unknown[]): Advisor[] {
  const survivors: Advisor[] = [];
  let droppedCount = 0;
  let firstReason: string | null = null;
  for (const entry of raw) {
    const result = AdvisorSchema.safeParse(entry);
    if (result.success) {
      survivors.push(result.data as Advisor);
    } else {
      droppedCount += 1;
      if (firstReason === null) {
        const issue = result.error.issues[0];
        firstReason = issue ? `${issue.path.join(".")}: ${issue.message}` : "validation failed";
      }
    }
  }
  if (droppedCount > 0) {
    process.stderr.write(
      `[match_advisors] dropped ${droppedCount} of ${raw.length} advisors (first reason: ${firstReason})\n`,
    );
  }
  return survivors;
}

function renderMatchText(match: MatchResult, index: number): string {
  const { advisor, score, budgetFit, normalizedRating } = match;
  const expertise = advisor.expertise.join(", ");
  const risk = advisor.riskLevels.join("/");
  const budget = `$${advisor.budgetMin.toLocaleString()}–$${advisor.budgetMax.toLocaleString()}`;
  return [
    `${index + 1}. ${advisor.name} — ${advisor.location}`,
    `   Expertise: ${expertise}`,
    `   Risk levels: ${risk}`,
    `   Rating: ${advisor.rating.toFixed(1)}/5`,
    `   Accepted budget: ${budget}`,
    `   Score: ${score.toFixed(3)} (budget fit ${budgetFit.toFixed(2)}, rating ${normalizedRating.toFixed(2)})`,
  ].join("\n");
}

export function registerMatchAdvisorsTool(server: McpServer): void {
  server.registerTool(
    "match_advisors",
    {
      title: "Match advisors to an investor profile",
      description:
        "Returns the top 1–3 financial advisors ranked by budget fit and rating for a given investor profile. If `advisors` is omitted, the built-in findanadvisor dataset is used. Malformed entries in a provided `advisors` list are silently dropped (count logged to stderr).",
      inputSchema: inputShape,
    },
    async ({ userProfile, advisors }) => {
      const profile = userProfile as InvestorProfile;
      const pool: Advisor[] = advisors ? sieveAdvisors(advisors as unknown[]) : [...getAdvisors()];
      const matches = matchAdvisors(profile, pool);
      const text = matches.map(renderMatchText).join("\n\n");
      return {
        structuredContent: { matches },
        content: [{ type: "text", text }],
      };
    },
  );
}
