/**
 * A hand-written OpenID Provider used by the integration tests.
 *
 * It is deliberately real: every endpoint is served over HTTP on loopback, DPoP proofs are
 * signature-checked, `jti` values are single-use, PKCE is verified, and ID tokens are signed
 * with an ES256 key published in its JWKS.
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

/** Where a provider instance can be reached. */
export interface FakeProviderAddress {
  readonly issuer: string;
  readonly clientId: string;
  readonly webId: string;
  readonly redirectUri: string;
}

/** State kept for one authorization code. */
interface CodeRecord {
  readonly challenge: string;
  readonly nonce: string;
  readonly redirectUri: string;
  readonly clientId: string;
  readonly webId: string;
}

/** State kept for an issued token pair. */
interface GrantRecord {
  readonly webId: string;
  readonly jkt: string;
}

/** Options for {@link FakeProvider.start}. */
export interface FakeProviderOptions {
  /** Callback URL the test application will publish and serve. */
  readonly redirectUri: string;
}

/** A running fake OpenID Provider. */
export class FakeProvider {
  readonly address: FakeProviderAddress;
  /** Authorization URLs received, in order. */
  readonly authorizationRequests: URL[] = [];
  /** Every `jti` observed in a valid proof. */
  readonly seenJtis = new Set<string>();
  /** Whether any request reused a `jti`. */
  jtiReuseDetected = false;
  /** Number of token requests served. */
  tokenRequests = 0;
  /** Number of refresh-token grants served. */
  refreshRequests = 0;
  /** Number of resource requests served. */
  resourceRequests = 0;
  /** Number of times a flaky resource received a body. */
  flakyBodyReads = 0;
  /** Refresh tokens passed to the revocation endpoint. */
  readonly revokedTokens: string[] = [];
  /** When set, `/authorize` redirects back with this OAuth error. */
  forceAuthorizeError: string | null = null;
  /** Last error thrown while handling a request, for assertions. */
  lastFailure: string | null = null;

  readonly #server: Server;
  #idKey!: CryptoKeyPair;
  #idJwk!: JsonWebKey & { kid: string; use: string; alg: string };
  readonly #codes = new Map<string, CodeRecord>();
  readonly #accessTokens = new Map<string, GrantRecord>();
  readonly #refreshTokens = new Map<string, GrantRecord>();
  #flakyAttempts = 0;

  private constructor(server: Server, address: FakeProviderAddress) {
    this.#server = server;
    this.address = address;
  }

  /** Start a provider on an ephemeral loopback port. */
  static async start(options: FakeProviderOptions): Promise<FakeProvider> {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const port = (server.address() as { port: number }).port;
    const issuer = `http://127.0.0.1:${String(port)}`;
    const provider = new FakeProvider(server, {
      issuer,
      clientId: `${issuer}/client-id.jsonld`,
      webId: `${issuer}/profile/card#me`,
      redirectUri: options.redirectUri,
    });
    await provider.#init();
    server.on("request", (req, res) => {
      void provider.#handle(req, res).catch((error: unknown) => {
        provider.lastFailure = error instanceof Error ? error.stack ?? error.message : String(error);
        if (!res.headersSent) {
          respondJson(res, 500, { error: "server_error" });
        } else {
          res.end();
        }
      });
    });
    return provider;
  }

  /** Stop the provider. */
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
    this.#idJwk = { ...(await exportJWK(this.#idKey.publicKey)), kid: "fake-provider-key", use: "sig", alg: "ES256" };
  }

  async #handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", this.address.issuer);
    switch (url.pathname) {
      case "/.well-known/openid-configuration":
        this.#serveDiscovery(res);
        return;
      case "/jwks":
        respondJson(res, 200, { keys: [this.#idJwk] });
        return;
      case "/client-id.jsonld":
        respondJson(
          res,
          200,
          {
            "@context": ["https://www.w3.org/ns/solid/oidc-context.jsonld"],
            client_id: this.address.clientId,
            redirect_uris: [this.address.redirectUri],
            client_name: "SEBA integration test",
          },
          "application/ld+json",
        );
        return;
      case "/profile/card":
        res.writeHead(200, { "content-type": "text/turtle; charset=utf-8" });
        res.end(
          [
            "@prefix solid: <http://www.w3.org/ns/solid/terms#>.",
            "",
            `<${this.address.webId}> solid:oidcIssuer <${this.address.issuer}> .`,
            "",
          ].join("\n"),
        );
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
      case "/flaky-resource":
        await this.#serveFlakyResource(req, res);
        return;
      case "/redirect-away":
        if (await this.#resourceGrant(req, res)) {
          this.resourceRequests += 1;
          res.writeHead(302, { location: "https://example.invalid/elsewhere" });
          res.end();
        }
        return;
      case "/resource":
        await this.#serveResource(req, res);
        return;
      default:
        respondJson(res, 404, { error: "not_found" });
    }
  }

  #serveDiscovery(res: ServerResponse): void {
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
  }

  #serveAuthorize(url: URL, res: ServerResponse): void {
    this.authorizationRequests.push(url);
    const params = url.searchParams;
    const state = params.get("state");
    const redirectUri = params.get("redirect_uri");
    if (this.forceAuthorizeError !== null) {
      const location = new URL(redirectUri ?? this.address.redirectUri);
      location.searchParams.set("error", this.forceAuthorizeError);
      location.searchParams.set("error_description", "the user declined");
      location.searchParams.set("state", state ?? "");
      location.searchParams.set("iss", this.address.issuer);
      redirect(res, location.href);
      return;
    }
    if (state === null || state === "") {
      respondJson(res, 400, { error: "invalid_request", detail: "missing state" });
      return;
    }
    if (redirectUri !== this.address.redirectUri) {
      respondJson(res, 400, { error: "invalid_request", detail: "redirect_uri is not published" });
      return;
    }
    if (params.get("client_id") !== this.address.clientId) {
      respondJson(res, 400, { error: "invalid_request", detail: "unknown client_id" });
      return;
    }
    if (params.get("response_type") !== "code") {
      respondJson(res, 400, { error: "unsupported_response_type" });
      return;
    }
    const challenge = params.get("code_challenge");
    if (challenge === null || params.get("code_challenge_method") !== "S256") {
      respondJson(res, 400, { error: "invalid_request", detail: "PKCE S256 required" });
      return;
    }
    const nonce = params.get("nonce");
    if (nonce === null || nonce === "") {
      respondJson(res, 400, { error: "invalid_request", detail: "missing nonce" });
      return;
    }
    const scope = params.get("scope") ?? "";
    if (!scope.split(" ").includes("openid")) {
      respondJson(res, 400, { error: "invalid_scope" });
      return;
    }

    const code = randomUUID();
    this.#codes.set(code, {
      challenge,
      nonce,
      redirectUri,
      clientId: this.address.clientId,
      webId: this.address.webId,
    });
    const location = new URL(redirectUri);
    location.searchParams.set("code", code);
    location.searchParams.set("state", state);
    location.searchParams.set("iss", this.address.issuer);
    redirect(res, location.href);
  }

  async #serveToken(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "POST") {
      respondJson(res, 405, { error: "invalid_request" });
      return;
    }
    this.tokenRequests += 1;
    const proof = await this.#verifyProof(req, "POST", `${this.address.issuer}/token`);
    if (proof === null) {
      respondJson(res, 400, { error: "invalid_dpop_proof" });
      return;
    }
    const form = new URLSearchParams(await readBody(req));
    const grantType = form.get("grant_type");

    if (grantType === "authorization_code") {
      const code = form.get("code") ?? "";
      const record = this.#codes.get(code);
      if (record === undefined) {
        respondJson(res, 400, { error: "invalid_grant" });
        return;
      }
      this.#codes.delete(code);
      if (form.get("client_id") !== record.clientId || form.get("redirect_uri") !== record.redirectUri) {
        respondJson(res, 400, { error: "invalid_grant" });
        return;
      }
      if (
        record.challenge !==
        base64url.encode(
          new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(form.get("code_verifier") ?? ""))),
        )
      ) {
        respondJson(res, 400, { error: "invalid_grant", error_description: "PKCE verification failed" });
        return;
      }
      const tokens = await this.#issueTokens(record.webId, proof, record.nonce);
      respondJson(res, 200, tokens);
      return;
    }

    if (grantType === "refresh_token") {
      this.refreshRequests += 1;
      const grant = this.#refreshTokens.get(form.get("refresh_token") ?? "");
      if (grant === undefined) {
        respondJson(res, 400, { error: "invalid_grant" });
        return;
      }
      this.#refreshTokens.delete(form.get("refresh_token") ?? "");
      if (grant.jkt !== proof) {
        respondJson(res, 400, { error: "invalid_grant", error_description: "DPoP key mismatch" });
        return;
      }
      const tokens = await this.#issueTokens(grant.webId, proof, null);
      respondJson(res, 200, tokens);
      return;
    }

    respondJson(res, 400, { error: "unsupported_grant_type" });
  }

  async #serveResource(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!(await this.#resourceGrant(req, res))) {
      return;
    }
    this.resourceRequests += 1;
    respondJson(res, 200, {
      ok: true,
      method: req.method,
      path: new URL(req.url ?? "/", this.address.issuer).pathname,
    });
  }

  async #serveFlakyResource(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.#flakyAttempts += 1;
    this.flakyBodyReads += 1;
    await readBody(req);
    if (!(await this.#resourceGrant(req, res))) {
      return;
    }
    // Always reject: the caller must not resend a streamed body.
    respondJson(res, 401, { error: "invalid_token", attempts: this.#flakyAttempts });
  }

  /** Validate the DPoP proof and access token of a resource request. */
  async #resourceGrant(req: IncomingMessage, res: ServerResponse): Promise<string | null> {
    const authorization = req.headers.authorization;
    if (typeof authorization !== "string" || !authorization.startsWith("DPoP ")) {
      respondJson(res, 401, { error: "invalid_token" });
      return null;
    }
    const accessToken = authorization.slice("DPoP ".length);
    const grant = this.#accessTokens.get(accessToken);
    if (grant === undefined) {
      respondJson(res, 401, { error: "invalid_token" });
      return null;
    }
    const proofUrl = `${this.address.issuer}${new URL(req.url ?? "/", this.address.issuer).pathname}`;
    const proof = await this.#verifyProof(req, req.method ?? "GET", proofUrl, await hashAccessToken(accessToken));
    if (proof === null || proof !== grant.jkt) {
      respondJson(res, 401, { error: "invalid_dpop_proof" });
      return null;
    }
    return proof;
  }

  async #serveRevoke(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "POST") {
      respondJson(res, 405, { error: "invalid_request" });
      return;
    }
    const form = new URLSearchParams(await readBody(req));
    const token = form.get("token");
    if (token !== null) {
      this.revokedTokens.push(token);
      this.#refreshTokens.delete(token);
    }
    res.writeHead(200, { "cache-control": "no-store" });
    res.end();
  }

  /**
   * Verify a DPoP proof.
   *
   * @returns The JWK thumbprint of the proof key, or `null` when invalid (a response has
   *   already been sent in that case).
   */
  async #verifyProof(
    req: IncomingMessage,
    method: string,
    expectedHtu: string,
    expectedAth?: string,
  ): Promise<string | null> {
    const raw = req.headers.dpop;
    if (typeof raw !== "string" || raw === "") {
      return null;
    }
    try {
      const header = decodeProtectedHeader(raw);
      if (header.typ !== "dpop+jwt" || header.alg !== "ES256" || header.jwk === undefined) {
        return null;
      }
      const key = await importJWK(header.jwk, "ES256");
      const { payload } = await jwtVerify(raw, key);
      const jti = payload["jti"];
      if (typeof jti !== "string" || jti === "") {
        return null;
      }
      if (this.seenJtis.has(jti)) {
        this.jtiReuseDetected = true;
        return null;
      }
      this.seenJtis.add(jti);
      if (payload["htm"] !== method) {
        return null;
      }
      if (payload["htu"] !== expectedHtu) {
        return null;
      }
      if (expectedAth !== undefined && payload["ath"] !== expectedAth) {
        return null;
      }
      if (expectedAth === undefined && payload["ath"] !== undefined) {
        return null;
      }
      return await calculateJwkThumbprint(header.jwk);
    } catch {
      return null;
    }
  }

  async #issueTokens(webId: string, jkt: string, nonce: string | null): Promise<Record<string, unknown>> {
    const accessToken = `at-${randomUUID()}`;
    const refreshToken = `rt-${randomUUID()}`;
    this.#accessTokens.set(accessToken, { webId, jkt });
    this.#refreshTokens.set(refreshToken, { webId, jkt });

    const payload: Record<string, unknown> = {
      webid: webId,
      cnf: { jkt },
      aud: [this.address.clientId, "solid"],
      azp: this.address.clientId,
    };
    if (nonce !== null) {
      payload["nonce"] = nonce;
    }
    const idToken = await new SignJWT(payload)
      .setProtectedHeader({ alg: "ES256", typ: "JWT", kid: "fake-provider-key" })
      .setIssuer(this.address.issuer)
      .setSubject(webId)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(this.#idKey.privateKey);

    return {
      access_token: accessToken,
      token_type: "DPoP",
      id_token: idToken,
      refresh_token: refreshToken,
      expires_in: 300,
      scope: "openid webid offline_access",
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
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString("utf8");
}
