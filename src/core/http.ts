/**
 * Internal HTTP helpers shared by discovery, token and revocation requests.
 *
 * This module owns the single implementation of "make a request, turn transport
 * failures into `SebaNetworkError`, and decode a JSON body safely". It never adds
 * credentials: callers attach `Authorization`/`DPoP` themselves.
 */

import { SebaDiscoveryError, SebaError, SebaNetworkError } from "./errors.js";

/** Default timeout for provider and resource requests, in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 10_000;

/** Request options accepted by {@link httpFetch}. */
export interface HttpOptions {
  /** `fetch` implementation supplied by the runtime platform. */
  readonly fetchImpl: typeof fetch;
  /** Abort the request after this many milliseconds. Defaults to 10 seconds. */
  readonly timeoutMs?: number;
  /** Caller cancellation signal, if any. */
  readonly signal?: AbortSignal | null;
}

/** JSON content types accepted from SEBA providers. */
export const JSON_ACCEPT = "application/json";

/**
 * Perform a single attempt of an HTTP request.
 *
 * Transport failures (offline, DNS, TLS, connection reset, unsupported scheme) become
 * {@link SebaNetworkError}; HTTP status handling is left to the caller because a 400 is
 * meaningful to a token endpoint and meaningless to a JWKS fetch.
 *
 * @param url - Absolute request URL.
 * @param init - Standard fetch options; `signal` is replaced with an internal one.
 * @param options - Runtime fetch implementation and timeout.
 */
export async function httpFetch(url: string | URL, init: RequestInit, options: HttpOptions): Promise<Response> {
  const target = typeof url === "string" ? url : url.href;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;
  const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const external = options.signal ?? null;
  const onAbort = (): void => {
    controller.abort();
  };
  if (external !== null) {
    if (external.aborted) {
      clearTimeout(timer);
      throw new SebaNetworkError(`The request to ${describeUrl(target)} was aborted before it started.`, {
        cause: external.reason,
      });
    }
    external.addEventListener("abort", onAbort, { once: true });
  }

  try {
    return await options.fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (external?.aborted === true) {
      throw new SebaNetworkError(`The request to ${describeUrl(target)} was aborted.`, { cause: error });
    }
    const reason = timedOut ? `did not complete within ${String(timeoutMs)} ms` : "could not be completed";
    const hint =
      typeof window !== "undefined" && typeof document !== "undefined"
        ? "In a browser the most common cause is CORS: the server at this URL must send an " +
          "Access-Control-Allow-Origin header covering this app's origin — resource servers " +
          "(Pods) normally do, but custom endpoints or a mismatched URL may not."
        : "Check any proxy configuration for the Node.js process.";
    throw new SebaNetworkError(
      `Network request to ${describeUrl(target)} ${reason}. ` +
        `Check the network connection and the URL. ${hint}`,
      { cause: error },
    );
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onAbort);
  }
}

/**
 * Parse a JSON response body.
 *
 * @param text - Raw response body.
 * @param context - Human-readable description used in the error message.
 * @param createError - Error constructor for the calling module (`SebaDiscoveryError`,
 *   `SebaAuthError`, …) so the failure carries the right code.
 */
export function parseJson<T>(
  text: string,
  context: string,
  createError: (message: string) => SebaError = (message) => new SebaDiscoveryError(message),
): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw createError(`${context} is not valid JSON. The provider returned a non-JSON response body.`) as never;
  }
}

/**
 * Read a response body as text, mapping a broken stream to a network error.
 *
 * @param response - Response whose body should be read.
 * @param context - Human-readable description used in the error message.
 */
export async function readText(response: Response, context: string): Promise<string> {
  try {
    return await response.text();
  } catch (error) {
    throw new SebaNetworkError(`Unable to read the ${context} response body.`, { cause: error });
  }
}

/**
 * Check whether a response is a successful HTTP status.
 *
 * @param response - Response to inspect.
 */
export function isOk(response: Response): boolean {
  return response.status >= 200 && response.status < 300;
}

/**
 * Strip query and fragment from a URL for safe inclusion in error messages and logs.
 *
 * @param value - Absolute URL, possibly unparseable.
 */
export function describeUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "the configured URL";
  }
}

/**
 * Join `fetch`-style input into a string URL without losing the base for `URL` objects.
 *
 * @param input - Request or string/URL input.
 */
export function inputToString(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}
