import { describe, expect, it } from "vitest";

import { SebaSessionExpiredError } from "../../src/core/errors.js";
import { SessionManager } from "../../src/core/session.js";
import { memorySessionStorage } from "../../src/core/storage.js";
import type {
  DPoPSigner,
  OIDCConfiguration,
  PersistedKey,
  SessionChangeEvent,
  TokenSet,
} from "../../src/types.js";

const ISSUER = "https://idp.example";
const CLIENT_ID = "https://app.example/client-id.jsonld";
const WEB_ID = "https://alice.example/profile/card#me";

const signer: DPoPSigner = {
  createProof: async () => "proof",
  thumbprint: async () => "thumbprint",
};
const key: PersistedKey = { kind: "jwk", jwk: { kty: "EC", crv: "P-256" } };
const configuration: OIDCConfiguration = {
  issuer: ISSUER,
  authorizationEndpoint: `${ISSUER}/authorize`,
  tokenEndpoint: `${ISSUER}/token`,
  jwksUri: `${ISSUER}/jwks`,
};

function tokens(overrides: Partial<TokenSet> = {}): TokenSet {
  return { accessToken: "access", tokenType: "DPoP", idToken: "id", expiresIn: 3600, ...overrides };
}

function manager(events: SessionChangeEvent[]): SessionManager {
  return new SessionManager({
    clientId: CLIENT_ID,
    storage: memorySessionStorage(),
    fetchImpl: async () => {
      throw new Error("network must not be used");
    },
    discover: async () => configuration,
    onSessionChange: (event) => {
      events.push(event);
    },
  });
}

async function adopt(target: SessionManager, value: TokenSet): Promise<void> {
  await target.adopt({
    tokens: value,
    identity: { webId: WEB_ID, issuer: ISSUER, subject: WEB_ID },
    signer,
    key,
    configuration,
  });
}

describe("session change events", () => {
  it("reports login and logout with the matching session", async () => {
    const events: SessionChangeEvent[] = [];
    const sessions = manager(events);

    await adopt(sessions, tokens({ refreshToken: "refresh" }));
    expect(events).toHaveLength(1);
    expect(events[0]?.reason).toBe("login");
    expect(events[0]?.session?.webId).toBe(WEB_ID);

    await sessions.logout();
    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({ reason: "logout", session: null });
  });

  it("reports expiry once per session and again after a new login", async () => {
    const events: SessionChangeEvent[] = [];
    const sessions = manager(events);

    await adopt(sessions, tokens());
    await expect(sessions.refreshIfNeeded(true)).rejects.toBeInstanceOf(SebaSessionExpiredError);
    await expect(sessions.refreshIfNeeded(true)).rejects.toBeInstanceOf(SebaSessionExpiredError);

    expect(events.map((event) => event.reason)).toEqual(["login", "expired"]);

    await adopt(sessions, tokens());
    await expect(sessions.refreshIfNeeded(true)).rejects.toBeInstanceOf(SebaSessionExpiredError);
    expect(events.map((event) => event.reason)).toEqual(["login", "expired", "login", "expired"]);
  });

  it("keeps working when a listener throws", async () => {
    const events: SessionChangeEvent[] = [];
    const sessions = new SessionManager({
      clientId: CLIENT_ID,
      storage: memorySessionStorage(),
      fetchImpl: async () => {
        throw new Error("network must not be used");
      },
      discover: async () => configuration,
      onSessionChange: (event) => {
        events.push(event);
        throw new Error("listener failure");
      },
    });

    await expect(adopt(sessions, tokens())).resolves.toBeUndefined();
    expect(events).toHaveLength(1);
  });
});
