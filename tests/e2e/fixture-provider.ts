/**
 * E2E fixture OpenID Provider (loopback). Extends the integration fake-provider
 * pattern with nonce challenges, short-lived tokens, invalid ID-token signing,
 * and a controllable cross-origin redirect target.
 *
 * Real server behavior (no mocks of token exchange/proof verification).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import {
  SignJWT,
  base64url,
  calculateJwkThumbprint,
  decodeProtectedHeader,
  exportJWK,
  generateKeyPair,
  importJWK,
  jwtVerify,
} from "jose";
import { hashAccessToken } from "../../src/core/dpop.js";

export interface FixtureAddress {
  readonly issuer: string;
  readonly clientId: string;
  readonly webId: string;
  readonly redirectUri: string;
}

interface CodeRecord {
  readonly challenge: string;
  readonly nonce: string;
  readonly redirectUri: string;
  readonly clientId: string;
  readonly webId: string;
}

interface GrantRecord {
  readonly webId: string;
  readonly jkt: string;
  expired?: boolean;
}

export interface CapturedRequest {
  readonly authorization?: string;
  readonly dpop?: string;
  readonly method: string;
  readonly url: string;
}

export class E2EFixtureProvider {
  readonly address: FixtureAddress;
  authorizationRequests: URL[] = [];
  seenJtis = new Set<string>();
  jtiReuseDetected = false;
  tokenRequests = 0;
  refreshRequests = 0;
  resourceRequests = 0;
  revokedTokens: string[] = [];
  /** When true, the next token endpoint request gets a use_dpop_nonce challenge once. */
  requireTokenNonceOnce = false;
  /** When true, resource requests get a use_dpop_nonce challenge once per session flow. */
  requireResourceNonceOnce = false;
  #tokenNonceIssued = false;
  #resourceNonceIssued = false;
  #expectedNonce = "fixture-nonce-1";
  /** When true, issue tokens that the client will treat as expired quickly. */
  issueShortLivedTokens = false;
  /** When true, sign ID tokens with a key not in JWKS (invalid signature). */
  signIdTokenWithWrongKey = false;
  /** Mark access tokens as expired server-side after first successful resource use. */
  expireAccessTokenAfterFirstResourceUse = false;
  #expiredAfterUse = new Set<string>();
  lastFailure: string | null = null;

  readonly #server: Server;
  #idKey!: CryptoKeyPair;
  #wrongKey!: CryptoKeyPair;
  #idJwk!: JsonWebKey & { kid: string; use: string; alg: string };
  readonly #codes = new Map<string, CodeRecord>();
  readonly #accessTokens = new Map<string, GrantRecord>();
  readonly #refreshTokens = new Map<string, GrantRecord>();

  private constructor(server: Server, address: FixtureAddress) {
    this.#server = server;
    this.address = address;
  }

  static async start(options: { redirectUri: string }): Promise<E2EFixtureProvider> {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const port = (server.address() as { port: number }).port;
    const issuer = `http://127.0.0.1:${String(port)}`;
    const provider = new E2EFixtureProvider(server, {
      issuer,
      clientId: `${issuer}/client-id.jsonld`,
      webId: `${issuer}/profile/card#me`,
      redirectUri: options.redirectUri,
    });
    await provider.#init();
    server.on("request", (req, res) => {
      void provider.#handle(req, res).catch((error: unknown) => {
        provider.lastFailure = error instanceof Error ? error.stack ?? error.message : String(error);
        if (!res.headersSent) respondJson(res, 500, { error: "server_error" });
        else res.end();
      });
    });
    return provider;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.#server.close(() => {
        this.#server.closeAllConnections();
        resolve();
      });
    });
  }

  async #init(): Promise<void> {
    this.#idKey = await generateKeyPair("ES256", { extractable: true });
    this.#wrongKey = await generateKeyPair("ES256", { extractable: true });
    this.#idJwk = { ...(await exportJWK(this.#idKey.publicKey)), kid: "fixture-key", use: "sig", alg: "ES256" };
  }

  async #handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", this.address.issuer);
    switch (url.pathname) {
      case "/.well-known/openid-configuration":
        respondJson(res, 200, {
          issuer: this.address.issuer,
          authorization_endpoint: `${this.address.issuer}/authorize`,
          token_endpoint: `${this.address.issuer}/token`,
          jwks_uri: `${this.address.issuer}/jwks`,
          revocation_endpoint: `${this.address.issuer}/revoke`,
          response_types_supported: ["code"],
          response_modes_supported: ["query"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          scopes_supported: ["openid", "webid", "offline_access"],
          dpop_signing_alg_values_supported: ["ES256"],
          code_challenge_methods_supported: ["S256"],
          id_token_signing_alg_values_supported: ["ES256"],
        });
        return;
      case "/jwks":
        respondJson(res, 200, { keys: [this.#idJwk] });
        return;
      case "/client-id.jsonld":
        respondJson(res, 200, {
          "@context": ["https://www.w3.org/ns/solid/oidc-context.jsonld"],
          client_id: this.address.clientId,
          redirect_uris: [this.address.redirectUri],
          client_name: "SEBA e2e fixture",
        }, "application/ld+json");
        return;
      case "/profile/card":
        res.writeHead(200, { "content-type": "text/turtle; charset=utf-8" });
        res.end(`@prefix solid: <http://www.w3.org/ns/solid/terms#>.\n<${this.address.webId}> solid:oidcIssuer <${this.address.issuer}> .\n`);
        return;
      case "/authorize":
        this.#serveAuthorize(url, res);
        return;
      case "/token":
        await this.#serveToken(req, res);
        return;
      case "/revoke":
        await this.#serveRevoke(req, res);
        return;
      case "/resource":
        await this.#serveResource(req, res);
        return;
      case "/redirect-cross-origin": {
        if (await this.#resourceGrant(req, res)) {
          this.resourceRequests += 1;
          const target = url.searchParams.get("to");
          res.writeHead(302, { location: target ?? "https://example.invalid/elsewhere", "cache-control": "no-store" });
          res.end();
        }
        return;
      }
      default:
        respondJson(res, 404, { error: "not_found" });
    }
  }

  #serveAuthorize(url: URL, res: ServerResponse): void {
    this.authorizationRequests.push(url);
    const params = url.searchParams;
    const state = params.get("state");
    const redirectUri = params.get("redirect_uri");
    if (state === null || redirectUri !== this.address.redirectUri || params.get("client_id") !== this.address.clientId) {
      respondJson(res, 400, { error: "invalid_request" });
      return;
    }
    const challenge = params.get("code_challenge");
    const nonce = params.get("nonce");
    if (challenge === null || params.get("code_challenge_method") !== "S256" || nonce === null) {
      respondJson(res, 400, { error: "invalid_request" });
      return;
    }
    const code = randomUUID();
    this.#codes.set(code, { challenge, nonce, redirectUri, clientId: this.address.clientId, webId: this.address.webId });
    const location = new URL(redirectUri);
    location.searchParams.set("code", code);
    location.searchParams.set("state", state);
    location.searchParams.set("iss", this.address.issuer);
    redirect(res, location.href);
  }

  async #serveToken(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "POST") { respondJson(res, 405, { error: "invalid_request" }); return; }
    this.tokenRequests += 1;
    const proofNonce = this.#dpopNonceHeader(req);
    if (this.requireTokenNonceOnce && !this.#tokenNonceIssued) {
      this.#tokenNonceIssued = true;
      res.writeHead(400, { "content-type": "application/json; charset=utf-8", "dpop-nonce": this.#expectedNonce, "cache-control": "no-store" });
      res.end(JSON.stringify({ error: "use_dpop_nonce" }));
      return;
    }
    if (this.requireTokenNonceOnce && proofNonce !== this.#expectedNonce) {
      respondJson(res, 400, { error: "invalid_dpop_proof" });
      return;
    }
    const proof = await this.#verifyProof(req, "POST", `${this.address.issuer}/token`, undefined, this.requireTokenNonceOnce ? this.#expectedNonce : undefined);
    if (proof === null) { respondJson(res, 400, { error: "invalid_dpop_proof" }); return; }
    const form = new URLSearchParams(await readBody(req));
    const grantType = form.get("grant_type");
    if (grantType === "authorization_code") {
      const code = form.get("code") ?? "";
      const record = this.#codes.get(code);
      if (record === undefined) { respondJson(res, 400, { error: "invalid_grant" }); return; }
      this.#codes.delete(code);
      if (record.challenge !== base64url.encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(form.get("code_verifier") ?? ""))))) {
        respondJson(res, 400, { error: "invalid_grant" }); return;
      }
      respondJson(res, 200, await this.#issueTokens(record.webId, proof, record.nonce));
      return;
    }
    if (grantType === "refresh_token") {
      this.refreshRequests += 1;
      const grant = this.#refreshTokens.get(form.get("refresh_token") ?? "");
      if (grant === undefined) { respondJson(res, 400, { error: "invalid_grant" }); return; }
      this.#refreshTokens.delete(form.get("refresh_token") ?? "");
      if (grant.jkt !== proof) { respondJson(res, 400, { error: "invalid_grant" }); return; }
      respondJson(res, 200, await this.#issueTokens(grant.webId, proof, null));
      return;
    }
    respondJson(res, 400, { error: "unsupported_grant_type" });
  }

  async #serveResource(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (this.requireResourceNonceOnce && !this.#resourceNonceIssued) {
      this.#resourceNonceIssued = true;
      res.writeHead(401, { "content-type": "application/json; charset=utf-8", "dpop-nonce": this.#expectedNonce, "www-authenticate": 'DPoP error="use_dpop_nonce"', "cache-control": "no-store" });
      res.end(JSON.stringify({ error: "use_dpop_nonce" }));
      return;
    }
    if (!(await this.#resourceGrant(req, res, this.requireResourceNonceOnce ? this.#expectedNonce : undefined))) return;
    this.resourceRequests += 1;
    respondJson(res, 200, { ok: true, method: req.method, path: new URL(req.url ?? "/", this.address.issuer).pathname });
  }

  async #resourceGrant(req: IncomingMessage, res: ServerResponse, expectedNonce?: string): Promise<string | null> {
    const authorization = req.headers.authorization;
    if (typeof authorization !== "string" || !authorization.startsWith("DPoP ")) { respondJson(res, 401, { error: "invalid_token" }); return null; }
    const accessToken = authorization.slice("DPoP ".length);
    const grant = this.#accessTokens.get(accessToken);
    if (grant === undefined || grant.expired || this.#expiredAfterUse.has(accessToken)) {
      respondJson(res, 401, { error: "invalid_token" }); return null;
    }
    const proofUrl = `${this.address.issuer}${new URL(req.url ?? "/", this.address.issuer).pathname}`;
    const proof = await this.#verifyProof(req, req.method ?? "GET", proofUrl, await hashAccessToken(accessToken), expectedNonce);
    if (proof === null || proof !== grant.jkt) { respondJson(res, 401, { error: "invalid_dpop_proof" }); return null; }
    if (this.expireAccessTokenAfterFirstResourceUse) this.#expiredAfterUse.add(accessToken);
    return proof;
  }

  async #serveRevoke(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "POST") { respondJson(res, 405, { error: "invalid_request" }); return; }
    const form = new URLSearchParams(await readBody(req));
    const token = form.get("token");
    if (token !== null) { this.revokedTokens.push(token); this.#refreshTokens.delete(token); }
    res.writeHead(200, { "cache-control": "no-store" });
    res.end();
  }

  #dpopNonceHeader(req: IncomingMessage): string | undefined {
    const raw = req.headers.dpop;
    if (typeof raw !== "string") return undefined;
    try {
      const [, payloadB64] = raw.split(".");
      if (!payloadB64) return undefined;
      const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Record<string, unknown>;
      return typeof payload["nonce"] === "string" ? payload["nonce"] : undefined;
    } catch { return undefined; }
  }

  async #verifyProof(req: IncomingMessage, method: string, expectedHtu: string, expectedAth?: string, expectedNonce?: string): Promise<string | null> {
    const raw = req.headers.dpop;
    if (typeof raw !== "string" || raw === "") return null;
    try {
      const header = decodeProtectedHeader(raw);
      if (header.typ !== "dpop+jwt" || header.alg !== "ES256" || header.jwk === undefined) return null;
      const key = await importJWK(header.jwk, "ES256");
      const { payload } = await jwtVerify(raw, key);
      const jti = payload["jti"];
      if (typeof jti !== "string" || jti === "") return null;
      if (this.seenJtis.has(jti)) { this.jtiReuseDetected = true; return null; }
      this.seenJtis.add(jti);
      if (payload["htm"] !== method || payload["htu"] !== expectedHtu) return null;
      if (expectedAth !== undefined && payload["ath"] !== expectedAth) return null;
      if (expectedNonce !== undefined && payload["nonce"] !== expectedNonce) return null;
      return await calculateJwkThumbprint(header.jwk);
    } catch { return null; }
  }

  async #issueTokens(webId: string, jkt: string, nonce: string | null): Promise<Record<string, unknown>> {
    const accessToken = `at-${randomUUID()}`;
    const refreshToken = `rt-${randomUUID()}`;
    this.#accessTokens.set(accessToken, { webId, jkt });
    this.#refreshTokens.set(refreshToken, { webId, jkt });
    const payload: Record<string, unknown> = {
      webid: webId, cnf: { jkt }, aud: [this.address.clientId, "solid"], azp: this.address.clientId,
    };
    if (nonce !== null) payload["nonce"] = nonce;
    const signer = this.signIdTokenWithWrongKey ? this.#wrongKey.privateKey : this.#idKey.privateKey;
    const idToken = await new SignJWT(payload)
      .setProtectedHeader({ alg: "ES256", typ: "JWT", kid: "fixture-key" })
      .setIssuer(this.address.issuer).setSubject(webId).setIssuedAt()
      .setExpirationTime(this.issueShortLivedTokens ? "5s" : "5m")
      .sign(signer);
    return {
      access_token: accessToken, token_type: "DPoP", id_token: idToken, refresh_token: refreshToken,
      expires_in: this.issueShortLivedTokens ? 1 : 300, scope: "openid webid offline_access",
    };
  }
}

function respondJson(res: ServerResponse, status: number, body: unknown, contentType = "application/json"): void {
  res.writeHead(status, { "content-type": `${contentType}; charset=utf-8`, "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { location, "cache-control": "no-store" });
  res.end();
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  return Buffer.concat(chunks).toString("utf8");
}

/** A tiny HTTP server on another loopback origin to capture cross-origin redirects. */
export async function startCaptureServer(): Promise<{
  origin: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}> {
  const requests: CapturedRequest[] = [];
  const server = createServer((req, res) => {
    const headers = req.headers;
    requests.push({
      method: req.method ?? "GET",
      url: req.url ?? "/",
      ...(typeof headers.authorization === "string" ? { authorization: headers.authorization } : {}),
      ...(typeof headers.dpop === "string" ? { dpop: headers.dpop } : {}),
    });
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as { port: number }).port;
  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => { server.closeAllConnections(); resolve(); })),
  };
}
