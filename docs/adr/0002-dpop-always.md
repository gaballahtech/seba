# ADR 0002: DPoP always

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Solid-OIDC deployments may vary in how strictly they implement proof-of-possession, and OAuth 2.0 ecosystems commonly support Bearer tokens. For Solid resource access, sender-constrained tokens (DPoP) reduce the impact of token exfiltration compared to Bearer tokens because possession of the token alone is not sufficient; the client must also prove possession of the bound key for each request. Supporting both modes as first-class defaults would complicate configuration, testing, and security reasoning.

## Decision

SEBA treats DPoP as mandatory for its authenticated flow. The core generates and manages a DPoP key for the session, creates fresh DPoP proofs per request/attempt, binds tokens according to provider/session validation rules, and sends `Authorization: DPoP ...` (not Bearer) on authenticated resource requests. SEBA does **not** offer a Bearer-token fallback mode as a supported public configuration. Implementation is centered in `src/core/dpop.ts` and the request/auth flows in `src/core/client.ts`, `src/core/session.ts`, and `src/core/oidc.ts`.

## Consequences

- **Positive:** Stronger default security posture; consistent behavior across supported runtimes; simpler mental model for applications (authenticated `fetch` means DPoP-bound requests).
- **Negative:** Requires DPoP-capable identity providers and compatible resource servers; interoperability with non-DPoP setups is not a goal; client implementation is more complex than a Bearer-only client.
- **Neutral:** Some provider quirks (for example specific claim/tolerance cases) are handled explicitly and visibly rather than by downgrading to Bearer.

## Alternatives

- **Optional DPoP (config flag):** Rejected because it weakens the default and creates easy misconfiguration paths.
- **Bearer fallback when DPoP fails:** Rejected because it removes the sender-constrained security property in the exact scenarios where robustness is tempting but risk is highest.
- **Separate Bearer client package:** Deferred/rejected for current scope; SEBA’s purpose is a Solid-OIDC client with DPoP-based guarantees.
