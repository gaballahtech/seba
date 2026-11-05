/**
 * End-to-end Solid-OIDC flow against a local Community Solid Server.
 *
 * The script serves a real Client ID Document over loopback HTTP and drives the CSS
 * account/OIDC JSON APIs in place of a browser: password login, WebID selection, consent,
 * then the authorization redirect that SEBA's loopback callback server receives.
 *
 * Usage (after css-setup.mjs):
 *   CSS_EMAIL=... CSS_PASSWORD=... WEBID=... node scripts/validation/css-flow.mjs
 *
 * Environment:
 *   CSS_BASE      issuer base (default http://localhost:3000) — the issuer identifier is
 *                 CSS_BASE + "/" and must match discovery exactly.
 *   CLIENT_PORT   port serving /client-id.jsonld (default 8443)
 *   CALLBACK_PORT port SEBA binds for the redirect URI (default 3001)
 */

import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { Seba } from "../../dist/index.js";

const cssBase = process.env["CSS_BASE"] ?? "http://localhost:3000";
const issuer = process.env["SEBA_ISSUER"] ?? `${cssBase}/`;
const email = process.env["CSS_EMAIL"];
const password = process.env["CSS_PASSWORD"];
const webId = process.env["WEBID"];
const clientPort = Number(process.env["CLIENT_PORT"] ?? "8443");
const callbackPort = Number(process.env["CALLBACK_PORT"] ?? "3001");

if (email === undefined || password === undefined || webId === undefined) {
  throw new Error("CSS_EMAIL, CSS_PASSWORD and WEBID are required (run css-setup.mjs first).");
}

const clientId = `http://localhost:${String(clientPort)}/client-id.jsonld`;
const redirectUri = `http://localhost:${String(callbackPort)}/auth/callback`;

const clientDocument = {
  "@context": ["https://www.w3.org/ns/solid/oidc-context.jsonld"],
  client_id: clientId,
  redirect_uris: [redirectUri],
  client_name: "Seba Validation",
  scope: "openid offline_access webid",
  grant_types: ["refresh_token", "authorization_code"],
};

const clientServer = createServer((request, response) => {
  if (request.url === "/client-id.jsonld") {
    response.writeHead(200, { "content-type": "application/ld+json", "cache-control": "no-store" });
    response.end(JSON.stringify(clientDocument));
    return;
  }
  response.writeHead(404, { "content-type": "text/plain" });
  response.end("not found");
});

await new Promise((resolve, reject) => {
  clientServer.once("error", reject);
  clientServer.listen(clientPort, "127.0.0.1", resolve);
});
log("client document", `http://localhost:${String(clientPort)}/client-id.jsonld`);

/* ------------------------------------------------------------------ tiny cookie jar */

const cookies = new Map();

function storeCookies(response) {
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(";");
    const index = pair.indexOf("=");
    if (index > 0) {
      cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }
}

function cookieHeader() {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function request(url, init = {}) {
  const headers = new Headers(init.headers ?? {});
  headers.set("accept", headers.get("accept") ?? "application/json");
  if (cookies.size > 0) {
    headers.set("cookie", cookieHeader());
  }
  const response = await fetch(url, { ...init, headers, redirect: "manual" });
  storeCookies(response);
  return response;
}

async function postJson(url, body) {
  const response = await request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const text = await response.text();
  log(`POST ${url}`, `${String(response.status)} ${text.slice(0, 200)}`);
  if (!response.ok) {
    throw new Error(`POST ${url} failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return text === "" ? {} : JSON.parse(text);
}

function continueAt(result, fallback) {
  return typeof result.location === "string" ? new URL(result.location, cssBase).href : fallback;
}

function log(label, detail) {
  console.log(`[css-flow] ${label}: ${detail}`);
}

/* ------------------------------------------------------------------ browser substitute */

let controls = null;

async function authenticatedControls() {
  const response = await request(`${cssBase}/.account/`);
  const body = await response.json();
  if (body.controls?.account?.pod === undefined) {
    throw new Error(`Account API is not authenticated: ${JSON.stringify(body).slice(0, 400)}`);
  }
  controls = body.controls;
  return controls;
}

/**
 * Drive the OIDC interaction until the provider redirects back to SEBA's callback.
 *
 * @param {string} authorizationUrl
 * @returns {Promise<string>} the callback URL, ready to be fetched
 */
async function completeAuthorization(authorizationUrl) {
  let current = authorizationUrl;
  let init = {};
  for (let hop = 0; hop < 15; hop += 1) {
    log(`hop ${String(hop)}`, current);
    const response = await request(current, init);
    const contentType = response.headers.get("content-type") ?? "";
    log(`  status ${String(response.status)}`, contentType);

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (location === null) {
        throw new Error(`Redirect without Location from ${current}`);
      }
      current = new URL(location, current).href;
      init = {};
      if (current.startsWith(redirectUri)) {
        return current;
      }
      continue;
    }

    const text = await response.text();
    if (contentType.includes("json")) {
      const body = JSON.parse(text);
      log("  json", JSON.stringify(body).slice(0, 300));
      if (body.controls?.oidc !== undefined) {
        // Every interaction response carries the URLs for the remaining steps.
        controls = body.controls;
      }
      if (body.prompt === "account") {
        const result = await postJson(`${cssBase}/.account/login/password/`, { email, password });
        current = continueAt(result, `${cssBase}/.account/oidc/prompt/`);
        if (current.startsWith(redirectUri)) {
          return current;
        }
        init = {};
        continue;
      }
      if (body.prompt === "login") {
        const api = controls ?? (await authenticatedControls());
        const result = await postJson(api.oidc.webId, { webId });
        current = continueAt(result, `${cssBase}/.account/oidc/prompt/`);
        init = {};
        continue;
      }
      if (body.prompt === "consent") {
        const api = controls ?? (await authenticatedControls());
        const result = await postJson(api.oidc.consent, { remember: true });
        current = continueAt(result, `${cssBase}/.account/oidc/prompt/`);
        if (current.startsWith(redirectUri)) {
          return current;
        }
        init = {};
        continue;
      }
      if (body.controls?.oidc?.prompt !== undefined) {
        // CSS redirects an unauthenticated authorization request to the account API index;
        // the interaction cookie makes the OIDC controls available there.
        current = body.controls.oidc.prompt;
        init = {};
        continue;
      }
      if (typeof body.location === "string") {
        current = new URL(body.location, cssBase).href;
        init = {};
        if (current.startsWith(redirectUri)) {
          return current;
        }
        continue;
      }
      throw new Error(`Unexpected CSS OIDC response: ${JSON.stringify(body).slice(0, 500)}`);
    }

    throw new Error(
      `CSS returned a non-JSON page at ${current} (HTTP ${String(response.status)}). ` +
        `Login may require a browser. Body: ${text.slice(0, 300)}`,
    );
  }
  throw new Error("CSS OIDC interaction did not finish within 15 hops.");
}

/* ------------------------------------------------------------------ SEBA flow */

// Capture the ID token claims CSS actually issues. Access and refresh tokens are never
// printed; only the non-secret claim set needed to explain validation failures.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const response = await originalFetch(input, init);
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/token") && response.ok) {
    try {
      const body = await response.clone().json();
      if (typeof body.id_token === "string") {
        const payload = JSON.parse(Buffer.from(body.id_token.split(".")[1], "base64url").toString("utf8"));
        log(
          "id_token claims",
          JSON.stringify({ iss: payload.iss, aud: payload.aud, azp: payload.azp, webid: payload.webid, sub: payload.sub, cnf: payload.cnf }),
        );
      }
    } catch (error) {
      log("id_token decode failed", String(error));
    }
  }
  return response;
};

const seba = new Seba({
  clientId,
  redirectUri,
  openAuthorizationUrl: async (url) => {
    const callback = await completeAuthorization(url);
    log("callback", callback.replace(/code=[^&]+/, "code=<redacted>"));
    const response = await fetch(callback);
    log("callback response", String(response.status));
  },
  debug: true,
});

const started = Date.now();
try {
  const session = await seba.login({ issuer, webId });
  log("login", `ok in ${String(Date.now() - started)} ms as ${session.webId}`);

  const profile = await seba.fetch(webId, { headers: { accept: "text/turtle" } });
  const profileBody = await profile.text();
  log("fetch profile", `HTTP ${String(profile.status)} (${String(profileBody.length)} bytes)`);

  const restored = await seba.restoreSession();
  log("restoreSession", restored === null ? "null" : `ok as ${restored.webId}`);

  const afterRestore = await seba.fetch(webId, { headers: { accept: "text/turtle" } });
  log("fetch after restore", `HTTP ${String(afterRestore.status)}`);

  await seba.logout();
  log("logout", "ok");

  const afterLogout = await seba.restoreSession();
  log("restore after logout", afterLogout === null ? "null (expected)" : "UNEXPECTED SESSION");
} catch (error) {
  log("FAILED", error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  if (error instanceof Error && error.cause instanceof Error) {
    log("cause", `${error.cause.name}: ${error.cause.message}`);
  }
  process.exitCode = 1;
} finally {
  await new Promise((resolve) => {
    clientServer.close(resolve);
  });
}

// Keep the module graph honest: pathToFileURL is only here to make ESM metadata obvious.
void pathToFileURL;
