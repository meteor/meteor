---
outline:
  level: [2, 3]
---

# Existing Test Drivers

Meteor's existing driver-package route remains available. You can continue using your application's Mocha setup, Tinytest package tests, or another driver without adopting Rstest. Driver improvements and new provider integrations can evolve independently.

## Application tests

For an app already using `meteortesting:mocha`, keep its existing commands:

```bash
meteor test --driver-package meteortesting:mocha
meteor test --once --driver-package meteortesting:mocha
meteor test --once --full-app --driver-package meteortesting:mocha
```

The driver still controls its supported environments, test API, reporting, and additional configuration. `--full-app` runs with the application loaded, while ordinary `meteor test` uses Meteor's test mode. Preserve your current test entry points, `meteor.testModule` settings, and driver-specific setup.

Adding Rstest does not translate Mocha's callback `done`, Mocha `this`, custom reporters, or driver hooks into another API. Files kept on the driver route retain their actual driver semantics.

## Package tests

Traditional package tests continue to declare their engine in `Package.onTest`. For example, a Tinytest package can retain:

```js
Package.onTest(api => {
  api.use(['ecmascript', 'tinytest', 'my-package']);
  api.mainModule('my-package.tests.js');
});
```

```bash
meteor test-packages ./packages/my-package
```

The default package-test route displays its results in a browser. Open the address printed by Meteor; a running server alone does not mean the browser tests have completed. For custom drivers, keep specifying `--driver-package` as required by that setup.

When working on the Meteor source repository, its existing headless package-test helper is also available:

```bash
./packages/test-in-console/run.sh "my-package"
```

Run that command from the Meteor repository root. It uses the established console driver and browser automation; it is not a Rstest command.

## Select a provider or a driver

With no explicit policy, adding Atmosphere `rstest` activates its provider for app tests. Package tests activate it only when all selected test unibuilds use Rstest for the active architectures.

An explicit `--driver-package` bypasses **automatic** provider activation. If you have explicitly selected a non-driver provider in `--test-runner`, `METEOR_TEST_RUNNER`, or `package.json`, remove that selection or opt out before using a driver. Conflicting requests are rejected instead of silently choosing one.

For a persistent driver route, use this `package.json` setting:

```json
{
  "meteor": {
    "testRunner": "driver"
  }
}
```

Then continue selecting the concrete driver with `--driver-package`. The value `driver` is policy vocabulary, not a provider ID: do not pass `--test-runner driver`.

For provider selection, the explicit `--test-runner` option takes precedence over `METEOR_TEST_RUNNER`, then `meteor.testRunner`, then package-based automatic activation. Normal Rstest usage needs none of these overrides.

## Adopt incrementally

Keep the existing suite running, add Rstest tests for a small area, and use separate commands for each engine. The Rstest provider identifies its tests through imports or explicit routing hints. Existing driver-owned files are not rewritten or executed by Rstest.

Also keep discovery separate. A legacy driver's eager discovery can still load ordinary colocated `*.test.*` or `*.spec.*` files, including a new Rstest file. Use a driver-specific test entry point, such as `meteor.testModule`, that imports only the legacy suite. Alternatively, keep new Rstest tests under the `tests/rstest/**` compatibility roots excluded from legacy eager discovery until that suite is migrated. Check that each command runs only its intended files; separate commands alone do not isolate all colocated tests.

Each invocation has one outer provider or driver owner. For package tests, do not mix Rstest packages and Tinytest/Mocha packages in the same selection. Run homogeneous groups separately, with the appropriate driver where needed. Rstest's unified coverage combines its selected environments, not results from unrelated driver invocations.

Rstest is an additional application and package workflow, not a migration of Meteor's entire contributor test infrastructure. The tool self-tests, existing package suites, and other repository checks continue to serve their own purposes.

See [Rstest Integration](./rstest.md) when you are ready to migrate a test, and [Test-Runner Providers](./providers.md) if you are maintaining an integration of your own.
