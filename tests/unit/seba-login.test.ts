import { describe, expect, it } from "vitest";

import { Seba, SebaLoginElement, defineSebaLogin, sebaLogo, sebaLogoImage } from "../../src/index.js";

describe("brand assets", () => {
  it("inlines PNG artwork for every variant", () => {
    for (const asset of Object.values(sebaLogo)) {
      expect(asset.dataUri.startsWith("data:image/png;base64,")).toBe(true);
      expect(asset.dataUri.length).toBeGreaterThan(400);
      expect(asset.png.startsWith("assets/")).toBe(true);
      expect(asset.png.endsWith(".png")).toBe(true);
      expect(asset.width).toBe(64);
      expect(asset.height).toBe(64);
      expect(asset.dataUri).not.toContain("svg");
    }
  });

  it("defaults to the primary artwork", () => {
    expect(sebaLogoImage()).toBe(sebaLogo.primary.dataUri);
    expect(sebaLogoImage("inverse")).toBe(sebaLogo.inverse.dataUri);
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

  it("exposes callback detection through the facade", () => {
    expect(Seba.isCallbackResponse("https://app.example/cb?code=1&state=2")).toBe(true);
    expect(Seba.isCallbackResponse("https://app.example/cb?code=1")).toBe(false);
  });
});
