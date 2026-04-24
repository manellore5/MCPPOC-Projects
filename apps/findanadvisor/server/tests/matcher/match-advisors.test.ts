import { describe, it, expect } from "vitest";
import { matchAdvisors } from "../../src/matcher/index.js";
import { type Advisor, type InvestorProfile } from "../../src/matcher/types.js";

const baseProfile: InvestorProfile = {
  name: "Alice",
  location: "Minneapolis",
  budget: 100000,
  investmentTypes: ["stocks"],
  riskLevel: "medium",
};

const baseAdvisor = (overrides: Partial<Advisor> = {}): Advisor => ({
  id: "a1",
  name: "Bob Advisor",
  location: "Minneapolis",
  expertise: ["stocks", "bonds"],
  riskLevels: ["low", "medium", "high"],
  rating: 4.5,
  budgetMin: 50000,
  budgetMax: 500000,
  ...overrides,
});

describe("matchAdvisors — happy path", () => {
  it("returns the single matching advisor for a simple profile", () => {
    const matches = matchAdvisors(baseProfile, [baseAdvisor()]);
    expect(matches).toHaveLength(1);
    expect(matches[0].advisor.id).toBe("a1");
  });

  it("returns a MatchResult with advisor, score, budgetFit, normalizedRating", () => {
    const [match] = matchAdvisors(baseProfile, [baseAdvisor()]);
    expect(match).toMatchObject({
      advisor: expect.objectContaining({ id: "a1" }),
      score: expect.any(Number),
      budgetFit: expect.any(Number),
      normalizedRating: expect.any(Number),
    });
  });
});

describe("matchAdvisors — location filter (exact match)", () => {
  it("excludes advisors in a different city", () => {
    const advisors = [
      baseAdvisor({ id: "in-city" }),
      baseAdvisor({ id: "out-of-city", location: "Boston" }),
    ];
    const matches = matchAdvisors(baseProfile, advisors);
    expect(matches.map((m) => m.advisor.id)).toEqual(["in-city"]);
  });

  it("throws when no advisor is in the investor city", () => {
    const advisors = [baseAdvisor({ location: "Boston" })];
    expect(() => matchAdvisors(baseProfile, advisors)).toThrow(/no advisors qualified/i);
  });
});

describe("matchAdvisors — expertise overlap filter (≥ 1)", () => {
  it("includes an advisor with a single overlap", () => {
    const advisors = [baseAdvisor({ expertise: ["stocks"] })];
    expect(matchAdvisors(baseProfile, advisors)).toHaveLength(1);
  });

  it("includes an advisor with multiple overlapping expertise", () => {
    const profile: InvestorProfile = {
      ...baseProfile,
      investmentTypes: ["stocks", "bonds", "crypto"],
    };
    const advisors = [baseAdvisor({ expertise: ["stocks", "bonds"] })];
    expect(matchAdvisors(profile, advisors)).toHaveLength(1);
  });

  it("excludes an advisor with no overlap", () => {
    const advisors = [
      baseAdvisor({ id: "match", expertise: ["stocks"] }),
      baseAdvisor({ id: "no-overlap", expertise: ["crypto", "real_estate"] }),
    ];
    const matches = matchAdvisors(baseProfile, advisors);
    expect(matches.map((m) => m.advisor.id)).toEqual(["match"]);
  });

  it("throws when no advisor has any overlapping expertise", () => {
    const advisors = [baseAdvisor({ expertise: ["real_estate"] })];
    expect(() => matchAdvisors(baseProfile, advisors)).toThrow();
  });
});

describe("matchAdvisors — risk level filter (in list)", () => {
  it("includes an advisor whose riskLevels contains the investor risk level", () => {
    const advisors = [baseAdvisor({ riskLevels: ["medium"] })];
    expect(matchAdvisors(baseProfile, advisors)).toHaveLength(1);
  });

  it("excludes an advisor whose riskLevels does not contain the investor risk level", () => {
    const profile: InvestorProfile = { ...baseProfile, riskLevel: "high" };
    const advisors = [
      baseAdvisor({ id: "accepts-high", riskLevels: ["high"] }),
      baseAdvisor({ id: "low-only", riskLevels: ["low"] }),
    ];
    const matches = matchAdvisors(profile, advisors);
    expect(matches.map((m) => m.advisor.id)).toEqual(["accepts-high"]);
  });
});

describe("matchAdvisors — budget fit scoring", () => {
  const profileWithBudget = (budget: number): InvestorProfile => ({
    ...baseProfile,
    budget,
  });

  it("scores 1.0 when budget is inside the range", () => {
    const [match] = matchAdvisors(profileWithBudget(100000), [
      baseAdvisor({ budgetMin: 50000, budgetMax: 500000 }),
    ]);
    expect(match.budgetFit).toBe(1);
  });

  it("scores 1.0 when budget equals budgetMin (edge)", () => {
    const [match] = matchAdvisors(profileWithBudget(50000), [
      baseAdvisor({ budgetMin: 50000, budgetMax: 500000 }),
    ]);
    expect(match.budgetFit).toBe(1);
  });

  it("scores 1.0 when budget equals budgetMax (edge)", () => {
    const [match] = matchAdvisors(profileWithBudget(500000), [
      baseAdvisor({ budgetMin: 50000, budgetMax: 500000 }),
    ]);
    expect(match.budgetFit).toBe(1);
  });

  it("scores linearly below min (just below)", () => {
    // budget = 40000, min = 50000 → 1 - (10000 / 50000) = 0.8
    const [match] = matchAdvisors(profileWithBudget(40000), [
      baseAdvisor({ budgetMin: 50000, budgetMax: 500000 }),
    ]);
    expect(match.budgetFit).toBeCloseTo(0.8, 5);
  });

  it("clamps to 0 when budget is far below min", () => {
    // budget = 0, min = 50000 → 1 - (50000/50000) = 0 (boundary)
    const [match] = matchAdvisors(profileWithBudget(0), [
      baseAdvisor({ budgetMin: 50000, budgetMax: 500000 }),
    ]);
    expect(match.budgetFit).toBe(0);
  });

  it("scores linearly above max (just above)", () => {
    // budget = 600000, max = 500000 → 1 - (100000 / 500000) = 0.8
    const [match] = matchAdvisors(profileWithBudget(600000), [
      baseAdvisor({ budgetMin: 50000, budgetMax: 500000 }),
    ]);
    expect(match.budgetFit).toBeCloseTo(0.8, 5);
  });

  it("clamps to 0 when budget is far above max", () => {
    // budget = 10_000_000, max = 500000 → 1 - (9_500_000 / 500_000) = -18 → clamp 0
    const [match] = matchAdvisors(profileWithBudget(10_000_000), [
      baseAdvisor({ budgetMin: 50000, budgetMax: 500000 }),
    ]);
    expect(match.budgetFit).toBe(0);
  });
});

describe("matchAdvisors — rating normalization", () => {
  it("normalizes rating 1 to 0", () => {
    const [match] = matchAdvisors(baseProfile, [baseAdvisor({ rating: 1 })]);
    expect(match.normalizedRating).toBe(0);
  });

  it("normalizes rating 5 to 1", () => {
    const [match] = matchAdvisors(baseProfile, [baseAdvisor({ rating: 5 })]);
    expect(match.normalizedRating).toBe(1);
  });

  it("normalizes rating 3 to 0.5", () => {
    const [match] = matchAdvisors(baseProfile, [baseAdvisor({ rating: 3 })]);
    expect(match.normalizedRating).toBe(0.5);
  });

  it("normalizes fractional rating 4.5 to 0.875", () => {
    const [match] = matchAdvisors(baseProfile, [baseAdvisor({ rating: 4.5 })]);
    expect(match.normalizedRating).toBeCloseTo(0.875, 5);
  });
});

describe("matchAdvisors — weighted score arithmetic", () => {
  it("combines 0.6 * budgetFit + 0.4 * normalizedRating", () => {
    // budget 100000 inside range → budgetFit = 1
    // rating 3 → normalizedRating = 0.5
    // score = 0.6 * 1 + 0.4 * 0.5 = 0.8
    const [match] = matchAdvisors(baseProfile, [
      baseAdvisor({ rating: 3, budgetMin: 50000, budgetMax: 500000 }),
    ]);
    expect(match.score).toBeCloseTo(0.8, 5);
  });

  it("produces zero score only when both components are zero", () => {
    // budget 0, budgetMin 50000 → budgetFit = 0
    // rating 1 → normalizedRating = 0
    // score = 0
    const [match] = matchAdvisors({ ...baseProfile, budget: 0 }, [
      baseAdvisor({ rating: 1, budgetMin: 50000, budgetMax: 500000 }),
    ]);
    expect(match.score).toBe(0);
  });
});

describe("matchAdvisors — ranking and top-3 cap", () => {
  it("orders by score descending", () => {
    const advisors = [
      baseAdvisor({ id: "low-rating", rating: 2 }), // nr=0.25, bf=1 → score=0.7
      baseAdvisor({ id: "high-rating", rating: 5 }), // nr=1, bf=1 → score=1.0
      baseAdvisor({ id: "mid-rating", rating: 3 }), // nr=0.5, bf=1 → score=0.8
    ];
    const matches = matchAdvisors(baseProfile, advisors);
    expect(matches.map((m) => m.advisor.id)).toEqual(["high-rating", "mid-rating", "low-rating"]);
  });

  it("caps at 3 matches even when more qualify", () => {
    const advisors = Array.from({ length: 7 }, (_, i) =>
      baseAdvisor({ id: `a${i}`, rating: 5 - i * 0.1 }),
    );
    const matches = matchAdvisors(baseProfile, advisors);
    expect(matches).toHaveLength(3);
    expect(matches.map((m) => m.advisor.id)).toEqual(["a0", "a1", "a2"]);
  });

  it("returns exactly 2 when only 2 qualify", () => {
    const advisors = [
      baseAdvisor({ id: "a1" }),
      baseAdvisor({ id: "a2" }),
      baseAdvisor({ id: "wrong-city", location: "Boston" }),
    ];
    const matches = matchAdvisors(baseProfile, advisors);
    expect(matches).toHaveLength(2);
  });

  it("returns exactly 1 when only 1 qualifies", () => {
    const advisors = [
      baseAdvisor({ id: "a1" }),
      baseAdvisor({ id: "wrong-city", location: "Boston" }),
      baseAdvisor({ id: "no-expertise", expertise: ["crypto"] }),
    ];
    const matches = matchAdvisors(baseProfile, advisors);
    expect(matches).toHaveLength(1);
    expect(matches[0].advisor.id).toBe("a1");
  });

  it("tie-breaks deterministically by advisor id ascending", () => {
    const advisors = [
      baseAdvisor({ id: "z-tie", rating: 4 }),
      baseAdvisor({ id: "a-tie", rating: 4 }),
      baseAdvisor({ id: "m-tie", rating: 4 }),
    ];
    const matches = matchAdvisors(baseProfile, advisors);
    expect(matches.map((m) => m.advisor.id)).toEqual(["a-tie", "m-tie", "z-tie"]);
  });
});

describe("matchAdvisors — zero qualifying throws", () => {
  it("throws when the advisors array is empty", () => {
    expect(() => matchAdvisors(baseProfile, [])).toThrow(/no advisors qualified/i);
  });

  it("throws when every advisor fails at least one filter", () => {
    const advisors = [baseAdvisor({ location: "Boston" })];
    expect(() => matchAdvisors(baseProfile, advisors)).toThrow();
  });
});
