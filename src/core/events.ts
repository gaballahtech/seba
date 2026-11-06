/**
 * Minimal session event emitter.
 *
 * Listener failures are swallowed: an application callback must never break the
 * authentication flow or lose a session transition.
 */

import type { SessionChangeEvent, SessionChangeListener } from "../types.js";

export type { SessionChangeEvent, SessionChangeListener, SessionChangeReason } from "../types.js";

/** Synchronous fan-out of {@link SessionChangeEvent}s. */
export class SessionEmitter {
  readonly #listeners = new Set<SessionChangeListener>();

  /** Number of subscribed listeners. */
  get size(): number {
    return this.#listeners.size;
  }

  /**
   * Subscribe to session transitions.
   *
   * @returns An unsubscribe function.
   */
  on(listener: SessionChangeListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Remove a previously added listener. */
  off(listener: SessionChangeListener): void {
    this.#listeners.delete(listener);
  }

  /** Notify every listener. Listener errors are ignored. */
  emit(event: SessionChangeEvent): void {
    for (const listener of [...this.#listeners]) {
      try {
        listener(event);
      } catch {
        // A listener must not break the caller's session flow.
      }
    }
  }
}

/** Create an empty session emitter. */
export function createSessionEmitter(): SessionEmitter {
  return new SessionEmitter();
}
