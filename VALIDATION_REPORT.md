# VALIDATION_REPORT — SEBA v0.2.0

Environment: Linux (container), Node.js v26.12.1, npm 12.2.1, Chrome 141 binary present
(`/usr/bin/google-chrome-stable`), no Firefox/Safari binary. Network access to npm and the
public Solid providers was available.

This report records what was executed, not what was intended. Where a gate could not run,
it is marked **BLOCKED** with the concrete reason.

## Phase A — real provider validation

### A.1 Local Community Solid Server 7.3.0

Commands:

```bash
npx @solid/community-server@7.3.0 -c @css:config/file.json -f ./css-data -p 3000
node scripts/validation/css-setup.mjs      # account + password login + pod
CSS_EMAIL=… CSS_PASSWORD=… WEBID=… node scripts/validation/css-flow.mjs
```

The Client ID Document is served by the validation script at
`http://localhost:8443/client-id.jsonld` with `redirect_uris:
["http://localhost:3001/auth/callback"]`. Plain loopback HTTP is used instead of the
suggested `mkcert` HTTPS endpoint because SEBA's Node callback server intentionally binds
plain HTTP on loopback only; the document shape is otherwise the requested one (`@context`,
`client_id`, `redirect_uris`, `client_name`, `scope`, `grant_types`).

What passed:

| Step | Result |
|---|---|
| Discovery | `GET /.well-known/openid-configuration` → 200; issuer `http://localhost:3000/` |
| Client ID Document fetch by CSS | Accepted; authorization request reached the account interaction |
| PKCE S256, `state`, `nonce` in authorization request | Accepted by CSS |
| Interactive login / WebID selection / consent (driven through CSS's account JSON API) | Completed; CSS redirected to the callback with `code`, `state`, `iss=http://localhost:3000/` |
| SEBA callback server | Received the callback, returned HTTP 200 |
| Token request with DPoP proof | Accepted by CSS (no `invalid_dpop_proof`, no nonce challenge needed) |
| Token response | `token_type: "DPoP"`, access token, refresh token, ID token |

The ID token CSS actually issued (non-secret claims only, captured by the validation
script):

```json
{
  "iss": "http://localhost:3000/",
  "aud": "http://localhost:8443/client-id.jsonld",
  "azp": "http://localhost:8443/client-id.jsonld",
  "webid": "http://localhost:3000/seba018213/profile/card#me",
  "sub": "http://localhost:3000/seba018213/profile/card#me"
}
```

SEBA then failed the login with:

```
SebaAuthError: The ID token audience does not include "solid".
Solid-OIDC requires it when the provider advertises the webid scope.
```

Root cause: CSS 7.3.0 deviates from [Solid-OIDC §8.1](https://solidproject.org/TR/oidc).
With the `webid` scope (which CSS itself advertises in `scopes_supported`), the spec
requires:

- `aud` to be an **array** that includes `azp` and the string `"solid"`;
- a `cnf` claim with `jkt`.

CSS emits a string `aud` containing only the client ID and emits no `cnf`. The same
observation was reported to the Solid authentication panel long ago
(solid/authentication-panel#135 discusses the strict audience requirement), but the current
normative text has not changed.

Decision: **do not relax the check.** Accepting an ID token without `"solid"` and `cnf`
would remove the Solid-specific audience restriction and the proof-of-possession binding
this library exists to enforce. The failure is in the provider, not in SEBA. Gate A.1 is
therefore **BLOCKED** at the last step (post-token, pre-session) by provider
non-conformance. Everything up to and including the DPoP token exchange was exercised
against real CSS.

Transcript files from the run: `/tmp/css-flow.out`, `/tmp/css-flow-noslash.out` (ephemeral,
environment-local).

### A.2 Public providers

No account could be created on `solidcommunity.net`, `solidweb.org` or `solidweb.me`
without an interactive browser session, an email address and (on some deployments) a
CAPTCHA. No credentials were available to this environment, so the full login → fetch →
restore → logout cycle did **not** run against any public provider. It is not marked as
tested anywhere in this repository.

What was executed instead, through SEBA's real discovery code
(`node scripts/validation/public-discovery.mjs`):

| Requested issuer | Discovery | Issuer returned | Revocation endpoint | `webid` advertised |
|---|---|---|---|---|
| `https://solidcommunity.net` | 200 | `https://solidcommunity.net/` | yes | yes |
| `https://solidcommunity.net/` | 200 | `https://solidcommunity.net/` | yes | yes |
| `https://solidweb.org` | 200 | `https://solidweb.org` | **no** | yes |
| `https://solidweb.me` | 200 | `https://solidweb.me/` | yes | yes |
| `http://localhost:3000` | 200 | `http://localhost:3000/` | yes | yes |

This surfaced a real interoperability problem: two of the three providers publish an issuer
with a trailing slash while users and documentation usually type the host without one, and
SEBA's exact-string comparison rejected the document. Fixed — see Phase D finding F1.

Gate A.2: **BLOCKED** (no public account; full cycle not executed). Discovery compatibility
is proven, not authentication.

## Phase B — browser validation

- Chrome is installed, but Firefox and Safari are not present in this environment.
- A browser end-to-end login against a real provider is blocked by A.1/A.2: the only local
  real provider (CSS) fails ID token validation, and no public provider account exists.
- No Playwright/Puppeteer run was performed. The built React example (Vite) and the browser
  storage adapter (`fake-indexeddb` unit tests) are the only browser-adjacent evidence.

Gate B.1: **BLOCKED** — Chrome + Firefox 5-step matrix not executed. Safari availability
was never reached.

### B.2 IndexedDB edge cases

Not executed in a real browser. What the code does today, verified by unit tests or
inspection:

| Case | Behaviour | Evidence |
|---|---|---|
| Storage quota exceeded | `storage.save()` rejection is caught in `SessionManager.adopt` and only logged; the in-memory session stays usable. Refresh-rotation save failure is likewise non-fatal. | `tests/unit/session.test.ts` "keeps the session usable when storage fails" |
| Corrupted pending-authorization JSON | Removed and treated as no pending login (`SebaAuthError` when a callback arrives). | `tests/unit/browser-storage.test.ts` |
| Stored session from another client/version | Cleared, then `SebaAuthError`. | `tests/unit/session.test.ts` |
| Unusable stored DPoP key | Cleared, then `SebaSessionExpiredError`. | `tests/unit/session.test.ts` |
| Private/incognito IndexedDB failure | `openDB` rejection propagates while saving; `adopt` downgrades it to a debug message and keeps the memory session. A later `restoreSession()` sees nothing. No hang, but no typed error is surfaced to the caller because storage failure is intentionally non-fatal. | code inspection; not browser-executed |

Gate B.2: **NOT EXECUTED in a browser**; no crash/hang was found by inspection or unit
tests, but this gate is not claimed green.

## Phase C — examples

- `tsconfig.examples.json` added; `npm run typecheck` now runs both projects.
- `npm run typecheck:examples` → 0 errors.
- `npm run example:react:build` (`vite build`) → success, 79 modules.
- Node example is env-driven and documented; React example has `index.html`, `main.tsx` and
  `vite.config.ts`, with `clientId`/`redirectUri` documented in its comments and README.
- Runtime against CSS remains blocked by A.1.

Gate C.1: **PASS** (typechecked). Gate C.2: **PARTIAL** — build command works; the Node
example cannot complete a login against CSS for the provider reason above.

## Phase D — security audit

See `SECURITY.md` §12 for the full table and accepted risks. Summary:

- **F1 (real-provider incompatibility, fixed):** issuer with/without trailing slash.
  `parseProviderConfiguration` now accepts only the empty-path canonical form and adopts the
  provider's spelling; paths, ports and schemes still require exact equality. Not a
  security weakening: the exact declared issuer is what is stored and compared afterwards.
- **F2 (audit finding, fixed, stricter):** a refresh whose ID token fails validation (e.g.
  different WebID) previously left the unusable grant in storage and threw `SebaAuthError`.
  It now clears storage and throws `SebaSessionExpiredError`. New regression test added.
- **F3 (audit finding, accepted):** a callback with a mismatched `state` throws
  `SebaAuthError` without clearing the pending transaction. The code is never exchanged and
  the legitimate transaction remains usable until its 10-minute expiry. Clearing it would
  let any page that can navigate the user cancel an in-flight login; both behaviours fail
  closed. Documented.
- No proof reuse, no cached proofs, fresh `jti` per attempt, `ath` only on resource
  requests, no tokens/keys logged.

Gate D.1: zero unresolved high-severity findings; one medium fixed, one low accepted.

## Phase E — release

See `BUILD_REPORT.md` for the pasted gate output and package contents. Version 0.2.0 is a
validation-and-hardening release, **not** a claim of production readiness: the public
provider and browser gates are blocked, and no document in this repository says otherwise.

## Definition-of-done checklist

| Item | Status |
|---|---|
| Local CSS full cycle with transcript | **BLOCKED** — every step through DPoP token exchange succeeded; CSS 7.3.0 fails Solid-OIDC §8.1 ID token requirements |
| At least one public provider full cycle | **BLOCKED** — no account could be created; discovery verified for three providers |
| Chrome and Firefox 5-step browser check | **BLOCKED** — Firefox absent; real-provider login blocked; no browser automation run |
| IndexedDB edge cases typed errors | **PARTIAL** — unit-covered; browser execution not performed |
| Examples typechecked and documented | **PASS** |
| Manual security audit of `dpop.ts`, `session.ts`, `client.ts` | **PASS** (findings in SECURITY.md §12) |
| No document claims untested capability | **PASS** |
| `npm pack --dry-run` output pasted in BUILD_REPORT | **PASS** |
| `CHANGELOG.md` honest about validation | **PASS** |
