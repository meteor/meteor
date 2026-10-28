# npm-deps-audit

Makes the npm dependencies of Meteor core packages visible to
[Socket](https://socket.dev) and GitHub's dependency graph, and writes the
fixes Socket computes back into `package.js`. Core packages
declare them with `Npm.depends({...})` in `packages/*/package.js` (build
plugins with `npmDependencies`), so there is no `package.json` or lockfile for
any scanner to read. This tool parses each `package.js` statically, writes a
throwaway `package.json` per package, generates a lockfile, and hands those to
the scanners.

Used by `.github/workflows/npm-dependency-audit.yml` (gate changes) and
`.github/workflows/npm-dependency-autofix.yml` (find and fix new advisories).
No npm dependencies of its own, and nothing from `package.js` is ever executed.

## How the pieces fit

| Layer | Covers | Blocks? | Policy lives in |
|---|---|---|---|
| **Socket GitHub App** | every real manifest in the repo, on all PRs incl. forks | per Socket policy, as a check run | Socket dashboard; `socket.yml` for paths |
| **`socket` job** (audit workflow) | `npm-packages/*` + generated `packages/*` manifests, on changes | yes, `socket scan create --report` exits non-zero on policy violations | Socket dashboard |
| **`fix-npm-packages` job** (autofix workflow) | `npm-packages/*`, daily | opens one PR per advisory via `socket fix` | Socket |
| **`fix-meteor-packages` job** (autofix workflow) | generated `packages/*` manifests, daily | `socket fix` locally, versions written back into `package.js`, one PR | Socket |
| **`submit-snapshot` job** (autofix workflow) | generated `packages/*` lockfiles → GitHub dependency graph, daily | no, feeds Dependabot alerts | GitHub Security tab |

Socket reports CVEs and, beyond them, malware, typosquats, install scripts,
network/shell/filesystem access, obfuscated code, unmaintained or deprecated
packages, git dependencies and license problems. Which of those block, warn or
are ignored is the org security policy in the Socket dashboard. There is no
second policy in this repo.

The audit workflow runs when a change touches dependencies (pull requests,
pushes to `devel`). The autofix workflow runs daily against unchanged
dependencies and turns new advisories into pull requests.

## Automatic fixes

`npm-dependency-autofix.yml` runs every day and on demand.

- **`npm-packages/*`**: `socket fix --all` in CI mode. Socket computes the
  upgrades, including transitive ones through npm `overrides` when a parent's
  range blocks the fix, and opens one pull request per advisory on
  `socket/fix/<GHSA>` branches. It skips advisories that already have an open
  fix PR. Those PRs are gated by the normal checks like any other.
- **`packages/*`**: no fixer can edit `Npm.depends`, so the generated manifests
  are fixed instead. `socket fix` runs in local mode with `--range-style pin`
  against the generated directory; `cli.js apply-fixes` then compares each
  generated `package.json` with the versions recorded at generation time and
  rewrites exactly those version literals in `package.js`, keeping quotes,
  formatting and comments. One PR is opened on `socket/fix/meteor-packages`
  and updated in place on later runs. Fixes that needed an `overrides` entry
  cannot be expressed in `Npm.depends` and are listed in the PR body for a
  maintainer to resolve by bumping the direct dependency.
- **Dependency graph**: the generated lockfiles are submitted to GitHub so
  Dependabot alerts for `packages/*` appear in the Security tab alongside the
  real lockfiles.

Both fixers refuse upgrade targets younger than seven days
(`--minimum-release-age`), which gives registries time to pull a compromised
release before we adopt it.

Package versions are deliberately not bumped by fix PRs. On a release branch the
`update-semver` tooling bumps every package that differs from `devel`, which
includes these (see `.github/skills/version-bump`). Fix PRs touch
`packages/` and `npm-packages/`, so the changelog generation picks them up
(see `.github/skills/changelog`).

### Pull requests from forks

Fork PRs do not receive repository secrets, so the `socket` job is skipped for
them with a notice in the job summary. The Socket GitHub App still reviews
changed real manifests. If a fork PR changes `Npm.depends`, a maintainer reads
the diff and adds the **`socket-scan`** label; that triggers a
`pull_request_target` run with the secret against the PR head. This is safe
because the run executes nothing from the PR: `package.js` is parsed rather
than evaluated, `npm install --package-lock-only --ignore-scripts` only fetches
registry metadata, the Socket CLI only reads manifests, and the scripts always
come from the base branch checkout.

## Setup (core team, once)

1. Install the [Socket GitHub App](https://github.com/apps/socket-security) on
   `meteor/meteor`. Free for public repositories.
2. In the Socket dashboard create an API token with the `full-scans:create`
   scope and add it as the repository secret `SOCKET_CLI_API_TOKEN`. Add the
   Socket organization slug as the repository variable `SOCKET_ORG`.
3. Review the org security policy in the Socket dashboard: which alert types
   block, warn or are ignored. That policy is what fails the `socket` job.
4. Create the `socket-scan` label.
5. Optionally make the Socket check run and the `Socket scan` job required via
   branch protection on `devel`.
6. For automatic fixes: give the token the `fixes:list` and `packages:list`
   scopes as well, and enable "Allow GitHub Actions to create and approve pull
   requests" under Settings → Actions → General.

Without the secret, the `socket` job fails on non-fork events rather than
skipping, so an expired token cannot silently turn the check green.

## Commands

```bash
# Parse packages/*/package.js, write a package.json per package and generate a
# package-lock.json for each. Exits 1 if any package.js cannot be parsed.
node scripts/npm-deps-audit/cli.js generate --out /tmp/npm-deps

# After `socket fix` edited the generated manifests, write the changes into package.js
node scripts/npm-deps-audit/cli.js apply-fixes --out /tmp/npm-deps --dry-run

# Submit the generated lockfiles to GitHub's Dependency Submission API
node scripts/npm-deps-audit/cli.js submit --out /tmp/npm-deps --dry-run

# Scan the same inputs Socket scans in CI (needs `socket login` or SOCKET_CLI_API_TOKEN).
# Targets must be under --cwd; CI generates into ./npm-deps-generated for that reason.
npx socket scan create --report npm-packages /tmp/npm-deps
```

Tests: `npm run test:npm-deps-audit`.

## Caveats

- `Npm.depends` and `npmDependencies` must be object literals with string
  values. Anything computed makes `generate` fail for that package, on purpose:
  a dependency the audit cannot see is worse than a failing job. All current
  core packages are literals.
- `Npm.depends` pins exact versions, but transitive dependencies are resolved
  fresh when the lockfile is generated. That matches what `meteor publish`
  does, since `packages/**/.npm` shrinkwraps are not committed. A published
  package may therefore differ slightly from what is scanned here.
- Git and HTTP dependency specs (e.g. `uWebSockets.js` in `ddp-server`) cannot
  be resolved by npm and are left out of the generated manifest. Socket flags
  git dependencies as a supply-chain risk in their own right when it sees them
  in real manifests; for `packages/*` they are listed in the `generate` log.
- In CI the generated manifests are written inside the workspace
  (`npm-deps-generated/`, deliberately not gitignored) because the Socket CLI
  only scans targets under its working directory and skips anything matched by
  `.gitignore`. The directory only exists on the runner.
- Production dependencies only; `npm-packages/*` dev dependencies are not what
  ships. Socket's own policy decides how to treat dev scope.
- The meteor-tool dev bundle (`scripts/dev-bundle-tool-package.js`) is out of
  scope; it needs code changes rather than pin bumps and is tracked separately.
- The `submit` step needs `contents: write`, which pull requests do not get, so
  snapshots are submitted only from the scheduled workflow.
- `socket fix` in CI mode opens PRs with the workflow's `GITHUB_TOKEN`, which
  requires the repository setting that allows Actions to create pull requests.
  Workflows do not run on PRs opened with that token until a human pushes to
  them or closes and reopens them; that is a GitHub limitation, and a GitHub
  App token or a maintainer PAT lifts it if it becomes a nuisance.
