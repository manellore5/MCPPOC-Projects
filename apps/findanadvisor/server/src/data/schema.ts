import { z } from "zod";
import { LOCATIONS, INVESTMENT_TYPES, RISK_LEVELS } from "../matcher/types.js";

const LocationSchema = z.enum([...LOCATIONS] as [string, ...string[]]);
const InvestmentTypeSchema = z.enum([...INVESTMENT_TYPES] as [string, ...string[]]);
const RiskLevelSchema = z.enum([...RISK_LEVELS] as [string, ...string[]]);

export const AdvisorSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    location: LocationSchema,
    expertise: z.array(InvestmentTypeSchema).min(1),
    riskLevels: z.array(RiskLevelSchema).min(1),
    rating: z.number().min(1).max(5),
    budgetMin: z.number().nonnegative(),
    budgetMax: z.number().nonnegative(),
  })
  .refine((a) => a.budgetMin <= a.budgetMax, {
    message: "budgetMin must be less than or equal to budgetMax",
    path: ["budgetMin"],
  });

export const AdvisorsArraySchema = z.array(AdvisorSchema);

export const InvestorProfileSchema = z.object({
  name: z.string().min(1),
  location: LocationSchema,
  budget: z.number().min(100),
  investmentTypes: z.array(InvestmentTypeSchema).min(1),
  riskLevel: RiskLevelSchema,
});
