---
outline:
  level: [2, 3]
---

# Test Stack

Meteor tests can check a small function, a UI component, a package, or a complete application. The test stack connects these workflows to Meteor's build system and runtime, so you can choose the environment each test needs.

**Rstest integration** brings a shared testing API and configuration to Rspack apps, from fast Node tests to tests using real Meteor services. **Existing test drivers** remain available for applications and packages using Mocha, Tinytest, or another driver.

## Quick start

### Rstest for Rspack apps

In an app configured for [Rspack](./modern-build-stack/rspack-bundler-integration.md), add the test-only Atmosphere package:

```bash
meteor add rstest
meteor test --once
```

Write tests with `@rstest/core`. A test that only needs application logic can run in Node without starting a Meteor server. A test importing `meteor/*`, directly or through application code, runs inside a real Meteor host. MongoDB, DDP, Atmosphere packages, and Meteor startup remain real services, not replacement modules.

> Follow the [**Rstest guide**](./test-stack/rstest.md) to write your first tests, then add browser testing, snapshots, coverage, and package tests as needed.

### Existing test drivers

You can keep using the driver already established in your project:

```bash
meteor test --once --driver-package meteortesting:mocha
meteor test-packages ./packages/my-package
```

Rstest does not translate Mocha or Tinytest tests, and adding a provider is not a requirement to keep using those tools. Driver packages can continue to evolve independently.

> See [**Existing Test Drivers**](./test-stack/drivers.md) for selection rules, package testing, and incremental adoption.

## Choose the test environment

| What you want to check | Environment |
| --- | --- |
| Functions, data transformations, snapshots, or isolated application modules | Native Rstest in Node |
| UI logic that only needs a simulated DOM | Native Rstest with jsdom |
| Components using real browser behavior | Rstest Browser Mode |
| Methods, publications, MongoDB, Tracker, or Atmosphere exports | Rstest inside a real Meteor server or client |
| A user's journey through the running application | Rstest Playwright tests against a Meteor-managed full app |
| Existing Mocha, Tinytest, or custom-driver suites | Their existing Meteor test driver |

Use the lightest environment that exercises the behavior you need. Pure tests give quick feedback; runtime and E2E tests check the integration with actual Meteor services. They complement each other without requiring every test to start a full app.

## How it fits together

Meteor owns app and package compilation, Atmosphere resolution, MongoDB, application startup, and cleanup. Rstest supplies the test API and its native runner, browser tooling, snapshots, mocks, and coverage facilities.

A **test-runner provider** connects the two before Meteor decides whether to build a host. When a host is needed, the Rstest Atmosphere package also acts as the runtime driver. Native projects keep their upstream execution model; hosted projects use Rstest's file runtime inside Meteor, with [documented differences](./test-stack/rstest.md#meteor-runtime-boundaries).

This is an additional integration point, not a requirement that all Meteor tests adopt one library. Each invocation has one provider or driver owner. Other integrations can use the same boundary without adding their runner-specific behavior to Meteor core.

## Learn more

- [Rstest Integration](./test-stack/rstest.md) — Write, configure, and run app and package tests.
- [Existing Test Drivers](./test-stack/drivers.md) — Keep current suites and migrate at your own pace.
- [Test-Runner Providers](./test-stack/providers.md) — Build or maintain an integration using the provider lifecycle, host services, and compiler adapters.
- [Modern Build Stack](./modern-build-stack.md) — Prepare an app for Rspack.
- [Community discussion](https://forums.meteor.com/t/meteor-rstest-a-natural-modern-testing-integration-for-meteor-rspack-apps/64744) — Background and early feedback on the integration.
