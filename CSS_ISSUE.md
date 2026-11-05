# ID token `aud` claim does not conform to Solid-OIDC §8.1

## Environment

- Community Solid Server: 7.3.0
- Deployment: local, `-c @css:config/file.json -f ./css-data -p 3000`
- Client: static Client ID Document at `https://localhost:8443/client-id.jsonld`

## Expected behavior

Per Solid-OIDC §8.1, the `id_token` issued to a Solid client must have:

- `aud` as an **array** containing at least `"solid"` and the client_id, or (per some interpretations) `"solid"` in `aud`.
- `cnf.jkt` present, binding the token to the DPoP key thumbprint.

Reference: https://solid.github.io/solid-oidc/#tokens-id

## Actual behavior

CSS issues:

```json
{
  "iss": "http://localhost:3000/",
  "aud": "http://localhost:8443/client-id.jsonld",
  "azp": "http://localhost:8443/client-id.jsonld",
  "webid": "http://localhost:3000/profile/card#me"
}
```

- `aud` is a **string**, not an array.
- `"solid"` is absent from `aud`.
- `cnf.jkt` is absent.

## Impact

A spec-compliant Solid client (e.g., `seba@0.2.0`) correctly **rejects** this ID token at validation time. This blocks any compliant client from completing login against CSS 7.3.0 without weakening validation (which would break Solid-OIDC §8.1's audience restriction and DPoP binding).

## Steps to reproduce

1. Run CSS 7.3.0 locally.
2. Register a client via a static Client ID Document.
3. Complete the authorization code + PKCE + DPoP flow.
4. Inspect the returned `id_token`.
5. Observe `aud` is a string and `cnf.jkt` is missing.

## Suggested fix

- Emit `aud` as an array: `["solid", client_id]` (or at minimum include `"solid"` per the chosen interpretation of §8.1).
- Include `cnf.jkt` = JWK thumbprint of the DPoP public key.
