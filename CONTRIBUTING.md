# Contributing

Thanks for taking the time to improve SEBA. This document covers the practical parts:
getting a working checkout, the checks a change has to pass, and the constraints that keep
the library safe to ship.

## Before you start

- Open an issue for anything larger than a small fix, so the design is agreed before code.
- Security problems do **not** go in an issue — see [`SECURITY.md`](SECURITY.md).
- By contributing you agree to the [Code of Conduct](CODE_OF_CONDUCT.md), and that your
  contribution is licensed under the MIT licence of this repository.

## Setup

```bash
git clone https://github.com/gaballahtech/seba.git
cd seba
npm install
```

Node.js 20 or newer is required.

## Checks

Run these before opening a pull request; CI runs the same commands.

```bash
npm run typecheck     # tsc --noEmit + the examples project
npm test              # vitest (unit tests, node environment)
npm run build         # tsc -p tsconfig.build.json -> dist/
```

Optional but useful when you touched the examples or the protocol layer:

```bash
npm run example:react:build
npm run validate:discovery       # public discovery documents, no login
```

`typecheck`, `test` and `build` must all pass. A pull request that skips or weakens an
assertion to get green will not be merged.

## What a change has to respect

- **No new runtime dependencies in the core.** `jose` and `idb` are the only runtime
  dependencies and are **pinned to exact versions** (no `^`) to reduce supply-chain
  drift; upgrade them deliberately with lockfile review and tests. Adding another dependency
  needs a clear size and maintenance argument in the issue (and a HUMAN_DECISIONS entry
  where the process requires it).
- **Keep the public surface small.** New exports are API commitments. Prefer a subpath
  export over growing the root entry point.
- **Brand assets keep their PNG originals.** `assets/` holds the 512×512 PNG files; the
  component embeds equivalent 48×48 inline SVG data URIs so they stay small and crisp.
  Do not replace the PNG originals with SVG.
- **Never log or persist tokens outside the existing storage path.** Access tokens stay in
  memory; only the refresh token and the DPoP key are deliberately persisted.
- **Do not weaken validation.** `state`, RFC 9207 `iss`, `nonce`, PKCE S256, ID-token
  signature/claims and `cnf.jkt` binding are all required. `allowNonCompliantCnf` and the
  tolerance options exist for the documented edge cases, not as a shortcut.
- **Browser and Node paths stay separate.** Platform code is loaded dynamically so a
  browser bundle never contains the Node HTTP server.
- **Tests come with behaviour.** New behaviour needs a unit test; bug fixes need a test
  that fails before the fix. When adding features, **core requires tests**; **beta modules require at minimum smoke tests** (see `docs/stability.md`).

## Commit and pull request style

- Commit messages follow `type: summary` (`fix:`, `feat:`, `docs:`, `test:`, `refactor:`,
  `chore:`), in the imperative mood.
- Keep pull requests focused; unrelated formatting or refactors belong in their own PR.
- Fill in the pull request template, including **what you actually ran** and the specific behavior/security impact.

## Contribution quality (human-reviewed, reviewable changes)

To keep maintenance sustainable and avoid low-quality/automated “slop” submissions:

- **Understand what you submit.** You should be able to explain the change, tradeoffs, and tests. Review any tool/AI-assisted output before opening a PR.
- **Attach work to a real issue or a clear, scoped problem.** Avoid drive-by bulk PRs.
- **Make it reviewable.** Prefer small PRs with focused diffs, concrete reproduction/fix details, and tests that fail before the fix (when applicable).
- **Be honest and specific.** Describe observed behavior, environment, and evidence (logs/screenshots/commands) — not generic claims.
- **Respect repo policy/tooling.** If maintainers request disclosure of AI/tool assistance or specific process steps, follow the project’s current guidance.

(Repo admins may also enforce branch/ruleset protections in GitHub settings; see GitHub’s rulesets/branch protection docs.)

## Signed commits (policy)

Contributors and maintainers should sign commits where feasible (`git commit -S` / SSH signing) so provenance and authorship are verifiable. Repository admins should enable **“Require signed commits”** in branch/ruleset protection for `main` once the team’s signing setup is in place.

### Branch protection (recommended; apply in GitHub repo settings)

Configure branch protection or a ruleset for `main` requiring at minimum:

- Pull request before merging (no direct pushes except emergency admin bypass documented)
- Required status checks: `test` (CI job name), plus any additional checks adopted (`e2e`, coverage/summary jobs as they become required)
- Require branches to be up to date before merging (recommended)
- Require signed commits (recommended, per policy above)
- Restrict who can push to matching branches

Include this block in PR bodies when changing workflows so reviewers/admins can apply matching settings.

## Releasing

Maintainers only. See [`RELEASING.md`](./RELEASING.md) for the SemVer/stability policy, 1.0 path, and publishing checklist (version bump, changelog, checks/build/publint, `npm pack --dry-run`, publish/provenance). Tag-driven publishing is handled by `.github/workflows/release.yml` (requires the protected `npm-publish` environment and `NPM_TOKEN`/trusted publishing setup with provenance).

## Branch protection & release environment (admin, HD-3 / Task 1.3, T19)

The repository should enforce the following (apply in GitHub repo settings / rulesets; **not** automated from this environment):

- **Required status checks (merge):** `typecheck`, `test`, `coverage`, `e2e` (where applicable), `publint` / export checks, `build`, `size` (once adopted). Do not merge on red checks.
- **Required pull request review:** at least 1 approving review.
- **Signed commits:** required for the protected branch (per policy).
- **Protected environment `npm-publish`:** used by `.github/workflows/release.yml` for tag `v*` publishes. Configure required reviewers and `NPM_TOKEN` (or npm trusted publishing) with least privilege; restrict who can deploy. The workflow uses `id-token: write` for provenance (`npm publish --provenance --access public`).

Status: **DOCUMENTED — awaiting admin**.
