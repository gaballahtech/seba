import { describe, expect, it } from "vitest";
import { decodeJwt, decodeProtectedHeader, exportJWK } from "jose";
import {
  createDPoPKey,
  createDPoPProof,
  dpopThumbprint,
  hashAccessToken,
  loadDPoPKey,
  normalizeHtu,
  publicJwkOf,
} from "../../src/core/dpop.js";
import { SebaDPoPError } from "../../src/core/errors.js";

const RESOURCE = "https://storage.example/alice/notes?page=1#top";

describe("createDPoPKey", () => {
  it("generates a non-extractable ES256 key that can be persisted", async () => {
    const material = await createDPoPKey();
    expect(material.persisted.kind).toBe("crypto-key");
    if (material.persisted.kind !== "crypto-key") {
      expect.unreachable("expected a non-extractable CryptoKey");
    }
    expect(material.persisted.publicJwk).toMatchObject({ kty: "EC", crv: "P-256" });
    await expect(crypto.subtle.exportKey("jwk", material.persisted.key)).rejects.toThrow();
    await expect(material.signer.thumbprint()).resolves.toBe(await dpopThumbprint(material.persisted.publicJwk));
  });

  it("round-trips a persisted CryptoKey through loadDPoPKey", async () => {
    const material = await createDPoPKey();
    const signer = await loadDPoPKey(material.persisted);
    const proof = await signer.createProof({ method: "GET", url: RESOURCE });
    expect(decodeJwt(proof)["htm"]).toBe("GET");
  });

  it("round-trips a persisted JWK fallback", async () => {
    const { privateKey, publicKey } = await generateFallbackPair();
    const privateJwk = await exportJWK(privateKey);
    const signer = await loadDPoPKey({ kind: "jwk", jwk: privateJwk });
    expect(await signer.thumbprint()).toBe(await dpopThumbprint(await exportJWK(publicKey)));
  });
});

async function generateFallbackPair(): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return pair as { privateKey: CryptoKey; publicKey: CryptoKey };
}

describe("createDPoPProof", () => {
  it("signs a dpop+jwt with a public-only jwk header", async () => {
    const material = await createDPoPKey();
    const proof = await material.signer.createProof({ method: "post", url: RESOURCE });
    const header = decodeProtectedHeader(proof);
    expect(header.typ).toBe("dpop+jwt");
    expect(header.alg).toBe("ES256");
    expect(header.jwk).toMatchObject({ kty: "EC", crv: "P-256" });
    expect(header.jwk).not.toHaveProperty("d");
  });

  it("normalizes htm and htu and includes a fresh jti", async () => {
    const material = await createDPoPKey();
    const first = decodeJwt(await material.signer.createProof({ method: "delete", url: RESOURCE }));
    const second = decodeJwt(await material.signer.createProof({ method: "delete", url: RESOURCE }));
    expect(first["htm"]).toBe("DELETE");
    expect(first["htu"]).toBe("https://storage.example/alice/notes");
    expect(first["iat"]).toBeTypeOf("number");
    expect(first["jti"]).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(first["jti"]).not.toBe(second["jti"]);
    expect(first["ath"]).toBeUndefined();
  });

  it("adds ath only when an access token is presented", async () => {
    const material = await createDPoPKey();
    const token = "an-access-token";
    const withToken = decodeJwt(await material.signer.createProof({ method: "GET", url: RESOURCE, accessToken: token }));
    expect(withToken["ath"]).toBe(await hashAccessToken(token));
    const withoutToken = decodeJwt(await material.signer.createProof({ method: "GET", url: RESOURCE }));
    expect(withoutToken["ath"]).toBeUndefined();
  });

  it("includes a server-provided nonce", async () => {
    const material = await createDPoPKey();
    const proof = decodeJwt(
      await material.signer.createProof({ method: "POST", url: "https://idp.example/token", nonce: "n-1" }),
    );
    expect(proof["nonce"]).toBe("n-1");
  });

  it("rejects an unusable URL", async () => {
    const material = await createDPoPKey();
    await expect(material.signer.createProof({ method: "GET", url: "/relative" })).rejects.toBeInstanceOf(SebaDPoPError);
  });
});

describe("normalizeHtu", () => {
  it("removes query and fragment and normalizes the URL", () => {
    expect(normalizeHtu("HTTPS://Storage.Example:443/alice/notes?page=1#top")).toBe("https://storage.example/alice/notes");
    expect(normalizeHtu("not a url")).toBeNull();
  });
});

describe("publicJwkOf", () => {
  it("keeps only public members", async () => {
    const { privateKey } = await generateFallbackPair();
    const privateJwk = await exportJWK(privateKey);
    expect(publicJwkOf(privateJwk)).toEqual({
      kty: "EC",
      crv: "P-256",
      x: privateJwk.x,
      y: privateJwk.y,
    });
  });
});

describe("createDPoPProof (direct)", () => {
  it("signs with an explicitly supplied key", async () => {
    const pair = await generateFallbackPair();
    const publicJwk = await exportJWK(pair.publicKey);
    const proof = await createDPoPProof({ privateKey: pair.privateKey, publicJwk }, { method: "GET", url: RESOURCE });
    expect(decodeProtectedHeader(proof).jwk).toEqual(publicJwk);
  });
});
