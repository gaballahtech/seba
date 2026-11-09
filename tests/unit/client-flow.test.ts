import { describe, expect, it } from "vitest";import { decodeJwt } from "jose";
import { SebaClient } from "../../src/core/client.js";
import { SebaSessionExpiredError } from "../../src/core/errors.js";
import { createDPoPKey } from "../../src/core/dpop.js";
import { memorySessionStorage } from "../../src/core/storage.js";
import type { PersistedSession, Platform, SessionStorageAdapter } from "../../src/types.js";

const CLIENT_ID = "https://app.example/id.jsonld";
const REDIRECT_URI = "https://app.example/callback";
const ISSUER = "https://issuer.example";
const WEBID = "https://alice.example/profile/card#me";
const ORIGIN = "https://resource.example";

async function seededNoRefreshClient(fetchImpl: typeof fetch): Promise<SebaClient> {
  const { persisted } = await createDPoPKey();
  const record: PersistedSession = {
    version: 1,
    webId: WEBID,
    provider: ISSUER,
    clientId: CLIENT_ID,
    accessToken: "at-1",
    accessTokenExpiresAt: Date.now() + 60_000,
    subject: WEBID,
    key: persisted,
    createdAt: Date.now(),
  };
  const storage = memorySessionStorage(record);
  const platform: Platform = {
    kind: "browser",
    defaultStorage: "memory",
    fetch: fetchImpl,
    currentUrl: () => null,
    pendingAuth: { async save(){}, async load(){ return null; }, async clear(){} },
    createStorage: () => storage,
    beginInteractiveLogin: async () => { throw new Error("no"); },
  };
  const client = new SebaClient({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI, storage: "memory" }, platform);
  const restored = await client.restoreSession();
  expect(restored?.webId).toBe(WEBID);
  return client;
}



import { SignJWT, calculateJwkThumbprint, exportJWK, generateKeyPair } from "jose";

async function seededRefreshClient(opts: {
  refreshBehavior: "success" | "invalid_grant";
  resourceFetch: typeof fetch;
}): Promise<{ client: SebaClient; refreshCalls: number[] }> {
  const { persisted } = await createDPoPKey();
  const publicJwk = (persisted as any).publicJwk ?? (persisted as any).jwk;
  const jkt = await calculateJwkThumbprint({ kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y } as JsonWebKey);
  const issuerKey = await generateKeyPair("ES256", { extractable: true });
  const issuerJwk = await exportJWK(issuerKey.publicKey);
  (issuerJwk as any).kid = "k1"; (issuerJwk as any).alg = "ES256"; (issuerJwk as any).use = "sig";
  const record: PersistedSession = {
    version: 1, webId: WEBID, provider: ISSUER, clientId: CLIENT_ID,
    refreshToken: "rt-1", key: persisted, createdAt: Date.now(),
  };
  const storage = memorySessionStorage(record);
  const refreshCalls: number[] = [];
  async function mintIdToken(): Promise<string> {
    return await new SignJWT({ sub: WEBID, webid: WEBID, nonce: "n", cnf: { jkt }, azp: CLIENT_ID })
      .setProtectedHeader({ alg: "ES256", kid: "k1", typ: "JWT" })
      .setIssuer(ISSUER).setAudience([CLIENT_ID, "solid"]).setIssuedAt().setExpirationTime("2m")
      .sign(issuerKey.privateKey);
  }
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/.well-known/openid-configuration")) {
      return new Response(JSON.stringify({
        issuer: ISSUER, authorization_endpoint: ISSUER+"/a", token_endpoint: ISSUER+"/token",
        jwks_uri: ISSUER+"/jwks", id_token_signing_alg_values_supported: ["ES256"],
        token_endpoint_auth_methods_supported: ["none"],
        scopes_supported: ["openid","webid","offline_access"], dpop_signing_alg_values_supported: ["ES256"],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/jwks")) return new Response(JSON.stringify({ keys: [issuerJwk] }), { status: 200, headers: { "content-type": "application/json" } });
    if (url.endsWith("/token")) {
      refreshCalls.push(Date.now());
      if (opts.refreshBehavior === "invalid_grant") return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ access_token: "at-2", id_token: await mintIdToken(), token_type: "DPoP", expires_in: 300, refresh_token: "rt-2" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return opts.resourceFetch(input, init);
  };
  const platform: Platform = {
    kind: "browser", defaultStorage: "memory", fetch: fetchImpl, currentUrl: () => null,
    pendingAuth: { async save(){}, async load(){ return null; }, async clear(){} },
    createStorage: () => storage, beginInteractiveLogin: async () => { throw new Error("no"); },
  };
  const client = new SebaClient({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI, storage: "memory" }, platform);
  await client.restoreSession();
  return { client, refreshCalls };
}

describe("SebaClient.fetch flow control (T5b)", () => {
  it("a. follows same-origin redirect (bounded) with a new DPoP proof per hop", async () => {
    // covers src/core/client.ts redirect follow + proof-per-attempt branches
    const proofs: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const dpop = new Headers(init?.headers).get("DPoP");
      if (dpop) proofs.push(dpop);
      if (url === `${ORIGIN}/a`) return new Response(null, { status: 302, headers: { location: "/b" } });
      return new Response("ok", { status: 200 });
    };
    const client = await seededNoRefreshClient(fetchImpl);
    const res = await client.fetch(`${ORIGIN}/a`);
    expect(res.status).toBe(200);
    expect(proofs.length).toBe(2);
    expect(proofs[0]).not.toBe(proofs[1]);
    expect(decodeJwt(proofs[1]!).htu).toBe(`${ORIGIN}/b`);
  });

  it("b. returns cross-origin redirect unchanged at the client level (no credential forward)", async () => {
    // covers src/core/client.ts cross-origin redirect return branch
    const seen: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      seen.push(String(input));
      return new Response(null, { status: 302, headers: { location: "https://evil.example/steal" } });
    };
    const client = await seededNoRefreshClient(fetchImpl);
    const res = await client.fetch(`${ORIGIN}/r`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://evil.example/steal");
    expect(seen).toEqual([`${ORIGIN}/r`]);
  });

  it("c. handles use_dpop_nonce challenge → fresh proof with nonce → retry succeeds", async () => {
    // covers src/core/client.ts nonce retry branch
    let calls = 0;
    const nonces: Array<string | undefined> = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      calls += 1;
      const dpop = new Headers(init?.headers).get("DPoP")!;
      const payload = JSON.parse(Buffer.from(dpop.split(".")[1]!, "base64url").toString("utf8")) as { nonce?: string };
      nonces.push(payload.nonce);
      if (calls === 1) return new Response("challenge", { status: 401, headers: { "dpop-nonce": "n-1" } });
      return new Response("ok", { status: 200 });
    };
    const client = await seededNoRefreshClient(fetchImpl);
    const res = await client.fetch(`${ORIGIN}/data`);
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
    expect(nonces[0]).toBeUndefined();
    expect(nonces[1]).toBe("n-1");
  });

  it("f. no-refresh-token session + 401 forces SebaSessionExpiredError", async () => {
    // covers src/core/client.ts 401 token-retry branch delegating to session refresh-if-needed
    const fetchImpl: typeof fetch = async () => new Response("unauth", { status: 401 });
    const client = await seededNoRefreshClient(fetchImpl);
    await expect(client.fetch(`${ORIGIN}/data`)).rejects.toBeInstanceOf(SebaSessionExpiredError);
  });

  it("g. streamed (non-replayable) body: redirect is returned, body never re-sent", async () => {
    // covers src/core/client.ts non-replayable redirect return branch
    let reads = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        reads += 1;
        if (reads > 1) throw new Error("body re-read");
        controller.enqueue(new TextEncoder().encode("hi"));
        controller.close();
      },
    });
    const fetchImpl: typeof fetch = async () => new Response(null, { status: 307, headers: { location: "/moved" } });
    const client = await seededNoRefreshClient(fetchImpl);
    const res = await client.fetch(`${ORIGIN}/upload`, { method: "POST", body: stream, duplex: "half" } as RequestInit & { duplex: "half" });
    expect(res.status).toBe(307);
    expect(reads).toBeLessThanOrEqual(1);
  });

  it("h. max redirects exceeded returns the last redirect response", async () => {
    // covers src/core/client.ts MAX_REDIRECTS / bounded follow branch
    let i = 0;
    const fetchImpl: typeof fetch = async (input) => {
      i += 1;
      const n = Number(new URL(String(input)).pathname.replace("/", "") || "0");
      return new Response(null, { status: 302, headers: { location: `/${n + 1}` } });
    };
    const client = await seededNoRefreshClient(fetchImpl);
    const res = await client.fetch(`${ORIGIN}/0`);
    expect(res.status).toBe(302);
    expect(i).toBeLessThanOrEqual(7); // bounded (MAX_REDIRECTS=5 + initial)
  });

  it("d. 401 → refresh succeeds → retry → 200", async () => {
    // covers src/core/client.ts: 401 token retry + refreshIfNeeded(force) branch
    let resourceCalls = 0;
    const { client, refreshCalls } = await seededRefreshClient({
      refreshBehavior: "success",
      resourceFetch: async (_input, init) => {
        resourceCalls += 1;
        const auth = new Headers(init?.headers).get("authorization");
        if (resourceCalls === 1) return new Response("expired", { status: 401 });
        expect(auth).toContain("at-2");
        return new Response("ok", { status: 200 });
      },
    });
    const res = await client.fetch(`${ORIGIN}/data`);
    expect(res.status).toBe(200);
    expect(resourceCalls).toBe(2);
    expect(refreshCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("e. 401 → refresh fails → SebaSessionExpiredError, local cleared", async () => {
    // covers src/core/client.ts: 401 token retry path when refresh fails (session expired/cleared)
    const storageRef: { current: SessionStorageAdapter | null } = { current: null };
    const { persisted } = await createDPoPKey();
    const publicJwk = (persisted as any).publicJwk ?? (persisted as any).jwk;
    const jkt = await calculateJwkThumbprint({ kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y } as JsonWebKey);
    const issuerKey = await generateKeyPair("ES256", { extractable: true });
    const issuerJwk = await exportJWK(issuerKey.publicKey);
    (issuerJwk as any).kid = "k1"; (issuerJwk as any).alg = "ES256"; (issuerJwk as any).use = "sig";
    const record: PersistedSession = { version: 1, webId: WEBID, provider: ISSUER, clientId: CLIENT_ID, refreshToken: "rt-1", key: persisted, createdAt: Date.now() };
    const storage = memorySessionStorage(record);
    storageRef.current = storage;
    async function mintIdToken(): Promise<string> {
      return await new SignJWT({ sub: WEBID, webid: WEBID, nonce: "n", cnf: { jkt }, azp: CLIENT_ID })
        .setProtectedHeader({ alg: "ES256", kid: "k1", typ: "JWT" }).setIssuer(ISSUER).setAudience([CLIENT_ID, "solid"]).setIssuedAt().setExpirationTime("2m").sign(issuerKey.privateKey);
    }
    let restoreRefreshes = 0;
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/.well-known/openid-configuration")) return new Response(JSON.stringify({ issuer: ISSUER, authorization_endpoint: ISSUER+"/a", token_endpoint: ISSUER+"/token", jwks_uri: ISSUER+"/jwks", id_token_signing_alg_values_supported: ["ES256"], token_endpoint_auth_methods_supported: ["none"], scopes_supported: ["openid","webid","offline_access"], dpop_signing_alg_values_supported: ["ES256"] }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.endsWith("/jwks")) return new Response(JSON.stringify({ keys: [issuerJwk] }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.endsWith("/token")) {
        restoreRefreshes += 1;
        if (restoreRefreshes === 1) return new Response(JSON.stringify({ access_token: "at-1", id_token: await mintIdToken(), token_type: "DPoP", expires_in: 300, refresh_token: "rt-1" }), { status: 200, headers: { "content-type": "application/json" } });
        return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400, headers: { "content-type": "application/json" } });
      }
      if (url.startsWith(ORIGIN)) return new Response("expired", { status: 401 });
      return new Response("no", { status: 404 });
    };
    const platform: Platform = { kind: "browser", defaultStorage: "memory", fetch: fetchImpl, currentUrl: () => null, pendingAuth: { async save(){}, async load(){ return null; }, async clear(){} }, createStorage: () => storage, beginInteractiveLogin: async () => { throw new Error("no"); } };
    const client = new SebaClient({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI, storage: "memory" }, platform);
    await client.restoreSession();
    await expect(client.fetch(`${ORIGIN}/data`)).rejects.toBeInstanceOf(SebaSessionExpiredError);
    expect(await storageRef.current!.load()).toBeNull();
  });


  it("returns existing session from login() when already authenticated", async () => {
    // covers src/core/client.ts login() existing-session branch
    const client = await seededNoRefreshClient(async () => new Response("ok", { status: 200 }));
    const s = await client.login();
    expect(s.webId).toBe(WEBID);
    expect(client.session?.webId).toBe(WEBID);
    expect(client.sessionInfo()?.webId).toBe(WEBID);
  });

  it("completeLoginFromCurrentUrl throws when URL is not a callback", async () => {
    // covers src/core/client.ts completeLoginFromCurrentUrl() guard branch
    const { persisted } = await createDPoPKey();
    const storage = memorySessionStorage({ version: 1, webId: WEBID, provider: ISSUER, clientId: CLIENT_ID, accessToken: "at", accessTokenExpiresAt: Date.now()+60000, key: persisted, createdAt: Date.now() } as PersistedSession);
    const platform: Platform = { kind: "browser", defaultStorage: "memory", fetch: async () => new Response("",{status:500}), currentUrl: () => new URL("https://app.example/other"), pendingAuth: { async save(){}, async load(){ return null; }, async clear(){} }, createStorage: () => storage, beginInteractiveLogin: async () => { throw new Error("no"); } };
    const client = new SebaClient({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI, storage: "memory" }, platform);
    await expect(client.completeLoginFromCurrentUrl()).rejects.toThrow(/does not carry an authorization response/);
  });

  it("follows 303 redirect as GET (same-origin, replayable) with new proof", async () => {
    // covers src/core/client.ts downgradeToGet(303) + redirect follow branch
    const methods: string[] = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      methods.push(String(init?.method ?? "GET"));
      if (methods.length === 1) return new Response(null, { status: 303, headers: { location: "/after" } });
      return new Response("ok", { status: 200 });
    };
    const client = await seededNoRefreshClient(fetchImpl);
    const res = await client.fetch(`${ORIGIN}/post`, { method: "POST", body: "x", headers: { "content-type": "text/plain" } });
    expect(res.status).toBe(200);
    expect(methods).toEqual(["POST", "GET"]);
  });

  it("handles 400 + dpop-nonce challenge and retries", async () => {
    // covers src/core/client.ts 400 nonce retry branch
    let calls = 0;
    const fetchImpl: typeof fetch = async (_input, init) => {
      calls += 1;
      if (calls === 1) return new Response("bad", { status: 400, headers: { "dpop-nonce": "nn" } });
      const dpop = new Headers(init?.headers).get("DPoP")!;
      const payload = JSON.parse(Buffer.from(dpop.split(".")[1]!, "base64url").toString("utf8")) as { nonce?: string };
      expect(payload.nonce).toBe("nn");
      return new Response("ok", { status: 200 });
    };
    const client = await seededNoRefreshClient(fetchImpl);
    expect((await client.fetch(`${ORIGIN}/d`)).status).toBe(200);
    expect(calls).toBe(2);
  });

  it("returns 401 without token retry when body is non-replayable (stream)", async () => {
    // covers src/core/client.ts replayable=false 401 branch (no token retry)
    let calls = 0;
    const stream = new ReadableStream<Uint8Array>({ start(c){ c.enqueue(new TextEncoder().encode("x")); c.close(); } });
    const fetchImpl: typeof fetch = async () => { calls += 1; return new Response("no", { status: 401 }); };
    const client = await seededNoRefreshClient(fetchImpl);
    const res = await client.fetch(`${ORIGIN}/up`, { method: "POST", body: stream, duplex: "half" } as RequestInit & { duplex: "half" });
    expect(res.status).toBe(401);
    expect(calls).toBe(1);
  });


  it("logout delegates through client (covers logout path)", async () => {
    // covers src/core/client.ts logout() branch
    const client = await seededNoRefreshClient(async () => new Response("ok", { status: 200 }));
    await client.logout();
    expect(client.session).toBeNull();
  });

  it("redirect with no location header returns the redirect response", async () => {
    // covers src/core/client.ts redirect with null location/safeResolve branch
    const fetchImpl: typeof fetch = async () => new Response(null, { status: 302 });
    const client = await seededNoRefreshClient(fetchImpl);
    const res = await client.fetch(`${ORIGIN}/n`);
    expect(res.status).toBe(302);
  });

  it("buildTemplate throws SebaConfigError on unconstructable request", async () => {
    // covers src/core/client.ts buildTemplate error branch
    const client = await seededNoRefreshClient(async () => new Response("ok", { status: 200 }));
    await expect(client.fetch("http://[::1")).rejects.toThrow(/could not be constructed/);
  });

});
