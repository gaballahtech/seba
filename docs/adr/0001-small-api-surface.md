# ADR 0001: Small API surface

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Solid-OIDC and OAuth 2.0/OpenID Connect expose many flows, grant types, token lifetimes, and integration patterns. In practice, most browser and Node applications that access Solid Pods need a narrow set of capabilities: start interactive sign-in, resume a session after reload/restart when possible, make authenticated requests to protected resources, and sign out. Exposing every protocol knob as public API increases maintenance cost, makes correct usage harder to verify, and encourages application code to depend on internal token/session mechanics.

## Decision

SEBA exposes a small primary runtime API centered on four operations: `login()`, `restoreSession()`, `fetch()`, and `logout()`. The library also exposes read-oriented session access (`session` / `getSession()`/session info patterns) and events for state changes, but it does **not** expose raw access/refresh tokens, DPoP private keys, or low-level protocol handles as the normal integration path. The core implementation in `src/core/client.ts` and `src/core/session.ts` owns PKCE, authorization callback handling, ID token validation, DPoP proof creation, refresh, and revocation behavior behind that surface.

## Consequences

- **Positive:** Less public API to maintain and document; fewer ways for applications to misuse tokens or DPoP material; clearer guidance for what a typical Solid app needs to do.
- **Negative:** Edge cases or advanced flows may be harder to implement without forking or extending the library; applications that want token-level control must not rely on SEBA’s intended abstraction.
- **Neutral:** Internal modules remain structured, but only selected entry points are treated as stable integration contracts (see `docs/stability.md`).

## Alternatives

- **Mirror `@inrupt/solid-client-authn-browser`-style broader surface:** Rejected because it exposes substantially more surface area than most SEBA use cases need and increases compatibility/maintenance burden.
- **Expose token/key access for advanced users:** Rejected because it encourages insecure handling patterns and weakens the library’s safety-by-default posture.
- **Split into many small packages immediately:** Deferred; the current subpath/export structure keeps the core focused while allowing targeted entry points.
