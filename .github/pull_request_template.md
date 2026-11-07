## What changed

<!-- One or two sentences. Link the issue this closes, if any. -->

Closes #

## How it was verified

<!-- Tick what you actually ran. Do not tick what you did not run. -->

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run example:react:build` (only if examples changed)
- [ ] Added or updated a test that covers the change

## Checklist

- [ ] The change is focused; unrelated refactors or formatting are in a separate PR.
- [ ] Public API changes are documented (README, `CHANGELOG.md`, and types).
- [ ] No new runtime dependency was added to the core (or the issue agreed to it).
- [ ] No token, authorization code, DPoP key or provider response is logged or newly persisted.
- [ ] Validation, tolerances and storage behaviour are unchanged unless this PR is about them.
- [ ] Brand assets remain PNG; nothing new is shipped as SVG.
- [ ] I did not include secrets, tokens or personal data in this description or the diff.
