import {
  INVESTMENT_TYPES,
  LOCATIONS,
  RISK_LEVELS,
  type InvestmentType,
  type InvestorProfile,
  type Location,
  type RiskLevel,
} from "./domain.js";

export type FormState = {
  name: string;
  location: string;
  budget: string;
  investmentTypes: string[];
  riskLevel: string;
};

export type FormErrors = Partial<Record<keyof FormState, string>>;

export const emptyForm: FormState = {
  name: "",
  location: "",
  budget: "",
  investmentTypes: [],
  riskLevel: "",
};

export function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (form.name.trim().length === 0) {
    errors.name = "Name is required";
  }
  if (!(LOCATIONS as readonly string[]).includes(form.location)) {
    errors.location = "Pick a city";
  }
  const budgetNum = Number(form.budget);
  if (form.budget === "" || Number.isNaN(budgetNum)) {
    errors.budget = "Budget is required";
  } else if (budgetNum < 100) {
    errors.budget = "Budget must be at least $100";
  }
  if (form.investmentTypes.length === 0) {
    errors.investmentTypes = "Pick at least one investment type";
  } else if (
    !form.investmentTypes.every((t) => (INVESTMENT_TYPES as readonly string[]).includes(t))
  ) {
    errors.investmentTypes = "Invalid investment type";
  }
  if (!(RISK_LEVELS as readonly string[]).includes(form.riskLevel)) {
    errors.riskLevel = "Pick a risk level";
  }
  return errors;
}

export function isValid(form: FormState): boolean {
  return Object.keys(validate(form)).length === 0;
}

export function toProfile(form: FormState): InvestorProfile {
  return {
    name: form.name.trim(),
    location: form.location as Location,
    budget: Number(form.budget),
    investmentTypes: form.investmentTypes as InvestmentType[],
    riskLevel: form.riskLevel as RiskLevel,
  };
}
