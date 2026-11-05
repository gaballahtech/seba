import { describe, expect, it } from "vitest";
import {
  SebaAuthError,
  SebaConfigError,
  SebaDiscoveryError,
  SebaDPoPError,
  SebaError,
  SebaNetworkError,
  SebaNoUIError,
  SebaRedirectMismatchError,
  SebaSessionExpiredError,
  isSebaError,
} from "../../src/core/errors.js";

describe("error hierarchy", () => {
  it("exposes the stable code for every error class", () => {
    expect(new SebaConfigError("bad config").code).toBe("SEBA_ERR_CONFIG");
    expect(new SebaDiscoveryError("no discovery").code).toBe("SEBA_ERR_DISCOVERY");
    expect(new SebaAuthError("bad token").code).toBe("SEBA_ERR_AUTH");
    expect(new SebaSessionExpiredError("expired").code).toBe("SEBA_ERR_SESSION_EXPIRED");
    expect(new SebaDPoPError("bad proof").code).toBe("SEBA_ERR_DPOP");
    expect(new SebaNetworkError("offline").code).toBe("SEBA_ERR_NETWORK");
    expect(new SebaNoUIError("no ui").code).toBe("SEBA_ERR_NO_UI");
    expect(new SebaRedirectMismatchError("https://a.example/cb", []).code).toBe("SEBA_ERR_REDIRECT_MISMATCH");
  });

  it("keeps a distinguishable class name and common SebaError base", () => {
    const error = new SebaAuthError("state mismatch");
    expect(error).toBeInstanceOf(SebaError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("SebaAuthError");
  });

  it("preserves the underlying cause for diagnostics", () => {
    const cause = new Error("socket hang up");
    const error = new SebaNetworkError("Unable to reach provider", { cause });
    expect(error.cause).toBe(cause);
  });

  it("describes both the requested and published redirect URIs without secrets", () => {
    const error = new SebaRedirectMismatchError("https://app.example/cb", [
      "https://app.example/callback",
      "http://127.0.0.1:8080/callback",
    ]);
    expect(error.message).toContain("https://app.example/cb");
    expect(error.message).toContain("https://app.example/callback");
    expect(error.message).toContain("http://127.0.0.1:8080/callback");
    expect(error.requestedRedirectUri).toBe("https://app.example/cb");
    expect(error.publishedRedirectUris).toEqual([
      "https://app.example/callback",
      "http://127.0.0.1:8080/callback",
    ]);
  });

  it("renders an explicit marker when no redirect URI is published", () => {
    const error = new SebaRedirectMismatchError("https://app.example/cb", []);
    expect(error.message).toContain("(none)");
  });

  it("does not treat plain errors as SebaError", () => {
    expect(isSebaError(new Error("plain"))).toBe(false);
    expect(isSebaError(new SebaConfigError("config"))).toBe(true);
    expect(isSebaError(null)).toBe(false);
  });
});
