export const LOCATIONS = [
  "Minneapolis",
  "New York",
  "San Francisco",
  "Chicago",
  "Los Angeles",
  "Denver",
  "Miami",
  "Boston",
] as const;
export type Location = (typeof LOCATIONS)[number];

export const INVESTMENT_TYPES = [
  "stocks",
  "bonds",
  "real_estate",
  "crypto",
  "mutual_funds",
] as const;
export type InvestmentType = (typeof INVESTMENT_TYPES)[number];

export const INVESTMENT_TYPE_LABELS: Record<InvestmentType, string> = {
  stocks: "Stocks",
  bonds: "Bonds",
  real_estate: "Real Estate",
  crypto: "Crypto",
  mutual_funds: "Mutual Funds",
};

export const RISK_LEVELS = ["low", "medium", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export type InvestorProfile = {
  name: string;
  location: Location;
  budget: number;
  investmentTypes: InvestmentType[];
  riskLevel: RiskLevel;
};

export type Advisor = {
  id: string;
  name: string;
  location: Location;
  expertise: InvestmentType[];
  riskLevels: RiskLevel[];
  rating: number;
  budgetMin: number;
  budgetMax: number;
};

export type MatchResult = {
  advisor: Advisor;
  score: number;
  budgetFit: number;
  normalizedRating: number;
};
