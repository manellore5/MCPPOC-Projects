import { describe, it, expect, vi, beforeEach } from "vitest";
import { isEmbedded, notifyIframeReady, notifyIframeSize } from "../src/postMessageBridge.js";

describe("isEmbedded", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("returns false when ?embedded param is absent", () => {
    expect(isEmbedded()).toBe(false);
  });

  it("returns true when ?embedded=1", () => {
    window.history.replaceState({}, "", "/?embedded=1");
    expect(isEmbedded()).toBe(true);
  });

  it('returns false when embedded param has a non-"1" value', () => {
    window.history.replaceState({}, "", "/?embedded=true");
    expect(isEmbedded()).toBe(false);
  });
});

describe("notifyIframeReady", () => {
  it("posts the MCP-UI ui-lifecycle-iframe-ready message to the target", () => {
    const post = vi.fn();
    const fakeTarget = { postMessage: post } as unknown as Window;
    notifyIframeReady(fakeTarget);
    expect(post).toHaveBeenCalledTimes(1);
    const firstCall = post.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [payload, targetOrigin] = firstCall as [unknown, string];
    expect(payload).toEqual({ type: "ui-lifecycle-iframe-ready" });
    expect(targetOrigin).toBe("*");
  });

  it("does not post when target is the same window (no parent)", () => {
    const post = vi.spyOn(window, "postMessage");
    notifyIframeReady(window);
    expect(post).not.toHaveBeenCalled();
    post.mockRestore();
  });
});

describe("notifyIframeSize", () => {
  it("posts the MCP-UI ui-size-change message with height and width", () => {
    const post = vi.fn();
    const fakeTarget = { postMessage: post } as unknown as Window;
    notifyIframeSize(480, 720, fakeTarget);
    expect(post).toHaveBeenCalledTimes(1);
    const firstCall = post.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [payload] = firstCall as [unknown, string];
    expect(payload).toEqual({
      type: "ui-size-change",
      payload: { height: 480, width: 720 },
    });
  });
});
