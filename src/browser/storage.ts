/**
 * Browser storage: IndexedDB for the session, `sessionStorage` for the short-lived
 * authorization transaction.
 *
 * IndexedDB is used for the session because it can store a non-extractable `CryptoKey`
 * through structured clone; `sessionStorage` is used for the PKCE verifier so it dies
 * with the tab and is never shared between tabs.
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { SebaAuthError, SebaConfigError } from "../core/errors.js";
import type {
  PendingAuthorization,
  PendingAuthorizationStore,
  PersistedSession,
  SessionStorageAdapter,
} from "../types.js";

/** IndexedDB database name. */
export const DB_NAME = "seba";

/** Object store holding exactly one session record. */
export const STORE_NAME = "session";

/** Key of the single session record. */
export const SESSION_KEY = "current";

/** `sessionStorage` key for the pending authorization transaction. */
export const PENDING_AUTH_KEY = "seba.pending-authorization";

/** Maximum age of an authorization transaction (10 minutes). */
export const PENDING_AUTH_TTL_MS = 10 * 60 * 1000;

interface SebaDB extends DBSchema {
  session: { key: string; value: PersistedSession };
}

let database: Promise<IDBPDatabase<SebaDB>> | null = null;

function open(): Promise<IDBPDatabase<SebaDB>> {
  if (typeof indexedDB === "undefined") {
    throw new SebaConfigError(
      "IndexedDB is not available in this environment. Use storage: \"memory\" or run in a browser.",
    );
  }
  database ??= openDB<SebaDB>(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
  return database;
}

/**
 * Create the IndexedDB-backed session store.
 *
 * Only {@link PersistedSession} is written; access tokens never reach this code.
 */
export function createIndexedDbStorage(): SessionStorageAdapter {
  return {
    async save(session) {
      const db = await open();
      await db.put(STORE_NAME, structuredClone(session), SESSION_KEY);
    },
    async load() {
      const db = await open();
      const value = await db.get(STORE_NAME, SESSION_KEY);
      return value ?? null;
    },
    async clear() {
      const db = await open();
      await db.delete(STORE_NAME, SESSION_KEY);
    },
  };
}

/**
 * Create the `sessionStorage`-backed authorization transaction store.
 *
 * Expired transactions are discarded on read instead of being resumed.
 */
export function createSessionStoragePendingAuthStore(): PendingAuthorizationStore {
  return {
    async save(pending) {
      const storage = sessionStorageOrThrow();
      storage.setItem(PENDING_AUTH_KEY, JSON.stringify(pending));
    },
    async load() {
      const storage = sessionStorageOrThrow();
      const raw = storage.getItem(PENDING_AUTH_KEY);
      if (raw === null) {
        return null;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        storage.removeItem(PENDING_AUTH_KEY);
        return null;
      }
      if (!isPendingAuthorization(parsed)) {
        storage.removeItem(PENDING_AUTH_KEY);
        return null;
      }
      if (Date.now() - parsed.createdAt > PENDING_AUTH_TTL_MS) {
        storage.removeItem(PENDING_AUTH_KEY);
        throw new SebaAuthError(
          "The pending login expired after 10 minutes. Start the login again from the application.",
        );
      }
      return parsed;
    },
    async clear() {
      sessionStorageOrThrow().removeItem(PENDING_AUTH_KEY);
    },
  };
}

function sessionStorageOrThrow(): Storage {
  try {
    if (typeof sessionStorage === "undefined") {
      throw new Error("sessionStorage is undefined");
    }
    return sessionStorage;
  } catch (error) {
    throw new SebaConfigError(
      "sessionStorage is unavailable, so an interactive login cannot be started safely.",
      { cause: error },
    );
  }
}

function isPendingAuthorization(value: unknown): value is PendingAuthorization {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record["state"] === "string" &&
    typeof record["codeVerifier"] === "string" &&
    typeof record["nonce"] === "string" &&
    typeof record["issuer"] === "string" &&
    typeof record["clientId"] === "string" &&
    typeof record["redirectUri"] === "string" &&
    typeof record["createdAt"] === "number"
  );
}
