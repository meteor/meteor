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
```

That command supplies required integration baseline. Before Rstest launches,
Atmosphere `rspack` installs its compiler-side npm dependencies and
`rstest/tooling` installs `@meteorjs/rstest`, `@rstest/core`, and
`@rstest/adapter-rspack`. This is sufficient for Node unit tests, snapshots,
native reporters/workers/sharding, and Meteor server-runtime tests.

Optional Rstest capabilities remain explicit project choices:

| Selected capability | Project dependency |
| --- | --- |
| `meteor-pure-client` generated jsdom project | `jsdom` |
| `meteor-browser` Browser Mode | `@rstest/browser`, `playwright`, selected browser binary |
| `meteor-runtime-client` or client package tests | `playwright`, selected browser binary |
| `meteor-e2e` | `@rstest/playwright`, `playwright`, selected browser binary |
| Istanbul coverage | `@rstest/coverage-istanbul` |
| V8 coverage | `@rstest/coverage-v8` |

For example:

```sh
meteor npm install --save-dev jsdom @rstest/browser playwright
npx playwright install chromium
```

Selected optional capability is validated before launch. Meteor prints an
actionable install command but does not silently add optional dependencies or
download browser binaries. Keep optional `@rstest/*` package versions
compatible with installed `@rstest/core`.

To manage required npm dependencies yourself too, set `meteor.autoInstallDeps`
to `false` in `package.json`. Missing coordinator or compiler packages fail
before any test is reported as passing.

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

Use `"meteor.testRunner": "driver"` as the persistent provider opt-out, then
select a concrete runtime driver with the existing `--driver-package` option.
An explicit `--driver-package` always wins.

## Driver packages versus test-runner providers

| Concern | Driver package | Test-runner provider |
| --- | --- | --- |
| Runs in | Generated Meteor test app | Meteor tool process |
| Host decision | Assumes Meteor host already exists | Selects native-only or Meteor-host execution before build |
| Compilation | Meteor/Isobuild completes before the driver runs | Runs native compilation or requests a Meteor host, with immutable package-scoped compiler options |
| Lifecycle | Runtime hooks and reporting | Validation, process/browser supervision, watch generations, exit propagation, cleanup |
| Examples | `test-in-browser`, `meteortesting:mocha` | Provider owned by test-only `rstest` |

`--driver-package <name>` always selects the runtime-driver route.
`--test-runner <provider-id>` is an advanced provider override; normal Rstest
usage needs neither because adding `rstest` activates its provider. One command
has one outer provider or explicit driver owner. Provider-owned Meteor hosts
may reuse established driver startup contract internally; Rstest uses its
Atmosphere package for that runtime adapter. Reusing `--driver-package` for tool-side providers
would overload established package-inclusion semantics and would still require
the provider lifecycle underneath. `driver` is policy vocabulary, not a
provider id accepted by `--test-runner`.

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
unibuilds, or MongoDB into a runtime root. Keep importing test APIs from
`@rstest/core`; importing real `meteor/*` dependencies selects the embedded
Meteor runtime.

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
  maxConcurrency: 5,
  env: {
    METEOR_TEST_COMMAND: context.command,
    METEOR_TEST_ARCHITECTURES: context.architectures.join(','),
  },
}));
```

Context fields are typed in `index.d.ts`: command, run/watch mode, full-app and
package-test flags, native/external phase, client/server selection,
architectures, application/config/harness roots, and Meteor local directory.
The context also exposes normalized `verbose`; it is true for top-level
`meteor.verbose`, `meteor.modern.verbose`, or
`meteor.modern.transpiler.verbose`.
Factory configs must run through `meteor test`; standalone Rstest cannot supply
this context. Native object configuration remains portable.

Native and Meteor-runtime suites both support `test.concurrent` and
`describe.concurrent`, bounded by `maxConcurrency` (default `5`). Runtime cases
remain serial unless opted in, share their Meteor host and Mongo database, and
can use `.sequential` as an ordering barrier. `--runtime-workers` stays the
separate file-level mechanism for isolated Meteor hosts and databases.

All projects use `rs.mock`, `rs.fn`, and `rs.spyOn` directly from
`@rstest/core`. Meteor's supervised Rstest process owns `NODE_ENV=test` so
hoisting remains enabled even though Meteor CLI itself runs with a production
environment. In Meteor-runtime projects, Rspack may mock application and npm
modules, but replacement of `meteor/*` and Atmosphere packages is rejected so
Meteor, MongoDB, DDP, and package exports stay real.

Meteor generates protected projects named `meteor-pure-server`,
`meteor-pure-client`, `meteor-browser`, `meteor-runtime-server`,
`meteor-runtime-client`, and `meteor-e2e`. Inline user projects remain supported
with distinct names. Legacy root-only plans require disjoint project roots;
import-aware plans exclude Meteor's exact owned files from overlapping app-root
projects. Current beta rejects string/glob project entries until upstream
expansion can be ownership-audited safely.

### Import-aware routing

Rstest tests do not need a routing directory. With the Rstest provider active,
Meteor discovers ordinary `*.test.*` and `*.spec.*` candidates and asks one
Rspack dependency graph to classify direct and transitive imports:

| Resolved signal | Execution |
|---|---|
| `@rstest/core` | Native Rstest, Node by default |
| `@rstest/browser` | Native Rstest Browser Mode |
| `@rstest/playwright` | External E2E against the Meteor app URL |
| An Rstest-owned graph reaching `meteor/*` | Upstream Rstest file runtime inside a real Meteor host |

Static dynamic imports and CommonJS `require` participate. Type-only imports do
not. Existing `tests/rstest/**` roots remain compatible ownership hints, while
`tests/legacy/**` remains driver-owned. Unmarked files with no Rstest signal stay
available to user-defined Rstest projects or legacy test routes.

Fallback-only filename markers provide explicit ownership for globals or
resolve environments and architectures that imports cannot distinguish:

```text
math.rstest.test.ts
math.native.rstest.test.ts
counter.dom.rstest.test.tsx
items.server.meteor.rstest.test.ts
subscription.client.meteor.rstest.test.ts
counter.browser.rstest.test.tsx
login.e2e.rstest.test.ts
```

Markers cannot force real `meteor/*`, Browser Mode, or Playwright dependencies
into an incompatible runtime. Meteor reports that conflict before test startup.
`--project`, `--test-file`, `--server-only`, and `--client-only` still narrow the
inferred exact-file manifest. Dynamic `rstest.config` evaluation remains once per
test generation and is not executed during dependency classification.

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
meteor test --once --server-only --project meteor-runtime-server --runtime-workers 4
meteor test --once --full-app --project meteor-e2e
```

`--project` and `--test-file` may be repeated. Provider options are
capability-qualified: a selected provider must reject unsupported combinations
before dependency installation or compilation.

Arguments after `--` pass to native Rstest. `--shard`, `--changed`, and
`--changed-since` require `--once` and pure native projects; Meteor-runtime
projects reject them until runtime scheduling supports equivalent semantics.
External E2E currently requires `--once`.
External E2E is collected only with `--full-app`; explicitly selecting
`meteor-e2e` without it fails.

`--runtime-workers N` is separate from native Rstest workers and `--shard`.
For `N > 1`, current support is limited to `meteor test --once --server-only`
and selected `tests/rstest/runtime/server/**` files. Parent Rstest config/native
planning and Meteor local-package preparation run once. Files are sorted and
partitioned deterministically; each non-empty partition gets an isolated
Meteor harness, Rspack build context, proxy/Mongo port pair, local database,
and generation-bound result. Sibling assertion failures remain visible in one
stable aggregate. Client/browser, watch, full-app, package tests, drivers, and
external Mongo/ROOT URLs reject this option instead of silently falling back.
The default value `1` preserves the existing single-host lifecycle.

## Reporting and verbosity

Native projects use native Rstest reporters exactly as configured. Meteor
runtime projects cannot feed their smaller structured result directly into
those reporters: Rstest 0.11.6 does not export built-in reporter classes, and
its experimental custom reporter API requires native file/suite events. Meteor
therefore formats runtime results with the same compact checks, failures, and
aligned totals without importing private Rstest bundle paths.

Default output prints one row per app-relative server/browser runtime test file
with Rstest-style `Test Files` and `Tests` totals. It hides passing case rows,
reporter-added worker labels, and `[Meteor-Rstest]` transport frames, while
always retaining full failure details. Client browsers submit results without printing a second copy.
Runtime-worker hosts write results silently; the parent prints one aggregate.

Enable detailed native and Meteor-runtime reporting, plus Meteor/provider
diagnostics, with the existing Meteor command flag:

```bash
meteor test --verbose
```

Package config provides the persistent equivalent:

```json
{
  "meteor": {
    "verbose": true
  }
}
```

This adds passing case names and durations, runtime-worker attribution, and
generic Meteor tool diagnostics. Rstest ownership routing and raw protocol JSON
stay hidden. User-configured native `reporters` remain authoritative; Meteor
selects Rstest's native verbose reporter only when no reporter was configured.
`METEOR_DISABLE_COLORS` and `NO_COLOR` disable runtime ANSI styling.

For detailed reporter rows without Meteor diagnostics, pass Rstest's native
reporter option after Meteor's `--` separator:

```bash
meteor test --once --server-only --runtime-workers 4 -- --reporters=verbose
```

`--reporter=verbose` and split flag/value forms work too. Native projects use
the requested Rstest reporter directly. Meteor runtime and parallel parent
aggregation project only verbose row detail; they do not enable provider
diagnostics, ownership chatter, or `[Meteor-Rstest]` frames. This is preferred
when detailed test output should remain free of generic Meteor verbose logs.
Other reporter types are not emulated for Meteor-runtime results.

Set `METEOR_RSTEST_DEBUG=1` only when diagnosing integration transport. It
exposes raw generation-bound `[Meteor-Rstest]` result frames independently from
normal Meteor and reporter verbosity.

For `meteor test-packages`, dynamic config evaluates once with
`context.command === "test-packages"`, `packageTests === true`, and distinct
application/harness roots. `testTimeout`, `hookTimeout`, and `maxConcurrency`
configure bounded Meteor runtime cases. Name filtering, browser choice, and side selection work.
Worker-only project/file, coverage, snapshot-update, shard, and changed-file
options fail before build instead of being ignored. Mixed Rstest and legacy
package ownership also fails with exact split commands until real compatibility
executors can share one harness.

Top-level `setupFiles` are loaded before each test file in native and embedded
projects. Keep shared setup environment-neutral. Import Meteor-only setup from
runtime test files so native Node, jsdom, Browser Mode, and E2E projects do not
evaluate Meteor modules.

Outside an application, `meteor test-packages /absolute/package/path`
bootstraps compatible compiler dependencies through Atmosphere `rspack` and
exact coordinator dependencies through `rstest/tooling` into its temporary
harness. Source-checkout E2E persists local `file:` specs for both unpublished
npm packages; `METEOR_RSTEST_NPM_SPEC` and `METEOR_RSPACK_NPM_SPEC` are internal
mirror overrides, not user configuration.

## Snapshots and coverage

Snapshots use native Rstest APIs in pure, DOM, Browser Mode, and external
projects. Inline, committed `.snap`, and standalone file snapshots need no
Meteor-specific adapter:

```js
import { expect, test } from '@rstest/core';

test('records stable toolchain output', async () => {
  expect({ compiler: 'rspack', runner: 'rstest' }).toMatchSnapshot('toolchain');
  expect(['client', 'server']).toMatchInlineSnapshot(`
    [
      "client",
      "server",
    ]
  `);
  await expect('<main>Meteor</main>').toMatchFileSnapshot(
    '../snapshots/app.html',
  );
});
```

Review a mismatch, then update selected native snapshots through Meteor:

```sh
meteor test --once --project meteor-pure-server --update-snapshots
```

Native coverage is available through the Meteor command after project installs
its chosen provider:

```sh
meteor npm install --save-dev @rstest/coverage-istanbul
meteor test --once --project meteor-pure-server --coverage
```

Use native Rstest `coverage` configuration to select Istanbul or V8 and define
reporters, include/exclude patterns, and report paths. Meteor-runtime projects
support upstream snapshot assertions backed by a Meteor-owned persistent
snapshot environment. Snapshot writes require `--update-snapshots`. Runtime
coverage remains unavailable because code executes in a long-lived Meteor host,
not a native instrumented Rstest worker.

Module mocking uses the same API in native and Meteor-runtime projects:

```js
import { expect, rs, test } from '@rstest/core';
import { loadDeck } from './deck.js';

rs.mock('./deck.js', () => ({
  loadDeck: rs.fn(() => ['meteor', 'rspack']),
}));

test('uses a hoisted app-module mock', () => {
  expect(loadDeck()).toEqual(['meteor', 'rspack']);
});
```

Runtime `rs.mock` is limited to application and npm modules in the Rspack graph.
`rs.mock('meteor/...')` and Atmosphere package replacement fail explicitly.
`rs.fn` and `rs.spyOn` remain available for application boundaries while real
Meteor, Atmosphere, DDP, and Mongo continue running.

Embedded runtime keeps upstream suite/test declarations, parameterization,
`test.extend` fixtures, hooks, context, matchers, promise assertions, retry,
repeats, fake timers, spies/stubs, `waitUntil`, snapshots, name filtering, and
globals. Native worker isolation/reset, file sharding/changed selection,
coverage, and native reporter event streams remain native-only. Use
`--runtime-workers` for isolated Meteor processes and databases.

## Playwright fixture

Install and import Rstest's upstream fixture directly. Meteor owns application
lifecycle and exposes its URL; project owns E2E library and browser runtime:

```js
const { test, expect } = require('@rstest/playwright');

test('Meteor app is ready', async ({ page }) => {
  await page.goto(process.env.METEOR_RSTEST_BASE_URL);
  await expect(page.locator('body')).toContainText('Meteor');
});
```

Meteor starts the app and submits the external project result back through the
versioned runtime protocol before cleanup.
