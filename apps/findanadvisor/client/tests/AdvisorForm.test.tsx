import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AdvisorForm } from "../src/components/AdvisorForm.js";
import { type MatchResult } from "../src/domain.js";

function sampleMatch(overrides: Partial<MatchResult["advisor"]> = {}): MatchResult {
  return {
    advisor: {
      id: "adv-1",
      name: "Sample Advisor",
      location: "Minneapolis",
      expertise: ["stocks"],
      riskLevels: ["medium"],
      rating: 4.5,
      budgetMin: 1000,
      budgetMax: 1000000,
      ...overrides,
    },
    score: 0.85,
    budgetFit: 1,
    normalizedRating: 0.875,
  };
}

async function fillValidForm() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/your name/i), "Alice");
  await user.selectOptions(screen.getByLabelText(/location/i), "Minneapolis");
  await user.type(screen.getByLabelText(/investable budget/i), "100000");
  await user.click(screen.getByRole("checkbox", { name: /stocks/i }));
  await user.selectOptions(screen.getByLabelText(/risk level/i), "medium");
  return user;
}

describe("<AdvisorForm /> — standalone mode", () => {
  it("disables the submit button while the form is invalid", () => {
    render(<AdvisorForm />);
    expect(screen.getByRole("button", { name: /find advisor/i })).toBeDisabled();
  });

  it("keeps the submit button disabled while the form is empty", () => {
    const noopFetch = vi.fn();
    render(<AdvisorForm fetchImpl={noopFetch} />);
    expect(screen.getByRole("button", { name: /find advisor/i })).toBeDisabled();
    expect(noopFetch).not.toHaveBeenCalled();
  });

  it("calls fetchImpl with a typed profile and renders matches on success", async () => {
    const fetchImpl = vi.fn(async () => [sampleMatch()]);
    render(<AdvisorForm fetchImpl={fetchImpl} />);
    const user = await fillValidForm();
    await user.click(screen.getByRole("button", { name: /find advisor/i }));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(fetchImpl).toHaveBeenCalledWith({
      name: "Alice",
      location: "Minneapolis",
      budget: 100000,
      investmentTypes: ["stocks"],
      riskLevel: "medium",
    });
    expect(await screen.findByText(/sample advisor/i)).toBeInTheDocument();
    expect(screen.getByText(/top 1 matched advisor/i)).toBeInTheDocument();
  });

  it("renders an error state with a Try again button on API failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([sampleMatch()]);
    render(<AdvisorForm fetchImpl={fetchImpl} />);
    const user = await fillValidForm();
    await user.click(screen.getByRole("button", { name: /find advisor/i }));
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});

describe("<AdvisorForm /> — embedded mode", () => {
  let postSpy: ReturnType<typeof vi.fn>;
  let originalParent: Window;

  beforeEach(() => {
    postSpy = vi.fn();
    originalParent = window.parent;
    // In jsdom, window.parent === window by default. Swap in a fake parent.
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: { postMessage: postSpy },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: originalParent,
    });
  });

  it("notifies the MCP-UI host of readiness on mount", () => {
    render(<AdvisorForm embedded fetchImpl={vi.fn()} />);
    const readyCall = postSpy.mock.calls.find(
      (c) => (c[0] as { type?: string }).type === "ui-lifecycle-iframe-ready",
    );
    expect(readyCall).toBeDefined();
  });

  it("posts ui-size-change messages so the host can resize the iframe", () => {
    render(<AdvisorForm embedded fetchImpl={vi.fn()} />);
    const sizeCall = postSpy.mock.calls.find(
      (c) => (c[0] as { type?: string }).type === "ui-size-change",
    );
    expect(sizeCall).toBeDefined();
  });

  it("calls fetchImpl and renders matches inline inside the iframe", async () => {
    const fetchImpl = vi.fn(async () => [sampleMatch()]);
    render(<AdvisorForm embedded fetchImpl={fetchImpl} />);
    const user = await fillValidForm();
    await user.click(screen.getByRole("button", { name: /find advisor/i }));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/sample advisor/i)).toBeInTheDocument();
  });
});
