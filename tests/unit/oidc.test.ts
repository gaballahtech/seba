import { beforeAll, describe, expect, it, vi } from "vitest";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import {
  buildAuthorizationUrl,
  createPendingAuthorization,
  createPkcePair,
  exchangeAuthorizationCode,
  localJwks,
  parseAuthorizationResponse,
  parseTokenSet,
  requestTokenResponse,
  validateIdToken,
} from "../../src/core/oidc.js";
import { SebaAuthError, SebaNetworkError } from "../../src/core/errors.js";
import type { DPoPSigner, OIDCConfiguration, PendingAuthorization } from "../../src/types.js";

const ISSUER = "https://idp.example";
const CLIENT_ID = "https://app.example/client-id.jsonld";
const REDIRECT_URI = "https://app.example/auth/callback";
const WEB_ID = "https://alice.example/profile/card#me";

let privateKey: CryptoKey;
let publicJwk: JsonWebKey;

beforeAll(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  privateKey = pair.privateKey;
  publicJwk = await exportJWK(pair.publicKey);
});

function configuration(overrides: Partial<OIDCConfiguration> = {}): OIDCConfiguration {
  return {
    issuer: ISSUER,
    authorizationEndpoint: `${ISSUER}/authorize`,
    tokenEndpoint: `${ISSUER}/token`,
    jwksUri: `${ISSUER}/jwks`,
    scopesSupported: ["openid", "webid", "offline_access"],
    ...overrides,
  };
}

function pending(overrides: Partial<PendingAuthorization> = {}): PendingAuthorization {
  return {
    state: "state-value",
    codeVerifier: "verifier",
    nonce: "nonce-value",
    issuer: ISSUER,
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    createdAt: Date.now(),
    ...overrides,
  };
}

function signer(thumbprint = "thumb-a"): DPoPSigner & { proofs: string[] } {
  const proofs: string[] = [];
  return {
    proofs,
    async createProof() {
      const proof = `proof-${String(proofs.length + 1)}`;
      proofs.push(proof);
      return proof;
    },
    async thumbprint() {
      return thumbprint;
    },
  };
}

async function signIdToken(claims: Record<string, unknown> = {}, key: CryptoKey = privateKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: ISSUER,
    aud: [CLIENT_ID, "solid"],
    azp: CLIENT_ID,
    sub: WEB_ID,
    iat: now,
    exp: now + 300,
    nonce: "nonce-value",
    cnf: { jkt: "thumb-a" },
    ...claims,
  })
    .setProtectedHeader({ alg: "ES256" })
    .sign(key);
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("createPkcePair", () => {
  it("creates an RFC 7636 verifier and an S256 challenge", async () => {
    const pair = await createPkcePair();
    expect(pair.codeVerifier).toHaveLength(43);
    expect(pair.codeVerifier).toMatch(/^[A-Za-z0-9\-._~]+$/);

    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pair.codeVerifier));
    const expected = Buffer.from(new Uint8Array(digest)).toString("base64url");
    expect(pair.codeChallenge).toBe(expected);
    expect(pair.codeChallenge).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(pair.codeChallenge).not.toContain("=");
  });

  it("never repeats a verifier", async () => {
    const first = await createPkcePair();
    const second = await createPkcePair();
    expect(first.codeVerifier).not.toBe(second.codeVerifier);
    expect(first.codeChallenge).not.toBe(second.codeChallenge);
  });
});

describe("createPendingAuthorization", () => {
  it("stores independent state and nonce values and the transaction binding", async () => {
    const transaction = await createPendingAuthorization({
      issuer: ISSUER,
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      webId: WEB_ID,
    });
    expect(transaction.state).not.toBe(transaction.nonce);
    expect(transaction.state.length).toBeGreaterThanOrEqual(43);
    expect(transaction.issuer).toBe(ISSUER);
    expect(transaction.webId).toBe(WEB_ID);
    expect(transaction.codeVerifier).toHaveLength(43);
    expect(transaction.createdAt).toBeGreaterThan(0);
  });
});

describe("buildAuthorizationUrl", () => {
  it("builds a code+PKCE+S256 request with state, nonce and the static client id", () => {
    const url = new URL(
      buildAuthorizationUrl({
        configuration: configuration(),
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
        state: "the-state",
        nonce: "the-nonce",
        codeChallenge: "the-challenge",
      }),
    );
    expect(url.origin + url.pathname).toBe(`${ISSUER}/authorize`);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(url.searchParams.get("scope")).toBe("openid webid offline_access");
    expect(url.searchParams.get("state")).toBe("the-state");
    expect(url.searchParams.get("nonce")).toBe("the-nonce");
    expect(url.searchParams.get("code_challenge")).toBe("the-challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("registration_endpoint")).toBeNull();
  });

  it("refuses to build a request without PKCE material", () => {
    expect(() =>
      buildAuthorizationUrl({
        configuration: configuration(),
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
        state: "s",
        nonce: "n",
        codeChallenge: "",
      }),
    ).toThrow(SebaAuthError);
  });
});

describe("parseAuthorizationResponse", () => {
  it("returns the code for a valid response", () => {
    const url = `${REDIRECT_URI}?code=abc&state=state-value&iss=${encodeURIComponent(ISSUER)}`;
    expect(parseAuthorizationResponse(url, pending())).toBe("abc");
  });

  it("rejects a mismatched state", () => {
    const url = `${REDIRECT_URI}?code=abc&state=other&iss=${encodeURIComponent(ISSUER)}`;
    expect(() => parseAuthorizationResponse(url, pending())).toThrow(/state does not match/);
  });

  it("rejects a missing or mismatched RFC 9207 iss", () => {
    const withoutIss = `${REDIRECT_URI}?code=abc&state=state-value`;
    expect(() => parseAuthorizationResponse(withoutIss, pending())).toThrow(/RFC 9207/);
    const otherIss = `${REDIRECT_URI}?code=abc&state=state-value&iss=${encodeURIComponent("https://evil.example")}`;
    expect(() => parseAuthorizationResponse(otherIss, pending())).toThrow(/mix-up/);
  });

  it("rejects a missing code and surfaces provider errors", () => {
    expect(() =>
      parseAuthorizationResponse(
        `${REDIRECT_URI}?state=state-value&iss=${encodeURIComponent(ISSUER)}`,
        pending(),
      ),
    ).toThrow(/does not contain an authorization code/);
    expect(() =>
      parseAuthorizationResponse(
        `${REDIRECT_URI}?error=access_denied&error_description=user%20said%20no&state=state-value`,
        pending(),
      ),
    ).toThrow(/access_denied.*user said no/);
  });
});

describe("requestTokenResponse", () => {
  it("retries a use_dpop_nonce challenge once with a new proof and the supplied nonce", async () => {
    const signerStub = signer();
    const seen: Array<{ nonce: string | null; dpop: string }> = [];
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      const headers = new Headers(init?.headers);
      seen.push({ nonce: headers.get("dpop-nonce"), dpop: headers.get("DPoP") ?? "" });
      if (seen.length === 1) {
        return jsonResponse({ error: "use_dpop_nonce" }, 400, { "dpop-nonce": "server-nonce" });
      }
      return jsonResponse({ access_token: "at", token_type: "DPoP", id_token: "it" });
    });

    const outcome = await requestTokenResponse({
      tokenEndpoint: `${ISSUER}/token`,
      body: new URLSearchParams({ grant_type: "authorization_code" }),
      signer: signerStub,
      fetchImpl,
    });

    expect(outcome.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(signerStub.proofs).toEqual(["proof-1", "proof-2"]);
    expect(seen[0]?.dpop).not.toBe(seen[1]?.dpop);
  });

  it("returns OAuth failures instead of throwing", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ error: "invalid_grant", error_description: "expired" }, 400),
    );
    const outcome = await requestTokenResponse({
      tokenEndpoint: `${ISSUER}/token`,
      body: new URLSearchParams({ grant_type: "refresh_token" }),
      signer: signer(),
      fetchImpl,
    });
    expect(outcome).toEqual({ ok: false, error: "invalid_grant", description: "expired", status: 400 });
  });

  it("throws SebaNetworkError when the endpoint is unreachable", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    await expect(
      requestTokenResponse({
        tokenEndpoint: `${ISSUER}/token`,
        body: new URLSearchParams(),
        signer: signer(),
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(SebaNetworkError);
  });
});

describe("parseTokenSet", () => {
  it("accepts DPoP token types case-insensitively", () => {
    const tokens = parseTokenSet({
      access_token: "at",
      token_type: "dpop",
      id_token: "it",
      refresh_token: "rt",
      expires_in: "300",
      scope: "openid",
    });
    expect(tokens).toEqual({
      accessToken: "at",
      tokenType: "DPoP",
      idToken: "it",
      refreshToken: "rt",
      expiresIn: 300,
      scope: "openid",
    });
  });

  it("rejects non-DPoP token types and missing tokens", () => {
    expect(() => parseTokenSet({ access_token: "at", token_type: "Bearer", id_token: "it" })).toThrow(/requires DPoP/);
    expect(() => parseTokenSet({ token_type: "DPoP", id_token: "it" })).toThrow(/access_token/);
    expect(() => parseTokenSet({ access_token: "at", token_type: "DPoP" })).toThrow(/id_token/);
  });
});

describe("validateIdToken", () => {
  const baseInput = () => ({
    idToken: "",
    configuration: configuration(),
    clientId: CLIENT_ID,
    nonce: "nonce-value",
    signer: signer(),
    requireDpopBinding: true,
    jwks: localJwks([publicJwk]),
  });

  it("returns the WebID from the webid claim", async () => {
    const identity = await validateIdToken({ ...baseInput(), idToken: await signIdToken() });
    expect(identity).toEqual({ webId: WEB_ID, issuer: ISSUER, subject: WEB_ID });
  });

  it("falls back to an https sub claim when webid is absent", async () => {
    const identity = await validateIdToken({
      ...baseInput(),
      idToken: await signIdToken({ sub: "https://bob.example/card#me" }),
    });
    expect(identity.webId).toBe("https://bob.example/card#me");
  });

  it("rejects non-https WebIDs", async () => {
    await expect(
      validateIdToken({ ...baseInput(), idToken: await signIdToken({ webid: "http://alice.example/card" }) }),
    ).rejects.toThrow(/does not use https/);
  });

  it("rejects a nonce mismatch", async () => {
    await expect(
      validateIdToken({ ...baseInput(), idToken: await signIdToken({ nonce: "other" }) }),
    ).rejects.toThrow(/nonce/);
  });

  it("rejects a token bound to a different DPoP key", async () => {
    await expect(
      validateIdToken({ ...baseInput(), idToken: await signIdToken({ cnf: { jkt: "thumb-other" } }) }),
    ).rejects.toThrow(/different DPoP key/);
  });

  it("requires cnf.jkt when the provider advertises webid", async () => {
    await expect(
      validateIdToken({ ...baseInput(), idToken: await signIdToken({ cnf: undefined }) }),
    ).rejects.toThrow(/not bound to a DPoP key/);
  });

  it("does not require cnf.jkt when webid is not advertised", async () => {
    const identity = await validateIdToken({
      ...baseInput(),
      configuration: configuration({ scopesSupported: ["openid"] }),
      requireDpopBinding: false,
      idToken: await signIdToken({ cnf: undefined }),
    });
    expect(identity.webId).toBe(WEB_ID);
  });

  it("requires the solid audience when the provider advertises webid", async () => {
    await expect(validateIdToken({ ...baseInput(), idToken: await signIdToken({ aud: CLIENT_ID }) })).rejects.toThrow(
      /"solid"/,
    );
  });

  it("rejects a mismatched authorized party", async () => {
    await expect(
      validateIdToken({ ...baseInput(), idToken: await signIdToken({ azp: "https://other.example" }) }),
    ).rejects.toThrow(/authorized party/);
  });

  it("rejects an ID token signed by another key", async () => {
    const other = await generateKeyPair("ES256", { extractable: true });
    await expect(
      validateIdToken({ ...baseInput(), idToken: await signIdToken({}, other.privateKey) }),
    ).rejects.toThrow(/failed validation/);
  });

  it("rejects an expired ID token", async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(
      validateIdToken({ ...baseInput(), idToken: await signIdToken({ iat: now - 600, exp: now - 400 }) }),
    ).rejects.toThrow(/failed validation/);
  });

  it("rejects a WebID that does not match the requested one", async () => {
    await expect(
      validateIdToken({
        ...baseInput(),
        idToken: await signIdToken(),
        expectedWebId: "https://bob.example/card#me",
      }),
    ).rejects.toThrow(/requested/);
  });
});

describe("validateIdToken with allowNonCompliantAudience", () => {
  const baseInput = () => ({
    idToken: "",
    configuration: configuration(),
    clientId: CLIENT_ID,
    nonce: "nonce-value",
    signer: signer(),
    requireDpopBinding: true,
    jwks: localJwks([publicJwk]),
  });

  function configWithAllow(enabled: boolean): OIDCConfiguration {
    return { ...configuration(), allowNonCompliantAudience: enabled };
  }

  function noncompliantToken(claims: Record<string, unknown> = {}): Promise<string> {
    return signIdToken({ aud: CLIENT_ID, ...claims });
  }

  it("rejects an ID token without \"solid\" in aud when the flag is false", async () => {
    await expect(
      validateIdToken({ ...baseInput(), configuration: configWithAllow(false), idToken: await noncompliantToken() }),
    ).rejects.toThrow(/does not include.*"solid"/);
  });

  it("passes an ID token without \"solid\" in aud when the flag is true", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const identity = await validateIdToken({
        ...baseInput(),
        configuration: configWithAllow(true),
        idToken: await noncompliantToken(),
      });
      expect(identity).toEqual({ webId: WEB_ID, issuer: ISSUER, subject: WEB_ID });
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("warns exactly once per process when the flag is true", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { setNonCompliantAudienceWarned } = await import("../../src/core/oidc.js");
    setNonCompliantAudienceWarned(false);
    try {
      // Force aud to the client_id only, without "solid", mirroring solidcommunity.net.
      // signIdToken is not exported from this test file, so build the token here.
      const { generateKeyPair, SignJWT } = await import("jose");
      const now = Math.floor(Date.now() / 1000);
      const keys = await generateKeyPair("ES256", { extractable: true });
      const token = await (new SignJWT({
        aud: CLIENT_ID,
        iss: ISSUER,
        sub: WEB_ID,
        nonce: "nonce-value",
        cnf: { jkt: "thumb-a" },
        iat: now,
        exp: now + 300,
      })
        .setProtectedHeader({ alg: "ES256" })
        .sign(keys.privateKey as CryptoKey));
      const jwksForTest = localJwks([await (await import("jose")).exportJWK(keys.publicKey)]);
      await validateIdToken({ ...baseInput(), configuration: configWithAllow(true), jwks: jwksForTest, idToken: token });
      await validateIdToken({ ...baseInput(), configuration: configWithAllow(true), jwks: jwksForTest, idToken: token });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect((warnSpy.mock.calls[0]?.[0] ?? "")).toContain("WARNING");
      expect((warnSpy.mock.calls[0]?.[0] ?? "")).toContain("allowNonCompliantAudience is enabled");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("still rejects an ID token without the client_id audience even when the flag is true", async () => {
    await expect(
      validateIdToken({
        ...baseInput(),
        configuration: configWithAllow(true),
        idToken: await signIdToken({ aud: "https://different.example/client-id.jsonld" }),
      }),
    ).rejects.toThrow(/failed validation/);
  });

  it("still rejects an ID token whose aud is an array that does not contain the client_id even when the flag is true", async () => {
    await expect(
      validateIdToken({
        ...baseInput(),
        configuration: configWithAllow(true),
        idToken: await signIdToken({ aud: ["https://different.example/client-id.jsonld"] }),
      }),
    ).rejects.toThrow(/failed validation/);
  });

  it("passes an ID token with \"solid\" and the client_id when the flag is false", async () => {
    const identity = await validateIdToken({
      ...baseInput(),
      configuration: configWithAllow(false),
      idToken: await signIdToken({ aud: [CLIENT_ID, "solid"] }),
    });
    expect(identity).toEqual({ webId: WEB_ID, issuer: ISSUER, subject: WEB_ID });
  });
});

describe("exchangeAuthorizationCode", () => {
  async function exchange(fetchImpl: typeof fetch) {
    return exchangeAuthorizationCode({
      configuration: configuration(),
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      code: "the-code",
      codeVerifier: "the-verifier",
      nonce: "nonce-value",
      signer: signer(),
      fetchImpl,
      jwks: localJwks([publicJwk]),
    });
  }

  it("exchanges the code and validates the identity", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        access_token: "access-token",
        token_type: "DPoP",
        id_token: await signIdToken({ aud: [CLIENT_ID, "solid"] }),
        refresh_token: "refresh-token",
        expires_in: 300,
        scope: "openid webid offline_access",
      }),
    );
    const result = await exchange(fetchImpl);
    expect(result.identity.webId).toBe(WEB_ID);
    expect(result.tokens.accessToken).toBe("access-token");
    expect(result.tokens.refreshToken).toBe("refresh-token");

    const body = String(fetchImpl.mock.calls[0]?.[1]?.body);
    const params = new URLSearchParams(body);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("the-code");
    expect(params.get("code_verifier")).toBe("the-verifier");
    expect(params.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(params.get("client_id")).toBe(CLIENT_ID);
  });

  it("rejects a rejected code without leaking the code", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ error: "invalid_grant", error_description: "code expired" }, 400),
    );
    const error = await exchange(fetchImpl).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SebaAuthError);
    expect(String((error as Error).message)).not.toContain("the-code");
  });

  it("rejects a Bearer token response", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ access_token: "at", token_type: "Bearer", id_token: await signIdToken() }),
    );
    await expect(exchange(fetchImpl)).rejects.toThrow(/requires DPoP/);
  });
});
