# ADR 0003: Tolerances as an explicit, acknowledged system

- **Status:** Accepted (2026-11-09)
- **Deciders:** SEBA maintainers

## Context

Some real-world Solid Identity Providers do not fully conform to Solid-OIDC (e.g. missing `"solid"` in ID token `aud`, missing `cnf.jkt`). SEBA is strict by default, but operators need a way to interoperate with known-broken providers without forking the library. Unacknowledged relaxations risk accidental security downgrades.

## Decision

- Tolerances remain **opt-in and explicit** (`allowNonCompliantAudience`, `allowNonCompliantCnf`, per-issuer `tolerances`).
- Enabling any tolerance requires `acknowledgeSecurityRelaxations: true`; otherwise configuration fails with `SebaConfigError`.
- Tolerances relax only the specific check named; signature verification, issuer, expiry/iat, nonce, client audience/`azp` rules, and DPoP proof requirements on requests remain enforced (see `SECURITY.md`).
- Validation code supports an `onToleranceApplied` callback so callers can observe when a bypass affects validation; emitting `session-changed` with reason `tolerance-applied` is the intended UX integration (wiring may span client/session layers).

## Consequences

- **Positive:** Misconfiguration is harder; relaxations are visible in config review; interoperability remains possible for documented cases.
- **Negative:** Existing configs that used tolerances without acknowledgement must add `acknowledgeSecurityRelaxations: true` (migration). Event emission on refresh-path validation requires plumbing outside the minimal oidc-only change.

## Alternatives

- **Warn-only (no throw):** easier adoption but weaker against accidental downgrade — rejected for the safeguard goal.
- **Per-tolerance acknowledgement objects:** more granular but noisier; a single explicit flag is sufficient for current tolerance set.
- **No tolerances:** breaks interoperability with non-compliant providers users already encounter — rejected.
