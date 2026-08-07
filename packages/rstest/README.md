# `rstest`

Test-only capability and Meteor-runtime executor for `@meteorjs/rstest`.

Adding `rstest` selects Rstest for `meteor test` and for selected
`meteor test-packages` whose `Package.onTest` metadata has a strong `rstest`
dependency. Explicit `--driver-package` or persistent
`meteor.testRunner: "driver"` keeps the established driver route.
The test-only package has a strong Atmosphere dependency on `rspack` and owns
its tool-host provider under `tooling/`. Meteor compiles that provider through
the narrow `Package.registerTestRunnerPlugin` API; provider code never enters
the application runtime bundle and ordinary build plugins remain forbidden in
`testOnly` packages. This mirrors the existing `rspack` +
`@meteorjs/rspack` lifecycle split without a second Atmosphere package.

Both Modern Tools capabilities install their npm side automatically before
native Rstest starts. `rspack` owns `@meteorjs/rspack`, Rspack, and SWC
dependencies; `rstest/tooling` owns `@meteorjs/rstest`, `@rstest/*`, jsdom, and
Playwright.
This avoids duplicate manifests and keeps compiler versions under the existing
Rspack package. Set `meteor.autoInstallDeps` to `false` in `package.json` to
disable all Modern Tools dependency installation and manage these packages
manually.

Automatic package selection is architecture-aware and requires homogeneous
ownership. Mixed Rstest/Tinytest/Mocha selections fail before compilation with
separate commands; unknown/custom drivers require explicit `--driver-package`.

## Driver packages and test-runner providers

A driver package runs inside an already built Meteor test application. It
expects Meteor/Isobuild compilation, server/client runtime, and the normal
Meteor host lifecycle. `test-in-browser` and `meteortesting:mocha` follow this
model.

A test-runner provider runs inside the Meteor tool before host construction.
It can select native-only execution or request a Meteor host, supervise native
processes and browsers, pass immutable options to compiler plugins, propagate
exit status, and clean up all owned resources. Rstest needs this earlier
boundary so pure, Browser Mode, snapshot, and Playwright projects retain native
Rstest/Rspack behavior while runtime projects still execute inside a real
Meteor program.

Normal commands rely on automatic provider activation. `--test-runner <id>`
is an advanced explicit provider override. It does not select driver packages;
use `--driver-package <name>` for that route. The `driver` value is reserved
for persistent `meteor.testRunner` opt-out policy, not as a `--test-runner`
provider id. Only one provider or driver owns one command invocation.

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

Package integration note: `rstest` uses `rspack` and
`isobuild:test-runner-plugin` as intentional strong dependencies. Consumers
only add or `api.use('rstest')`; its runtime and tool-host provider are one
capability. Use `Package['name']` only when integrating an optional weak
dependency at runtime, not as an availability check for these required parts.
