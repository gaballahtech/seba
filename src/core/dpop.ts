/**
 * DPoP key management and proof creation (RFC 9449).
 *
 * Every attempt gets a brand-new proof: a new `jti`, a new signature and a new `iat`.
 * This module holds no proof state, so no code path can replay a proof.
 */

import { SignJWT, calculateJwkThumbprint, exportJWK, generateKeyPair, importJWK } from "jose";
import { SebaDPoPError } from "./errors.js";
import type { DPoPSigner, PersistedKey, ProofInput } from "../types.js";

/** DPoP signing algorithm required by Solid-OIDC. */
export const DPOP_ALG = "ES256";

/** A generated DPoP key and its persistable representation. */
export interface DPoPKeyMaterial {
  /** Signing capability for this key. */
  readonly signer: DPoPSigner;
  /** Value to store (private key or exported JWK + public JWK). */
  readonly persisted: PersistedKey;
}

/** Signing inputs for one proof. */
interface SigningKey {
  readonly privateKey: CryptoKey;
  readonly publicJwk: JsonWebKey;
}

function signerFrom(signingKey: SigningKey): DPoPSigner {
  return {
    async createProof(input: ProofInput): Promise<string> {
      return createDPoPProof(signingKey, input);
    },
    async thumbprint(): Promise<string> {
      return dpopThumbprint(signingKey.publicJwk);
    },
  };
}

/**
 * Generate a new ES256 DPoP key pair.
 *
 * The private key is non-extractable whenever the runtime can structured-clone a
 * `CryptoKey` (the property IndexedDB relies on). When it cannot, an extractable key is
 * generated and its JWK is stored instead; this is reported in SECURITY.md and never
 * happens silently.
 */
export async function createDPoPKey(): Promise<DPoPKeyMaterial> {
  try {
    const pair = await generateKeyPair(DPOP_ALG, { extractable: false, crv: "P-256" });
    const publicJwk = await exportJWK(pair.publicKey);
    const cloneable = canStructuredClone(pair.privateKey);
    if (cloneable) {
      const signingKey: SigningKey = { privateKey: pair.privateKey, publicJwk };
      return {
        signer: signerFrom(signingKey),
        persisted: { kind: "crypto-key", key: pair.privateKey, publicJwk },
      };
    }
    return await generateExtractableKey();
  } catch (error) {
    throw new SebaDPoPError(
      "Unable to generate a DPoP key. The runtime must support Web Crypto ECDSA P-256.",
      { cause: error },
    );
  }
}

async function generateExtractableKey(): Promise<DPoPKeyMaterial> {
  const pair = await generateKeyPair(DPOP_ALG, { extractable: true, crv: "P-256" });
  const publicJwk = await exportJWK(pair.publicKey);
  const privateJwk = await exportJWK(pair.privateKey);
  const signingKey: SigningKey = { privateKey: pair.privateKey, publicJwk };
  return {
    signer: signerFrom(signingKey),
    persisted: { kind: "jwk", jwk: privateJwk },
  };
}

function canStructuredClone(key: CryptoKey): boolean {
  try {
    structuredClone(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Rebuild a signer from a persisted key.
 *
 * @param persisted - Stored key material.
 */
export async function loadDPoPKey(persisted: PersistedKey): Promise<DPoPSigner> {
  try {
    if (persisted.kind === "crypto-key") {
      return signerFrom({ privateKey: persisted.key, publicJwk: persisted.publicJwk });
    }
    const privateKey = (await importJWK(persisted.jwk, DPOP_ALG)) as CryptoKey;
    return signerFrom({ privateKey, publicJwk: publicJwkOf(persisted.jwk) });
  } catch (error) {
    throw new SebaDPoPError("The stored DPoP key could not be loaded; the session must be recreated.", {
      cause: error,
    });
  }
}

/**
 * Strip private members from a JWK.
 *
 * @param jwk - JWK that may contain private material.
 */
export function publicJwkOf(jwk: JsonWebKey): JsonWebKey {
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
}

/**
 * Create a fresh DPoP proof.
 *
 * @param input - HTTP method, absolute URL, optional access token and optional nonce.
 * @param key - Public half of the session key, used for the `jwk` header and thumbprint.
 * @param privateKey - Key used to sign this proof.
 */
export async function createDPoPProof(
  key: { privateKey: CryptoKey; publicJwk: JsonWebKey },
  input: ProofInput,
): Promise<string> {
  const htu = normalizeHtu(input.url);
  if (htu === null) {
    throw new SebaDPoPError(`The request URL "${input.url}" cannot be normalized for a DPoP proof.`);
  }
  const payload: Record<string, unknown> = {
    jti: randomJti(),
    htm: input.method.toUpperCase(),
    htu,
    iat: Math.floor(Date.now() / 1000),
  };
  if (input.accessToken !== undefined) {
    payload["ath"] = await hashAccessToken(input.accessToken);
  }
  if (input.nonce !== undefined) {
    payload["nonce"] = input.nonce;
  }
  try {
    return await new SignJWT(payload)
      .setProtectedHeader({ typ: "dpop+jwt", alg: DPOP_ALG, jwk: key.publicJwk })
      .sign(key.privateKey);
  } catch (error) {
    throw new SebaDPoPError("Unable to sign the DPoP proof with the session key.", { cause: error });
  }
}

/**
 * RFC 9449 `htu`: the HTTP URI without query and fragment.
 *
 * @param value - Absolute request URL.
 */
export function normalizeHtu(value: string): string | null {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

/**
 * RFC 9449 `ath`: base64url(SHA-256(ASCII(access_token))).
 *
 * @param accessToken - Access token being presented.
 */
export async function hashAccessToken(accessToken: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(accessToken));
  return base64urlOf(new Uint8Array(digest));
}

function base64urlOf(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Base64url JWK SHA-256 thumbprint of a public key (`cnf.jkt`).
 *
 * @param publicJwk - Public JWK.
 */
export async function dpopThumbprint(publicJwk: JsonWebKey): Promise<string> {
  try {
    return await calculateJwkThumbprint(publicJwk, "sha256");
  } catch (error) {
    throw new SebaDPoPError("Unable to compute the DPoP key thumbprint.", { cause: error });
  }
}

function randomJti(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64urlOf(bytes);
}
