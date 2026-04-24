import { type Advisor, type InvestorProfile, type MatchResult } from "./types.js";

export type { Advisor, InvestorProfile, MatchResult } from "./types.js";
export { LOCATIONS, INVESTMENT_TYPES, RISK_LEVELS } from "./types.js";
export type { Location, InvestmentType, RiskLevel } from "./types.js";

const BUDGET_WEIGHT = 0.6;
const RATING_WEIGHT = 0.4;
const MAX_RESULTS = 3;

function passesLocation(advisor: Advisor, profile: InvestorProfile): boolean {
  return advisor.location === profile.location;
}

function passesExpertiseOverlap(advisor: Advisor, profile: InvestorProfile): boolean {
  return profile.investmentTypes.some((t) => advisor.expertise.includes(t));
}

function passesRisk(advisor: Advisor, profile: InvestorProfile): boolean {
  return advisor.riskLevels.includes(profile.riskLevel);
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function computeBudgetFit(advisor: Advisor, budget: number): number {
  const { budgetMin, budgetMax } = advisor;
  if (budget >= budgetMin && budget <= budgetMax) return 1;
  if (budget < budgetMin) {
    return clamp01(1 - (budgetMin - budget) / budgetMin);
  }
  return clamp01(1 - (budget - budgetMax) / budgetMax);
}

function computeNormalizedRating(rating: number): number {
  return clamp01((rating - 1) / 4);
}

function computeScore(budgetFit: number, normalizedRating: number): number {
  return BUDGET_WEIGHT * budgetFit + RATING_WEIGHT * normalizedRating;
}

export function matchAdvisors(profile: InvestorProfile, advisors: Advisor[]): MatchResult[] {
  const qualifying: MatchResult[] = [];
  for (const advisor of advisors) {
    if (
      !passesLocation(advisor, profile) ||
      !passesExpertiseOverlap(advisor, profile) ||
      !passesRisk(advisor, profile)
    ) {
      continue;
    }
    const budgetFit = computeBudgetFit(advisor, profile.budget);
    const normalizedRating = computeNormalizedRating(advisor.rating);
    const score = computeScore(budgetFit, normalizedRating);
    qualifying.push({ advisor, score, budgetFit, normalizedRating });
  }

  if (qualifying.length === 0) {
    throw new Error(
      "No advisors qualified for the given profile. Dataset must include at least one matching advisor per valid profile.",
    );
  }

  qualifying.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // deterministic tie-break: advisor id ascending
    return a.advisor.id.localeCompare(b.advisor.id);
  });

  return qualifying.slice(0, MAX_RESULTS);
}
