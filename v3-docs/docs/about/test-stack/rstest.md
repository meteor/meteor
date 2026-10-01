---
outline:
  level: [2, 3]
---

# Rstest Integration

Rstest gives Meteor apps a shared way to write tests, configure projects, and collect results. Small tests run directly in Node or a browser environment; tests that depend on Meteor run the same test API inside a real Meteor application.

## Add Rstest

The integration requires the [Rspack build setup](../modern-build-stack/rspack-bundler-integration.md), including application entry points. Add the test-only Atmosphere package to your app:

```bash
meteor add rstest
```

The test-only `rstest` package depends on Atmosphere `rspack`. On the first test run, their tooling installs the required compiler and coordinator dependencies, including `@meteorjs/rstest`, `@rstest/core`, and `@rstest/adapter-rspack`. Adding `rstest` selects its provider automatically; normal usage does not need `--test-runner` or `--driver-package`.

The baseline supports Node tests and Meteor server-runtime tests. Other environments require explicit dependencies:

| Capability | Additional project dependencies |
| --- | --- |
| Simulated DOM | `jsdom` |
| Browser Mode | `@rstest/browser`, `playwright`, and a browser binary |
| Meteor client-runtime tests | `playwright` and a browser binary |
| Full-app E2E | `@rstest/playwright`, `playwright`, and a browser binary |
| Istanbul coverage | `@rstest/coverage-istanbul` |
| Native V8 coverage | `@rstest/coverage-v8` |

For example, to use browser testing, E2E, and Istanbul coverage with Rstest `0.11.6`:

```bash
meteor npm install --save-dev jsdom playwright \
  @rstest/browser@0.11.6 @rstest/playwright@0.11.6 \
  @rstest/coverage-istanbul@0.11.6
meteor npx playwright install chromium
```

The integration manages the required Rstest version. Keep optional `@rstest/*` packages on the same version as your installed `@rstest/core`; the commands above match `0.11.6`. Upstream documentation can describe features newer than the version installed in your app. Framework-specific browser adapters and testing libraries are additional project choices.

Meteor validates selected capabilities before launch, but does not silently install these optional packages or download browsers. To manage required npm dependencies yourself as well, set `meteor.autoInstallDeps` to `false` in `package.json`.

## Write your first tests

### Application logic

Create a colocated test such as `imports/math/add.test.js`:

```js
import { expect, test } from '@rstest/core';

test('adds two numbers', () => {
  expect(2 + 3).toBe(5);
});
```

Run it without a Meteor host:

```bash
meteor test --once --project meteor-pure-server
```

Omit `--once` to watch for changes. Tests can use the upstream declarations, hooks, table-driven cases, assertions, fixtures, snapshots, and `rs` utilities.

### Real Meteor services

Use the same test imports alongside Meteor imports. For example, `imports/api/tasks.server.meteor.rstest.test.js` can exercise a real collection:

```js
import { afterEach, expect, test } from '@rstest/core';
import { Mongo } from 'meteor/mongo';

const Tasks = new Mongo.Collection('rstest-guide-tasks');

afterEach(async () => {
  await Tasks.removeAsync({});
});

test('persists a task', async () => {
  const id = await Tasks.insertAsync({ title: 'Try Rstest' });
  const task = await Tasks.findOneAsync(id);
  expect(task.title).toBe('Try Rstest');
});
```

```bash
meteor test --once --server-only --project meteor-runtime-server
```

Meteor builds the test application and starts its local database. The `.server` marker selects the server side; the Meteor dependency selects the real runtime. Keep test data isolated and clean it up between cases. Do not point destructive test fixtures at a production database.

You do not import a second test API from `meteor/rstest`. That module is an internal bridge. Application and package tests use `@rstest/core`; Browser Mode and E2E use the appropriate upstream browser extensions.

## Test discovery and projects

Tests can live alongside their source files. Meteor discovers ordinary `*.test.*` and `*.spec.*` files and uses their dependency graph to determine the environment:

| Dependency signal | Generated project |
| --- | --- |
| `@rstest/core`, with no Meteor or browser requirement | `meteor-pure-server` |
| Simulated DOM hint | `meteor-pure-client` |
| `@rstest/browser` | `meteor-browser` |
| Rstest test reaching `meteor/*`, directly or through application code | `meteor-runtime-server` or `meteor-runtime-client` |
| `@rstest/playwright` | `meteor-e2e` |

Direct and transitive dependencies participate, including statically resolvable dynamic imports and CommonJS imports. Type-only imports do not select a runtime. Existing `tests/rstest/pure/server`, `pure/client`, `browser`, `runtime/server`, `runtime/client`, and `e2e` directories remain supported routing hints, not required layouts.

When imports cannot express the environment or tests only use globals, filename markers make it explicit:

```text
math.rstest.test.ts
counter.dom.rstest.test.tsx
items.server.meteor.rstest.test.ts
subscription.client.meteor.rstest.test.ts
counter.browser.rstest.test.tsx
login.e2e.rstest.test.ts
```

A marker cannot force a Meteor dependency into a native-only environment. Conflicts fail before tests start instead of substituting mocked Meteor modules. Files without a Rstest signal remain available to custom projects or existing drivers; Mocha and Tinytest files are not converted.

If a legacy suite remains in the app, give that driver its own test entry points or keep Rstest files in the compatibility roots. Legacy eager discovery does not use Rstest's import-aware filtering. See [incremental adoption](./drivers.md#adopt-incrementally) before mixing colocated files from different engines.

Narrow a run by generated project, file, name, or side:

```bash
meteor test --once --project meteor-pure-server
meteor test --once --test-file imports/math/add.test.js
meteor test --once --test-name-pattern 'persists a task'
meteor test --once --server-only
```

`--project` and `--test-file` can be repeated. See the [CLI reference](/cli/index.md#meteortest) for the command options.

## Configuration

Use an ordinary `rstest.config.ts`, `.mjs`, or `.cjs` configuration. The [official Rstest configuration reference](https://rstest.rs/config/) describes the upstream options; the sections below explain the Meteor-specific boundaries.

For a static configuration, use `defineConfig` from `@rstest/core`. If configuration needs to know how Meteor is running, use the factory helper from `@meteorjs/rstest`:

```ts
import { defineConfig } from '@meteorjs/rstest';

export default defineConfig(context => ({
  clearMocks: true,
  restoreMocks: true,
  testTimeout: context.fullApp ? 45_000 : 10_000,
  hookTimeout: 15_000,
  maxConcurrency: 2,
}));
```

The factory receives immutable Meteor context, including `context.appRoot`, `context.command`, `context.fullApp`, `context.packageTests`, and `context.architectures`. The [typed context reference](https://github.com/meteor/meteor/blob/devel/npm-packages/meteor-rstest/index.d.ts) lists all fields. It is evaluated once per configuration generation. Run factory configurations through Meteor; standalone Rstest does not supply this context.

Top-level settings are applied to generated projects where supported. Shared `setupFiles` must work in every selected environment. Put Meteor-only setup in a module imported by the runtime tests, so native Node and browser projects do not evaluate Meteor imports.

You can add inline Rstest projects with distinct names, for example for in-source tests. The six generated `meteor-*` names are reserved. String or glob project entries are not supported. Keep the configuration root at the application root. Import-aware routing excludes Meteor-owned files from overlapping custom projects; directory-only configurations need separate project roots to avoid duplicate ownership.

Native compilation reuses the relevant Rspack/SWC configuration, aliases, assets, CSS handling, and compatible `tools.rspack` customization. It does not start Meteor's dev server or reuse application lifecycle plugins as native test plugins.

## Browser testing and E2E

Use jsdom for tests that need DOM APIs without a browser, and Browser Mode for component behavior that depends on a real browser:

```bash
meteor test --once --client-only --project meteor-pure-client
meteor test --once --client-only --browser chromium --project meteor-browser
```

These are different from `meteor-runtime-client`, which runs tests inside the real Meteor browser program with DDP, Minimongo, Tracker, and Atmosphere client code available. The Meteor client launcher supports Chromium, Firefox, and WebKit when their binaries are installed. Browser support depends on the selected mode: the pinned `@rstest/playwright` E2E fixture supports Chromium only.

For a complete user journey, use the upstream Playwright fixture in a file such as `tests/e2e/home.test.ts`:

```ts
import { expect, test } from '@rstest/playwright';

test('shows the home page', async ({ page }) => {
  await page.goto(process.env.METEOR_RSTEST_BASE_URL!);
  await expect(page.locator('body')).toBeVisible();
});
```

```bash
meteor test --once --full-app --browser chromium --project meteor-e2e
```

Meteor starts the full app, exposes its URL through `METEOR_RSTEST_BASE_URL`, and cleans up the host when testing finishes. Do not start a separate development server for this command. E2E currently requires both `--once` and `--full-app`; it is not a watch-mode project.

## Snapshots and mocks

Use `expect(...).toMatchSnapshot()`, inline snapshots, or file snapshots through Rstest. Native projects use upstream snapshot handling. Meteor-runtime projects use a persistent snapshot environment connected to the host; writes require explicit update mode:

```bash
meteor test --once --project meteor-runtime-server --update-snapshots
```

Review generated snapshot changes before committing them. Package-test invocations currently reject snapshot-update mode.

`rs.mock`, `rs.fn`, and `rs.spyOn` keep the same API across native and Meteor-runtime tests. Runtime module replacement is limited to application and npm modules compiled by Rspack. Replacing `meteor/*` or Atmosphere packages is rejected: Meteor services stay real. You can still observe application boundaries with spies without replacing the host.

## Coverage

Enable coverage on the tests you want to run:

```bash
meteor test --once --coverage
meteor test --once --full-app --coverage
meteor test-packages --once --coverage my-package
```

For app tests, **Istanbul coverage combines selected native and Meteor execution into one report**. Depending on the selected mode, this includes real server/client hosts, isolated server workers, or full-app E2E pages, plus loaded local Atmosphere sources using standard compilers.

Package-test selections can also produce coverage through `meteor test-packages`. Each command produces its own report; the integration does not merge separate app/package invocations or different test drivers. The worker and full-app restrictions described below still apply.

Configure it in the same Rstest file:

```ts
import { defineConfig } from '@rstest/core';

export default defineConfig({
  coverage: {
    provider: 'istanbul',
    include: ['imports/**/*.{js,jsx,ts,tsx}'],
    exclude: ['**/*.{test,spec}.*', '**/*.d.ts'],
    reporters: ['text', 'html', 'json-summary'],
    reportsDirectory: 'coverage',
    reportOnFailure: true,
  },
});
```

Include/exclude rules, report options, and configured thresholds apply to the combined report. The example above writes an HTML report to `coverage/index.html` and a summary to `coverage/coverage-summary.json`. Add generated reports to `.gitignore`.

Native-only selections keep upstream Istanbul or V8 coverage. A selection that includes Meteor hosts requires Istanbul; V8 collection inside Meteor is not supported. With coverage disabled, no coverage instrumentation is added.

Current limits:

- Reports do not accumulate across Meteor watch generations.
- Included but never-loaded source files do not receive synthetic zero-hit entries in combined Meteor coverage.
- Local Atmosphere sources using the standard `ecmascript` or `typescript` compiler path are supported; custom compiler output is not.
- E2E collection covers fixture browsers and direct launches through the selected project's `playwright` module. Browsers launched in another process or outside that project are not collected.

## Parallelism and feedback

Native Rstest projects keep upstream worker configuration. For example:

```bash
meteor test --once --project meteor-pure-server -- --pool.type threads --pool.maxWorkers 4
```

For file-level isolation between real Meteor server tests:

```bash
meteor test --once --server-only --project meteor-runtime-server --runtime-workers 2
```

Each worker gets a separate Meteor host, build context, local Mongo database, and ports. Files are partitioned deterministically, and the parent aggregates the results. More hosts also mean more build and startup work; use this when isolation or suite size justifies it.

Values above `1` currently require `meteor test --once --server-only`. They do not support full-app E2E, client/browser execution, package tests, watch mode, custom drivers, debugging, mobile modes, or external Mongo/ROOT URL overrides. The default is one host.

Within a host, tests are serial unless they opt into `.concurrent`; `maxConcurrency` bounds that concurrency. Those cases share host state and the database. In-test concurrency is not a substitute for isolated runtime workers.

Native-only runs can use `--shard`, `--changed`, and `--changed-since` with `--once`. These options are not supported for embedded Meteor-runtime projects.

### Reporting

Native projects use their configured Rstest reporters. Hosted tests print compact per-file results and failure details, with client and worker results aggregated once. For more detail:

```bash
meteor test --once --verbose
meteor test --once -- --reporters=verbose
```

The first also enables Meteor diagnostics. The second requests detailed test rows without those diagnostics. Hosted results do not currently provide the native event stream required by JSON, JUnit, or arbitrary custom Rstest reporters.

## Test Atmosphere packages

Declare Rstest in the package's test dependencies:

```js
Package.onTest(api => {
  api.use(['ecmascript', 'rstest', 'my-package']);
  api.mainModule('my-package.tests.js');
});
```

The test module imports declarations and assertions from `@rstest/core` and the package's real exports from `meteor/my-package`. Keep `rstest` a strong, ordered test dependency on the architectures you want to test.

```bash
meteor test-packages --once my-package
meteor test-packages --once --server-only --coverage my-package
```

Package tests retain `Package.onTest`, Meteor linking, and test-only unibuilds. They support coverage, configuration, name filtering, browser choice, and side selection. Project/file filtering, snapshot updates, sharding, and changed-file selection are not supported for this command.

All selected packages must use the same test engine for the active architectures. Run Rstest and Tinytest/Mocha packages in separate commands; mixed ownership is rejected with guidance. See [Existing Test Drivers](./drivers.md) for the fallback path.

## Meteor-runtime boundaries

Hosted tests execute Rstest's upstream file runtime, including declarations, modifiers, parameterization, fixtures, hooks, context, matchers, retries, repeats, fake timers, snapshots, and mocks within the limits above. They do not execute inside a native Rstest file worker.

That distinction matters: native worker module isolation/reset, file sharding, changed-file selection, and native reporter events do not automatically carry over. Only the implemented configuration subset is projected into the host; arbitrary upstream configuration is not a promise of embedded compatibility. Runtime defaults are a 30-second test timeout, 10-second hook timeout, and concurrency limit of 5.

The integration does not execute `node:test` or `bun:test` files as Rstest tests, and it does not provide a configurable Bun host launcher. Other engines can be integrated through the [provider architecture](./providers.md), but require their own execution and result adapters.
