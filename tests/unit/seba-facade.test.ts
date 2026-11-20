import { describe, expect, it } from "vitest";

import { Seba } from "../../src/index.js";
import type { SessionChangeEvent } from "../../src/types.js";

const CONFIG = {
  clientId: "https://app.example/client-id.jsonld",
  redirectUri: "http://127.0.0.1:3000/callback",
};

describe("Seba facade events", () => {
  it("is an EventTarget", () => {
    const seba = new Seba(CONFIG);
    expect(seba).toBeInstanceOf(EventTarget);
  });

  it("dispatches session-changed and logout DOM events", async () => {
    const seba = new Seba(CONFIG);
    const seen: string[] = [];
    seba.addEventListener("session-changed", (event) => {
      const detail = (event as CustomEvent<SessionChangeEvent>).detail;
      seen.push(`session-changed:${detail.reason}`);
    });
    seba.addEventListener("logout", () => {
      seen.push("logout");
    });

    await seba.logout();

    expect(seen).toEqual(["session-changed:logout", "logout"]);
  });

  it("keeps the onSessionChange listener API", async () => {
    const seba = new Seba(CONFIG);
    const reasons: string[] = [];
    const unsubscribe = seba.onSessionChange((event) => {
      reasons.push(event.reason);
    });

    await seba.logout();
    unsubscribe();

    expect(reasons).toEqual(["logout"]);
  });

  it("emits login/restore as a login event and logout/expired as a logout event", async () => {
    const seba = new Seba(CONFIG);
    const logins: unknown[] = [];
    const logouts: unknown[] = [];
    seba.addEventListener("login", (event) => {
      logins.push((event as CustomEvent).detail);
    });
    seba.addEventListener("logout", (event) => {
      logouts.push((event as CustomEvent).detail);
    });

    // No session yet: logout emits with a null previous session.
    await seba.logout();

    expect(logins).toEqual([]);
    expect(logouts).toEqual([null]);
  });
});