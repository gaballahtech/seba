import { describe, expect, it } from "vitest";
import { applyComplianceTolerances } from "../../src/core/oidc.js";
import { isAuthorizationResponse } from "../../src/core/client.js";
import type { OIDCConfiguration } from "../../src/types.js";

function configuration(): OIDCConfiguration {
  return {
    issuer: "https://idp.example/",
    authorizationEndpoint: "https://idp.example/authorize",
    tokenEndpoint: "https://idp.example/token",
    jwksUri: "https://idp.example/jwks",
  };
}

describe("applyComplianceTolerances", () => {
  it("copies global flags when true", () => {
    const c = configuration();
    applyComplianceTolerances(c, { allowNonCompliantAudience: true, allowNonCompliantCnf: true });
    expect(c.allowNonCompliantAudience).toBe(true);
    expect(c.allowNonCompliantCnf).toBe(true);
  });

  it("leaves configuration untouched when false or undefined", () => {
    const c = configuration();
    applyComplianceTolerances(c, { allowNonCompliantAudience: false });
    applyComplianceTolerances(c, undefined);
    expect(c.allowNonCompliantAudience).toBeUndefined();
    expect(c.allowNonCompliantCnf).toBeUndefined();
  });

  it("does not mutate the tolerance input object shape expectations (copy semantics)", () => {
    const c = configuration();
    applyComplianceTolerances(c, {});
    expect(Object.keys(c).sort()).toEqual(
      ["authorizationEndpoint", "issuer", "jwksUri", "tokenEndpoint"].sort(),
    );
  });
});

describe("isAuthorizationResponse", () => {
  it("detects code + state", () => {
    expect(isAuthorizationResponse(new URL("https://app.example/callback?code=abc&state=xyz"))).toBe(true);
  });

  it("detects an error + state response", () => {
    expect(isAuthorizationResponse(new URL("https://app.example/callback?error=access_denied&state=xyz"))).toBe(true);
  });

  it("rejects URLs without both state and a response parameter", () => {
    expect(isAuthorizationResponse(new URL("https://app.example/?code=abc"))).toBe(false);
    expect(isAuthorizationResponse(new URL("https://app.example/?state=xyz"))).toBe(false);
    expect(isAuthorizationResponse(new URL("https://app.example/"))).toBe(false);
  });
});
