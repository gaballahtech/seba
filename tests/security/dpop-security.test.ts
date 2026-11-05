import { describe, expect, it } from "vitest";
import { decodeJwt, decodeProtectedHeader } from "jose";
import { createDPoPKey, hashAccessToken, loadDPoPKey } from "../../src/core/dpop.js";

const TOKEN_ENDPOINT = "https://idp.example/token";
const RESOURCE = "https://storage.example/alice/notes";

describe("DPoP proof uniqueness", () => {
  it("never reuses a proof, jti or signature for the same method and URL", async () => {
    const material = await createDPoPKey();
    const proofs: string[] = [];
    for (let index = 0; index < 200; index += 1) {
      proofs.push(await material.signer.createProof({ method: "POST", url: TOKEN_ENDPOINT }));
    }
    expect(new Set(proofs).size).toBe(proofs.length);

    const jtis = proofs.map((proof) => decodeJwt(proof)["jti"]);
    expect(new Set(jtis).size).toBe(proofs.length);
    for (const jti of jtis) {
      expect(jti).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it("does not reuse proofs across signer instances restored from the same key", async () => {
    const material = await createDPoPKey();
    const restored = await loadDPoPKey(material.persisted);
    const first = await material.signer.createProof({ method: "GET", url: RESOURCE, accessToken: "at" });
    const second = await restored.createProof({ method: "GET", url: RESOURCE, accessToken: "at" });
    expect(first).not.toBe(second);
    expect(decodeJwt(first)["jti"]).not.toBe(decodeJwt(second)["jti"]);
  });
});

describe("DPoP proof secrecy", () => {
  it("never embeds the access token in the proof", async () => {
    const material = await createDPoPKey();
    const accessToken = "secret-access-token-value";
    const proof = await material.signer.createProof({ method: "GET", url: RESOURCE, accessToken });

    expect(proof).not.toContain(accessToken);
    expect(JSON.stringify(decodeJwt(proof))).not.toContain(accessToken);
    expect(JSON.stringify(decodeProtectedHeader(proof))).not.toContain(accessToken);

    const payload = decodeJwt(proof);
    expect(payload["ath"]).toBe(await hashAccessToken(accessToken));
    expect(payload["ath"]).not.toBe(accessToken);
    expect(payload["ath"]).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("publishes only public key members in the jwk header", async () => {
    const material = await createDPoPKey();
    const proof = await material.signer.createProof({ method: "GET", url: RESOURCE });
    const header = decodeProtectedHeader(proof);
    expect(Object.keys(header.jwk ?? {}).sort()).toEqual(["crv", "kty", "x", "y"]);
    expect(header.jwk).not.toHaveProperty("d");
    expect(proof).not.toContain('"d"');
  });

  it("produces different ath values for different access tokens", async () => {
    const material = await createDPoPKey();
    const first = decodeJwt(await material.signer.createProof({ method: "GET", url: RESOURCE, accessToken: "a" }));
    const second = decodeJwt(await material.signer.createProof({ method: "GET", url: RESOURCE, accessToken: "b" }));
    expect(first["ath"]).not.toBe(second["ath"]);
  });
});
