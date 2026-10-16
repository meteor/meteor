# E2E Tests

Isolated Jest + Playwright environment for testing Meteor skeletons, bundler
integrations, CLI behavior, and Accounts against real apps and Chromium.
Test dependencies stay in this directory so they cannot change the dependencies
used to build and ship the Meteor tool.

## Run from the repository root

```sh
# Install the test dependencies and the pinned Playwright browser
npm run install:e2e

# List every group and its CI workflow
npm run test:e2e:groups

# Run the same group selected by CI
npm run test:e2e:group -- monorepo
npm run test:e2e:group -- server_runtime
npm run test:e2e:group -- accounts

# Narrow a group to a test file (paths are relative to tools/e2e-tests)
npm run test:e2e:group -- react --runTestsByPath react.test.js

# Run all E2E tests, including Accounts
npm run test:e2e

# Check that every registered test belongs to exactly one group
npm run test:e2e:groups:audit
```

From `tools/e2e-tests/`, the equivalent commands are `npm run test:groups`,
`npm run test:group -- monorepo`, `npm test`, and `npm run test:groups:audit`.
Group selection does not depend on `CI` or GitHub Actions. CI enables longer
waits and retries; use `CI=true METEOR_E2E_TEST_RETRIES=1` locally to enable
those settings too. `HEADED=1` opens Chromium, and `RECORD=1` saves browser
videos. Group runs share fixed app ports: run groups sequentially on one
machine, or use isolated containers as CI does.

By default, app tests install the dependencies of `npm-packages/meteor-rspack`
and link that checkout into each app, including pnpm workspaces. This also works
on a fresh checkout. Set `NPM_LINK_RSPACK=false` to test the published package;
CI uses that setting on `release-*` branches.

Lifecycle tests reuse apps between phases. Prefer running a whole group or
file; filtering an individual lifecycle test with `-t` can omit the creation
or initialization it needs. Extra arguments are forwarded to Jest, so supplying
another `--testNamePattern` overrides the group's name selection.

## Group definitions and CI

[`test-groups.js`](test-groups.js) owns the groups, anchored test-name patterns,
file filters, and workflow assignments. The runner and coverage audit use the
same selection rules. No workflow files are needed to list, run, or audit
groups locally.

The [E2E Tests workflow](../../.github/workflows/e2e-tests.yml) first runs the
audit, then generates its job matrix from that module. Adding a group there
automatically adds its CI job. The matrix includes `uncategorized`, which
selects tests that match no named group; its job fails if those tests fail.
The audit warns about these tests so they can be assigned to a named group.

The `server_runtime` group runs separately from the other `regressions`.
`monorepo` includes npm, Yarn, pnpm, symlink fixtures, and the generated pnpm
skeleton. Accounts tests are selected by file in the `accounts` group and run
in the [E2E Accounts workflow](../../.github/workflows/e2e-accounts.yml).
Accounts is included in the coverage audit and excluded from the modern matrix
to avoid duplicate execution. Its workflow also runs when shared runner,
configuration, or dependency files change.

For tooling, `node tools/e2e-tests/scripts/list-test-groups.js --json` emits the
modern CI matrix; `--workflow accounts --json` emits the Accounts assignment.
The default human-readable group listing includes both workflows.

The audit registers tests without running app hooks or launching Chromium.
It requires only the isolated test dependencies, which can be installed with
`npm ci --prefix tools/e2e-tests`. It fails for missing coverage, overlapping
groups, empty named groups, discovery errors, or an empty test inventory.
Registration is not execution: existing `test.skip`/`describe.skip` declarations
remain skipped when their group runs. The legacy React Creator test is skipped;
the active React Skeleton lifecycle covers creation in `skeleton.test.js`.

## Add or move tests

1. Add a `*.test.js` suite outside `apps/`, using the existing helpers where
   appropriate. `apps/` contains fixture apps and is excluded from Jest discovery.
2. Match an existing group's name pattern, or add a group to `test-groups.js`.
   Keep patterns anchored with `^`. A new group defaults to the modern CI matrix.
3. Run `npm run test:e2e:groups:audit` from the repository root. A new test that
   has not been assigned yet still runs in the fallback job.
4. Run the affected group with `npm run test:e2e:group -- <group>`.
5. Update the [feature coverage report](../../dev/modern-tools/rspack/E2E_COVERAGE.md)
   when changing fixtures, skeletons, or covered behavior.
