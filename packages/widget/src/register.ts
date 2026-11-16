import { RetornoWidget, VERSION } from "./widget";

// document.currentScript only exists while this script is executing: capture
// where widget.js was served from, so it talks to that API even when embedded
// on another domain.
try {
  const script = document.currentScript as HTMLScriptElement | null;
  if (script?.src) RetornoWidget.defaultApiBase = new URL(script.src).origin;
} catch {
  // Fall back to same-origin requests.
}

// Idempotent: loading widget.js twice must not throw.
if (!customElements.get("retorno-widget")) customElements.define("retorno-widget", RetornoWidget);

(window as typeof window & { RetornoWidget?: { version: string } }).RetornoWidget = {
  version: VERSION,
};
