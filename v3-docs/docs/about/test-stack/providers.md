---
outline:
  level: [2, 3]
---

# Test-Runner Providers

A test-runner provider connects a testing tool to the Meteor CLI before the tool decides whether to build an application host. Rstest is the first integration using this boundary. Most application developers only need the [Rstest guide](./rstest.md); this page is for contributors building or maintaining an integration.

Start with the ownership model below, then follow [registration](#register-a-provider), [execution plans](#prepare-an-execution-plan), and the [lifecycle](#run-and-clean-up). The contract described here is provider API version `1`. Check the source for the Meteor version your integration supports.

## Providers and drivers solve different problems

| Concern | Test-runner provider | Runtime driver package |
| --- | --- | --- |
| Runs inside | Meteor tool process | Built Meteor test application |
| Starts work | Before host construction | After the host exists |
| Chooses execution | Native-only or Meteor-hosted plan | Executes within its host |
| Coordinates | Processes, browsers, completion, restarts, cleanup | Runtime test registration, execution, and results |
| Rstest implementation | Tool-side plugin in Atmosphere `rstest` | Server/client bridge in the same package |

The provider can avoid building a Meteor host for pure tests. When tests need real Meteor services, it requests a host and uses the existing driver startup contract inside that host. A single Atmosphere package can own both pieces without making them the same extension point.

One command has one outer provider or explicit driver owner. The Rstest provider's internal use of `driverPackage: 'rstest'` does not mean users should select `--driver-package rstest` to get the whole workflow.

## Ownership in the Rstest integration

**Meteor core** owns command selection, Isobuild, package linking, application and MongoDB processes, ports, watch generations, and host cleanup. It exposes generic services and validates provider plans.

**Atmosphere `rstest`** owns provider activation, Rstest-specific planning, the real server/client execution bridge, runtime transport, and Meteor coverage collection. Its tool plugin stays outside application runtime bundles.

**`@meteorjs/rstest`** owns the coordinator, configuration bridge, generated Rstest projects, routing support, coverage merging, and the connection to upstream Rstest. The Rspack integration supplies the relevant compilation hooks.

**Upstream Rstest** supplies the test API and native runner capabilities. Hosted tests use its file runtime; Meteor does not recreate a separate set of assertion or fixture APIs.

This keeps engine-specific behavior with the integration. Coverage collection uses generic compiler options where a core boundary is needed; Meteor core does not choose Rstest's reporters or coverage policy.

## Register a provider

A test-only Atmosphere package declares its tool plugin in `package.js`. For example:

```js
Package.describe({
  name: 'example:test-runner',
  version: '1.0.0',
  summary: 'Connect an example test runner to Meteor',
  testOnly: true,
});

Package.onUse(function (api) {
  api.use('isobuild:test-runner-plugin@1.0.0');
});

Package.registerTestRunnerPlugin({
  name: 'exampleTestRunner',
  sources: ['tooling/provider.js'],
  use: ['ecmascript'],
});
```

Inside `tooling/provider.js`, register a factory for your provider implementation:

```js
Plugin.registerTestRunner({
  id: 'example',
  apiVersion: 1,
  activationPackages: ['example:test-runner'],
}, context => new ExampleProvider(context));
```

`ExampleProvider` represents your implementation of the methods described below. The factory returns the provider synchronously; its lifecycle methods can be asynchronous. Keep resource acquisition in those methods so validation and cleanup can manage it.

The ID starts with a lowercase letter or number and can also contain dots, underscores, or dashes. `activationPackages` names the Atmosphere packages that select the provider. Optional `incompatiblePackages` entries have the shape `{ name, driverPackage }` and identify conflicting driver packages with a suggested explicit driver selection.

This narrow plugin API exposes `Plugin.registerTestRunner`, not compiler, minifier, or linter registration. Runtime driver files, when needed, are separate `api.mainModule` or `api.addFiles` entries. Tool plugin sources stay out of application bundles.

An explicit `--driver-package` bypasses provider discovery, unless it conflicts with an explicit runner policy. Otherwise selection checks `--test-runner`, `METEOR_TEST_RUNNER`, then `meteor.testRunner` in `package.json`, followed by automatic package activation. For package tests, selection considers the selected packages' strong, ordered test dependencies on the active architectures. Conflicting providers or mixed test-engine ownership fail before execution. See [driver selection](./drivers.md) for application-facing behavior.

### Start from the generic fixture

The repository's [fake-provider fixture](https://github.com/meteor/meteor/tree/devel/tools/tests/apps/test-runner-provider) is a small working example without Rstest or Rspack dependencies. Read its `package.js`, `tooling/provider.js`, and `server.js` together: they show registration, native execution, a hosted completion bridge, and worker delegation. Its compiler fixture demonstrates package-scoped build options.

The [provider self-tests](https://github.com/meteor/meteor/blob/devel/tools/tests/test-runner-providers.js) exercise those paths and their failure cases. Use this fixture to understand the generic boundary; use Rstest for examples of engine-specific runtime, browser, and coverage integration.

## Read the provider context

The factory, `validate(context)`, and `prepare(context)` receive the same context. Its data is a deeply frozen JSON-safe snapshot; `npm` and `meteorHosts` are separate service objects.

| Field | Meaning |
| --- | --- |
| `command` | Public command identity: `test` or `test-packages`, including inside a worker. |
| `appDir` | Source application root, or the invocation directory for package tests outside an app. Use the package inventory for individual package source roots. |
| `harnessRoot` | Test harness location; do not assume it is the source application root. |
| `localDir`, `basePort` | Current project's local build directory and requested base port. |
| `localPackages` | Local package inventory, including source roots, provenance, and source processors. |
| `packageTests` | Selected package-test targets, including their names and source roots. |
| `architectures`, `webArchs` | Active execution architectures and web build architectures. |
| `verbose` | Verbosity normalized from the command and Meteor configuration. |
| `options` | Normalized command options listed below. |
| `worker` | `null` in the parent, or `{ id, index, total, payload }` in a delegated worker. The index starts at zero. |
| `npm` | Harness npm service: `root`, `autoInstall`, `ensureHarnessManifest(options)`, and `restoreIfTemporary()`. |
| `meteorHosts` | Service for starting and stopping isolated Meteor test workers. |

`options` contains `once`, `fullApp`, `serverOnly`, `clientOnly`, `config`, `project`, `testFile`, `testNamePattern`, `browser`, `coverage`, `updateSnapshots`, `shard`, `changed`, `changedSince`, `runtimeWorkers`, and `passthrough`. `project` and `testFile` are arrays. `passthrough` contains positional command arguments: it carries runner arguments following `--` for app tests, but also package targets for `test-packages`. Interpret it according to `command` rather than forwarding it unconditionally to an engine.

The shared option names do not promise support from every provider. Implement `validate` to reject unsupported selections and flag combinations with actionable messages. Engine configuration, project names, discovery rules, and reporting remain provider concerns.

Use explicit roots from the context instead of changing process-wide application-root variables. The [harness npm service](https://github.com/meteor/meteor/blob/devel/tools/cli/test-runners/harness-npm.js) prepares a harness manifest and its standard npm dependencies; it is not a general engine installer. Provider dependency setup should respect `npm.autoInstall`. `ensureHarnessManifest({ retain: false })` allows later restoration through `restoreIfTemporary()`; the default retains the manifest.

## Prepare an execution plan

`prepare(context)` returns a plan after `validate(context)` succeeds. Both methods are required. Meteor validates and freezes the plan before installing compiler context or starting execution.

| Field | Contract |
| --- | --- |
| `mode` | Required: `native-only` or `meteor-host`. Native-only skips the parent Meteor application host; it can still coordinate delegated hosts. |
| `driverPackage` | Optional non-empty Atmosphere package name for a hosted plan. Omit it to retain the command's driver choice. |
| `hostTestMode` | Hosted plans only: `test`, `app-test`, or `mixed`. Sets `Meteor.isTest`, `Meteor.isAppTest`, or both. Omit it to keep the command's mode. |
| `harnessPackages` | Hosted plans only: additional Atmosphere packages for a generated `test-packages` harness. |
| `refreshProjectMetadata` | Boolean requesting catalog and constraint refresh after preparation, for example after changing a generated harness. |
| `metadata` | Provider-owned JSON object exposed as the test-runner metadata payload. |
| `buildPluginOptions` | JSON objects keyed by consuming Atmosphere build-plugin package name. |
| `buildPluginDependencies` | Package names mapped to arrays of declared `buildPluginOptions` keys that affect their caches. |
| `isobuildOptions` | Generic compiler controls described in [compiler integration](#integrate-with-the-compiler). |

For example, a provider with a runtime driver can request:

```js
return {
  mode: 'meteor-host',
  driverPackage: 'example:test-runner',
  hostTestMode: 'test',
  metadata: { selectedFiles: ['imports/math.test.js'] },
};
```

Plans contain data, not executable hooks. Keep child processes and other mutable state on the provider instance. When a compiler needs executable behavior, pass a module path and load it in the compiler process.

## Run and clean up

After preparation, Meteor installs the plan's metadata and compiler options, updates the harness if requested, and calls `startBeforeHost`. A native-only plan then waits for its result. A hosted plan continues through the existing Meteor application runner.

| Method | When it runs and what it returns |
| --- | --- |
| `validate(context)` | Before preparation; throw for unsupported input. |
| `prepare(context)` | Once after validation; return an execution plan. |
| `startBeforeHost({ updateMetadata })` | Before the optional parent host. Return nothing, `{ exitCode }`, or `{ process: { completion, stop } }`. |
| `beforeAppRun({ updateMetadata })` | Before each application build/run generation, including restarts. |
| `startHost({ url, log, updateMetadata })` | After initial host startup. Connect the engine or browser to the host here. |
| `completeRun({ exitCode, outcome })` | Finalizes the invocation; optionally return `{ exitCode }`, for example when a coverage threshold fails. |
| `stop()` | Releases provider-owned resources on completion or failure. |

All lifecycle methods may return promises. Only `validate` and `prepare` are required. `updateMetadata(payload)` replaces the provider metadata payload; supply the complete current payload when updating it. `startHost` observes host startup: it neither launches a replacement executable nor runs again for every rebuild. Engine readiness, browser readiness, and reconnect behavior remain provider responsibilities.

### Completion and failure

Exit codes are non-negative integers. A nonzero `startBeforeHost.exitCode` ends the command immediately, cleans up, and skips `completeRun`.

For **native-only** execution, `process.completion` resolves to the final exit code. Without a process, the command uses `exitCode`, defaulting to zero. Meteor then calls `completeRun` and `stop`.

For **hosted** execution, a returned pre-host process is a service required for the host's lifetime. If it completes while the host is running, even with zero, Meteor treats that as failure. Report successful test completion through the runtime driver or host results bridge. A completed external test process is not, by itself, the hosted success signal.

`completeRun` receives an outcome of `completed`, `failed`, or `aborted`. It is finalization for the invocation, not a callback for each watch generation. Its exit code can turn success into failure but cannot hide an existing failure. Preparation and startup errors can bypass this hook, so put resource cleanup in `stop`.

### Resource ownership

Keep handles for children, browsers, transports, and delegated workers that the provider starts. A returned process must expose `completion` and `stop`, but core cleanup calls the provider's `stop()`; it does not automatically call that process handle's `stop`. The provider must connect those operations.

Make cleanup safe after partial initialization. The session invokes provider shutdown at most once, preserves the primary lifecycle error if cleanup also fails, and clears active compiler context even when shutdown fails. Meteor remains responsible for its application, database, and proxy processes.

## Use isolated Meteor workers

`context.meteorHosts.start(hosts, { basePort })` returns `{ completion, stop }`. Each host descriptor has a unique stable `id`, a JSON-safe `payload`, and optional `commandOptions`. Omit `basePort` to use the context's base port.

Core allocates ports, separate harness and build directories, and a local database per worker. It forwards `payload` as `context.worker.payload` and selects the same provider in each worker. Branch on `context.worker` to distinguish coordination from execution and avoid recursively starting workers.

`completion` resolves to `{ workers }` in descriptor order. Each result includes `id`, `index`, `total`, `code`, `signal`, captured `stdout` and `stderr`, and an `error` when a supervised stage fails. The provider aggregates these into its own result. A native-only parent's `process.completion` must resolve to an exit code, not this result object.

Worker `commandOptions` use CLI names, such as `project` or `test-file`, from the [host service's permitted options](https://github.com/meteor/meteor/blob/devel/tools/cli/test-runners/meteor-hosts.js). These differ from the camelCase normalized provider options. Project names and payload contents remain opaque to core. The worker command forces one worker and a test host rather than a full-app host.

For `--runtime-workers` above `1`, **Meteor core currently requires `meteor test --once --server-only`**. Package tests, full-app mode, client execution, watch mode, explicit drivers, debugging, mobile/deploy modes, and `ROOT_URL`, `MONGO_URL`, `MONGO_OPLOG_URL`, or `UNIX_SOCKET_PATH` overrides are unsupported. These are core constraints, not solely Rstest policy. Providers must validate additional engine-specific combinations, including browser execution.

## Integrate with the compiler

Compiler integration is optional. A native runner may only need its own subprocess; a hosted integration may use Isobuild, a bundler adapter, or both.

### Isobuild options and cache dependencies

`isobuildOptions` supports two controls:

- `lazyTestPackages: true` defers evaluation of Meteor's `local-test:*` package modules so the integration can register and execute them.
- `moduleReplacements: [{ module, source }]` replaces an exact installed npm module path with provider-supplied source text. Paths are relative to `node_modules`, for example `example-runner/dist/index.js`. This is not a general import-alias API and does not replace built-in specifiers such as `node:test`.

The provider owns the replacement source and runtime implementation. Isobuild does not import an engine's runtime or interpret its assertion API.

`buildPluginOptions` stays opaque to core. A consuming plugin reads its own options through `Plugin.getTestRunnerBuildOptions()`. If another package's cached output depends on those options, declare that relationship explicitly:

```js
buildPluginOptions: {
  'example:compiler': { instrument: true },
},
buildPluginDependencies: {
  'example:runtime': ['example:compiler'],
},
```

Every referenced dependency key must exist in `buildPluginOptions`. This lets Meteor invalidate the affected caches without inspecting private Babel, SWC, or engine configuration.

### Rspack adapters

The Rspack build plugin accepts its own entry in `buildPluginOptions`:

```js
buildPluginOptions: {
  rspack: {
    lifecycle: 'runtime',
    context: {
      adapter: absoluteAdapterPath,
      options: { /* provider-owned JSON */ },
    },
  },
},
```

`context` is passed to the adapter loader. The surrounding Rspack options control its Meteor plugin lifecycle: `lifecycle: 'runtime'` enables provider-driven builds, while `'dependencies-only'` prepares dependencies without running the application compiler. Optional `targets: { client, server }` selects builds when there is no explicit test module; `projectRoot` scopes the plugin's tools-core helper to a harness, and `autoInstall` carries dependency-installation policy.

The adapter module exports a CommonJS factory. The factory receives `{ projectDir, isClient, isTest, isTestLike, isTestFullApp, rspack, options }` and returns a plain object synchronously. Do not use an async factory or async hooks: this compiler boundary does not await them.

| Adapter field | Purpose |
| --- | --- |
| `runtime` | Enables the provider runtime entry path when `true`. |
| `meteorTestFlags` | Supplies `isTest` and `isAppTest` flags for the compiled runtime. |
| `ignoreEntries`, `entryOptions` | Extends ignored paths and supplies generic test-entry generation options. |
| `typescript` | Enables TypeScript compilation when `true`. |
| `cacheVersion` | Includes provider compilation state in the Rspack cache version. |
| `configureSwcRule(rule)` | Mutates Meteor's SWC rule. |
| `finalizeConfig(config)` | Mutates the configuration after application configuration has been merged. |

Hook return values are ignored. Resolve engine dependencies from the intended project or harness root and pass roots explicitly to helpers; avoid process-wide root changes.

The [test-entry generator](https://github.com/meteor/meteor/blob/devel/npm-packages/meteor-rspack/lib/test.js) accepts `discoveryRoot`, `testFileRoot`, `includeFiles`, `setupFiles`, and `testFileRegistration`. Registration specifies a module and exported function which receives a file ID and a loader. Its mode is `sync` by default; `lazy` requires a `runtimeFactory` with `module`, `exportName`, and `registrationExportName`.

An explicit `includeFiles` list takes precedence over the generator's filename matching and `testFiles` filters. Supply absolute file paths and apply requested `--test-file` selections in the provider before passing that list.

Per-file `setupFiles` currently require both explicit `includeFiles` and `testFileRegistration`. Otherwise setup modules are not loaded. Lazy registration and setup loaders supply compilation plumbing; the provider still owns the engine's file execution and isolation semantics.

For a complete adapter, see [`@meteorjs/rstest/rspack`](https://github.com/meteor/meteor/blob/devel/npm-packages/meteor-rstest/src/rspack/index.js). Its aliases, registration, mocking, and coverage belong there rather than in shared Rspack configuration.

## Other test engines

The boundary is not tied to Rstest declarations or assertions. Another integration could supply its own provider, request a Meteor host, and use a driver or executor appropriate to its engine. Existing driver-only integrations do not need to become providers unless they benefit from that earlier lifecycle.

For an engine such as Node's native test runner or Jest, first decide which tests run independently and which need real Meteor services. A native-only provider can launch its own executable and translate completion into an exit code. A hosted provider also needs a runtime driver or executor, a result bridge, and explicit decisions about module isolation, watch behavior, reporting, and coverage. An import alias does not supply those behaviors. This page describes an extension point, not an existing Node or Jest integration.

The Meteor application host launches with Node's `process.execPath`; its executable is not configurable through the provider. Choosing a native runner subprocess does not change that. Replacing the Meteor host executable would require a separate core capability, not a different `startHost` callback.

Before advertising support, validate the combinations the integration implements: app versus package tests, server versus client, test mode versus full-app mode, watch versus one-shot, and any worker or coverage options. Keep engine-specific restrictions in the provider and explain them in that engine's guide.

## Validate an integration

From a Meteor source checkout, start with the generic contract tests and fixture:

```bash
node --test tools/cli/test-runners/tests/*.test.js
./meteor self-test 'test-runner-providers' --retries 0
```

These check selection, explicit-driver compatibility, plan validation, lifecycle failures, cleanup, cache state, and workers without depending on a particular engine. Extend them when changing a shared contract; add engine-specific tests alongside the provider or adapter that owns the behavior.

For runtime or compiler changes, also run the affected integration and E2E tests. Check actual failure exit codes and cleanup, not only successful output. A watch-mode change needs a passing run, an intentional failure after an edit, and recovery after restoring it. Changes to shared compilation should retain existing driver behavior and Rstest's documented runtime boundaries.

## Contributor entry points

Start with these source files in the Meteor repository, and check the contract against the Meteor version your integration supports:

- [Provider selection](https://github.com/meteor/meteor/blob/devel/tools/cli/test-runners/provider-registry.js) and [lifecycle contract](https://github.com/meteor/meteor/blob/devel/tools/cli/test-runners/provider-contract.js).
- [Generic provider fixture](https://github.com/meteor/meteor/tree/devel/tools/tests/apps/test-runner-provider) and [self-tests](https://github.com/meteor/meteor/blob/devel/tools/tests/test-runner-providers.js).
- [Meteor host service](https://github.com/meteor/meteor/blob/devel/tools/cli/test-runners/meteor-hosts.js).
- [Atmosphere registration](https://github.com/meteor/meteor/blob/devel/packages/rstest/package.js) and [Rstest provider](https://github.com/meteor/meteor/blob/devel/packages/rstest/tooling/provider/provider.js).
- [Coordinator and configuration](https://github.com/meteor/meteor/tree/devel/npm-packages/meteor-rstest), including typed factory context and generated projects.
- [Runtime integration README](https://github.com/meteor/meteor/blob/devel/packages/rstest/README.md), including execution, reporting, and coverage details.

Keep the [runtime boundaries](./rstest.md#meteor-runtime-boundaries) visible when extending the integration. A new capability needs both execution support and truthful validation of unsupported combinations.
