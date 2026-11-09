import { beforeAll, describe, expect, it, vi } from "vitest";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { createDPoPKey } from "../../src/core/dpop.js";
import { SebaAuthError, SebaNetworkError, SebaSessionExpiredError } from "../../src/core/errors.js";
import { SessionManager } from "../../src/core/session.js";
import { memorySessionStorage } from "../../src/core/storage.js";
import type {
  DPoPSigner,
  OIDCConfiguration,
  PersistedKey,
  PersistedSession,
  SessionStorageAdapter,
} from "../../src/types.js";

const ISSUER = "https://idp.example";
const CLIENT_ID = "https://app.example/client-id.jsonld";
const WEB_ID = "https://alice.example/profile/card#me";
const TOKEN_ENDPOINT = `${ISSUER}/token`;
const JWKS_URI = `${ISSUER}/jwks`;
const REVOCATION_ENDPOINT = `${ISSUER}/revoke`;

let privateKey: CryptoKey;
let publicJwk: JsonWebKey;
let persistedKey: PersistedKey;
let signer: DPoPSigner;
let thumbprint: string;

beforeAll(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  privateKey = pair.privateKey;
  publicJwk = await exportJWK(pair.publicKey);
  const material = await createDPoPKey();
  persistedKey = material.persisted;
  signer = material.signer;
  thumbprint = await material.signer.thumbprint();
});

function configuration(overrides: Partial<OIDCConfiguration> = {}): OIDCConfiguration {
  return {
    issuer: ISSUER,
    authorizationEndpoint: `${ISSUER}/authorize`,
    tokenEndpoint: TOKEN_ENDPOINT,
    jwksUri: JWKS_URI,
    revocationEndpoint: REVOCATION_ENDPOINT,
    scopesSupported: ["openid", "webid", "offline_access"],
    ...overrides,
  };
}

async function idToken(claims: Record<string, unknown> = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: ISSUER,
    aud: [CLIENT_ID, "solid"],
    azp: CLIENT_ID,
    sub: WEB_ID,
    webid: WEB_ID,
    iat: now,
    exp: now + 300,
    cnf: { jkt: thumbprint },
    ...claims,
  })
    .setProtectedHeader({ alg: "ES256" })
    .sign(privateKey);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function tokenResponse(
  overrides: Record<string, unknown> = {},
): Promise<Response> {
  return json({
    access_token: "access-token-2",
    token_type: "DPoP",
    id_token: await idToken(),
    refresh_token: "refresh-token-2",
    expires_in: 300,
    ...overrides,
  });
}

interface Harness {
  manager: SessionManager;
  storage: SessionStorageAdapter & { raw(): PersistedSession | null };
  tokenCalls: URLSearchParams[];
  revokeCalls: URLSearchParams[];
  tokenResponses: Array<() => Response | Promise<Response>>;
}

function harness(initial: PersistedSession | null, options: { revocationEndpoint?: string | null } = {}): Harness {
  const base = memorySessionStorage(initial);
  let last: PersistedSession | null = null;
  const storage: Harness["storage"] = {
    async save(session) {
      await base.save(session);
      last = structuredClone(session);
    },
    async load() {
      return base.load();
    },
    async clear() {
      await base.clear();
      last = null;
    },
    raw() {
      return last;
    },
  };
  const tokenCalls: URLSearchParams[] = [];
  const revokeCalls: URLSearchParams[] = [];
  const tokenResponses: Harness["tokenResponses"] = [];
  const config = configuration(
    options.revocationEndpoint === null ? { revocationEndpoint: undefined } : {},
  );

  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === JWKS_URI) {
      return json({ keys: [publicJwk] });
    }
    if (url === TOKEN_ENDPOINT) {
      tokenCalls.push(new URLSearchParams(String(init?.body ?? "")));
      const next = tokenResponses.shift();
      if (next === undefined) {
        return json({ error: "invalid_grant" }, 400);
      }
      return next();
    }
    if (url === REVOCATION_ENDPOINT) {
      revokeCalls.push(new URLSearchParams(String(init?.body ?? "")));
      return new Response("", { status: 200 });
    }
    return new Response("unexpected URL", { status: 404 });
  });

  const manager = new SessionManager({
    clientId: CLIENT_ID,
    storage,
    fetchImpl,
    discover: async () => config,
    debug: () => undefined,
  });
  return { manager, storage, tokenCalls, revokeCalls, tokenResponses };
}

function storedSession(overrides: Partial<PersistedSession> = {}): PersistedSession {
  return {
    version: 1,
    webId: WEB_ID,
    provider: ISSUER,
    clientId: CLIENT_ID,
    refreshToken: "refresh-token-1",
    key: persistedKey,
    createdAt: Date.now(),
    ...overrides,
  };
}

function activeTokens(overrides: Record<string, unknown> = {}) {
  return {
    accessToken: "access-token-1",
    tokenType: "DPoP" as const,
    idToken: "",
    refreshToken: "refresh-token-1",
    expiresIn: 300,
    ...overrides,
  };
}

describe("restore", () => {
  it("returns null when nothing is stored", async () => {
    const { manager } = harness(null);
    await expect(manager.restore()).resolves.toBeNull();
    expect(manager.isAuthenticated).toBe(false);
  });

  it("resumes a session stored without a refresh token using its access token", async () => {
    const soon = Date.now() + 10 * 60 * 1000;
    const { manager, tokenCalls } = harness(
      storedSession({
        refreshToken: undefined,
        accessToken: "access-token-1",
        accessTokenExpiresAt: soon,
        scope: "openid webid",
      }),
    );
    const session = await manager.restore();
    expect(session).toEqual({ webId: WEB_ID, isLoggedIn: true, provider: ISSUER });
    expect(manager.require().tokens.accessToken).toBe("access-token-1");
    expect(manager.require().tokens.scope).toBe("openid webid");
    expect(manager.require().expiresAt).toBe(soon);
    expect(tokenCalls).toHaveLength(0);
  });

  it("clears an expired refresh-token-less session with a clear error", async () => {
    const { manager, storage } = harness(
      storedSession({
        refreshToken: undefined,
        accessToken: "access-token-1",
        accessTokenExpiresAt: Date.now() - 1000,
      }),
    );
    await expect(manager.restore()).rejects.toBeInstanceOf(SebaSessionExpiredError);
    expect(manager.isAuthenticated).toBe(false);
    expect(await storage.load()).toBeNull();
    await expect(manager.restore()).resolves.toBeNull();
  });

  it("refreshes the stored grant and rotates the refresh token", async () => {
    const { manager, storage, tokenCalls, tokenResponses } = harness(storedSession());
    tokenResponses.push(() => tokenResponse());

    const session = await manager.restore();

    expect(session).toEqual({ webId: WEB_ID, isLoggedIn: true, provider: ISSUER });
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0]?.get("grant_type")).toBe("refresh_token");
    expect(tokenCalls[0]?.get("refresh_token")).toBe("refresh-token-1");
    expect(tokenCalls[0]?.get("client_id")).toBe(CLIENT_ID);
    expect(manager.require().tokens.accessToken).toBe("access-token-2");
    expect(manager.require().tokens.refreshToken).toBe("refresh-token-2");

    const saved = storage.raw();
    expect(saved?.refreshToken).toBe("refresh-token-2");
    const serialized = JSON.stringify(saved);
    expect(serialized).not.toContain("access-token-2");
    expect(serialized).not.toContain("eyJ"); // no ID token
  });

  it("clears the session when the grant was revoked", async () => {
    const { manager, storage, tokenResponses } = harness(storedSession());
    tokenResponses.push(() => json({ error: "invalid_grant" }, 400));

    await expect(manager.restore()).rejects.toBeInstanceOf(SebaSessionExpiredError);
    expect(manager.isAuthenticated).toBe(false);
    expect(await storage.load()).toBeNull();
    await expect(manager.restore()).resolves.toBeNull();
  });

  it("keeps the stored session when the token endpoint is unavailable", async () => {
    const { manager, storage, tokenResponses } = harness(storedSession());
    tokenResponses.push(() => json({ error: "server_error" }, 503));

    await expect(manager.restore()).rejects.toBeInstanceOf(SebaNetworkError);
    expect(await storage.load()).not.toBeNull();
    expect(manager.isAuthenticated).toBe(false);
  });

  it("keeps the stored session for non-terminal OAuth errors", async () => {
    const { manager, storage, tokenResponses } = harness(storedSession());
    tokenResponses.push(() => json({ error: "temporarily_unavailable", error_description: "later" }, 400));

    await expect(manager.restore()).rejects.toBeInstanceOf(SebaAuthError);
    expect(await storage.load()).not.toBeNull();
  });

  it("fails closed and clears state when the refreshed ID token belongs to another WebID", async () => {
    const { manager, storage, tokenResponses } = harness(storedSession());
    const wrongIdentityToken = await idToken({
      webid: "https://bob.example/card#me",
      sub: "https://bob.example/card#me",
    });
    tokenResponses.push(() => tokenResponse({ id_token: wrongIdentityToken }));

    await expect(manager.restore()).rejects.toBeInstanceOf(SebaSessionExpiredError);
    expect(manager.isAuthenticated).toBe(false);
    expect(await storage.load()).toBeNull();
    await expect(manager.restore()).resolves.toBeNull();
  });

  it("keeps the old refresh token when the provider does not rotate it", async () => {
    const { manager, storage, tokenResponses } = harness(storedSession());
    tokenResponses.push(() => tokenResponse({ refresh_token: undefined }));

    await manager.restore();
    expect(manager.require().tokens.refreshToken).toBe("refresh-token-1");
    expect((await storage.load())?.refreshToken).toBe("refresh-token-1");
  });

  it("clears an unusable stored key", async () => {
    const { manager, storage } = harness(
      storedSession({ key: { kind: "jwk", jwk: { kty: "EC", crv: "P-256" } } }),
    );
    await expect(manager.restore()).rejects.toBeInstanceOf(SebaSessionExpiredError);
    expect(await storage.load()).toBeNull();
  });
});

describe("adopt", () => {
  async function adopt(manager: SessionManager, tokens?: Awaited<ReturnType<typeof activeTokens>>) {
    return manager.adopt({
      tokens: tokens ?? activeTokens({ idToken: await idToken() }),
      identity: { webId: WEB_ID, issuer: ISSUER, subject: WEB_ID },
      signer,
      key: persistedKey,
      configuration: configuration(),
    });
  }

  it("persists only the refresh token and key material", async () => {
    const { manager, storage } = harness(null);
    await adopt(manager);

    expect(manager.toPublicSession()).toEqual({ webId: WEB_ID, isLoggedIn: true, provider: ISSUER });
    const saved = storage.raw();
    expect(saved?.refreshToken).toBe("refresh-token-1");
    expect(saved?.key).toEqual(persistedKey);
    expect(JSON.stringify(saved)).not.toContain("access-token-1");
  });

  it("persists the access token when the provider issued no refresh token", async () => {
    const { manager, storage } = harness(null);
    await adopt(manager, activeTokens({ idToken: await idToken(), refreshToken: undefined }));
    expect(manager.isAuthenticated).toBe(true);
    const saved = storage.raw();
    expect(saved?.refreshToken).toBeUndefined();
    expect(saved?.accessToken).toBe("access-token-1");
  });

  it("keeps a no-refresh-token session in memory only when soft-persist is disabled (reload returns null)", async () => {
    const storage = memorySessionStorage(null);
    const manager = new SessionManager({
      clientId: CLIENT_ID,
      storage,
      fetchImpl: vi.fn<typeof fetch>(),
      discover: async () => configuration(),
      persistSessionWithoutRefreshToken: "never",
      debug: () => undefined,
    });
    await manager.adopt({
      tokens: activeTokens({ idToken: await idToken(), refreshToken: undefined }),
      identity: { webId: WEB_ID, issuer: ISSUER, subject: WEB_ID },
      signer,
      key: persistedKey,
      configuration: configuration(),
    });
    expect(manager.isAuthenticated).toBe(true);
    expect(await storage.load()).toBeNull();
    // Reload/new manager sees no persisted session.
    const reloaded = new SessionManager({
      clientId: CLIENT_ID,
      storage,
      fetchImpl: vi.fn<typeof fetch>(),
      discover: async () => configuration(),
      persistSessionWithoutRefreshToken: "never",
    });
    await expect(reloaded.restore()).resolves.toBeNull();
  });

  it("keeps the session usable when storage fails", async () => {
    const { manager } = harness(null);
    const failing = new SessionManager({
      clientId: CLIENT_ID,
      storage: {
        async save() {
          throw new Error("quota exceeded");
        },
        async load() {
          return null;
        },
        async clear() {
          throw new Error("quota exceeded");
        },
      },
      fetchImpl: vi.fn<typeof fetch>(),
      discover: async () => configuration(),
    });
    await adopt(failing);
    expect(failing.isAuthenticated).toBe(true);
    await manager.clearLocal();
  });
});

describe("refreshIfNeeded", () => {
  async function loggedIn() {
    const harnessed = harness(null);
    await harnessed.manager.adopt({
      tokens: activeTokens({ idToken: await idToken() }),
      identity: { webId: WEB_ID, issuer: ISSUER, subject: WEB_ID },
      signer,
      key: persistedKey,
      configuration: configuration(),
    });
    return harnessed;
  }

  it("does nothing while the access token is fresh", async () => {
    const { manager, tokenCalls } = await loggedIn();
    await manager.refreshIfNeeded();
    expect(tokenCalls).toHaveLength(0);
  });

  it("refreshes once for concurrent callers", async () => {
    const { manager, tokenCalls, tokenResponses } = await loggedIn();
    tokenResponses.push(() => tokenResponse());
    await Promise.all([manager.refreshIfNeeded(true), manager.refreshIfNeeded(true)]);
    expect(tokenCalls).toHaveLength(1);
    expect(manager.require().tokens.accessToken).toBe("access-token-2");
  });

  it("fails closed when there is no refresh token and a refresh is forced", async () => {
    const { manager } = await loggedIn();
    const state = manager.require();
    // Drop the refresh token to model providers that omit offline_access.
    Object.defineProperty(state, "tokens", { value: { ...state.tokens, refreshToken: undefined } });
    await expect(manager.refreshIfNeeded(true)).rejects.toBeInstanceOf(SebaSessionExpiredError);
  });
});

describe("logout", () => {
  it("revokes the refresh token and clears local state", async () => {
    const { manager, storage, revokeCalls } = harness(storedSession());
    await manager.logout();

    expect(manager.isAuthenticated).toBe(false);
    expect(await storage.load()).toBeNull();
    expect(revokeCalls).toHaveLength(1);
    expect(revokeCalls[0]?.get("token")).toBe("refresh-token-1");
    expect(revokeCalls[0]?.get("token_type_hint")).toBe("refresh_token");
  });

  it("clears local state even when revocation fails", async () => {
    const storage = memorySessionStorage(storedSession());
    const manager = new SessionManager({
      clientId: CLIENT_ID,
      storage,
      fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline")),
      discover: async () => configuration(),
    });
    await manager.adopt({
      tokens: activeTokens({ idToken: await idToken() }),
      identity: { webId: WEB_ID, issuer: ISSUER, subject: WEB_ID },
      signer,
      key: persistedKey,
      configuration: configuration(),
    });
    await expect(manager.logout()).resolves.toBeUndefined();
    expect(manager.isAuthenticated).toBe(false);
    expect(await storage.load()).toBeNull();
  });
});
