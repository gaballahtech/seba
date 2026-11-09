import { describe, expect, it } from "vitest";
import { createDPoPKey } from "../../src/core/dpop.js";
import { SebaNetworkError, SebaSessionExpiredError } from "../../src/core/errors.js";
import { SessionManager } from "../../src/core/session.js";
import type { PersistedSession, SessionStorageAdapter } from "../../src/types.js";

const CLIENT_ID = "https://app.example/id.jsonld";

function storage(overrides: Partial<SessionStorageAdapter>): SessionStorageAdapter {
  return {
    async save() {},
    async load() {
      return null;
    },
    async clear() {},
    ...overrides,
  };
}

function manager(store: SessionStorageAdapter, opts: { discover?: (issuer: string) => Promise<never> } = {}) {
  return new SessionManager({
    clientId: CLIENT_ID,
    storage: store,
    fetchImpl: async () => new Response("", { status: 500 }),
    discover: opts.discover ?? (async () => {
      throw new Error("discover not expected");
    }),
  });
}

describe("SessionManager.restore storage/error mapping (Task 4)", () => {
  it("returns null on no record", async () => {
    const m = manager(storage({ async load() { return null; } }));
    await expect(m.restore()).resolves.toBeNull();
  });

  it("maps storage unavailable (IDB undefined / load throws DOMException-like) to SebaSessionExpiredError(storage_unavailable)", async () => {
    const err = Object.assign(new Error("IndexedDB is not available"), { name: "InvalidStateError" });
    const m = manager(storage({ async load() { throw err; } }));
    await expect(m.restore()).rejects.toBeInstanceOf(SebaSessionExpiredError);
    try {
      await m.restore();
    } catch (e) {
      const se = e as SebaSessionExpiredError & { stage?: string; cause?: unknown };
      expect(se.stage).toBe("storage_unavailable");
      expect(se.cause).toBe(err);
    }
  });

  it("maps quota exceeded on load to SebaSessionExpiredError(storage_unavailable) without raw leak", async () => {
    const quota = Object.assign(new Error("QuotaExceededError"), { name: "QuotaExceededError" });
    const m = manager(storage({ async load() { throw quota; } }));
    await expect(m.restore()).rejects.toSatisfy((e: unknown) => {
      return e instanceof SebaSessionExpiredError && (e as { stage?: string }).stage === "storage_unavailable";
    });
  });

  it("treats evicted record as no record (null)", async () => {
    const m = manager(storage({ async load() { return null; } }));
    await expect(m.restore()).resolves.toBeNull();
  });

  it("keeps network failure as SebaNetworkError (unchanged)", async () => {
    const material = await createDPoPKey();
    const record: PersistedSession = {
      version: 1,
      webId: "https://alice.example/profile/card#me",
      provider: "https://issuer.example",
      clientId: CLIENT_ID,
      refreshToken: "rt-1",
      key: material.persisted,
      createdAt: Date.now(),
    };
    const m = manager(storage({ async load() { return record; } }), {
      discover: async () => {
        throw new SebaNetworkError("offline");
      },
    });
    await expect(m.restore()).rejects.toBeInstanceOf(SebaNetworkError);
  });
});
