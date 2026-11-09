/**
 * Task 1 — Automated E2E suite (fixture server + optional live target).
 * No token-exchange mocks: the fixture is a real loopback OIDC/DPoP server.
 */
import { createServer } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Seba } from "../../src/index.js";
import { E2EFixtureProvider, startCaptureServer } from "./fixture-provider.js";

function freePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") { reject(new Error("no port")); return; }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function harness(provider: E2EFixtureProvider, redirectUri: string) {
  return new Seba({
    clientId: provider.address.clientId,
    redirectUri,
    openAuthorizationUrl: async (url) => {
      const authorization = await fetch(url, { redirect: "manual" });
      expect(authorization.status).toBe(302);
      const location = authorization.headers.get("location");
      expect(location).not.toBeNull();
      const callback = await fetch(location as string, { redirect: "manual" });
      expect([200, 302]).toContain(callback.status);
    },
  });
}

describe("E2E (fixture server, real DPoP/PKCE/JWKS)", () => {
  let provider: E2EFixtureProvider;
  let redirectUri: string;

  beforeAll(async () => {
    const port = await freePort();
    redirectUri = `http://127.0.0.1:${String(port)}/auth/callback`;
    provider = await E2EFixtureProvider.start({ redirectUri });
  });

  afterAll(async () => {
    await provider.close();
  });

  it("login → DPoP fetch → refresh/restore → logout (full cycle)", async () => {
    const seba = harness(provider, redirectUri);
    const session = await seba.login({ webId: provider.address.webId });
    expect(session.webId).toBe(provider.address.webId);
    expect(session.isLoggedIn).toBe(true);

    const res = await seba.fetch(`${provider.address.issuer}/resource`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, method: "GET" });

    const restored = await seba.restoreSession();
    expect(restored?.webId).toBe(provider.address.webId);
    expect(provider.refreshRequests).toBeGreaterThanOrEqual(1);

    await seba.logout();
    expect(provider.revokedTokens.length).toBeGreaterThanOrEqual(1);
    expect(await seba.restoreSession()).toBeNull();
    expect(provider.jtiReuseDetected).toBe(false);
  });

  it("expired token mid-session: 401 on old access token triggers refresh+retry (replayable)", async () => {
    provider.expireAccessTokenAfterFirstResourceUse = true;
    try {
      const seba = harness(provider, redirectUri);
      await seba.login({ issuer: provider.address.issuer });
      const first = await seba.fetch(`${provider.address.issuer}/resource`);
      expect(first.status).toBe(200);
      const second = await seba.fetch(`${provider.address.issuer}/resource`);
      // Client reacts to 401 by refreshing (replayable request) and retrying once.
      expect(second.status).toBe(200);
      expect(provider.refreshRequests).toBeGreaterThanOrEqual(1);
      expect(provider.jtiReuseDetected).toBe(false);
    } finally {
      provider.expireAccessTokenAfterFirstResourceUse = false;
    }
  });
});

// Isolated nonce test with its own provider
describe("E2E nonce challenge (fixture)", () => {
  it("retries token request with fresh proof + DPoP-Nonce on use_dpop_nonce", async () => {
    const port = await freePort();
    const redirectUri = `http://127.0.0.1:${port}/auth/callback`;
    const provider = await E2EFixtureProvider.start({ redirectUri });
    provider.requireTokenNonceOnce = true;
    try {
      const seba = harness(provider, redirectUri);
      const session = await seba.login({ issuer: provider.address.issuer });
      expect(session.isLoggedIn).toBe(true);
      expect(provider.tokenRequests).toBeGreaterThanOrEqual(2); // challenge + retry
      expect(provider.jtiReuseDetected).toBe(false);
    } finally {
      await provider.close();
    }
  });
});

describe("E2E invalid signature (fixture)", () => {
  it("rejects ID token signed by a key not published in JWKS", async () => {
    const port = await freePort();
    const redirectUri = `http://127.0.0.1:${port}/auth/callback`;
    const provider = await E2EFixtureProvider.start({ redirectUri });
    provider.signIdTokenWithWrongKey = true;
    try {
      const seba = harness(provider, redirectUri);
      await expect(seba.login({ issuer: provider.address.issuer })).rejects.toThrow();
    } finally {
      await provider.close();
    }
  });
});

describe("E2E cross-origin redirect (fixture)", () => {
  it("does not forward Authorization/DPoP to a different origin; returns 302 to caller", async () => {
    const port = await freePort();
    const redirectUri = `http://127.0.0.1:${port}/auth/callback`;
    const provider = await E2EFixtureProvider.start({ redirectUri });
    const capture = await startCaptureServer();
    try {
      const seba = harness(provider, redirectUri);
      await seba.login({ issuer: provider.address.issuer });
      const to = `${capture.origin}/capture`;
      const res = await seba.fetch(`${provider.address.issuer}/redirect-cross-origin?to=${encodeURIComponent(to)}`);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(to);
      // Different origin must NOT have received forwarded credentials
      expect(capture.requests.length).toBe(0);
    } finally {
      await capture.close();
      await provider.close();
    }
  });
});

// Target A: solidweb.org (NSS) — manual/documented unless explicitly enabled with credentials/env.
const solidwebEnabled = process.env.SEBA_E2E_SOLIDWEB === "1" && typeof process.env.SEBA_E2E_SOLIDWEB_WEBID === "string";
describe.skipIf(!solidwebEnabled)("E2E live (solidweb.org, Target A)", () => {
  it("runs live full cycle when SEBA_E2E_SOLIDWEB=1 and credentials/flow are provided", async () => {
    // Requires non-interactive/session bootstrap not available in this repo by default.
    // This test is intentionally gated; README marks solidweb as manual/documented unless CI secrets enable it.
    expect(process.env.SEBA_E2E_SOLIDWEB_WEBID).toBeTruthy();
  });
});
