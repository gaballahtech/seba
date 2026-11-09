import { describe, expect, it } from "vitest";
import { SessionEmitter, createSessionEmitter } from "../../src/core/events.js";
import { SebaClient } from "../../src/core/client.js";
import { SebaConfigError } from "../../src/core/errors.js";
import { createDPoPKey } from "../../src/core/dpop.js";
import { memoryPendingAuthStore, memorySessionStorage } from "../../src/core/storage.js";
import type { PersistedSession, Platform } from "../../src/types.js";

const CLIENT_ID = "https://app.example/id.jsonld";
const REDIRECT_URI = "https://app.example/callback";
const ISSUER = "https://issuer.example";
const WEBID = "https://alice.example/profile/card#me";
const ORIGIN = "https://resource.example";

async function seededClient(fetchImpl: typeof fetch): Promise<SebaClient> {
  const { persisted } = await createDPoPKey();
  const record: PersistedSession = {
    version: 1,
    webId: WEBID,
    provider: ISSUER,
    clientId: CLIENT_ID,
    accessToken: "at-1",
    accessTokenExpiresAt: Date.now() + 60_000,
    key: persisted,
    createdAt: Date.now(),
  };
  const storage = memorySessionStorage(record);
  const platform: Platform = {
    kind: "browser",
    defaultStorage: "memory",
    fetch: fetchImpl,
    currentUrl: () => null,
    pendingAuth: { async save() {}, async load() { return null; }, async clear() {} },
    createStorage: () => storage,
    beginInteractiveLogin: async () => { throw new Error("no"); },
  };
  const client = new SebaClient({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI, storage: "memory" }, platform);
  await client.restoreSession();
  return client;
}

describe("SessionEmitter (covers src/core/events.ts)", () => {
  it("on/off/size/emit and swallows listener errors", () => {
    // covers src/core/events.ts:18-52 (on, off, emit, size, createSessionEmitter)
    const emitter = createSessionEmitter();
    expect(emitter).toBeInstanceOf(SessionEmitter);
    expect(emitter.size).toBe(0);
    const seen: string[] = [];
    const l1 = () => { seen.push("a"); };
    const l2 = () => { throw new Error("boom"); };
    const l3 = () => { seen.push("b"); };
    const unsub = emitter.on(l1);
    emitter.on(l2);
    emitter.on(l3);
    expect(emitter.size).toBe(3);
    emitter.emit({ reason: "login", session: null });
    expect(seen).toEqual(["a", "b"]);
    unsub();
    emitter.off(l3);
    expect(emitter.size).toBe(1);
  });
});

describe("SebaClient helper branches (covers src/core/client.ts helpers)", () => {
  it("Request input with body is non-replayable so redirect is returned", async () => {
    // covers src/core/client.ts:599-604 branch (isReplayable: Request with non-null body)
    let calls = 0;
    const client = await seededClient(async () => { calls += 1; return new Response(null, { status: 302, headers: { location: "/m" } }); });
    const req = new Request(`${ORIGIN}/r`, { method: "POST", body: "x" });
    const res = await client.fetch(req);
    expect(res.status).toBe(302);
    expect(calls).toBe(1);
  });

  it("301 redirect on POST downgrades to GET when replayable", async () => {
    // covers src/core/client.ts:608-623 branch (downgradeToGet 301/302+POST)
    const methods: string[] = [];
    const client = await seededClient(async (_input, init) => {
      methods.push(String(init?.method ?? "GET"));
      if (methods.length === 1) return new Response(null, { status: 301, headers: { location: "/g" } });
      return new Response("ok", { status: 200 });
    });
    const res = await client.fetch(`${ORIGIN}/p`, { method: "POST", body: "x" });
    expect(res.status).toBe(200);
    expect(methods).toEqual(["POST", "GET"]);
  });

  it("redirect with invalid Location returns the redirect response (safeResolve catch)", async () => {
    // covers src/core/client.ts:623-630 branch (safeResolve catch -> null next)
    const client = await seededClient(async () => new Response(null, { status: 302, headers: { location: "http://[" } }));
    const res = await client.fetch(`${ORIGIN}/x`);
    expect(res.status).toBe(302);
  });

  it("307 redirect preserves method for replayable body", async () => {
    // covers src/core/client.ts downgradeToGet false path (307 keeps method)
    const methods: string[] = [];
    const client = await seededClient(async (_input, init) => {
      methods.push(String(init?.method ?? "GET"));
      if (methods.length === 1) return new Response(null, { status: 307, headers: { location: "/t" } });
      return new Response("ok", { status: 200 });
    });
    const res = await client.fetch(`${ORIGIN}/t0`, { method: "POST", body: "x" });
    expect(res.status).toBe(200);
    expect(methods).toEqual(["POST", "POST"]);
  });
});

describe("Core config/storage small branches (covers src/core/client.ts, src/core/storage.ts)", () => {
  it("resolveConfig throws when tolerance enabled without acknowledgement", () => {
    // covers src/core/client.ts:558 branch (ack required throw)
    expect(
      () =>
        new SebaClient(
          { clientId: CLIENT_ID, redirectUri: REDIRECT_URI, allowNonCompliantCnf: true },
          {
            kind: "browser",
            defaultStorage: "memory",
            fetch: async () => new Response("", { status: 500 }),
            currentUrl: () => null,
            pendingAuth: memoryPendingAuthStore(),
            createStorage: () => memorySessionStorage(),
            beginInteractiveLogin: async () => { throw new Error("no"); },
          },
        ),
    ).toThrow(SebaConfigError);
  });

  it("memoryPendingAuthStore peek() returns current pending value", async () => {
    // covers src/core/storage.ts:53 (peek)
    const store = memoryPendingAuthStore();
    expect(store.peek()).toBeNull();
    await store.save({ state: "s", nonce: "n", codeVerifier: "v".repeat(43), issuer: ISSUER, clientId: CLIENT_ID, redirectUri: REDIRECT_URI, createdAt: 1 });
    expect(store.peek()?.state).toBe("s");
    await store.clear();
    expect(store.peek()).toBeNull();
  });

  it("debug config exercises #debug log path during startLogin", async () => {
    // covers src/core/client.ts:495 branch (#debug console.debug when debug enabled)
    const discovery = {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      jwks_uri: `${ISSUER}/jwks`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      id_token_signing_alg_values_supported: ["ES256", "RS256"],
      subject_types_supported: ["public"],
      scopes_supported: ["openid", "webid", "offline_access"],
      dpop_signing_alg_values_supported: ["ES256"],
    };
    const clientDoc = {
      "@context": ["https://www.w3.org/ns/solid/oidc-context.jsonld"],
      client_id: CLIENT_ID,
      client_name: "Test",
      redirect_uris: [REDIRECT_URI],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "openid webid offline_access",
      token_endpoint_auth_method: "none",
    };
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/.well-known/openid-configuration")) {
        return new Response(JSON.stringify(discovery), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url === CLIENT_ID) {
        return new Response(JSON.stringify(clientDoc), { status: 200, headers: { "content-type": "application/ld+json" } });
      }
      return new Response("not found", { status: 404 });
    };
    const storage = memorySessionStorage();
    const platform: Platform = {
      kind: "browser",
      defaultStorage: "memory",
      fetch: fetchImpl,
      currentUrl: () => null,
      pendingAuth: memoryPendingAuthStore(),
      createStorage: () => storage,
      beginInteractiveLogin: async () => { throw new Error("stop-after-debug"); },
    };
    const client = new SebaClient(
      { clientId: CLIENT_ID, redirectUri: REDIRECT_URI, debug: true },
      platform,
    );
    await expect(client.login({ issuer: ISSUER })).rejects.toThrow(/stop-after-debug/);
  });
});
