// Runs before `next dev`. If ../certs/cert.pem + key.pem are missing, generate
// a self-signed cert covering localhost + this machine's LAN IP so the same
// cert works on a laptop and on a phone over Wi-Fi.
//
// Cross-platform: only uses Node stdlib + the `selfsigned` npm package. No
// openssl, no Python, no shell — works on macOS, Linux, and Windows.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import selfsigned from "selfsigned";

const here = dirname(fileURLToPath(import.meta.url));
const certsDir = join(here, "..", "..", "certs");
const certPath = join(certsDir, "cert.pem");
const keyPath = join(certsDir, "key.pem");

if (existsSync(certPath) && existsSync(keyPath)) {
  process.exit(0);
}

function lanIps() {
  const ips = new Set(["127.0.0.1"]);
  for (const list of Object.values(networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === "IPv4" && !iface.internal) ips.add(iface.address);
    }
  }
  return [...ips];
}

const ips = lanIps();
console.log(`[ensure-certs] generating self-signed cert for: ${ips.join(", ")}`);

const altNames = [
  { type: 2, value: "localhost" }, // DNS
  ...ips.map((ip) => ({ type: 7, ip })), // IP
];

const { private: key, cert } = selfsigned.generate(
  [{ name: "commonName", value: "FirstResponseAI Dev" }],
  {
    days: 365,
    keySize: 2048,
    algorithm: "sha256",
    extensions: [
      { name: "basicConstraints", cA: false },
      {
        name: "keyUsage",
        digitalSignature: true,
        keyEncipherment: true,
      },
      { name: "extKeyUsage", serverAuth: true },
      { name: "subjectAltName", altNames },
    ],
  },
);

mkdirSync(certsDir, { recursive: true });
writeFileSync(keyPath, key);
writeFileSync(certPath, cert);
console.log(`[ensure-certs] wrote ${certPath}`);
