# Migrating to SEBA from `@inrupt/solid-client-authn-browser`

This guide maps the common operations of `@inrupt/solid-client-authn-browser` (v3) to
`@gaballahtech/seba`. It is written from a real migration (a Google-Tasks-style todo app
validated against solidcommunity.net).

## Unreleased / next

- **Security relaxation acknowledgement (Task 8).** If you enable `allowNonCompliantAudience`, `allowNonCompliantCnf`, or any `tolerances` entry, you must now set `acknowledgeSecurityRelaxations: true` in `SebaConfig`; otherwise construction throws `SebaConfigError`. This makes security downgrades explicit. See [`SECURITY.md`](./SECURITY.md) and [`docs/adr/0003-tolerances-as-system.md`](./docs/adr/0003-tolerances-as-system.md).

## From SEBA 0.5.0 to 0.5.1

- **`Seba.pod` was removed** so login-only bundles can tree-shake the Turtle parser. Use the
  subpath (preferred) or the root named exports:

  ```ts
  // before — 0.5.0
  Seba.pod.toTurtle(triples);

  // after — 0.5.1
  import { toTurtle } from "@gaballahtech/seba/pod";
  toTurtle(triples);
  ```

  `import { pod, parseSubjectTriples, objectify, toTurtle } from "@gaballahtech/seba"` still
  works; those helpers are simply no longer attached to the `Seba` class.
- **`sebaLogo.*.dataUri` is an SVG data URI now** (`data:image/svg+xml,...`). It is still
  valid as an `<img src>`; only code that asserted the MIME prefix needs updating. The
  raster originals are unchanged: `sebaLogo.*.png` still points at the shipped PNG.

| Inrupt | SEBA | Notes |
|---|---|---|
| `handleIncomingRedirect()` on page load | `await seba.login()` **or** the explicit pair `seba.isCallbackResponse() && await seba.completeLogin()` | Both work. `login()` on a callback URL completes it; elsewhere it *navigates away* (document never unloads the promise). Use the explicit pair when that pattern is confusing. |
| `login({ oidcIssuer, redirectUrl, clientName })` | `seba.login({ issuer })` (redirect URL + client id come from one `new Seba({...})`) | |
| `fetchDefaultSession()` / `fetch(session)` | `seba.fetch(url, init)` | Always DPoP-signed with a fresh proof; cross-origin redirects are returned, never followed with credentials. |
| `getDefaultSession().info.webId` | `(await seba.getSessionInfo())?.webId` | SessionInfo is token-free and also carries `accessTokenExpiresAt`. |
| `getDefaultSession().info.isLoggedIn` | `(await seba.getSessionInfo()) !== null` | |
| `logout()` | `await seba.logout()` | SEBA also revokes the refresh token when the provider advertises revocation. |
| dynamic client registration | **none by design** — publish a Client ID Document; its URL is the `client_id` | See the README section "Publish a Client ID Document". Host a JSON-LD file at a stable HTTPS URL; no registration call is ever made. |
| `session.events.sessionRestore` / expiry events | poll `getSessionInfo()` → `accessTokenExpiresAt` | SEBA refreshes automatically; tell users *before* the access token lapses. |

## Conceptual differences worth knowing

1. **Tokens are not exposed.** Inrupt hands you the access token; SEBA never does. Access
   tokens live in memory only, and the refresh token + DPoP key are the only persisted
   secrets. If you think you need the raw token, re-check the design: `seba.fetch` covers it.
2. **A brand-new DPoP proof per attempt.** No proof cache, no sharing; replays are structurally
   impossible. Cross-origin redirects are returned to you instead of followed with credentials.
3. **Provider conformance gaps are opt-in per provider.** Real-world providers (solidcommunity.net,
   any recent CSS) violate Solid-OIDC §8.1 (`aud` without `"solid"`, missing `cnf.jkt`). Pass
   `tolerances` for exactly those issuers — everything else stays fully strict:

   ```ts
   const seba = new Seba({
     clientId: location.origin + "/client-id.jsonld",
     redirectUri: location.origin + "/callback",
     tolerances: {
       "https://solidcommunity.net/": { allowNonCompliantAudience: true, allowNonCompliantCnf: true },
     },
   });
   ```

4. **Errors carry `code` and `stage`.** Branch on `error.code`
   (`SEBA_ERR_SESSION_EXPIRED` → re-login; `SEBA_ERR_NETWORK` → transport/CORS) and
   `error.stage` (`token-exchange`, `id-token-*`, `authorization-response-*`) for triage.

## Minimal app skeleton

```ts
import { Seba } from "@gaballahtech/seba";

const seba = new Seba({
  clientId: window.location.origin + "/client-id.jsonld",
  redirectUri: window.location.origin + "/callback",
});

// On mount:
const info = await seba.getSessionInfo();
if (seba.isCallbackResponse()) {
  await seba.completeLogin();
} else if (info === null) {
  // render a login button; call `seba.login()` inside onClick (it navigates away)
}
```
