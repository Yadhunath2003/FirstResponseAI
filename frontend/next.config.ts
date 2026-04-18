import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

// Every non-loopback IPv4 on this machine, plus `*.*.*.*` so any LAN IP is
// accepted. Next's `allowedDevOrigins` rejects a bare `"*"`, so we have to
// enumerate or use a 4-part wildcard.
function lanHosts(): string[] {
  const hosts = new Set<string>(["*.*.*.*"]);
  for (const list of Object.values(networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === "IPv4" && !iface.internal) hosts.add(iface.address);
    }
  }
  return [...hosts];
}

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND}/api/:path*` },
      { source: "/ws/:path*", destination: `${BACKEND}/ws/:path*` },
      { source: "/audio/:path*", destination: `${BACKEND}/audio/:path*` },
    ];
  },
  allowedDevOrigins: lanHosts(),
};

export default nextConfig;
