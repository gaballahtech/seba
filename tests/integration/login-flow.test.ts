/**
 * End-to-end flows against a real loopback OpenID Provider.
 *
 * The provider verifies DPoP proofs, PKCE, `jti` uniqueness and access-token hashes, so a
 * failure here means the client's wire behaviour is wrong, not just its unit-level logic.
 */

import { createServer } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Seba, SebaAuthError } from "../../src/index.js";
import { FakeProvider } from "./fake-provider.js";

let provider: FakeProvider;
let redirectUri: string;

beforeAll(async () => {
  const port = await freePort();
  redirectUri = `http://127.0.0.1:${String(port)}/auth/callback`;
  provider = await FakeProvider.start({ redirectUri });
});

afterAll(async () => {
  await provider.close();
});

function freePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Could not determine a free port."));
        return;
      }
      const { port } = address;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

interface Harness {
  readonly seba: Seba;
  readonly openedUrls: string[];
}

function createHarness(): Harness {
  const openedUrls: string[] = [];
  const seba = new Seba({
    clientId: provider.address.clientId,
    redirectUri,
    openAuthorizationUrl: async (url) => {
      openedUrls.push(url);
      const authorization = await fetch(url, { redirect: "manual" });
      expect(authorization.status).toBe(302);
      const location = authorization.headers.get("location");
      expect(location).not.toBeNull();
      const callback = await fetch(location as string, { redirect: "manual" });
      expect(callback.status).toBe(200);
    },
  });
  return { seba, openedUrls };
}

describe("login flow", () => {
  it("logs in, calls a protected resource, restores, and revokes on logout", async () => {
    const { seba, openedUrls } = createHarness();
    const session = await seba.login({ webId: provider.address.webId });

    expect(session).toEqual({
      webId: provider.address.webId,
      isLoggedIn: true,
      provider: provider.address.issuer,
    });
    expect(Object.keys(session).sort()).toEqual(["isLoggedIn", "provider", "webId"]);
    expect(openedUrls).toHaveLength(1);

    const authorizationUrl = new URL(openedUrls[0] as string);
    expect(authorizationUrl.searchParams.get("response_type")).toBe("code");
    expect(authorizationUrl.searchParams.get("client_id")).toBe(provider.address.clientId);
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizationUrl.searchParams.get("state")).not.toBeNull();
    expect(authorizationUrl.searchParams.get("nonce")).not.toBeNull();
    expect(provider.authorizationRequests).toHaveLength(1);

    const response = await seba.fetch(`${provider.address.issuer}/resource`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; method: string };
    expect(body).toEqual({ ok: true, method: "GET", path: "/resource" });

    const restored = await seba.restoreSession();
    expect(restored).toEqual(session);
    expect(provider.refreshRequests).toBe(1);

    const afterRefresh = await seba.fetch(`${provider.address.issuer}/resource`, { method: "HEAD" });
    expect(afterRefresh.status).toBe(200);

    expect(provider.jtiReuseDetected).toBe(false);

    await seba.logout();
    expect(provider.revokedTokens).toHaveLength(1);
    expect(provider.revokedTokens[0]).toMatch(/^rt-/);

    expect(await seba.restoreSession()).toBeNull();
    await expect(seba.fetch(`${provider.address.issuer}/resource`)).rejects.toBeInstanceOf(SebaAuthError);
  });

  it("does not follow redirects to another origin and keeps the proof per request", async () => {
    const { seba } = createHarness();
    await seba.login({ issuer: provider.address.issuer });

    const before = provider.resourceRequests;
    const response = await seba.fetch(`${provider.address.issuer}/redirect-away`);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.invalid/elsewhere");
    expect(provider.resourceRequests).toBe(before + 1);
    expect(provider.jtiReuseDetected).toBe(false);
  });

  it("rejects an authorization error from the provider", async () => {
    const { seba } = createHarness();
    provider.forceAuthorizeError = "access_denied";
    try {
      await expect(seba.login({ issuer: provider.address.issuer })).rejects.toThrow(/access_denied/);
    } finally {
      provider.forceAuthorizeError = null;
    }
    expect(await seba.restoreSession()).toBeNull();
  });

  it("never resends a streamed body after a 401", async () => {
    const { seba } = createHarness();
    await seba.login({ webId: provider.address.webId });

    const before = provider.flakyBodyReads;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("streamed"));
        controller.close();
      },
    });
    const init = { method: "POST", body, duplex: "half" } as unknown as RequestInit;
    const response = await seba.fetch(`${provider.address.issuer}/flaky-resource`, init);
    expect(response.status).toBe(401);
    expect(provider.flakyBodyReads).toBe(before + 1);
  });

  it("replays a buffered request once after refreshing the access token", async () => {
    const { seba } = createHarness();
    await seba.login({ webId: provider.address.webId });
    const refreshes = provider.refreshRequests;
    const reads = provider.flakyBodyReads;

    const response = await seba.fetch(`${provider.address.issuer}/flaky-resource`, {
      method: "POST",
      body: "buffered",
    });
    expect(response.status).toBe(401);
    expect(provider.flakyBodyReads).toBe(reads + 2);
    expect(provider.refreshRequests).toBe(refreshes + 1);
  });
});
