# Stability tiers

This document defines what **stable** and **beta** mean for `@gaballahtech/seba` entry points.

## Stable

Applies to: `@gaballahtech/seba` (core).

- **API:** Frozen for the 1.x line. Breaking changes require a major version and migration notes.
- **Security review:** Core protocol logic (OIDC, PKCE, DPoP, session/restore/refresh, redirect safety) is treated as security-sensitive and changes require focused review.
- **Coverage gate:** `src/core/**` is gated in CI at **≥85% lines / ≥80% branches** (`vitest.config.ts`, `npm run test:coverage`; measured 85.03%/82.07%, 2026-11-09). The gate must stay green; thresholds are not lowered without an explicit human-decision entry and evidence.

## Beta

Applies to: `@gaballahtech/seba/react`, the `<seba-login>` Web Component surface (`@gaballahtech/seba` browser/element integration), and `@gaballahtech/seba/node`.

- **API:** May change in minor releases while the tier remains beta. Behavior and props/options may evolve; pin versions if you depend on beta surface details.
- **Security review:** Uses the stable core for authentication operations, but the binding/UI/runtime integration layers are not held to the same production-grade maturity claim as core.
- **Coverage gate:** Beta modules are **gated loosely** at measured floors (not production-grade coverage targets). See `vitest.config.ts` and `coverage/` reports. Raising their gates requires dedicated test investment; this release does not claim uniform coverage across all entry points.

## Contributing

When adding features, **core requires tests** appropriate to the changed protocol/security behavior. **Beta modules require at minimum smoke tests** for changed behavior, plus targeted tests when practical.

See [`CONTRIBUTING.md`](../CONTRIBUTING.md) and [`docs/coverage-baseline.md`](./coverage-baseline.md).
