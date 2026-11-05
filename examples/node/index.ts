/**
 * Node.js example: restore or start a login, read the user's profile, sign out.
 *
 * Prerequisites for the local Community Solid Server flow:
 *
 * 1. `npm run build` (the example imports the package through its self-reference).
 * 2. A CSS instance on http://localhost:3000 with an account and a pod.
 * 3. A Client ID Document served over http on loopback that publishes the redirect URI.
 *
 * Run:
 *
 * ```bash
 * SEBA_CLIENT_ID=http://localhost:8443/client-id.jsonld \
 * SEBA_REDIRECT_URI=http://localhost:3001/auth/callback \
 * SEBA_ISSUER=http://localhost:3000 \
 * WEBID=http://localhost:3000/alice/profile/card#me \
 *   node examples/node/index.ts
 * ```
 *
 * The redirect URI must be published verbatim in the Client ID Document and must use
 * plain http on loopback (`127.0.0.1`, `::1` or `localhost`) because SEBA starts a
 * temporary callback server there.
 */

import { exec } from "node:child_process";
import { Seba } from "@gaballahtech/seba/node";

const issuer = process.env["SEBA_ISSUER"] ?? "http://localhost:3000";
const clientId = process.env["SEBA_CLIENT_ID"] ?? "http://localhost:8443/client-id.jsonld";
const redirectUri = process.env["SEBA_REDIRECT_URI"] ?? "http://localhost:3001/auth/callback";
const webId = process.env["WEBID"];

const seba = new Seba({
  clientId,
  redirectUri,
  openAuthorizationUrl(url) {
    // Replace with the opener for your platform: `open` (macOS), `start` (Windows).
    exec(`xdg-open "${url}"`, (error) => {
      if (error !== null) {
        console.error("Open this URL in a browser to continue:");
        console.error(url);
      }
    });
  },
  debug: process.env["SEBA_DEBUG"] === "1",
});

const session = (await seba.restoreSession()) ?? (await seba.login(webId === undefined ? { issuer } : { issuer, webId }));

console.log(`Signed in as ${session.webId} (provider ${session.provider}).`);

const response = await seba.fetch(session.webId, {
  headers: { accept: "text/turtle" },
});
if (!response.ok) {
  throw new Error(`Reading the profile failed with HTTP ${String(response.status)}.`);
}
console.log(await response.text());

await seba.logout();
console.log("Signed out.");
