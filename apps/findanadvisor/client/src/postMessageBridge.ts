export function isEmbedded(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("embedded") === "1";
}

/**
 * Tell the MCP-UI host (e.g. Nanobot) that the iframe has finished loading.
 * The host uses this to resolve sizing and reveal the iframe contents.
 */
export function notifyIframeReady(target: Window = window.parent): void {
  if (target === window) return;
  target.postMessage({ type: "ui-lifecycle-iframe-ready" }, "*");
}

/**
 * Report the iframe's current content size to the host so it can resize
 * the surrounding chat chrome. Called after layout settles and on resize.
 */
export function notifyIframeSize(
  height: number,
  width: number,
  target: Window = window.parent,
): void {
  if (target === window) return;
  target.postMessage({ type: "ui-size-change", payload: { height, width } }, "*");
}
