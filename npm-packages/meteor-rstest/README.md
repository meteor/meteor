# `@meteorjs/rstest`

Meteor-owned Rstest coordinator and configuration bridge.

This package is paired with the test-only Atmosphere package `rstest`. Meteor
keeps ownership of CLI selection, Isobuild, Atmosphere packages, MongoDB, DDP,
the application process, browser launch, restarts, and cleanup. Rstest owns
native test collection, Rspack compilation, assertions, snapshots, Browser
Mode, Playwright fixtures, filtering, reporting, and exit status.

## Install

```sh
meteor add rstest
meteor npm install --save-dev \
  @meteorjs/rspack@3.0.0-beta.0 \
  @meteorjs/rstest@0.1.0-beta.0 \
  @rspack/cli@2.1.8 \
  @rspack/core@2.1.8
```

Adding `rstest` makes `meteor test` select Rstest. `meteor test-packages`
selects Rstest only when every selected test unibuild for active architectures
has a strong, ordered `rstest` dependency. Existing explicit driver commands keep their
current behavior:

```sh
meteor test --once
meteor test --once --driver-package meteortesting:mocha
```

Persistent selection uses `package.json`:

```json
{
  "meteor": {
    "testRunner": "rstest"
  }
}
```

Use `"driver"` together with the existing `--driver-package` option to opt out.
An explicit `--driver-package` always wins.

## Test ownership

| Root | Compiler and runtime |
| --- | --- |
| `tests/rstest/pure/server` | Native Rstest, Rspack, Node |
| `tests/rstest/pure/client` | Native Rstest, Rspack, jsdom |
| `tests/rstest/browser` | Native Rstest Browser Mode and Playwright |
| `tests/rstest/runtime/server` | Meteor/Rspack/Isobuild server, including Atmosphere packages and MongoDB |
| `tests/rstest/runtime/client` | Meteor/Rspack/Isobuild in the real Meteor browser runtime |
| `tests/rstest/e2e` | `@rstest/playwright` against a Meteor-owned full application |
| Existing Meteor `.test`/`.app-test`, `meteor.testModule`, and optional `tests/legacy` outside native roots | Existing real driver route; never source-translated into Rstest |

Pure projects intentionally do not emulate `meteor/*` resolution. Move tests
requiring Meteor globals, Atmosphere exports, DDP, WebApp, package test-only
unibuilds, or MongoDB into a runtime root and import the runtime API from
`meteor/rstest`.

## Dynamic configuration

`defineConfig` returns ordinary native Rstest configuration. Object configs are
unchanged. A factory receives one immutable Meteor context and is evaluated by
the Meteor coordinator:

```js
const { defineConfig } = require('@meteorjs/rstest');

module.exports = defineConfig(context => ({
  globals: true,
  retry: process.env.CI ? 2 : 0,
  testTimeout: context.fullApp ? 30_000 : 10_000,
  env: {
    METEOR_TEST_COMMAND: context.command,
    METEOR_TEST_ARCHITECTURES: context.architectures.join(','),
  },
}));
```

Context fields are typed in `index.d.ts`: command, run/watch mode, full-app and
package-test flags, native/external phase, client/server selection,
architectures, application/config/harness roots, and Meteor local directory.
Factory configs must run through `meteor test`; standalone Rstest cannot supply
this context. Native object configuration remains portable.

Meteor generates protected projects named `meteor-pure-server`,
`meteor-pure-client`, `meteor-browser`, `meteor-runtime-server`,
`meteor-runtime-client`, and `meteor-e2e`. Inline user projects remain supported
when they use distinct names and explicit roots disjoint from every
`tests/rstest` ownership root. Current beta rejects string/glob project entries
until upstream expansion can be ownership-audited safely.

Pure projects reuse `@meteorjs/rspack` SWC/`.swcrc`, resolution aliases and
fallbacks, CSS and static-asset rules, Meteor compile-time side/test defines,
and compatible user `tools.rspack` composition. Meteor lifecycle/output plugins,
entries, externals registration, and dev-server ownership remain excluded.

## CLI

Meteor exposes stable Rstest options through its existing commands:

```sh
meteor test --once --server-only
meteor test --once --client-only --browser chromium
meteor test --once --project meteor-browser
meteor test --once --test-file tests/rstest/pure/server/math.test.js
meteor test --once --test-name-pattern '^inserts document$'
meteor test --once --coverage
meteor test --once --update-snapshots
meteor test --once --shard 1/4
meteor test --once --changed-since main
meteor test --once --full-app --project meteor-e2e
```

Arguments after `--` pass to native Rstest. `--shard`, `--changed`, and
`--changed-since` require `--once` and pure native projects; Meteor-runtime
projects reject them until runtime scheduling supports equivalent semantics.
External E2E currently requires `--once`.
External E2E is collected only with `--full-app`; explicitly selecting
`meteor-e2e` without it fails.

For `meteor test-packages`, dynamic config evaluates once with
`context.command === "test-packages"`, `packageTests === true`, and distinct
application/harness roots. `testTimeout` and `hookTimeout` configure bounded
Meteor runtime cases. Name filtering, browser choice, and side selection work.
Worker-only project/file, coverage, snapshot-update, shard, and changed-file
options fail before build instead of being ignored. Mixed Rstest and legacy
package ownership also fails with exact split commands until real compatibility
executors can share one harness.

Outside an application, `meteor test-packages /absolute/package/path`
bootstraps exact compatible coordinator/Rspack npm packages into its temporary
harness. Source-checkout E2E uses `METEOR_RSTEST_NPM_SPEC` and
`METEOR_RSPACK_NPM_SPEC` only to mirror unpublished local package directories.

Snapshots and coverage are native Rstest services for pure, DOM, Browser Mode,
and external projects. Meteor-runtime projects currently provide assertions,
hooks, filtering, structured results, and architecture aggregation; they do not
pretend to support Rstest worker-only mocking or snapshot internals.

## Playwright fixture

Use the re-export matching this package's pinned Rstest version:

```js
const { test, expect } = require('@meteorjs/rstest/playwright');

test('Meteor app is ready', async ({ page }) => {
  await page.goto(process.env.METEOR_RSTEST_BASE_URL);
  await expect(page.locator('body')).toContainText('Meteor');
});
```

Meteor starts the app and submits the external project result back through the
versioned runtime protocol before cleanup.
