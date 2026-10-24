# npm-deps-audit

Makes the npm dependencies of Meteor core packages visible to dependency
scanners. Core packages declare them with `Npm.depends({...})` in
`packages/*/package.js` (build plugins with `npmDependencies`), so there is no
`package.json` or lockfile for Socket, Dependabot or `npm audit` to read. This
tool evaluates each `package.js` in a sandbox, writes a throwaway `package.json`
per package, generates a lockfile, and then feeds those to the scanners.

Used by `.github/workflows/npm-dependency-audit.yml`. No npm dependencies of
its own, so it runs before any install step.

## How the pieces fit

| Layer | Covers | Blocks? | Where policy lives |
|---|---|---|---|
| **Socket GitHub App** | every real manifest in the repo, on PRs, incl. forks | per Socket policy, as a check run | Socket dashboard (org security policy), `socket.yml` for paths |
| **`socket` job** (CLI full scan) | `npm-packages/*` + generated `packages/*` manifests | yes, when `SOCKET_CLI_API_TOKEN` is available | Socket dashboard |
| **`npm-audit` job** | same manifests, CVEs only | yes, at `failOn` in `.github/npm-audit-policy.json` | the policy JSON |
| **`submit-dependency-snapshot` job** | generated `packages/*` lockfiles → GitHub dependency graph | no, feeds Dependabot alerts | GitHub Security tab |

Socket is the primary signal: beyond CVEs it flags malware, typosquats,
install scripts, network/shell/filesystem access, obfuscated code, unmaintained
or deprecated packages and license problems. The `npm audit` job is the
deterministic fallback that needs no secrets, so pull requests from forks that
change `packages/*/package.js` are still gated on known vulnerabilities.

## Setup (core team, once)

1. Install the [Socket GitHub App](https://github.com/apps/socket-security) on
   `meteor/meteor`. Free for public repositories.
2. In the Socket dashboard create an API token with the `full-scans:create`
   scope and add it as the repository secret `SOCKET_CLI_API_TOKEN`. Add the
   Socket organization slug as the repository variable `SOCKET_ORG`.
3. Review the org security policy in the Socket dashboard: which alert types
   block, warn or are ignored. That policy is what fails the `socket` job.
4. Optionally make the Socket check and `npm audit (policy gate)` required via
   branch protection on `devel`.

## Commands

```bash
# 1. Evaluate packages/*/package.js, write a package.json per package and
#    generate a package-lock.json for each (default out dir: $TMPDIR/meteor-npm-deps-audit)
node scripts/npm-deps-audit/cli.js generate --out /tmp/npm-deps

# 2. npm audit every generated lockfile, plus any real lockfile dirs given as arguments.
#    Prints a markdown report (and appends to $GITHUB_STEP_SUMMARY in CI).
#    Exits 1 when an advisory at/above policy.failOn is not allowlisted.
node scripts/npm-deps-audit/cli.js audit --out /tmp/npm-deps npm-packages/*

# 3. Submit the generated lockfiles to GitHub's Dependency Submission API so
#    Dependabot alerts cover packages/*. Use --dry-run to print the snapshot.
node scripts/npm-deps-audit/cli.js submit --out /tmp/npm-deps --dry-run

# Socket scan of the same inputs (needs `socket login` or SOCKET_CLI_API_TOKEN)
npx socket scan create --report --cwd . npm-packages /tmp/npm-deps   # targets must be under --cwd; CI uses ./npm-deps-generated
```

Tests: `npm run test:npm-deps-audit`.

## npm audit policy file

```json
{
  "failOn": "high",
  "allow": [
    {
      "ghsa": "GHSA-xxxx-xxxx-xxxx",
      "reason": "Why this is accepted and what the plan is",
      "expires": "2027-01-31"
    }
  ]
}
```

`failOn` is the lowest severity that fails the `npm-audit` job (`low`,
`moderate`, `high`, `critical`, or `none` to report only). Allowlist entries
need a GHSA id, a reason and an expiry date; after expiry the entry stops
suppressing and is listed in the report so it gets revisited. Socket has its
own triage flow for accepting alerts; keep the two in step.

## Caveats

- Production dependencies only (`--omit=dev`). Dev-dependency findings in
  `npm-packages/*` are noise for what ships and are not reported.
- `Npm.depends` pins exact versions, but transitive dependencies are resolved
  fresh when the lockfile is generated. That matches what `meteor publish`
  does, since `packages/**/.npm` shrinkwraps are not committed. A published
  package may therefore differ slightly from what is audited here.
- Git and HTTP dependency specs (e.g. `uWebSockets.js` in `ddp-server`) cannot
  be resolved by npm and are listed separately in the report. Socket flags git
  dependencies as a supply-chain risk in their own right.
- In CI the generated manifests are written inside the workspace
  (`npm-deps-generated/`, deliberately not gitignored) because the Socket CLI
  only scans targets under its working directory and skips anything matched by
  `.gitignore`. The directory only ever exists on the runner; locally, use a
  directory outside the repo as in the examples above.
- The meteor-tool dev bundle (`scripts/dev-bundle-tool-package.js`) is out of
  scope; it needs code changes rather than pin bumps and is tracked separately.
- The `submit` step needs `contents: write`, which fork pull requests do not
  get, so snapshots are submitted only on pushes to `devel` and on schedule.
