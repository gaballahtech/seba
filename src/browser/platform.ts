/**
 * Browser platform: navigation-based login, IDB session storage, `sessionStorage`
 * authorization state.
 */

import { SebaConfigError } from "../core/errors.js";
import { memorySessionStorage } from "../core/storage.js";
import type { InteractiveLoginRequest, LoginOptions, Platform, StorageKind, SessionStorageAdapter } from "../types.js";
import { askForIdentity } from "./provider-modal.js";
import { createIndexedDbStorage, createSessionStoragePendingAuthStore } from "./storage.js";

/** Query parameters produced by an authorization response. */
const CALLBACK_PARAMS = ["code", "state", "iss", "error", "error_description", "error_uri", "session_state"];

/** How long a browser waits for navigation before reporting that it did not happen. */
const NAVIGATION_GRACE_MS = 1_500;

/**
 * Create the platform used by `Seba` in browsers.
 *
 * @throws {@link SebaConfigError} when no browser `window`/`document` exists.
 */
export function createBrowserPlatform(): Platform {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new SebaConfigError(
      "The browser entry point requires a DOM. Import \"seba\" in a browser or \"seba/node\" in Node.js.",
    );
  }

  return {
    kind: "browser",
    defaultStorage: "indexeddb",
    fetch: (input, init) => globalThis.fetch(input, init),
    currentUrl: () => new URL(window.location.href),
    pendingAuth: createSessionStoragePendingAuthStore(),
    selectIdentity: () => askForIdentity(),
    createStorage(kind: StorageKind): SessionStorageAdapter {
      if (kind === "memory") {
        return memorySessionStorage();
      }
      return createIndexedDbStorage();
    },
    async beginInteractiveLogin(request: InteractiveLoginRequest): Promise<URL> {
      const target = new URL(request.redirectUri);
      const before = window.location.href;
      window.location.assign(request.authorizationUrl);

      return new Promise<URL>((_resolve, reject) => {
        if (before.startsWith(target.origin) && window.location.href !== before) {
          // Navigation already happened; the page is unloading.
          return;
        }
        window.setTimeout(() => {
          reject(
            new SebaConfigError(
              "The browser did not navigate to the identity provider. " +
                "A popup blocker or a sandboxed iframe can prevent navigation; open the page in a top-level tab.",
            ),
          );
        }, NAVIGATION_GRACE_MS);
      });
    },
    clearCallback(): void {
      const url = new URL(window.location.href);
      for (const name of CALLBACK_PARAMS) {
        url.searchParams.delete(name);
      }
      const query = url.searchParams.toString();
      window.history.replaceState(
        {},
        document.title,
        `${url.pathname}${query === "" ? "" : `?${query}`}${url.hash}`,
      );
    },
  } satisfies Platform;
}

/** Re-exported for {@link Seba} type inference in browser-only builds. */
export type { LoginOptions };
