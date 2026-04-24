import { LOCATIONS, INVESTMENT_TYPES, RISK_LEVELS } from "../../matcher/types.js";

export const investorProfileJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "location", "budget", "investmentTypes", "riskLevel"],
  properties: {
    name: { type: "string", minLength: 1 },
    location: { type: "string", enum: [...LOCATIONS] },
    budget: { type: "number", minimum: 100 },
    investmentTypes: {
      type: "array",
      minItems: 1,
      items: { type: "string", enum: [...INVESTMENT_TYPES] },
    },
    riskLevel: { type: "string", enum: [...RISK_LEVELS] },
  },
} as const;
