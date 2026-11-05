import { describe, expect, it, vi } from "vitest";
import {
  advertisesWebIdScope,
  discoverProvider,
  parseProviderConfiguration,
  validateIssuerUrl,
  wellKnownCandidates,
} from "../../src/core/discovery.js";
import { SebaDPoPError, SebaDiscoveryError, SebaNetworkError } from "../../src/core/errors.js";

const ISSUER = "https://idp.example";

function configuration(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/authorize`,
    token_endpoint: `${ISSUER}/token`,
    jwks_uri: `${ISSUER}/jwks`,
    response_types_supported: ["code"],
    scopes_supported: ["openid", "webid", "offline_access"],
    dpop_signing_alg_values_supported: ["ES256"],
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("validateIssuerUrl", () => {
  it("accepts https issuers and preserves the exact string", () => {
    expect(validateIssuerUrl(ISSUER)).toBe(ISSUER);
    expect(validateIssuerUrl("https://idp.example/tenant/")).toBe("https://idp.example/tenant/");
  });

  it("accepts loopback http for development", () => {
    expect(validateIssuerUrl("http://127.0.0.1:8080")).toBe("http://127.0.0.1:8080");
    expect(validateIssuerUrl("http://localhost:8080")).toBe("http://localhost:8080");
  });

  it("rejects non-https issuers outside loopback", () => {
    expect(() => validateIssuerUrl("http://idp.example")).toThrow(SebaDiscoveryError);
  });

  it("rejects query strings, fragments, relative values and credentials", () => {
    expect(() => validateIssuerUrl("https://idp.example?x=1")).toThrow(SebaDiscoveryError);
    expect(() => validateIssuerUrl("https://idp.example#frag")).toThrow(SebaDiscoveryError);
    expect(() => validateIssuerUrl("/relative")).toThrow(SebaDiscoveryError);
    expect(() => validateIssuerUrl("https://user:pass@idp.example")).toThrow(SebaDiscoveryError);
  });
});

describe("wellKnownCandidates", () => {
  it("uses the RFC 8414 form for issuers with a path", () => {
    expect(wellKnownCandidates("https://idp.example/tenant")).toEqual([
      "https://idp.example/.well-known/openid-configuration/tenant",
      "https://idp.example/tenant/.well-known/openid-configuration",
    ]);
  });

  it("uses a single candidate without a path", () => {
    expect(wellKnownCandidates(ISSUER)).toEqual([`${ISSUER}/.well-known/openid-configuration`]);
  });
});

describe("parseProviderConfiguration", () => {
  it("returns the subset SEBA relies on", () => {
    const parsed = parseProviderConfiguration(configuration(), ISSUER);
    expect(parsed).toMatchObject({
      issuer: ISSUER,
      authorizationEndpoint: `${ISSUER}/authorize`,
      tokenEndpoint: `${ISSUER}/token`,
      jwksUri: `${ISSUER}/jwks`,
      scopesSupported: ["openid", "webid", "offline_access"],
      dpopSigningAlgValuesSupported: ["ES256"],
    });
    expect(advertisesWebIdScope(parsed)).toBe(true);
  });

  it("rejects an issuer mismatch", () => {
    expect(() => parseProviderConfiguration(configuration({ issuer: "https://other.example" }), ISSUER)).toThrow(
      /declares its issuer as "https:\/\/other\.example"/,
    );
  });

  it("requires authorization, token and JWKS endpoints", () => {
    const missing = configuration();
    delete missing["token_endpoint"];
    expect(() => parseProviderConfiguration(missing, ISSUER)).toThrow(/token_endpoint/);
  });

  it("rejects insecure endpoints", () => {
    expect(() =>
      parseProviderConfiguration(configuration({ token_endpoint: "http://idp.example/token" }), ISSUER),
    ).toThrow(/does not use https/);
  });

  it("rejects providers that do not advertise ES256 for DPoP", () => {
    expect(() =>
      parseProviderConfiguration(configuration({ dpop_signing_alg_values_supported: ["RS256"] }), ISSUER),
    ).toThrow(SebaDPoPError);
  });

  it("rejects providers that do not support the code response type", () => {
    expect(() => parseProviderConfiguration(configuration({ response_types_supported: ["token"] }), ISSUER)).toThrow(
      /"code" response type/,
    );
  });

  it("treats a missing scopes_supported array as not advertising webid", () => {
    const parsed = parseProviderConfiguration(configuration({ scopes_supported: undefined }), ISSUER);
    expect(advertisesWebIdScope(parsed)).toBe(false);
  });
});

describe("discoverProvider", () => {
  it("fetches and validates the configuration", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(configuration()));
    const result = await discoverProvider(ISSUER, fetchImpl);
    expect(result.issuer).toBe(ISSUER);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(`${ISSUER}/.well-known/openid-configuration`);
  });

  it("falls back to the appended well-known path when the RFC 8414 form is missing", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(jsonResponse(configuration({ issuer: "https://idp.example/tenant" })));
    const result = await discoverProvider("https://idp.example/tenant", fetchImpl);
    expect(result.issuer).toBe("https://idp.example/tenant");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reports a missing configuration when every candidate returns 404", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("nope", { status: 404 }));
    await expect(discoverProvider(ISSUER, fetchImpl)).rejects.toThrow(/No OpenID Provider configuration/);
  });

  it("maps transport failures to SebaNetworkError", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    await expect(discoverProvider(ISSUER, fetchImpl)).rejects.toBeInstanceOf(SebaNetworkError);
  });

  it("rejects non-JSON configuration bodies", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse("<html>", 200));
    await expect(discoverProvider(ISSUER, fetchImpl)).rejects.toThrow(/not valid JSON/);
  });
});

describe("issuer canonicalization", () => {
  it("accepts the trailing-slash form of a path-less issuer and adopts it", () => {
    const parsed = parseProviderConfiguration(configuration({ issuer: "https://idp.example/" }), ISSUER);
    expect(parsed.issuer).toBe("https://idp.example/");
  });

  it("keeps exact matching for issuers with a path", () => {
    expect(() =>
      parseProviderConfiguration(configuration({ issuer: "https://idp.example/tenant" }), ISSUER),
    ).toThrow(SebaDiscoveryError);
    expect(() =>
      parseProviderConfiguration(configuration({ issuer: "https://idp.example/" }), "https://idp.example/tenant"),
    ).toThrow(SebaDiscoveryError);
  });

  it("does not normalize a different port", () => {
    expect(() =>
      parseProviderConfiguration(configuration({ issuer: "https://idp.example:8443/" }), ISSUER),
    ).toThrow(SebaDiscoveryError);
  });
});
