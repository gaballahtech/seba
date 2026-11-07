import { describe, expect, it } from "vitest";

import { Seba, SebaLoginElement, defineSebaLogin, sebaLogo, sebaLogoImage } from "../../src/index.js";
import { parseInlineConfig, parseProviders, providerLabel, lastIssuer } from "../../src/element.js";

describe("brand assets", () => {
  it("inlines SVG artwork for every variant and still ships the PNG original", () => {
    for (const asset of Object.values(sebaLogo)) {
      expect(asset.dataUri.startsWith("data:image/svg+xml,")).toBe(true);
      expect(decodeURIComponent(asset.dataUri)).toContain('viewBox=\'0 0 512 512\'');
      expect(asset.dataUri.length).toBeLessThan(700);
      expect(asset.png.startsWith("assets/")).toBe(true);
      expect(asset.png.endsWith(".png")).toBe(true);
      expect(asset.width).toBe(48);
      expect(asset.height).toBe(48);
    }
  });

  it("defaults to the primary artwork", () => {
    expect(sebaLogoImage()).toBe(sebaLogo.primary.dataUri);
    expect(sebaLogoImage("inverse")).toBe(sebaLogo.inverse.dataUri);
  });
});

describe("<seba-login>", () => {
  it("maps well-known issuers to people-readable names", () => {
    expect(providerLabel("https://solidcommunity.net/")).toBe("Solid Community");
    expect(providerLabel("https://login.inrupt.com/")).toBe("Inrupt Pod Spaces");
    expect(providerLabel("https://login.inrupt.com")).toBe("Inrupt Pod Spaces");
    expect(providerLabel("https://unknown-provider.example")).toBe("unknown-provider.example");
  });

  it("parses the providers attribute defensively", () => {
    expect(
      parseProviders("https://solidcommunity.net, https://login.inrupt.com not-a-url https://trinpod.eu/"),
    ).toEqual(["https://solidcommunity.net/", "https://login.inrupt.com/", "https://trinpod.eu/"]);
    expect(parseProviders("")).toEqual([]);
  });

  it("last-issuer helpers degrade gracefully without a browser", () => {
    expect(lastIssuer()).toBeNull();
  });

  it("does not register itself outside a browser", () => {
    expect(defineSebaLogin()).toBe(false);
  });

  it("starts signed out and refuses to log in without configuration", async () => {
    const element = new SebaLoginElement();
    expect(element.session).toBeNull();
    await expect(element.login()).resolves.toBeNull();
  });

  it("parses the inline config attribute", () => {
    const ok = parseInlineConfig('{"tolerances":{"https://p.example/":{"allowNonCompliantAudience":true}}}');
    expect(ok).toEqual({ config: { tolerances: { "https://p.example/": { allowNonCompliantAudience: true } } } });
    expect(parseInlineConfig("{invalid")).toMatchObject({ error: expect.any(String) });
    expect(parseInlineConfig("[1,2]")).toMatchObject({ error: expect.any(String) });
    expect(parseInlineConfig("null")).toMatchObject({ error: expect.any(String) });
  });

  it("parses provider lists, dropping duplicates and non-URLs", () => {
    expect(
      parseProviders("https://solidcommunity.net/, https://solidweb.org nope https://solidcommunity.net"),
    ).toEqual(["https://solidcommunity.net/", "https://solidweb.org/"]);
    expect(parseProviders("")).toEqual([]);
  });

  it("exposes callback detection through the facade", () => {
    expect(Seba.isCallbackResponse("https://app.example/cb?code=1&state=2")).toBe(true);
    expect(Seba.isCallbackResponse("https://app.example/cb?code=1")).toBe(false);
  });
});
