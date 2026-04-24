import { describe, it, expect } from "vitest";
import { parseAdvisors, getAdvisors } from "../../src/data/loader.js";
import { LOCATIONS, INVESTMENT_TYPES, RISK_LEVELS } from "../../src/matcher/types.js";

const validAdvisor = {
  id: "x1",
  name: "Test Advisor",
  location: "Minneapolis",
  expertise: ["stocks"],
  riskLevels: ["medium"],
  rating: 4.5,
  budgetMin: 1000,
  budgetMax: 10000,
};

describe("parseAdvisors — validation", () => {
  it("parses a valid single-advisor array", () => {
    const advisors = parseAdvisors([validAdvisor]);
    expect(advisors).toHaveLength(1);
    expect(advisors[0].id).toBe("x1");
  });

  it("throws when input is not an array", () => {
    expect(() => parseAdvisors({} as unknown)).toThrow();
    expect(() => parseAdvisors(null as unknown)).toThrow();
  });

  it("throws with a readable message when an advisor is missing a required field", () => {
    const bad = { ...validAdvisor, rating: undefined };
    expect(() => parseAdvisors([bad])).toThrow(/rating/);
  });

  it("throws when rating is outside 1–5", () => {
    expect(() => parseAdvisors([{ ...validAdvisor, rating: 0 }])).toThrow(/rating/);
    expect(() => parseAdvisors([{ ...validAdvisor, rating: 6 }])).toThrow(/rating/);
  });

  it("throws when budgetMin > budgetMax", () => {
    expect(() => parseAdvisors([{ ...validAdvisor, budgetMin: 10000, budgetMax: 1000 }])).toThrow(
      /budget/i,
    );
  });

  it("throws when location is not in the allowed enum", () => {
    expect(() => parseAdvisors([{ ...validAdvisor, location: "Nowhere" }])).toThrow();
  });

  it("throws when expertise contains an unknown investment type", () => {
    expect(() => parseAdvisors([{ ...validAdvisor, expertise: ["forex"] }])).toThrow();
  });

  it("throws when expertise is empty", () => {
    expect(() => parseAdvisors([{ ...validAdvisor, expertise: [] }])).toThrow();
  });

  it("throws when riskLevels is empty", () => {
    expect(() => parseAdvisors([{ ...validAdvisor, riskLevels: [] }])).toThrow();
  });
});

describe("getAdvisors — built-in dataset", () => {
  const advisors = getAdvisors();

  it("returns exactly 20 advisors", () => {
    expect(advisors).toHaveLength(20);
  });

  it("returns a frozen array", () => {
    expect(Object.isFrozen(advisors)).toBe(true);
  });

  it("contains exactly 8 generalists (one per city, all expertise, all risk levels)", () => {
    const generalists = advisors.filter(
      (a) =>
        a.expertise.length === INVESTMENT_TYPES.length &&
        a.riskLevels.length === RISK_LEVELS.length,
    );
    expect(generalists).toHaveLength(8);
    const generalistCities = new Set(generalists.map((a) => a.location));
    expect(generalistCities.size).toBe(LOCATIONS.length);
  });

  it("contains 12 non-generalist (specialist) advisors", () => {
    const specialists = advisors.filter(
      (a) =>
        a.expertise.length < INVESTMENT_TYPES.length || a.riskLevels.length < RISK_LEVELS.length,
    );
    expect(specialists).toHaveLength(12);
  });

  it("has rating distribution: at least one < 4.0 and one ≥ 4.5", () => {
    expect(advisors.some((a) => a.rating < 4.0)).toBe(true);
    expect(advisors.some((a) => a.rating >= 4.5)).toBe(true);
  });

  it("satisfies budgetMin ≤ budgetMax for every advisor", () => {
    for (const a of advisors) {
      expect(a.budgetMin).toBeLessThanOrEqual(a.budgetMax);
    }
  });

  it("has unique ids for every advisor", () => {
    const ids = new Set(advisors.map((a) => a.id));
    expect(ids.size).toBe(advisors.length);
  });

  it("returns the same frozen instance on repeated calls", () => {
    expect(getAdvisors()).toBe(advisors);
  });
});
