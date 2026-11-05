import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDPoPKey } from "../../src/core/dpop.js";
import { SebaAuthError } from "../../src/core/errors.js";
import {
  PENDING_AUTH_KEY,
  createIndexedDbStorage,
  createSessionStoragePendingAuthStore,
} from "../../src/browser/storage.js";
import type { PendingAuthorization, PersistedSession } from "../../src/types.js";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key) {
      return map.get(key) ?? null;
    },
    key(index) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key) {
      map.delete(key);
    },
    setItem(key, value) {
      map.set(key, value);
    },
  };
}

async function record(overrides: Partial<PersistedSession> = {}): Promise<PersistedSession> {
  const material = await createDPoPKey();
  return {
    version: 1,
    webId: "https://alice.example/card#me",
    provider: "https://idp.example",
    clientId: "https://app.example/client-id.jsonld",
    refreshToken: "refresh-token",
    key: material.persisted,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("IndexedDB session storage", () => {
  afterEach(async () => {
    await createIndexedDbStorage().clear();
  });

  it("stores and loads the session with its non-extractable key", async () => {
    const storage = createIndexedDbStorage();
    const saved = await record();
    await storage.save(saved);

    const loaded = await storage.load();
    expect(loaded?.webId).toBe(saved.webId);
    expect(loaded?.refreshToken).toBe("refresh-token");
    expect(loaded?.key.kind).toBe("crypto-key");
    if (loaded?.key.kind === "crypto-key") {
      expect(loaded.key.publicJwk).toEqual(
        saved.key.kind === "crypto-key" ? saved.key.publicJwk : undefined,
      );
      await expect(crypto.subtle.exportKey("jwk", loaded.key.key)).rejects.toThrow();
    }
  });

  it("overwrites the single record", async () => {
    const storage = createIndexedDbStorage();
    await storage.save(await record({ refreshToken: "first" }));
    await storage.save(await record({ refreshToken: "second" }));
    expect((await storage.load())?.refreshToken).toBe("second");
  });

  it("returns null and clears cleanly", async () => {
    const storage = createIndexedDbStorage();
    await storage.clear();
    expect(await storage.load()).toBeNull();
    await storage.save(await record());
    await storage.clear();
    expect(await storage.load()).toBeNull();
  });
});

describe("sessionStorage pending authorization store", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const pending = (overrides: Partial<PendingAuthorization> = {}): PendingAuthorization => ({
    state: "state",
    codeVerifier: "verifier",
    nonce: "nonce",
    issuer: "https://idp.example",
    clientId: "https://app.example/client-id.jsonld",
    redirectUri: "https://app.example/callback",
    createdAt: Date.now(),
    ...overrides,
  });

  it("round-trips a transaction and clears it", async () => {
    const storage = memoryStorage();
    vi.stubGlobal("sessionStorage", storage);
    const store = createSessionStoragePendingAuthStore();

    await store.save(pending());
    expect((await store.load())?.state).toBe("state");
    await store.clear();
    expect(await store.load()).toBeNull();
    expect(storage.length).toBe(0);
  });

  it("discards an expired transaction", async () => {
    const storage = memoryStorage();
    vi.stubGlobal("sessionStorage", storage);
    const store = createSessionStoragePendingAuthStore();

    await store.save(pending({ createdAt: Date.now() - 11 * 60 * 1000 }));
    await expect(store.load()).rejects.toBeInstanceOf(SebaAuthError);
    expect(storage.getItem(PENDING_AUTH_KEY)).toBeNull();
  });

  it("ignores corrupt or incomplete records", async () => {
    const storage = memoryStorage();
    vi.stubGlobal("sessionStorage", storage);
    const store = createSessionStoragePendingAuthStore();

    storage.setItem(PENDING_AUTH_KEY, "{not json");
    expect(await store.load()).toBeNull();
    storage.setItem(PENDING_AUTH_KEY, JSON.stringify({ state: "only-state" }));
    expect(await store.load()).toBeNull();
  });
});
