/**
 * Check SEBA's discovery implementation against real, public OpenID Providers.
 *
 * This performs no login (that needs an account), but it does exercise the exact code
 * path a real login takes: issuer validation, well-known lookup, metadata validation and
 * issuer matching. Run after `npm run build` because it imports the compiled modules.
 *
 * Usage:
 *   node scripts/validation/public-discovery.mjs
 */

import { discoverProvider } from "../../dist/core/discovery.js";

const issuers = [
  "https://solidcommunity.net",
  "https://solidcommunity.net/",
  "https://solidweb.org",
  "https://solidweb.me",
  "http://localhost:3000",
  "http://localhost:3000/",
];

for (const issuer of issuers) {
  try {
    const configuration = await discoverProvider(issuer, fetch);
    console.log(
      JSON.stringify({
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
    console.log(
      JSON.stringify({
        requested: issuer,
        ok: false,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      }),
    );
  }
}
