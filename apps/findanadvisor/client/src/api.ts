import { type InvestorProfile, type MatchResult } from "./domain.js";

export async function fetchMatches(profile: InvestorProfile): Promise<MatchResult[]> {
  const res = await fetch("/api/match-advisors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body || res.statusText || "unknown"}`);
  }
  const data = (await res.json()) as { matches: MatchResult[] };
  return data.matches;
}
