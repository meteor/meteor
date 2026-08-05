# `rstest`

Test-only capability and Meteor-runtime executor for `@meteorjs/rstest`.

Adding `rstest` selects Rstest for `meteor test` and for selected
`meteor test-packages` whose `Package.onTest` metadata has a strong `rstest`
dependency. Explicit `--driver-package`, `--test-runner driver`, or
`meteor.testRunner: "driver"` keeps the established driver route.
The test-only package has strong Atmosphere dependencies on `rspack` and the
internal build-time-only `rstest-tooling` support package. This preserves the
existing `rspack` + `@meteorjs/rspack` lifecycle split while keeping build
plugins out of a `testOnly` package, which Meteor does not allow.

Both Atmosphere packages install their npm side automatically before native
Rstest starts. `rspack` owns `@meteorjs/rspack`, Rspack, and SWC dependencies;
`rstest-tooling` owns `@meteorjs/rstest`, `@rstest/*`, jsdom, and Playwright.
This avoids duplicate manifests and keeps compiler versions under the existing
Rspack package. Set `meteor.autoInstallDeps` to `false` in `package.json` to
disable all Modern Tools dependency installation and manage these packages
manually.

Automatic package selection is architecture-aware and requires homogeneous
ownership. Mixed Rstest/Tinytest/Mocha selections fail before compilation with
separate commands; unknown/custom drivers require explicit `--driver-package`.

Pure, DOM, Browser Mode, snapshot, coverage, and Playwright tests use native
Rstest APIs under `tests/rstest/pure`, `tests/rstest/browser`, and
`tests/rstest/e2e`. Tests requiring Meteor runtime import the supported API from
`meteor/rstest` and live under `tests/rstest/runtime`.

```js
import { expect, test } from 'meteor/rstest';

test('has Meteor runtime', () => {
  expect(Meteor.isTest).toBe(true);
});
```

Runtime tests preserve Meteor/Isobuild ownership of Atmosphere package linking,
`Package.onTest`, test-only unibuilds, MongoDB, DDP, WebApp, server/client
architectures, and globals. Atmosphere packages remain external to native
Rspack output and resolve from the real Meteor program; they are not bundled as
ordinary npm modules.

Supported runtime API: `describe`, `test`, `test.skip`, `test.todo`,
`test.only`, `beforeAll`, `afterAll`, `beforeEach`, `afterEach`, and the matcher
subset declared in `runtime/api.d.ts`. Async cases, promise matchers, and Meteor
CLI name filtering are supported. Cases and hooks have bounded, config-derived
timeouts; transport results are generation-bound, schema-validated, single-use,
and authenticated by capabilities injected only into managed runners.

Runtime module mocking, hoisting, native Rstest snapshots, and worker-only
features are not emulated. Keep those tests in a pure Rstest project or use
explicit dependency injection. Unmigrated Mocha/Tinytest files remain on their
real driver route so callback `done`, Mocha `this`, hooks, reporters, and custom
driver behavior are never approximated.

Package integration note: `api.use('rspack')` and
`api.use('rstest-tooling')` are intentionally strong dependencies. Use
`Package['name']` only when integrating an optional weak dependency at runtime;
it is not an availability check needed for these required packages.
