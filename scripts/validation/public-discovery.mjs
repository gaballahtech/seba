/**
 * Discovery-only compatibility checks (no login, no token exchange, no resource fetch).
 *
 * Reads targets from compat/providers.json by default. Exercises SEBA's discovery
 * implementation: issuer validation, well-known lookup, metadata validation and
 * issuer matching.
 *
 * Usage:
 *   npm run build
 *   node scripts/validation/public-discovery.mjs
 *
 * Env:
 *   SEBA_COMPAT_INCLUDE_SELF_HOSTED=1  include skipByDefault/self-hosted-example targets
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverProvider } from "../../dist/core/discovery.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compatPath = path.resolve(__dirname, "../../compat/providers.json");
const includeSelfHosted = process.env.SEBA_COMPAT_INCLUDE_SELF_HOSTED === "1";

function loadProviders() {
  if (!fs.existsSync(compatPath)) {
    throw new Error(`Missing ${compatPath}`);
  }
  const data = JSON.parse(fs.readFileSync(compatPath, "utf8"));
  const providers = Array.isArray(data.providers) ? data.providers : [];
  return providers.filter((p) => {
    if (!p || typeof p.issuer !== "string") return false;
    if (includeSelfHosted) return true;
    if (p.skipByDefault === true) return false;
    if (p.type === "self-hosted-example") return false;
    return true;
  });
}

const providers = loadProviders();
let failed = 0;

for (const p of providers) {
  const issuer = p.issuer;
  try {
    const configuration = await discoverProvider(issuer, fetch);
    console.log(
      JSON.stringify({
        id: p.id ?? null,
        name: p.name ?? null,
        requested: issuer,
        ok: true,
        issuer: configuration.issuer,
        authorizationEndpoint: configuration.authorizationEndpoint,
        tokenEndpoint: configuration.tokenEndpoint,
        revocation: configuration.revocationEndpoint !== undefined,
        webidScope: configuration.scopesSupported?.includes("webid") === true,
      }),
    );
  } catch (error) {
    failed += 1;
    console.log(
      JSON.stringify({
        id: p.id ?? null,
        name: p.name ?? null,
        requested: issuer,
        ok: false,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      }),
    );
  }
}

if (failed > 0) {
  console.error(`Discovery-only check failed for ${failed} provider(s).`);
  process.exit(1);
}
console.log(`Discovery-only check passed for ${providers.length} provider(s).`);
