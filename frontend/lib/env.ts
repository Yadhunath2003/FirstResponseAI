// Same-origin by default: Next.js dev/prod server reverse-proxies /api, /ws,
// and /audio to the FastAPI backend (see next.config.ts). This means the
// browser only ever talks to ONE origin — the Next.js server — so mobile
// devices need to accept exactly one TLS cert.
//
// You can override the origin at build time via NEXT_PUBLIC_API_URL if you
// want to point the frontend at a different backend host.

const OVERRIDE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");

export const API_URL = OVERRIDE ?? "";

// WS_URL is resolved at call time so it can read window.location in the
// browser. On the server it's unused (WebSockets are only opened client-side).
export function getWsBase(): string {
  if (OVERRIDE) return OVERRIDE.replace(/^http/, "ws");
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
  }
  return "";
}
