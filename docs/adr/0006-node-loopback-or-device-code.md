# ADR 0006: Node login flow — loopback redirect (device code deferred)

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Node.js applications do not have a browser redirect/callback environment in-process. Solid-OIDC login still requires an interactive authorization step at the Identity Provider. The library must provide a practical way for a Node process to receive the authorization response, while keeping the callback listener local and minimizing exposure. Device Authorization Grant (device code) can improve UX for headless environments, but it depends on provider support and Solid-OIDC/OIDC deployment details.

## Decision

SEBA’s Node platform uses a **temporary loopback HTTP redirect** flow. The application provides a loopback `redirectUri` and an `openAuthorizationUrl` hook; `src/node/platform.ts` starts a local loopback callback server, waits for the provider redirect (bounded by a timeout), captures the authorization response, and completes the normal code exchange through the core client. This is the current implementation behavior.

Device-code flow was considered for headless/CLI ergonomics but is **deferred** because provider support for the required device/authorization patterns in the targeted Solid-OIDC context is not assumed for this release. Stage 5 (T16) may add UX improvements to the existing loopback flow (for example port-collision retry and optional auto-open via an optional dependency) without changing this ADR’s core decision.

## Consequences

- **Positive:** Works with the existing authorization-code + PKCE + DPoP flow; keeps callback handling on loopback; no server-side token custody added to the library.
- **Negative:** Node login requires the user to open a browser URL manually unless an opener is provided; not suitable for unattended server-to-server authentication.
- **Neutral:** CLI UX can be improved incrementally (error messages, optional opener, port retry) while preserving the same protocol model.

## Alternatives

- **Device code flow now:** Deferred; not adopted as the primary Node mechanism in this release due to provider/deployment uncertainty and scope.
- **Embedded browser/webview:** Rejected; heavy dependency, platform/security complexity, and poor fit for a library.
- **Server-side state/token custody managed by SEBA:** Rejected/out of scope for v1.0; would expand the threat model and API surface significantly.
