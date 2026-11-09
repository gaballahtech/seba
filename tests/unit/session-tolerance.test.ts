import { describe, expect, it } from "vitest";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { SessionManager } from "../../src/core/session.js";
import { createDPoPKey } from "../../src/core/dpop.js";
import { memorySessionStorage } from "../../src/core/storage.js";
import type { OIDCConfiguration, PersistedSession, SessionChangeEvent } from "../../src/types.js";

const CLIENT_ID = "https://app.example/id.jsonld";
const ISSUER = "https://issuer.example";
const WEBID = "https://alice.example/profile/card#me";

async function setup() {
  const { persisted } = await createDPoPKey();
  const issuerKey = await generateKeyPair("ES256", { extractable: true });
  const issuerJwk = await exportJWK(issuerKey.publicKey);
  (issuerJwk as any).kid = "k1"; (issuerJwk as any).alg = "ES256"; (issuerJwk as any).use = "sig";
  const record: PersistedSession = { version: 1, webId: WEBID, provider: ISSUER, clientId: CLIENT_ID, refreshToken: "rt-1", key: persisted, createdAt: Date.now() };
  const storage = memorySessionStorage(record);
  const events: SessionChangeEvent[] = [];
  async function mintIdToken(): Promise<string> {
    // No cnf.jkt — triggers allowNonCompliantCnf tolerance path when configuration allows it.
    return await new SignJWT({ sub: WEBID, webid: WEBID, azp: CLIENT_ID })
      .setProtectedHeader({ alg: "ES256", kid: "k1", typ: "JWT" })
      .setIssuer(ISSUER).setAudience([CLIENT_ID, "solid"]).setIssuedAt().setExpirationTime("2m")
      .sign(issuerKey.privateKey);
  }
  let tokenCalls = 0;
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/jwks")) return new Response(JSON.stringify({ keys: [issuerJwk] }), { status: 200, headers: { "content-type": "application/json" } });
    if (url.endsWith("/token")) {
      tokenCalls += 1;
      return new Response(JSON.stringify({ access_token: `at-${tokenCalls}`, id_token: await mintIdToken(), token_type: "DPoP", expires_in: 300, refresh_token: `rt-${tokenCalls}` }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("no", { status: 404 });
  };
  const configuration: OIDCConfiguration = {
    issuer: ISSUER, authorizationEndpoint: ISSUER + "/a", tokenEndpoint: ISSUER + "/token",
    jwksUri: ISSUER + "/jwks", idTokenSigningAlgValuesSupported: ["ES256"],
    tokenEndpointAuthMethodsSupported: ["none"], scopesSupported: ["openid", "webid", "offline_access"],
    allowNonCompliantCnf: true,
  };
  const manager = new SessionManager({
    clientId: CLIENT_ID, storage, fetchImpl,
    discover: async () => configuration,
    onSessionChange: (e) => events.push(e),
  });
  return { manager, events, storage, tokenCallsRef: () => tokenCalls };
}

describe("tolerance-applied session event (T8b)", () => {
  it("emits exactly one session-changed(tolerance-applied) on refresh validation, deduplicated", async () => {
    const { manager, events } = await setup();
    await manager.restore(); // refresh re-validates; tolerance fires
    const applied = events.filter((e) => e.reason === "tolerance-applied");
    expect(applied.length).toBe(1);

    // force a second refresh in same session
    await manager.refreshIfNeeded(true);
    const applied2 = events.filter((e) => e.reason === "tolerance-applied");
    expect(applied2.length).toBe(1);
  });

  it("fires again for a new session after logout (per session lifetime)", async () => {
    const { manager, events, storage } = await setup();
    await manager.restore();
    expect(events.filter((e) => e.reason === "tolerance-applied").length).toBe(1);
    await manager.logout();

    // seed a fresh session record and restore again
    const { persisted } = await createDPoPKey();
    const issuerKey = await generateKeyPair("ES256", { extractable: true });
    const issuerJwk = await exportJWK(issuerKey.publicKey);
    (issuerJwk as any).kid = "k1"; (issuerJwk as any).alg = "ES256"; (issuerJwk as any).use = "sig";
    const record: PersistedSession = { version: 1, webId: WEBID, provider: ISSUER, clientId: CLIENT_ID, refreshToken: "rt-x", key: persisted, createdAt: Date.now() };
    await storage.save(record);
    // manager state was cleared; restore will read storage and refresh
    await manager.restore();
    expect(events.filter((e) => e.reason === "tolerance-applied").length).toBe(2);
  });
});
