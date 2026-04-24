import { describe, it, expect } from "vitest";

describe("client test infrastructure", () => {
  it("runs vitest in jsdom environment", () => {
    expect(1 + 1).toBe(2);
  });

  it("has access to the DOM", () => {
    const div = document.createElement("div");
    div.textContent = "hello";
    expect(div.textContent).toBe("hello");
  });

  it("has access to window", () => {
    expect(typeof window).toBe("object");
  });
});
