import { describe, expect, it } from "vitest";
import { SebaClient } from "../../src/core/client.js";
import { SebaAuthError, SebaConfigError, SebaNoUIError } from "../../src/core/errors.js";
import { createDPoPKey } from "../../src/core/dpop.js";
import { memorySessionStorage } from "../../src/core/storage.js";
import type { PendingAuthorization, PersistedSession, Platform } from "../../src/types.js";

const CLIENT_ID = "https://app.example/id.jsonld";
const REDIRECT_URI = "https://app.example/callback";
const ISSUER = "https://issuer.example";
const WEBID = "https://alice.example/profile/card#me";

function basePlatform(overrides: Partial<Platform> = {}): Platform {
  const storage = memorySessionStorage();
  return {
    kind: "browser",
    defaultStorage: "memory",
    fetch: async () => new Response("", { status: 500 }),
    currentUrl: () => null,
    pendingAuth: {
      async save() {},
      async load() {
        return null;
      },
      async clear() {},
    },
    createStorage: () => storage,
    beginInteractiveLogin: async () => {
      throw new Error("no interactive login in test");
    },
    ...overrides,
  };
}

describe("SebaClient config/edge branches (T5b, covers src/core/client.ts)", () => {
  it("resolveConfig rejects non-absolute redirectUri", () => {
    // covers src/core/client.ts:528-534 branch (redirect URL parse catch)
    expect(
      () =>
        new SebaClient(
          { clientId: CLIENT_ID, redirectUri: "/relative/callback" },
          basePlatform(),
        ),
    ).toThrow(SebaConfigError);
  });

  it("resolveConfig rejects non-https, non-loopback redirectUri", () => {
    // covers src/core/client.ts:534-540 branch (protocol/loopback validation)
    expect(
      () =>
        new SebaClient(
          { clientId: CLIENT_ID, redirectUri: "http://app.example/callback" },
          basePlatform(),
        ),
    ).toThrow(/must use https/);
  });

  it("resolveConfig rejects Node platform with non-loopback redirectUri", () => {
    // covers src/core/client.ts:542-548 branch (node loopback requirement)
    expect(
      () =>
        new SebaClient(
          { clientId: CLIENT_ID, redirectUri: "https://app.example/callback" },
          basePlatform({ kind: "node" }),
        ),
    ).toThrow(/loopback/);
  });

  it("resolveConfig rejects invalid maxDpopNonceRetries", () => {
    // covers src/core/client.ts:558-563 branch (maxDpopNonceRetries validation)
    expect(
      () =>
        new SebaClient(
          { clientId: CLIENT_ID, redirectUri: REDIRECT_URI, maxDpopNonceRetries: -1 },
          basePlatform(),
        ),
    ).toThrow(/non-negative integer/);
    expect(
      () =>
        new SebaClient(
          { clientId: CLIENT_ID, redirectUri: REDIRECT_URI, maxDpopNonceRetries: 1.5 },
          basePlatform(),
        ),
    ).toThrow(/non-negative integer/);
  });

  it("resolveConfig rejects invalid account format", () => {
    // covers src/core/client.ts:574-579 branch (account validation)
    expect(
      () =>
        new SebaClient(
          { clientId: CLIENT_ID, redirectUri: REDIRECT_URI, account: "bad space" },
          basePlatform(),
        ),
    ).toThrow(/account must be/);
  });

  it("resolveConfig rejects invalid persistSessionWithoutRefreshToken value", () => {
    // covers src/core/client.ts:598-604 branch (persistSessionWithoutRefreshToken validation)
    expect(
      () =>
        new SebaClient(
          {
            clientId: CLIENT_ID,
            redirectUri: REDIRECT_URI,
            persistSessionWithoutRefreshToken: "sometimes" as "auto",
          },
          basePlatform(),
        ),
    ).toThrow(/must be "auto" or "never"/);
  });

  it("resolveConfig accepts debug/openAuthorizationUrl/tolerances/account and login guard throws without UI", async () => {
    // covers src/core/client.ts:578-598 return spread branches (debug/openAuthorizationUrl/tolerances/account)
    // and src/core/client.ts:188-195 branch (login without webId/issuer/selectIdentity -> SebaNoUIError)
    const client = new SebaClient(
      {
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
        debug: true,
        openAuthorizationUrl: () => {},
        account: "acct_1",
        allowNonCompliantAudience: true,
        acknowledgeSecurityRelaxations: true,
        tolerances: { [ISSUER]: { allowNonCompliantCnf: true } },
        maxDpopNonceRetries: 2,
        persistSessionWithoutRefreshToken: "never",
      },
      basePlatform({ kind: "browser", selectIdentity: undefined }),
    );
    await expect(client.login()).rejects.toBeInstanceOf(SebaNoUIError);
  });

  it("callback URL on different path is not treated as completion", async () => {
    // covers src/core/client.ts:485-488 branch (origin/pathname mismatch in #callbackUrl)
    const { persisted } = await createDPoPKey();
    const storage = memorySessionStorage({
      version: 1,
      webId: WEBID,
      provider: ISSUER,
      clientId: CLIENT_ID,
      accessToken: "at",
      accessTokenExpiresAt: Date.now() + 60_000,
      key: persisted,
      createdAt: Date.now(),
    } as PersistedSession);
    const client = new SebaClient(
      { clientId: CLIENT_ID, redirectUri: REDIRECT_URI, storage: "memory" },
      basePlatform({
        createStorage: () => storage,
        currentUrl: () => new URL("https://app.example/other?code=x&state=y"),
        selectIdentity: undefined,
      }),
    );
    // existing session present and URL not a matching callback -> login returns existing session
    await client.restoreSession();
    const s = await client.login();
    expect(s.webId).toBe(WEBID);
  });

  it("completeLogin rejects when no pending authorization exists", async () => {
    // covers src/core/client.ts:351-358 branch (#completeLogin pending null)
    const client = new SebaClient(
      { clientId: CLIENT_ID, redirectUri: REDIRECT_URI },
      basePlatform({
        currentUrl: () => new URL(`${REDIRECT_URI}?code=abc&state=st`),
        pendingAuth: {
          async save() {},
          async load() {
            return null;
          },
          async clear() {},
        },
      }),
    );
    await expect(client.login()).rejects.toBeInstanceOf(SebaAuthError);
    await expect(client.login()).rejects.toThrow(/no login is pending/);
  });

  it("completeLogin rejects when pending client/redirect mismatches and clears pending", async () => {
    // covers src/core/client.ts:359-365 branch (#completeLogin client/redirect mismatch)
    let cleared = 0;
    const pending: PendingAuthorization = {
      state: "st",
      nonce: "n",
      codeVerifier: "v".repeat(43),
      issuer: ISSUER,
      clientId: "https://other.example/id.jsonld",
      redirectUri: REDIRECT_URI,
      createdAt: Date.now(),
    };
    const client = new SebaClient(
      { clientId: CLIENT_ID, redirectUri: REDIRECT_URI },
      basePlatform({
        currentUrl: () => new URL(`${REDIRECT_URI}?code=abc&state=st`),
        pendingAuth: {
          async save() {},
          async load() {
            return pending;
          },
          async clear() {
            cleared += 1;
          },
        },
      }),
    );
    await expect(client.login()).rejects.toThrow(/different client or redirect URI/);
    expect(cleared).toBeGreaterThanOrEqual(1);
  });
});
