---
name: test-runners
description: Use when creating, changing, or reviewing Meteor test-runner providers, execution plans, host lifecycle, compiler adapters, or Rstest integration boundaries. Ordinary application test writing belongs in the testing skill.
---

# Test-Runner Integrations

Preserve Meteor's provider boundary while changing test execution or its build integration.

## Start with the contract

Read [Test-Runner Providers](../../../v3-docs/docs/about/test-stack/providers.md)
as the authoritative contributor guide. Use the implementation for the checked-out
Meteor version when evaluating a proposed capability. Keep that guide current when
changing a contract; avoid maintaining a second schema in this skill.

Use [testing](../testing/SKILL.md) for test infrastructure and
[modern-tools](../modern-tools/SKILL.md) for tools-core, dependency installation,
and Rspack conventions. For dependency version changes, use
[sync-modern-tool-versions](../sync-modern-tool-versions/SKILL.md).

## Locate the owner before editing

| Change | Start here |
| --- | --- |
| Provider selection, activation, explicit driver bypass | [provider-registry.js](../../../tools/cli/test-runners/provider-registry.js), [resolve.js](../../../tools/cli/test-runners/resolve.js) |
| Registration and executable lifecycle | [test-runner-plugin.js](../../../tools/isobuild/test-runner-plugin.js), [provider-contract.js](../../../tools/cli/test-runners/provider-contract.js) |
| Worker orchestration and command restrictions | [meteor-hosts.js](../../../tools/cli/test-runners/meteor-hosts.js) |
| Host startup, rebuilds, completion | [run-app.js](../../../tools/runners/run-app.js), [run-all.js](../../../tools/runners/run-all.js) |
| Compiler context and cache dependencies | [test-runner-context.js](../../../tools/tool-env/test-runner-context.js) |
| Generic Rspack adapter and eager discovery | [lib/test-runner.js](../../../npm-packages/meteor-rspack/lib/test-runner.js), [lib/test.js](../../../npm-packages/meteor-rspack/lib/test.js) |
| Rstest planning, capabilities, runtime bridge | [packages/rstest](../../../packages/rstest/) |
| Rstest routing, coordinator, compiler policy | [meteor-rstest/src](../../../npm-packages/meteor-rstest/src/) |

- Keep engine imports, discovery roots, registration APIs, mocking, reporters,
  and coverage policy in the provider's packages. Generic hooks should express
  the operation the core performs, with provider-owned options passed explicitly.
- Distinguish the tool-side provider from the driver running inside a Meteor
  host. Preserve the explicit `--driver-package` bypass: it must not activate
  provider preparation or install provider dependencies.
- Preserve one execution owner per command and reject unsupported combinations
  before starting work. Provider selection belongs to core; routing test files
  among native, browser, or hosted execution belongs to the selected provider.
- Review a proposed generic change against the
  [fake-provider fixture](../../../tools/tests/apps/test-runner-provider/),
  not only Rstest. Do not implement another engine merely to demonstrate reuse.

## Preserve compiler and path boundaries

- Keep plan data JSON-safe. `buildPluginOptions` is opaque and scoped to the
  consuming package; executable adapter hooks are loaded separately. Declare
  cross-package cache dependencies through `buildPluginDependencies`.
- Keep `isobuildOptions` behavioral and engine-neutral. `lazyTestPackages`
  defers local package-test evaluation. `moduleReplacements` replaces exact
  installed npm module paths; it is not a builtin-module alias mechanism.
- Treat Rspack adapters as synchronous factories loaded from absolute module
  paths. Their configuration hooks mutate the supplied configuration; returned
  Promises or replacement configurations are not consumed. Finalization follows
  application-config merging, so review deliberate overrides carefully.
- Check entry-generation prerequisites: setup files currently require both an
  exact `includeFiles` inventory and `testFileRegistration`; lazy registration
  also requires a runtime factory. These hooks do not provide process or VM
  isolation, or compatibility with another engine's API.
- Distinguish source application, temporary package harness, npm dependency,
  and physical coverage-source roots. Pass roots through the owning package's
  context/helper boundary; avoid a process-wide environment override. Shared
  helper modules do not inherit a consuming build plugin's lexical `Plugin` API.
- Preserve `Meteor.isTest`/`Meteor.isAppTest`, full-app startup, legacy test-file
  filtering, and cache invalidation when manifests or runtime settings change.

## Review lifecycle changes end to end

- `startBeforeHost` can supply native completion or a supervised process.
  In hosted mode, that process must remain alive: its completion currently
  signals host failure, even with exit code zero.
- `startHost` observes initial host startup; it does not launch the host or run
  after every rebuild. `beforeAppRun` runs before successive app generations.
  A listening HTTP port does not establish engine or browser readiness.
- Provider `stop()` owns its resources, including any process returned from
  `startBeforeHost`; core does not independently call that process's `stop()`.
  Preserve idempotent cleanup and compiler-context clearing on failure.
- Trace success, test failure, startup failure, interruption, and watch restart.
  Keep completion results and cleanup failures from turning a failed run green.
- Attribute restrictions to their actual owner. Current multi-host command
  limits are enforced by core's `validateRuntimeWorkerCommand`, in addition to
  provider-specific validation. The Meteor host uses Node's `process.execPath`;
  requesting another engine requires an executor, not just import aliases.

## Validate the affected behavior

Run commands from the repository root. Choose checks according to the changed
boundary. Documentation and architecture reviews need link and contract checks;
run runtime suites for behavior changes or requested reproductions.

```bash
# Focused engine-neutral contract tests
node --test tools/cli/test-runners/tests/*.test.js tools/tool-env/test-runner-context.test.js tools/isobuild/module-replacements.test.js

# Real CLI selection, lifecycle, workers, and explicit-driver regression checks
./meteor self-test --retries 0 "test-runner-providers"

# Provider, adapter, runtime, and related compiler unit tests
npm run test:rstest

# Rstest integration suite after relevant host/runtime/compiler changes
npm run test:e2e -- --runInBand --testPathPattern rstest.test.js
```

Use the [E2E README](../../../tools/e2e-tests/README.md) for isolated dependency
setup and the [coverage map](../../../dev/modern-tools/rspack/E2E_COVERAGE.md)
to select additional generic bundler regressions. Do not run separate E2E
invocations concurrently on the same machine: fixture cleanup sweeps processes
whose arguments contain `meteortest-`.

For changes crossing runtime/build boundaries, include affected server/client,
full-app, package-harness, watch, and coverage cases. When reproducing an external
example, verify it loads the local changed packages and record the actual modes
and results. Do not infer hosted compatibility from native-only test success.
