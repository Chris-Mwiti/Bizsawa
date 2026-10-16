# Collaboration Guide

How we propose to work together on BizSawa. This is a starting point for discussion: change anything that doesn't fit how the project runs.

## Why this matters here

CI deploys on every push to `main` (backend to Fly.io, an EAS preview build for mobile; see `.github/workflows/ci.yml`). A merge is therefore a release, so the process below is built to keep `main` safe to ship.

## Workflow

1. **Open or pick an issue.** One issue per task; reference it in the PR (`Closes #n`).
2. **Branch from the latest `main`**: `<type>/<short-description>` where type is `feat`, `fix`, `perf`, `refactor`, `test`, `docs` or `chore`. Prefer short-lived branches over long-running ones such as `feat/ai_dev`; if a long branch is needed, merge `main` into it often.
3. **Commit** using Conventional Commits, with a short bullet body:
   ```
   fix(sync): stop re-pushing resolved conflicts

   - skip records whose conflict is already resolved
   - add a regression test for repeated pushes
   ```
   Scopes in use: `mobile`, `backend` (or a domain such as `orders`), `web`, `migrations`, `loadtests`, `ci`, `deps`.
4. **Open a PR into `main`** from your branch (or from your fork). Keep it single-purpose and describe what changed and how you checked it.
5. **CI must pass** (mobile lint + typecheck, backend vet/lint/test, API e2e) before merging.
6. **Get one review** from someone other than the author where possible. Migrations, `.github/`, auth and payment changes should always be reviewed.
7. **Merge** and delete the branch.

## Outside contributors

Fork the repo, branch from `main`, and open a PR back. Forks need no secrets: the deploy steps skip when `FLY_API_TOKEN` / `EXPO_TOKEN` are unset.

## Database migrations

Files in `backend/migrations/` are numbered pairs (`NNNNNN_name.up.sql` and `.down.sql`).
- Add both files; make `down` really undo `up`.
- Never edit a merged migration; add a new one.
- Keep each migration compatible with the code currently deployed, since schema changes are applied before new code serves traffic.
- Test locally with `up`, tests, `down`, `up`.

## Secrets

Only `.env.example` files are tracked. Never commit real values. `EXPO_PUBLIC_*` variables ship inside the app, so nothing private belongs there. If a secret leaks, rotate it; removing the commit isn't enough.

## Suggested repository settings

These are settings, not files, so they need a maintainer to apply them:
- Protect `main`: require a PR, require the CI checks, block force pushes.
- Add a `CODEOWNERS` file naming reviewers for `backend/migrations/`, `.github/` and deploy config.
- Enable "automatically delete head branches". Several merged and stale Dependabot branches are currently open and can be triaged or closed.
- Add `web/`, GitHub Actions and Docker to `dependabot.yml`, and `web/` lint and build to CI.
- Optionally add a manual approval to the `production` environment, so a merge can't deploy without a second look.

## Known gaps worth fixing

- Mobile lint tolerates existing warnings, and Go lint checks only new issues.
- The `mobile-unit` job is disabled, and the API e2e step passes when no script is found.
- `web/` is not built or linted in CI and has two lockfiles (`bun.lock`, `package-lock.json`).
