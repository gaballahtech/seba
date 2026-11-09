# Architecture Decision Records (ADRs)

| ADR | Title | Summary |
|---|---|---|
| [0001](./0001-small-api-surface.md) | Small API surface | Core API stays focused on `login`/`restoreSession`/`fetch`/`logout` (plus session/events), avoiding token/key exposure. |
| [0002](./0002-dpop-always.md) | DPoP always | SEBA requires DPoP-bound authenticated requests; no Bearer fallback mode. |
| [0003](./0003-tolerances-as-system.md) | Tolerances as an explicit, acknowledged system | Provider-compatibility relaxations are opt-in and require `acknowledgeSecurityRelaxations: true`. |
| [0004](./0004-persist-without-refresh-token.md) | Persist session without refresh token | Default `auto` soft-persists access token + DPoP key only when no refresh token; `never` keeps such sessions in memory. |
| [0005](./0005-ssr-stance.md) | SSR stance — browser-only | No SSR/server entry point; use SEBA in client-only paths. |
| [0006](./0006-node-loopback-or-device-code.md) | Node login flow — loopback redirect | Node uses a temporary loopback callback server; device-code flow deferred. |
