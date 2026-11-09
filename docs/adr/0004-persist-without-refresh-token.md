# ADR 0004: Persist session without refresh token

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Some Solid Identity Providers do not issue a refresh token even when applications request offline-capable scopes. Users still expect a browser session to survive a page reload for the remaining lifetime of the access token. Persisting nothing means reload always forces re-authentication; persisting long-lived credentials improves convenience but increases the impact of a successful XSS or local profile compromise because more session material remains available on disk.

## Decision

SEBA provides `persistSessionWithoutRefreshToken` in `SebaConfig` (resolved in `src/core/client.ts`, applied in `src/core/session.ts`):

- **`"auto"` (default):** when the provider issues **no refresh token**, SEBA soft-persists the access token, access-token expiry, subject/WebID context needed for resume, and the DPoP key so `restoreSession()` can resume the session until the access token expires. When a refresh token **is** issued, SEBA persists the refresh token and DPoP key (and does not persist access tokens for refresh-token sessions).
- **`"never"` (opt-in):** when no refresh token is issued, the session remains **in memory only**; reload does not restore it.

## Consequences

- **Positive:** Better default UX for common short-lived access-token/no-refresh-token provider behavior; explicit privacy-oriented opt-out for higher-risk applications.
- **Negative:** In `auto` mode without a refresh token, XSS impact extends to the access token lifetime (and the persisted DPoP key material as stored by the configured adapter), not just in-memory minutes. Operators must treat XSS prevention and browser profile security as critical.
- **Neutral:** Restore behavior differs by provider/token outcome; errors and logs should make the mode/expiry behavior understandable.

## Alternatives

- **Always `never` (memory only when no refresh token):** Rejected as default because it creates poor reload UX for common deployments, though it remains available as an explicit option.
- **Always persist access tokens in `auto`-like mode even when refresh tokens exist:** Rejected because it stores more sensitive material than necessary for refresh-capable sessions.
- **Require applications to implement their own persistence policy:** Rejected; the library needs a safe, documented default and an explicit opt-out.
