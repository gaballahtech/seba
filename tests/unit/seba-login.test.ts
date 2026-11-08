import { describe, expect, it } from "vitest";

import {
  Seba,
  SebaLoginElement,
  defineSebaLogin,
  issuerDomain,
  providerInfo,
  sebaLogo,
  sebaLogoImage,
} from "../../src/index.js";
import {
  classifyInput,
  parseInlineConfig,
  parseProviders,
  providerChoices,
  safeExternalHttpUrl,
} from "../../src/element.js";
import { DEFAULT_PROVIDERS } from "../../src/assets/providers.js";

describe("brand assets", () => {
  it("inlines SVG artwork for every variant and still ships the PNG original", () => {
    for (const asset of Object.values(sebaLogo)) {
      expect(asset.dataUri.startsWith("data:image/svg+xml,")).toBe(true);
      expect(decodeURIComponent(asset.dataUri)).toContain("viewBox='0 0 512 512'");
      expect(asset.dataUri.length).toBeLessThan(700);
      expect(asset.png.startsWith("assets/")).toBe(true);
      expect(asset.png.endsWith(".png")).toBe(true);
      expect(asset.width).toBe(48);
      expect(asset.height).toBe(48);
    }
  });

  it("has a bare white treatment for the purple gradient button", () => {
    expect(sebaLogo.white.dataUri).toBeDefined();
    const decoded = decodeURIComponent(sebaLogo.white.dataUri);
    expect(decoded.includes("<rect")).toBe(false);
    expect(decoded).toContain("#FFFFFF");
  });

  it("defaults to the primary artwork", () => {
    expect(sebaLogoImage()).toBe(sebaLogo.primary.dataUri);
    expect(sebaLogoImage("inverse")).toBe(sebaLogo.inverse.dataUri);
  });
});

describe("provider branding", () => {
  function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
    const map = new Map<string, string>();
    return {
      getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
      setItem: (key, value) => void map.set(key, String(value)),
      removeItem: (key) => void map.delete(key),
    };
  }

  it("knows the common providers with names, sign-up links and tiles", () => {
    const solid = providerInfo("https://solidcommunity.net/");
    expect(solid.name).toBe("Solid Project");
    expect(solid.signup).toBe("https://solidcommunity.net/");
    expect(providerInfo("https://login.inrupt.com/").signup).toBe("https://start.inrupt.com/profile");
    expect(providerInfo("https://trinpod.us/").signup).toBe("https://trinpod.us/");
    expect(solid.iconUri.startsWith("data:image/png;base64,")).toBe(true);
    expect(providerInfo("https://login.inrupt.com/").name).toBe("Inrupt");
  });

  it("synthesizes a monogram tile for unknown issuers instead of rendering bare", () => {
    const info = providerInfo("https://mypod.example/");
    expect(info.name).toBe("mypod.example");
    expect(info.signup).toBeNull();
    expect(info.iconUri.startsWith("data:image/svg+xml,")).toBe(true);
    expect(info.iconUri.startsWith("data:image/")).toBe(true);
    expect(issuerDomain("https://login.inrupt.com/")).toBe("login.inrupt.com");
  });

  it("ships a five-provider default set when the app omits the list", () => {
    expect(DEFAULT_PROVIDERS.length).toBe(5);
    expect(new Set(DEFAULT_PROVIDERS).size).toBe(5);
    expect(DEFAULT_PROVIDERS[0]).toBe("https://solidcommunity.net/");
    expect(DEFAULT_PROVIDERS).toEqual(expect.arrayContaining(["https://solidweb.me/", "https://trinpod.eu/"]));
    expect(DEFAULT_PROVIDERS).not.toContain("https://inrupt.net/");
  });

  it("pins the remembered issuer first in the picker choices", () => {
    const storage = memoryStorage();
    Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
    try {
      storage.setItem("seba:last-issuer", "https://trinpod.eu/");
      const choices = providerChoices([
        "https://solidcommunity.net/",
        "https://trinpod.eu/",
      ]);
      expect(choices[0]?.issuer).toBe("https://trinpod.eu/");
      expect(choices[0]?.name).toBe("trinpod");
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});

describe("typed WebID input", () => {
  it("treats provider origins and bare roots as issuers", () => {
    expect(classifyInput("https://solidcommunity.net/")).toEqual({
      kind: "issuer",
      value: "https://solidcommunity.net/",
    });
    expect(classifyInput("https://login.inrupt.com")).toEqual({
      kind: "issuer",
      value: "https://login.inrupt.com/",
    });
  });

  it("treats deeper paths as WebIDs and rejects anything that is not a URL", () => {
    expect(classifyInput("https://solidcommunity.net/profile/alice")).toEqual({
      kind: "webId",
      value: "https://solidcommunity.net/profile/alice",
    });
    expect(classifyInput("not a url")).toBeNull();
    expect(classifyInput("javascript:alert(1)")).toBeNull();
    expect(classifyInput("ftp://solidcommunity.net/")).toBeNull();
  });
});

describe("<seba-login>", () => {
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


describe("safeExternalHttpUrl", () => {
  it("accepts absolute https URLs", () => {
    expect(safeExternalHttpUrl("https://solidproject.org/get_a_pod")).toBe(
      "https://solidproject.org/get_a_pod",
    );
    expect(safeExternalHttpUrl("  https://example.com/path?q=1  ")).toBe(
      "https://example.com/path?q=1",
    );
  });

  it("rejects unsafe or non-https schemes and invalid values", () => {
    expect(safeExternalHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalHttpUrl("data:text/html,hi")).toBeNull();
    expect(safeExternalHttpUrl("http://example.com/")).toBeNull();
    expect(safeExternalHttpUrl("ftp://example.com/")).toBeNull();
    expect(safeExternalHttpUrl("not a url")).toBeNull();
    expect(safeExternalHttpUrl("")).toBeNull();
    expect(safeExternalHttpUrl(null)).toBeNull();
    expect(safeExternalHttpUrl(undefined)).toBeNull();
  });
});
