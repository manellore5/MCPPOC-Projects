import { describe, it, expect } from "vitest";

describe("server test infrastructure", () => {
  it("runs vitest in node environment", () => {
    expect(1 + 1).toBe(2);
  });

  it("has access to node globals", () => {
    expect(typeof process).toBe("object");
    expect(typeof Buffer).toBe("function");
  });
});
