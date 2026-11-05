/**
 * Node.js platform: a temporary loopback HTTP server captures the authorization response.
 *
 * The server binds only the loopback interface from the configured redirect URI, accepts a
 * single matching `GET`, and shuts down as soon as the response is delivered.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isLoopbackHost } from "../core/discovery.js";
import { SebaAuthError, SebaConfigError, SebaNoUIError } from "../core/errors.js";
import { memoryPendingAuthStore, memorySessionStorage } from "../core/storage.js";
import type { InteractiveLoginRequest, Platform, SessionStorageAdapter, StorageKind } from "../types.js";

/** How long an interactive login may wait for the browser (5 minutes). */
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

const SUCCESS_HTML = [
  "<!doctype html>",
  '<html lang="en"><head><meta charset="utf-8"><title>Signed in</title></head>',
  '<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">',
  "<h1>Signed in</h1>",
  "<p>You can close this window and return to the terminal.</p>",
  "</body></html>",
].join("");

const FAILURE_HTML = [
  "<!doctype html>",
  '<html lang="en"><head><meta charset="utf-8"><title>Sign-in failed</title></head>',
  '<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">',
  "<h1>Sign-in could not be completed</h1>",
  "<p>Return to the terminal for details and start the login again.</p>",
  "</body></html>",
].join("");

/**
 * Create the platform used by `Seba` in Node.js.
 *
 * Sessions are stored in process memory; IndexedDB is rejected with a configuration error
 * so a missing browser API never turns into a silent login failure.
 */
export function createNodePlatform(): Platform {
  return {
    kind: "node",
    defaultStorage: "memory",
    fetch: (input, init) => globalThis.fetch(input, init),
    currentUrl: () => null,
    pendingAuth: memoryPendingAuthStore(),
    createStorage(kind: StorageKind): SessionStorageAdapter {
      if (kind === "indexeddb") {
        throw new SebaConfigError(
          'IndexedDB is not available in Node.js. Remove storage or use storage: "memory".',
        );
      }
      return memorySessionStorage();
    },
    beginInteractiveLogin: startLoopbackCallbackServer,
  } satisfies Platform;
}

/**
 * Listen on the loopback interface, open the authorization URL, and resolve with the
 * callback URL once the provider redirects back.
 *
 * @param request - Authorization URL, redirect URI and expected state.
 * @throws {@link SebaNoUIError} when no `openAuthorizationUrl` hook was configured.
 * @throws {@link SebaConfigError} when the redirect URI cannot be served locally.
 * @throws {@link SebaAuthError} when no valid callback arrives within five minutes.
 */
export async function startLoopbackCallbackServer(request: InteractiveLoginRequest): Promise<URL> {
  if (request.openAuthorizationUrl === undefined) {
    throw new SebaNoUIError(
      "Node.js cannot open a browser by itself. Pass openAuthorizationUrl in the Seba config, " +
        "for example a function that prints the URL or calls the platform's browser opener.",
    );
  }

  let target: URL;
  try {
    target = new URL(request.redirectUri);
  } catch {
    throw new SebaConfigError(`The redirectUri "${request.redirectUri}" is not an absolute URL.`);
  }
  if (target.protocol !== "http:") {
    throw new SebaConfigError(
      `Node.js serves the login callback over plain http on loopback, but the redirectUri uses "${target.protocol}". ` +
        'Configure something like "http://127.0.0.1:3000/auth/callback" and publish it in the Client ID Document.',
    );
  }
  if (!isLoopbackHost(target.hostname)) {
    throw new SebaConfigError(
      `The redirectUri "${request.redirectUri}" does not point at a loopback host. ` +
        "SEBA only listens on 127.0.0.1, ::1 or localhost.",
    );
  }

  const hostname = target.hostname.replace(/^\[|\]$/g, "");
  const port = target.port === "" ? 80 : Number(target.port);
  const callbackPath = target.pathname;

  return new Promise<URL>((resolve, reject) => {
    let settled = false;
    const server = createServer();
    const timer = setTimeout(() => {
      finish(
        new SebaAuthError(
          "The interactive login timed out after five minutes without a callback. Start the login again.",
        ),
      );
    }, LOGIN_TIMEOUT_MS);
    timer.unref();

    server.on("request", (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", "http://placeholder");
      if (req.method !== "GET" || url.pathname !== callbackPath) {
        respond(res, 404, FAILURE_HTML);
        return;
      }
      if (url.searchParams.get("state") !== request.state) {
        respond(res, 400, FAILURE_HTML);
        return;
      }
      const hasResponse = url.searchParams.has("code") || url.searchParams.has("error");
      if (!hasResponse) {
        respond(res, 400, FAILURE_HTML);
        return;
      }
      respond(res, 200, SUCCESS_HTML);
      const callback = new URL(`${callbackPath}${url.search}`, target.origin);
      finish(null, callback);
    });

    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        finish(
          new SebaConfigError(
            `Port ${String(port)} on ${hostname} is already in use, so the login callback cannot be received. ` +
              "Choose a different port in redirectUri and in the Client ID Document.",
            { cause: error },
          ),
        );
        return;
      }
      finish(
        new SebaConfigError(`The loopback callback server could not start: ${error.message}`, {
          cause: error,
        }),
      );
    });

    server.listen(port, hostname, () => {
      Promise.resolve()
        .then(() => request.openAuthorizationUrl?.(request.authorizationUrl))
        .catch((error: unknown) => {
          finish(
            new SebaAuthError("openAuthorizationUrl failed, so the login could not be started.", {
              cause: error,
            }),
          );
        });
    });

    function finish(error: SebaAuthError | SebaConfigError | null, callback?: URL): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      server.closeAllConnections();
      // Settle only once the listening socket is closed, so the port is free for the next
      // login and no request can be delivered to this server after the promise resolves.
      server.close(() => {
        if (error !== null) {
          reject(error);
          return;
        }
        if (callback === undefined) {
          reject(new SebaAuthError("The loopback server finished without a callback URL."));
          return;
        }
        resolve(callback);
      });
    }
  });
}

function respond(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    "referrer-policy": "no-referrer",
    connection: "close",
  });
  res.end(html);
}
