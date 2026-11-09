# ADR 0005: SSR stance — browser-only (Option A)

- **Status:** Accepted (Round 2, HD-5 / Task 1.5)
- **Date:** 2026-11-09

## Context
SEBA performs Solid-OIDC login (interactive redirects), callback parsing, session persistence, and DPoP-signed `fetch`. In browsers it relies on `window`/`document`/URL handling, Web Crypto, and storage adapters (IndexedDB by default). Server-side rendering (SSR) frameworks (e.g. Next.js) execute modules on the server where these APIs and the browser security/origin model do not apply in the same way.

## Decision
**Option A — browser-only, documented.** SEBA does not provide an SSR/server entry point in this decision. Applications using SSR should:
- render and invoke SEBA login/session/`fetch` flows in **client-only** components/code paths;
- use server-side code only for patterns that do not require browser-held DPoP keys/tokens (e.g. proxying after an explicit, reviewed design) — not shipped by this library.

No `src/server/` entry point or SSR-specific public export is added.

## Consequences
- Clear security boundary: secrets/keys remain in the browser profile context intended by the library.
- SSR apps must structure auth as client-initiated; Task 10 will provide a minimal Next.js example and README guidance.
- If a future SSR-safe API is needed, it requires an explicit ADR and public API review.

## Alternatives
- **B: Add SSR-safe entry point.** Rejected for now — higher API/security surface; not needed to unblock browser/Node flows. Revisit via HD escalation if a concrete, safe design emerges.
