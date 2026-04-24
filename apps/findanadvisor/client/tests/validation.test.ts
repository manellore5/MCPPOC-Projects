import { describe, it, expect } from "vitest";
import { emptyForm, isValid, toProfile, validate, type FormState } from "../src/validation.js";

const completeForm: FormState = {
  name: "Alice",
  location: "Minneapolis",
  budget: "100000",
  investmentTypes: ["stocks", "bonds"],
  riskLevel: "medium",
};

describe("validate", () => {
  it("returns no errors for a complete valid form", () => {
    expect(validate(completeForm)).toEqual({});
    expect(isValid(completeForm)).toBe(true);
  });

  it("flags every missing field on the empty form", () => {
    const errors = validate(emptyForm);
    expect(errors.name).toBeDefined();
    expect(errors.location).toBeDefined();
    expect(errors.budget).toBeDefined();
    expect(errors.investmentTypes).toBeDefined();
    expect(errors.riskLevel).toBeDefined();
    expect(isValid(emptyForm)).toBe(false);
  });

  it("flags budget below 100", () => {
    const errors = validate({ ...completeForm, budget: "50" });
    expect(errors.budget).toMatch(/100/);
  });

  it("accepts budget exactly at 100", () => {
    expect(validate({ ...completeForm, budget: "100" }).budget).toBeUndefined();
  });

  it("flags a non-enum location", () => {
    const errors = validate({ ...completeForm, location: "Nowhere" });
    expect(errors.location).toBeDefined();
  });

  it("flags an empty investmentTypes list", () => {
    const errors = validate({ ...completeForm, investmentTypes: [] });
    expect(errors.investmentTypes).toBeDefined();
  });

  it("flags a non-enum risk level", () => {
    const errors = validate({ ...completeForm, riskLevel: "major" });
    expect(errors.riskLevel).toBeDefined();
  });

  it("trims whitespace-only name as invalid", () => {
    const errors = validate({ ...completeForm, name: "   " });
    expect(errors.name).toBeDefined();
  });
});

describe("toProfile", () => {
  it("converts a valid form state to a typed InvestorProfile", () => {
    const profile = toProfile(completeForm);
    expect(profile).toEqual({
      name: "Alice",
      location: "Minneapolis",
      budget: 100000,
      investmentTypes: ["stocks", "bonds"],
      riskLevel: "medium",
    });
  });
});
