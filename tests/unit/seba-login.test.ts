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
  buildWebId,
  classifyInput,
  extractUsername,
  matchesSearch,
  parseInlineConfig,
  parseProviders,
  providerChoices,
  providerForWebId,
  safeExternalHttpUrl,
} from "../../src/element.js";
import {
  DEFAULT_PROVIDERS,
  popularityRank,
  PRIMARY_PROVIDERS,
} from "../../src/assets/providers.js";

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
    expect(solid.signup).toBe("https://solidcommunity.net/.account/login/password/register/");
    expect(providerInfo("https://login.inrupt.com/").signup).toBe("https://start.inrupt.com/profile");
    expect(providerInfo("https://solidweb.org/").signup).toBe("https://solidweb.org/register");
    expect(providerInfo("https://solidweb.me/").signup).toBe(
      "https://solidweb.me/.account/login/password/register/",
    );
    expect(providerInfo("https://solid.openlinksw.com:8445/").signup).toBe(
      "https://solid.openlinksw.com:8445/register",
    );
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

  it("ships every curated provider in popularity order when the app omits the list", () => {
    expect(DEFAULT_PROVIDERS.length).toBe(11);
    expect(new Set(DEFAULT_PROVIDERS).size).toBe(11);
    // Most-known community Pod leads, Inrupt follows, then SolidWeb.org.
    expect(DEFAULT_PROVIDERS[0]).toBe("https://solidcommunity.net/");
    expect(DEFAULT_PROVIDERS[1]).toBe("https://login.inrupt.com/");
    expect(DEFAULT_PROVIDERS[2]).toBe("https://solidweb.org/");
    expect(DEFAULT_PROVIDERS).toEqual(expect.arrayContaining(["https://solidweb.me/", "https://trinpod.eu/"]));
    expect(DEFAULT_PROVIDERS).not.toContain("https://inrupt.net/");
  });

  it("orders providers by the curated popularity rank", () => {
    expect(PRIMARY_PROVIDERS).toEqual([
      "https://solidcommunity.net/",
      "https://login.inrupt.com/",
      "https://solidweb.org/",
    ]);
    expect(popularityRank("https://solidcommunity.net/")).toBeLessThan(
      popularityRank("https://solidweb.me/"),
    );
    expect(popularityRank("https://unknown.example/")).toBe(DEFAULT_PROVIDERS.length);
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


describe("matchesSearch", () => {
  const row = "SolidWeb.me solidweb.me";

  it("matches plain names and domains", () => {
    expect(matchesSearch(row, "solidweb")).toBe(true);
    expect(matchesSearch(row, "web.me")).toBe(true);
    expect(matchesSearch(row, "SOLIDWEB.ME")).toBe(true);
  });

  it("matches full URLs, with or without protocol, www or trailing slash", () => {
    expect(matchesSearch(row, "https://solidweb.me/")).toBe(true);
    expect(matchesSearch(row, "http://www.solidweb.me")).toBe(true);
    expect(matchesSearch(row, "solidweb.me/")).toBe(true);
  });

  it("shows everything for an empty query and rejects unrelated text", () => {
    expect(matchesSearch(row, "")).toBe(true);
    expect(matchesSearch(row, "   ")).toBe(true);
    expect(matchesSearch(row, "inrupt")).toBe(false);
  });
});

describe("providerForWebId", () => {
  const providers = [
    "https://solidcommunity.net/",
    "https://login.inrupt.com/",
    "https://solidweb.me/",
    "https://solid.redpencil.io/",
  ];

  it("matches the exact provider host", () => {
    expect(providerForWebId("https://solidweb.me/alice/profile/card#me", providers)).toBe(
      "https://solidweb.me/",
    );
    expect(providerForWebId("https://solidcommunity.net/profile/card#me", providers)).toBe(
      "https://solidcommunity.net/",
    );
  });

  it("matches sub-domains of a provider", () => {
    expect(providerForWebId("https://id.inrupt.com/alice", providers)).toBe(
      "https://login.inrupt.com/",
    );
  });

  it("returns null for an unknown host", () => {
    expect(providerForWebId("https://unknown.example/alice", providers)).toBeNull();
    expect(providerForWebId("not a url", providers)).toBeNull();
  });
});

describe("extractUsername", () => {
  it("pulls the name out of a standard Solid profile URL", () => {
    expect(extractUsername("https://solidweb.me/alice/profile/card#me")).toBe("alice");
    expect(extractUsername("https://solidcommunity.net/alice/profile/card#me")).toBe("alice");
  });

  it("returns an empty string when the WebID has no name", () => {
    expect(extractUsername("https://solidcommunity.net/profile/card#me")).toBe("");
    expect(extractUsername("https://solidweb.me/")).toBe("");
    expect(extractUsername("nope")).toBe("");
  });

  it("reads the name from a sub-domain style WebID", () => {
    expect(extractUsername("https://test123123.solidcommunity.net/profile/card#me", "solidcommunity.net")).toBe(
      "test123123",
    );
    expect(extractUsername("https://alice.solidweb.me/profile/card#me", "solidweb.me")).toBe("alice");
  });

  it("does not mistake a provider sub-domain for a user name", () => {
    expect(extractUsername("https://id.inrupt.com/bob", "login.inrupt.com")).toBe("bob");
  });
});

describe("buildWebId", () => {
  it("turns a bare username into the standard profile document", () => {
    expect(buildWebId("https://solidcommunity.net/", "alice")).toBe(
      "https://solidcommunity.net/alice/profile/card#me",
    );
    expect(buildWebId("https://solidweb.me", "alice")).toBe(
      "https://solidweb.me/alice/profile/card#me",
    );
  });

  it("keeps an explicit path or fragment instead of appending one", () => {
    expect(buildWebId("https://solidcommunity.net/", "alice/profile/card#me")).toBe(
      "https://solidcommunity.net/alice/profile/card#me",
    );
    expect(buildWebId("https://solidcommunity.net/", "profile/card#me")).toBe(
      "https://solidcommunity.net/profile/card#me",
    );
    expect(buildWebId("https://solidweb.org/", "alice/")).toBe(
      "https://solidweb.org/alice/profile/card#me",
    );
  });

  it("leaves a full URL untouched", () => {
    expect(buildWebId("https://solidweb.me/", "https://other.example/card#me")).toBe(
      "https://other.example/card#me",
    );
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
