import { afterEach, describe, expect, it, vi } from "vitest";
import { SebaClient } from "../../src/core/client.js";
import type { PendingAuthorization, Platform, SessionStorageAdapter } from "../../src/types.js";

const CLIENT_ID = "https://app.example/id.jsonld";
const REDIRECT_URI = "https://app.example/callback";
const ISSUER = "https://issuer.example";

function pending(overrides: Partial<PendingAuthorization> = {}): PendingAuthorization {
  return {
    state: "state-123",
    codeVerifier: "verifier-abcdefghijklmnopqrstuvwxyz0123456789",
    nonce: "nonce-123",
    issuer: ISSUER,
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    createdAt: Date.now(),
    ...overrides,
  };
}

function memorySession(): SessionStorageAdapter {
  let value = null as unknown;
  return {
    async save(session) {
      value = session;
    },
    async load() {
      return (value as never) ?? null;
    },
    async clear() {
      value = null;
    },
  };
}

function platformWith(opts: {
  callbackUrl: string;
  pendingValue: PendingAuthorization | null;
  fetchImpl?: typeof fetch;
}): { platform: Platform; pendingRef: { current: PendingAuthorization | null }; cleared: number[] } {
  const pendingRef = { current: opts.pendingValue };
  const cleared: number[] = [];
  const platform: Platform = {
    kind: "browser",
    defaultStorage: "memory",
    fetch: opts.fetchImpl ?? (async () => new Response("not mocked", { status: 500 })),
    currentUrl: () => new URL(opts.callbackUrl),
    pendingAuth: {
      async save(p) {
        pendingRef.current = p;
      },
      async load() {
        return pendingRef.current;
      },
      async clear() {
        cleared.push(Date.now());
        pendingRef.current = null;
      },
    },
    createStorage: () => memorySession(),
    beginInteractiveLogin: async () => {
      throw new Error("beginInteractiveLogin should not be called");
    },
  };
  return { platform, pendingRef, cleared };
}

const callback = `https://app.example/callback?code=abc&state=state-123&iss=${encodeURIComponent(ISSUER)}`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pending authorization cleanup (Task 3)", () => {
  it("clears pending on validation failure (state/iss handled by parse path throws)", async () => {
    const { platform, pendingRef } = platformWith({
      callbackUrl: `https://app.example/callback?code=abc&state=WRONG&iss=${encodeURIComponent(ISSUER)}`,
      pendingValue: pending(),
    });
    const client = new SebaClient({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI, storage: "memory" }, platform);
    await expect(client.login()).rejects.toThrow();
    expect(await platform.pendingAuth.load()).toBeNull();
    expect(pendingRef.current).toBeNull();
  });

  it("clears pending when discovery/exchange fails (network)", async () => {
    const { platform } = platformWith({
      callbackUrl: callback,
      pendingValue: pending(),
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });
    const client = new SebaClient({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI, storage: "memory" }, platform);
    await expect(client.login()).rejects.toThrow();
    expect(await platform.pendingAuth.load()).toBeNull();
  });

  it("clears pending when token exchange returns OAuth error", async () => {
    let call = 0;
    const fetchImpl: typeof fetch = async (input) => {
      call += 1;
      const url = String(input);
      if (url.includes("/.well-known/openid-configuration")) {
        return new Response(
          JSON.stringify({
            issuer: ISSUER,
            authorization_endpoint: `${ISSUER}/auth`,
            token_endpoint: `${ISSUER}/token`,
            jwks_uri: `${ISSUER}/jwks`,
            token_endpoint_auth_methods_supported: ["none"],
            id_token_signing_alg_values_supported: ["ES256"],
            scopes_supported: ["openid", "webid", "offline_access"],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/token")) {
        return new Response(JSON.stringify({ error: "invalid_grant", error_description: "bad code" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("unexpected", { status: 404 });
    };
    const { platform } = platformWith({
      callbackUrl: callback,
      pendingValue: pending(),
      fetchImpl,
    });
    const client = new SebaClient({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI, storage: "memory" }, platform);
    await expect(client.login()).rejects.toThrow(/invalid_grant/i);
    expect(await platform.pendingAuth.load()).toBeNull();
    expect(call).toBeGreaterThan(0);
  });

  it("preserves retry semantics: a new login can create a new pending (old never reused)", async () => {
    const { platform, pendingRef } = platformWith({
      callbackUrl: callback,
      pendingValue: pending({ state: "old-state" }),
      fetchImpl: async () => {
        throw new TypeError("network");
      },
    });
    // callback has state-123 but pending has old-state -> parse/validation fails, pending cleared
    const client = new SebaClient({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI, storage: "memory" }, platform);
    await expect(client.login()).rejects.toThrow();
    expect(pendingRef.current).toBeNull();
    // Simulate a new login creating a new pending
    const fresh = pending({ state: "fresh-state" });
    await platform.pendingAuth.save(fresh);
    expect((await platform.pendingAuth.load())?.state).toBe("fresh-state");
  });
});
