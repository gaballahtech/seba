/**
 * In-memory storage backends.
 *
 * Used by Node.js by default and by every test that does not need IndexedDB. They hold
 * data only for the lifetime of the objects, exactly like a browser tab holds
 * `sessionStorage` state.
 */

import type {
  PendingAuthorization,
  PendingAuthorizationStore,
  PersistedSession,
  SessionStorageAdapter,
} from "../types.js";

/**
 * Session storage that keeps the record in this process only.
 *
 * Records are structured-cloned on write and read, mirroring IndexedDB semantics so the
 * same code paths (including `CryptoKey` persistence) are exercised.
 *
 * @param initial - Pre-seeded record, used by tests.
 */
export function memorySessionStorage(initial: PersistedSession | null = null): SessionStorageAdapter {
  let record: PersistedSession | null = initial === null ? null : structuredClone(initial);
  return {
    async save(session) {
      record = structuredClone(session);
    },
    async load() {
      return record === null ? null : structuredClone(record);
    },
    async clear() {
      record = null;
    },
  };
}

/** Authorization transaction storage that keeps the record in this process only. */
export function memoryPendingAuthStore(): PendingAuthorizationStore & { peek(): PendingAuthorization | null } {
  let pending: PendingAuthorization | null = null;
  return {
    async save(value) {
      pending = { ...value };
    },
    async load() {
      return pending;
    },
    async clear() {
      pending = null;
    },
    peek() {
      return pending;
    },
  };
}
